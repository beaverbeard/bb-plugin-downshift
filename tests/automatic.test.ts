import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AutomaticDownshift, type AutomaticRecord, type ModeOperation, type ModeState, type QuotaSnapshot} from '../lib/automatic';
import {nativeQuota} from '../lib/quota';

const now = 1_800_000_000_000;
function sample(remaining = 5, reset = now / 1000 + 1800): QuotaSnapshot {
  return {status: 'ok', scope: 'codex_account', model: 'primary', checked_at: new Date(now).toISOString(), windows: [{used_percent: 100 - remaining, remaining_percent: remaining, window_minutes: 300, resets_at: reset}]};
}
function fixture() {
  let saved: AutomaticRecord | null = null;
  let mode: ModeState = {available: true, enabled: false, generation: 7, error: null};
  const calls: ModeOperation[] = [];
  let fail = false, writeFails = false;
  const ports = {now: () => now, primaryModel: 'primary', policyId: 'original-policy', load: async () => structuredClone(saved),
    save: async (s: AutomaticRecord) => {if (writeFails) throw Error('disk'); saved = structuredClone(s);}, mode: () => mode,
    set: (input: ModeOperation) => {calls.push({...input}); if (fail) throw Error('uncertain'); mode = {...mode, enabled: true, generation: mode.generation + 1}; return mode;}};
  return {ports, calls, create: () => new AutomaticDownshift(ports), mode: (value: Partial<ModeState>) => {mode = {...mode, ...value};},
    fail: (value: boolean) => {fail = value;}, writeFails: (value: boolean) => {writeFails = value;}, saved: () => saved,
    corrupt: () => {saved = {version: 99} as unknown as AutomaticRecord;}};
}
test('5% boundary and either shared window; 5.01% does not trigger', async () => {
  const f = fixture(), auto = f.create(); await auto.observe(sample(5.01)); assert.equal(f.calls.length, 0);
  const s = sample(80); s.windows.push(sample(5).windows[0]!); await auto.observe(s);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0]!.enabled, true); assert.equal(auto.view.status, 'enabled');
  await auto.observe(sample(0)); assert.equal(f.calls.length, 1);
});
test('unknown, stale, expired, nonfinite and inconsistent quota never trigger', async () => {
  const bad = [null, {...sample(), status: 'stale'}, {...sample(), checked_at: new Date(now - 360001).toISOString()},
    {...sample(), checked_at: new Date(now + 60001).toISOString()}, sample(5, now / 1000),
    {...sample(), windows: [{...sample().windows[0]!, remaining_percent: NaN}]},
    {...sample(), windows: [{...sample().windows[0]!, used_percent: 1}]}];
  const f = fixture(), auto = f.create(); for (const s of bad) await auto.observe(s); assert.equal(f.calls.length, 0);
});
test('model-specific quota is accepted only for the selected primary; shared quota is independent', async () => {
  const f = fixture(), auto = f.create(); await auto.observe({...sample(), scope: 'model', model: 'other'}); assert.equal(f.calls.length, 0);
  await auto.observe({...sample(), scope: 'model'}); assert.equal(f.calls.length, 1);
});
test('uncertain activation persists its UUID across reload and retries only that operation', async () => {
  const f = fixture(); f.fail(true); await f.create().observe(sample()); const op = f.calls[0];
  assert.ok(f.saved()!.pending); f.fail(false); await f.create().observe(sample());
  assert.deepEqual(f.calls[1], op); assert.equal(f.saved()!.pending, null);
});
test('manual OFF suppresses repeated activation until the corresponding reset', async () => {
  const f = fixture(), auto = f.create(); await auto.observe(sample()); await auto.suppress(sample());
  f.mode({enabled: false, generation: 9}); await f.create().observe(sample()); assert.equal(f.calls.length, 1);
  await f.create().observe(sample(5, now / 1000 + 3600)); assert.equal(f.calls.length, 2);
});
test('a newer manual generation cancels an uncertain activation', async () => {
  const f = fixture(); f.fail(true); await f.create().observe(sample());
  f.mode({generation: 9}); f.fail(false); const auto = f.create(); await auto.observe(sample()); await auto.observe(sample());
  assert.equal(f.calls.length, 1); assert.equal(auto.view.status, 'suppressed');
});
test('manual OFF with unknown/stale quota survives restart and binds the first fresh windows until reset', async () => {
  for (const missing of [null, {...sample(), status: 'stale'}]) {
    const f = fixture(); f.mode({enabled: true, generation: 1});
    await f.create().suppress(missing); f.mode({enabled: false, generation: 2});
    assert.equal(f.saved()?.holdForFreshQuota, true);
    await f.create().observe({...sample(3), status: 'stale'}); assert.equal(f.calls.length, 0);
    const fresh = sample(3); fresh.windows.push({...sample(90).windows[0]!, window_minutes: 10080, resets_at: now/1000+7200});
    await f.create().observe(fresh); assert.equal(f.calls.length, 0); assert.equal(f.saved()?.holdForFreshQuota, false);
    await f.create().observe(sample(3)); assert.equal(f.calls.length, 0);
    await f.create().observe({...sample(3,now/1000+7200),windows:[{...sample(3,now/1000+7200).windows[0]!,window_minutes:10080}]}); assert.equal(f.calls.length, 0);
    await f.create().observe(sample(3, now/1000+14400)); assert.equal(f.calls.length, 1);
  }
});
test('recovered/reset quota cancels an unconfirmed old activation', async () => {
  const f = fixture(); f.fail(true); await f.create().observe(sample()); f.fail(false);
  await f.create().observe(sample(60)); assert.equal(f.calls.length, 1); assert.equal(f.saved()!.pending, null);
});
test('corrupt record, storage failure, and unhealthy core fail before mutation', async () => {
  for (const fault of ['corrupt', 'disk', 'core'] as const) {
    const f = fixture(); if (fault === 'corrupt') f.corrupt(); if (fault === 'disk') f.writeFails(true); if (fault === 'core') f.mode({available: false});
    const auto = f.create(); await auto.observe(sample()); assert.equal(f.calls.length, 0); assert.equal(auto.view.status, 'error');
  }
});
test('concurrent observations serialize into one mutation; automatic never turns OFF', async () => {
  const f = fixture(), auto = f.create(); await Promise.all([auto.observe(sample()), auto.observe(sample()), auto.observe(sample())]);
  assert.equal(f.calls.length, 1); assert.ok(f.calls.every(x => x.enabled));
});
test('dispose during durable operation preparation prevents a late activation', async () => {
  const f = fixture(); let resume: (() => void) | undefined;
  const original = f.ports.save;
  f.ports.save = async value => {await new Promise<void>(r => {resume = r;}); await original(value);};
  const auto = f.create(), work = auto.observe(sample());
  while (!resume) await new Promise(r => setImmediate(r));
  auto.dispose(); resume(); await work; await auto.observe(sample());
  assert.equal(f.calls.length, 0); assert.ok(f.saved()?.pending);
});
test('native quota adapter strips account data and rejects invalid windows', () => {
  const s = nativeQuota({codex: {status: 'ok', accountEmail: 'private', windows: [{label: 'weekly', usedPercent: 95, resetsAt: new Date(now + 1000).toISOString()}]}}, 'primary', now);
  assert.equal(s?.windows[0]?.remaining_percent, 5); assert.ok(!JSON.stringify(s).includes('private'));
  assert.equal(nativeQuota({codex: {status: 'error'}}, 'primary', now), null);
  assert.equal(nativeQuota({codex: {status: 'ok', windows: [{usedPercent: 95, resetsAt: null}]}}, 'primary', now), null);
});

