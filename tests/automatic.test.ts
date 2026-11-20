import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AutomaticDownshift, type AutomaticRecord, type ModeOperation, type ModeState, type QuotaSnapshot, type AutomaticPorts} from '../lib/automatic';
import {nativeQuota} from '../lib/quota';

const now = 1_800_000_000_000;
const selection = {providerId: 'sample-provider', hostId: 'test-host', primaryModel: 'main-model'};
function sample(remaining = 5, reset: number | null = now + 1_800_000, extra: Record<string, unknown> = {}): QuotaSnapshot {
  return nativeQuota({[selection.providerId]: {status: 'ok', accountKey: 'test:account:one', windows: [{label: 'Weekly', kind: 'weekly', usedPercent: 100 - remaining, resetsAt: reset === null ? null : new Date(reset).toISOString()}], ...extra}}, selection, now)!;
}
function fixture() {
  let saved: unknown = null;
  let mode: ModeState = {available: true, enabled: false, generation: 7, error: null};
  const calls: ModeOperation[] = [];
  let fail = false, writeFails = false;
  const ports: AutomaticPorts = {now: () => now, providerId: selection.providerId, primaryModel: selection.primaryModel, policyId: 'original-policy', load: async () => structuredClone(saved),
    save: async s => {if (writeFails) throw Error('disk'); saved = structuredClone(s);}, mode: () => mode,
    set: input => {calls.push({...input}); if (fail) throw Error('uncertain'); mode = {...mode, enabled: true, generation: mode.generation + 1}; return mode;}};
  return {ports, calls, create: () => new AutomaticDownshift(ports), mode: (value: Partial<ModeState>) => {mode = {...mode, ...value};},
    fail: (value: boolean) => {fail = value;}, writeFails: (value: boolean) => {writeFails = value;}, saved: () => saved as AutomaticRecord | null,
    stored: (value: unknown) => {saved = value;}};
}
test('remaining threshold is inclusive at 5% and parameterized at 50%; any applicable shared window can trigger', async () => {
  for (const threshold of [5, 50]) {
    const f = fixture(); f.ports.thresholdPercent = threshold; const auto = f.create();
    await auto.observe(sample(threshold + .01)); assert.equal(f.calls.length, 0);
    await auto.observe(sample(threshold)); assert.equal(f.calls.length, 1); assert.equal(auto.view.status, 'enabled');
    await auto.observe(sample(0)); assert.equal(f.calls.length, 1); assert.equal(f.calls[0]!.enabled, true);
  }
  const f = fixture(), s = sample(80); s.windows.push({...sample(5).windows[0]!, id: 'another-window'});
  await f.create().observe(s); assert.equal(f.calls.length, 1);
});
test('unknown, stale, expired, future, inconsistent, unlimited and nonfinite readings never activate', async () => {
  const f = fixture(), s = sample();
  const bad = [null, {...s, status: 'error'}, {...s, checkedAt: now - 360001}, {...s, checkedAt: now + 60001},
    {...s, windows: [{...s.windows[0]!, resetsAt: now}]}, {...s, windows: []}, {...s, windows: [{...s.windows[0]!, remainingPercent: NaN}]},
    {...s, windows: [{...s.windows[0]!, usedPercent: 1}]}, {...s, providerId: 'foreign-provider'}];
  for (const usage of bad) await f.create().observe(usage as QuotaSnapshot | null);
  assert.equal(f.calls.length, 0);
  assert.equal(nativeQuota({[selection.providerId]: {status: 'ok', windows: [{unlimited: true}]}}, selection, now), null);
});
test('foreign model quota is ignored; shared quota and selected model apply without provider allowlists', async () => {
  const quota = (model: string | null, usedPercent: number) => ({label: 'Window', kind: 'weekly', model, usedPercent, resetsAt: null});
  const read = (windows: unknown[]) => nativeQuota({[selection.providerId]: {status: 'ok', accountKey: 'issuer:test', windows}}, selection, now);
  const f = fixture();
  await f.create().observe(read([quota('main-model', 20), quota('other-model', 99)])); assert.equal(f.calls.length, 0);
  await f.create().observe(read([quota('main-model', 95), quota('other-model', 0)])); assert.equal(f.calls.length, 1);
  const shared = fixture(); await shared.create().observe(read([quota('main-model', 20), quota(null, 97)])); assert.equal(shared.calls.length, 1);
});
test('Claude family adapter uses native model metadata, never label text or arbitrary substrings', () => {
  const entry = (model: string | null, label = 'Sonnet') => ({'claude-code': {status: 'ok', accountKey: 'anthropic:test', windows: [{kind: 'weekly', model, label, usedPercent: 99, resetsAt: null}]}});
  const pick = {...selection, providerId: 'claude-code', primaryModel: 'claude-sonnet-5-1'};
  assert.ok(nativeQuota(entry('sonnet'), pick, now));
  assert.equal(nativeQuota(entry('opus'), pick, now), null);
  assert.ok(nativeQuota(entry(null, 'Opus'), pick, now));
  assert.equal(nativeQuota(entry('son'), pick, now), null);
  assert.equal(nativeQuota({[selection.providerId]: entry('sonnet')['claude-code']}, {...selection, primaryModel: 'not-sonnet-model'}, now), null);
});
test('UUID retry survives restart only for the same source/selection/generation and fresh low windows', async () => {
  const f = fixture(); f.fail(true); await f.create().observe(sample()); const op = f.calls[0];
  assert.ok(f.saved()!.pending); f.fail(false); await f.create().observe(sample());
  assert.deepEqual(f.calls[1], op); assert.equal(f.saved()!.pending, null);
});
test('manual OFF with dated quota holds even after temporary recovery until its actual reset', async () => {
  const f = fixture(), auto = f.create(); await auto.observe(sample()); await auto.suppress(sample());
  f.mode({enabled: false, generation: 9}); await f.create().observe(sample(80)); await f.create().observe(sample()); assert.equal(f.calls.length, 1);
  await f.create().observe(sample(5, now + 3_600_000)); assert.equal(f.calls.length, 1);
  f.ports.now=()=>now+1_800_001;const reset=sample(5,now+3_600_000);reset.checkedAt=now+1_800_001;await f.create().observe(reset);assert.equal(f.calls.length,2);
});
test('manual OFF with nullable reset survives restart, error, label change and reorder; only same-window confirmed recovery rearms', async () => {
  const f = fixture(), auto = f.create(); const low = sample(3, null);
  await auto.observe(low); await auto.suppress(low); f.mode({enabled: false, generation: 9});
  await f.create().observe(low); await f.create().observe(null); assert.equal(f.calls.length, 1);
  const renamed = sample(3, null, {windows: [{kind: 'weekly', label: 'Renamed by provider', usedPercent: 97, resetsAt: null}]});
  assert.equal(renamed.windows[0]!.id, low.windows[0]!.id); await f.create().observe(renamed); assert.equal(f.calls.length, 1);
  const healthyOther = sample(80, null, {windows: [{kind: 'daily', label: 'Daily', usedPercent: 20, resetsAt: null}]});
  await f.create().observe(healthyOther); await f.create().observe(low); assert.equal(f.calls.length, 1);
  await f.create().observe(sample(5.01, null)); await f.create().observe(low); assert.equal(f.calls.length, 2);
});
test('native window identity survives labels/order; distinct IDs remain separate and undated duplicates use conservative suppression', async () => {
  const windows = [{kind: 'daily', label: 'First', usedPercent: 99, resetsAt: null}, {kind: 'weekly', label: 'Second', usedPercent: 20, resetsAt: null}];
  const read = (windows: unknown[]) => sample(0, null, {windows});
  assert.deepEqual(read(windows).windows.map(w => w.id).sort(), read(windows.slice().reverse().map(w => ({...w, label: 'Translated'}))).windows.map(w => w.id).sort());
  const ambiguous = read([windows[0], {...windows[0], label: 'Other quota'}]); assert.equal(ambiguous.identityError,null);assert.equal(ambiguous.groupedWindows,true); assert.equal(ambiguous.windows.length, 2);
  const f = fixture(), auto = f.create(); await auto.observe(ambiguous); assert.equal(f.calls.length, 1); assert.equal(auto.view.status, 'enabled');
  const distinct = read([{...windows[0], id: 'one'}, {...windows[0], id: 'two'}]); assert.equal(new Set(distinct.windows.map(w => w.id)).size, 2); assert.equal(distinct.identityError, null);
});
test('manual OFF during unknown quota binds first fresh windows after restart, including no-reset quota', async () => {
  for (const reset of [now + 1800000, null]) {
    const f = fixture(); f.mode({enabled: true}); await f.create().suppress(null); f.mode({enabled: false, generation: 8});
    await f.create().observe(null); await f.create().observe(sample(3, reset)); await f.create().observe(sample(3, reset)); assert.equal(f.calls.length, 0);
    assert.equal(f.saved()?.holdForFreshQuota, false);
    if (reset === null) {await f.create().observe(sample(80, null)); await f.create().observe(sample(3, null));}
    else {f.ports.now=()=>reset+1;const next=sample(3,reset+1800000);next.checkedAt=reset+1;await f.create().observe(next);}
    assert.equal(f.calls.length, 1);
  }
});
test('missing optional account identity uses connection scope and never replays an old account decision', async () => {
  const f = fixture(); f.fail(true); await f.create().observe(sample()); f.fail(false);
  const noIdentity = sample(3, null, {accountKey: null, accountEmail: 'example@example.invalid'});
  await f.create().observe(noIdentity); assert.equal(f.calls.length, 1); assert.equal(f.saved()?.pending,null);
  await f.create().observe(noIdentity);assert.equal(f.calls.length,2);assert.notEqual(f.calls[0]!.requestId,f.calls[1]!.requestId);
  const plain = fixture(),auto=plain.create(); await auto.observe(noIdentity); assert.equal(plain.calls.length, 1);assert.match(auto.view.message,/current provider connection/);
});
test('account, host, primary model and generation changes cancel an old pending request instead of replaying it', async () => {
  for (const changed of ['account', 'host', 'model', 'generation']) {
    const f = fixture(); f.fail(true); await f.create().observe(sample()); f.fail(false);
    let next = sample();
    if (changed === 'account') next = sample(3, undefined, {accountKey: 'test:account:two'});
    if (changed === 'host') next = nativeQuota({[selection.providerId]: {status: 'ok', accountKey: 'test:account:one', windows: [{label: 'Weekly', kind: 'weekly', usedPercent: 97, resetsAt: null}]}}, {...selection, hostId: 'other-host'}, now)!;
    if (changed === 'model') {f.ports.policyId = 'new-selection'; f.ports.primaryModel = 'another-main';}
    if (changed === 'generation') f.mode({generation: 9});
    await f.create().observe(next); assert.equal(f.calls.length, 1); assert.equal(f.saved()!.pending, null);
  }
});
test('source change, unknown identity and recovery during durable save prevent the already prepared activation', async () => {
  for (const final of [sample(3, null, {accountKey: 'test:account:two'}), sample(3, null, {accountKey: null}), sample(80), null]) {
    const f = fixture(); f.ports.confirm = async () => final;
    await f.create().observe(sample()); assert.equal(f.calls.length, 0); assert.ok(f.saved()?.pending);
  }
});
test('corrupt persistence, storage failure and unhealthy native controller fail before mutation', async () => {
  for (const fault of ['corrupt', 'disk', 'core']) {
    const f = fixture(); if (fault === 'corrupt') f.stored({version: 99}); if (fault === 'disk') f.writeFails(true); if (fault === 'core') f.mode({available: false});
    const auto = f.create(); await auto.observe(sample()); assert.equal(f.calls.length, 0); assert.equal(auto.view.status, 'error');
  }
});
test('legacy Codex suppression/unknown OFF/prepared v1 records migrate conservatively without replay or rewriting v1', async () => {
  for (const old of [{version: 1, consumed: {'codex_account:shared:300:1800001800': now + 1800000}, pending: null}, {version: 1, consumed: {}, pending: null, holdForFreshQuota: true}]) {
    const f = fixture(); f.stored(old); await f.create().observe(sample()); assert.equal(f.calls.length, 0); assert.equal(f.saved()?.version, 2); assert.equal(f.saved()?.holdForFreshQuota, false);
    await f.create().observe(sample()); assert.equal(f.calls.length, 0);
  }
});
test('concurrent reads serialize; newer manual generation wins; auto never sends OFF', async () => {
  const f = fixture(), auto = f.create(); await Promise.all([auto.observe(sample()), auto.observe(sample()), auto.observe(sample())]); assert.equal(f.calls.length, 1);
  assert.ok(f.calls.every(op => op.enabled));
  const other = fixture(); other.fail(true); await other.create().observe(sample()); other.fail(false); other.mode({generation: 9});
  await other.create().observe(sample()); assert.equal(other.calls.length, 1); assert.equal(other.saved()!.pending, null);
});
test('dispose during durable preparation prevents late activation and keeps the prepared UUID', async () => {
  const f = fixture(); let resume: (() => void) | undefined; const save = f.ports.save;
  f.ports.save = async value => {await new Promise<void>(r => {resume = r;}); await save(value);};
  const auto = f.create(), work = auto.observe(sample());
  while (!resume) await new Promise(r => setImmediate(r)); auto.dispose(); resume(); await work;
  assert.equal(f.calls.length, 0); assert.ok(f.saved()?.pending);
});
test('adapter strips account data, preserves reset null, validates percentages and never uses a wrong provider entry', () => {
  const s = sample(5, null, {accountEmail: 'example@example.invalid', planLabel: 'Private plan'});
  assert.equal(s.windows[0]!.remainingPercent, 5); assert.equal(s.windows[0]!.resetsAt, null);
  assert.ok(!JSON.stringify(s).includes('example@')); assert.ok(!JSON.stringify(s).includes('test:account:one'));
  assert.equal(nativeQuota({codex: {status: 'ok', windows: []}}, selection, now), null);
  assert.equal(nativeQuota({[selection.providerId]: {status: 'ok', windows: [{label: 'Weekly', usedPercent: NaN, resetsAt: null}]}}, selection, now), null);
});

test('reset metadata changes do not erase manual OFF; nullable recovery applies only to the same source/window', async () => {
  for (const first of [null, now + 1_800_000]) {
    const f=fixture(),auto=f.create();await auto.observe(sample(3,first));await auto.suppress(sample(3,first));f.mode({enabled:false,generation:9});
    await f.create().observe(sample(3, first===null ? now+1_800_000 : null));assert.equal(f.calls.length,1);
    if(first===null){await f.create().observe(sample(80,now+1_800_000));await f.create().observe(sample(3,null));assert.equal(f.calls.length,2);}
  }
  const f=fixture(),auto=f.create();await auto.observe(sample(3,null));await auto.suppress(sample(3,null));f.mode({enabled:false,generation:9});
  await f.create().observe(sample(80,null,{accountKey:'issuer:other'}));await f.create().observe(sample(3,null));assert.equal(f.calls.length,1);
});

test('a failed durable recovery write cannot weaken an anonymous-window manual barrier in memory',async()=>{
 const f=fixture(),auto=f.create();
 const group=(values:number[])=>sample(0,null,{windows:values.map(usedPercent=>({label:'Provider window',usedPercent,resetsAt:null}))});
 await auto.observe(group([97,20]));await auto.suppress(group([97,20]));f.mode({enabled:false,generation:9});
 f.writeFails(true);await auto.observe(group([20,20]));assert.equal(auto.view.status,'error');f.writeFails(false);
 await auto.observe(group([20]));await auto.observe(group([97,20]));assert.equal(f.calls.length,1);
 await f.create().observe(group([97,20]));assert.equal(f.calls.length,1);
});