test('a pending automatic operation cannot follow a different policy even when generations match; shared manual suppression survives primary-model changes',async()=>{
 const f=fixture();f.ports.policyId='old-policy';f.fail(true);await f.create().observe(sample());assert.equal(f.calls.length,1);
 f.ports.policyId='new-policy';f.fail(false);await f.create().observe(sample());assert.equal(f.calls.length,1);assert.equal(f.saved()!.pending,null);
 f.mode({enabled:true});await f.create().suppress(null);f.mode({enabled:false});f.ports.primaryModel='another-main';
 await f.create().observe({...sample(3),model:'another-main'});await f.create().observe({...sample(3),model:'another-main'});assert.equal(f.calls.length,1);
 await f.create().observe({...sample(3,now/1000+7200),model:'another-main'});assert.equal(f.calls.length,2);
});

test('corruption of a prepared operation cannot activate despite matching low quota and generation',async()=>{
 for(const fault of ['expiry','policy'] as const){
  const f=fixture();f.fail(true);await f.create().observe(sample());const bad=structuredClone(f.saved()!);
  if(fault==='expiry')bad.pending!.keys[Object.keys(bad.pending!.keys)[0]!]=NaN;
  else (bad.pending! as any).policyId={unexpected:true};
  f.ports.load=async()=>bad;f.fail(false);const auto=f.create();await auto.observe(sample());assert.equal(f.calls.length,1);assert.equal(auto.view.status,'error');
 }
});
