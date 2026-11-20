import test from 'node:test';
import assert from 'node:assert/strict';
import {createFakePluginHost} from '@get-bb/plugin-sdk/testing';
import plugin from '../server';
import {nativeProtocol, requiredSemantics} from '../lib/native-contract';
import {unavailableDownshift} from '../lib/state';
import {configurationId, policyId} from '../lib/policy-id';
import type {Configuration} from '../lib/configuration';

const initial = (providerId: string): Configuration => ({version: 1, providerId, primaryModel: 'main-model', profile: {model: 'small-model', reasoningLevel: 'default', serviceTier: 'default'}, autoEnabled: true});
const window = (usedPercent = 97, extra: Record<string, unknown> = {}):{label:string;usedPercent:number;resetsAt:string|null;[key:string]:unknown} => ({label: 'Window', kind: 'weekly', usedPercent, resetsAt: null, ...extra});
const usage = (windows = [window()], accountKey: string | null = 'issuer:test-account') => ({status: 'ok', accountEmail: null, planLabel: null, accountKey, windows});
const model = (id: string) => ({id, model: id, displayName: id, description: '', reasoningDiscovery: 'known' as const, supportedReasoningEfforts: [], defaultReasoningEffort: 'default', isDefault: false});
async function until(condition: () => boolean) {for (let i = 0; i < 150 && !condition(); i++) await new Promise<void>(r => setImmediate(r)); assert.ok(condition(), 'expected async milestone');}
function native() {
  const states = new Map<string, ReturnType<typeof unavailableDownshift>>(), calls: {providerId: string; input: any}[] = [], declarations: any[] = [];
  let releases = 0;
  const capability = {describe: () => ({protocol: nativeProtocol, semantics: requiredSemantics}), register: (d: any) => {
    declarations.push(d);
    if (!states.has(d.id)) states.set(d.id, {...unavailableDownshift(), available: true, error: null, profile: d.profile});
    return {status: () => states.get(d.id), set: (input: any) => {
      const old = states.get(d.id)!; assert.equal(input.expectedGeneration, old.generation); calls.push({providerId: d.providerId, input});
      const next = {...old, generation: old.generation + 1, enabled: input.enabled, phase: input.enabled ? 'on' as const : 'off' as const}; states.set(d.id, next); return next;
    }, subscribe: () => () => {}, release: () => {releases++;}};
  }};
  return {capability, calls, declarations, get releases() {return releases;}};
}
async function fixture(providerId: string, extraProviders: string[] = []) {
  let currentUsage: any = usage(), currentHost = 'test-host';
  const ids = [providerId, ...extraProviders], n = native();
  let read = async (id: string): Promise<any> => ({[id]: currentUsage});
  const h = createFakePluginHost({pluginId: 'downshift', sdk: {
    providers: {list: async () => ids.map(id => ({id, displayName: id, available: true, maintenance: {usage: true}})), models: async () => ({models: [model('main-model'), model('small-model'), model('another-main')], modelLoadError: null})},
    system: {config: async () => ({primaryHostId: currentHost}), usageLimits: async args => read(args!.providerId!)},
  }});
  Object.assign(h.bb, {experimental_executionPolicies: n.capability});
  await h.bb.storage.kv.set('configuration-v1', initial(providerId)); await plugin(h.bb);
  let current=h;
  return {...h,get bb(){return current.bb;},get harness(){return current.harness;},reload:async()=>{current=await current.harness.lifecycle.reload(async bb=>{Object.assign(bb,{experimental_executionPolicies:n.capability});await plugin(bb);});}, n, setUsage: (u: any) => {currentUsage = u;}, setRead: (r: typeof read) => {read = r;}, setHost: (id: string) => {currentHost = id;},
    state: () => current.harness.behavior.callRpc('economy_state', null) as Promise<any>,
    manual: (enabled: boolean) => {return current.harness.behavior.callRpc('economy_state', null).then((v: any) => current.harness.behavior.callRpc('economy_set', {enabled, expectedGeneration: v.generation, requestId: crypto.randomUUID(), configurationId: v.configurationId}));}};
}
for (const providerId of ['claude-code', 'acp-opencode', 'new-quota-provider']) test(`actual SDK harness activates the selected ${providerId} profile, using its source only`, async () => {
  const f = await fixture(providerId); const svc = f.harness.behavior.runService('quota');
  try {
    await until(() => f.n.calls.length === 1); const state = await f.state(); assert.equal(state.enabled, true); assert.equal(state.automatic.status, 'enabled');
    assert.equal(state.profile.model, 'small-model'); assert.equal(f.n.calls[0]!.providerId, providerId); assert.equal(f.n.calls[0]!.input.expectedGeneration, 0);
    const queries = f.harness.inspection.sdk.callsTo('system.usageLimits'); assert.equal(queries.length, 2);
    for (const query of queries) assert.deepEqual({...query[0] as object, signal: undefined}, {providerId, hostId: 'test-host', refresh: true, signal: undefined});
    assert.equal(f.harness.inspection.sdk.callsTo('threads.spawn').length, 0);
    const pending = await f.bb.storage.kv.get<any>(`automatic-v2:${providerId}`); assert.equal(pending.pending, null); assert.ok(Object.keys(pending.consumed).length);
  } finally {svc.controller.abort(); await svc.done; await f.harness.lifecycle.dispose();}
  assert.equal(f.n.releases, 1);
});
test('SDK model M2 low does not trigger primary M1; native Claude family metadata and shared limits work', async t => {
  t.mock.timers.enable({apis: ['setTimeout']}); const f = await fixture('claude-code');
  f.setUsage(usage([window(20, {model: 'main-model'}), window(99, {model: 'other-model'})]));
  const svc = f.harness.behavior.runService('quota');
  try {
    await until(() => f.harness.realtimeSignals.length > 0); assert.equal(f.n.calls.length, 0);
    f.setUsage(usage([window(20, {model: 'main-model'}), window(95, {model: null, kind: 'daily'})])); t.mock.timers.tick(30000);
    await until(() => f.n.calls.length === 1); assert.equal((await f.state()).enabled, true);
  } finally {svc.controller.abort(); await svc.done; await f.harness.lifecycle.dispose(); t.mock.timers.reset();}
});
test('nullable-reset manual OFF remains durable across SDK plugin reload, unknown, label/order changes, and rearms only on recovery', async t => {
  t.mock.timers.enable({apis: ['setTimeout']}); const f = await fixture('acp-opencode'); let svc = f.harness.behavior.runService('quota');
  try {
    await until(() => f.n.calls.length === 1); await f.manual(false); assert.equal(f.n.calls.length, 2);
    svc.controller.abort(); await svc.done; await f.reload(); svc = f.harness.behavior.runService('quota');
    let signals = f.harness.realtimeSignals.length; await until(() => f.harness.realtimeSignals.length > signals); assert.equal(f.n.calls.length, 2);
    f.setUsage({status: 'error', message: 'source unavailable'}); signals = f.harness.realtimeSignals.length; t.mock.timers.tick(30000); await until(() => f.harness.realtimeSignals.length > signals); assert.equal(f.n.calls.length, 2);
    f.setUsage(usage([window(20, {kind: 'daily', label: 'Other window'}), window(97, {label: 'Renamed'})])); signals = f.harness.realtimeSignals.length; t.mock.timers.tick(30000); await until(() => f.harness.realtimeSignals.length > signals); assert.equal(f.n.calls.length, 2);
    f.setUsage(usage([window(94.99)])); signals = f.harness.realtimeSignals.length; t.mock.timers.tick(30000); await until(() => f.harness.realtimeSignals.length > signals);
    svc.controller.abort(); await svc.done; await f.reload(); f.setUsage(usage()); svc = f.harness.behavior.runService('quota');
    await until(() => f.n.calls.length === 3); assert.equal(f.n.calls[2]!.input.enabled, true);
  } finally {svc.controller.abort(); await svc.done; await f.harness.lifecycle.dispose(); t.mock.timers.reset();}
});
for (const identity of ['changed', 'removed'] as const) test(`SDK account ${identity} during durable save prevents stale activation and restart replay`, async () => {
  const f = await fixture('claude-code'); let resume: (() => void) | undefined;
  const original = f.bb.storage.kv.set;
  Object.assign(f.bb, {storage: {...f.bb.storage, kv: {...f.bb.storage.kv, set: async (key: string, value: unknown) => {
    if (key === 'automatic-v2:claude-code' && (value as any).pending) await new Promise<void>(r => {resume = r;}); await original(key, value);
  }}}});
  let svc = f.harness.behavior.runService('quota');
  try {
    await until(() => !!resume); f.setUsage(usage([window()], identity === 'changed' ? 'issuer:other-account' : null)); resume!();
    await until(() => f.harness.realtimeSignals.length > 0); assert.equal(f.n.calls.length, 0);
    svc.controller.abort(); await svc.done; await f.reload(); const signals = f.harness.realtimeSignals.length; svc = f.harness.behavior.runService('quota');
    await until(() => f.harness.realtimeSignals.length > signals); assert.equal(f.n.calls.length, 0);
    const record = await f.bb.storage.kv.get<any>('automatic-v2:claude-code');
    assert.equal(record.pending,null);if(identity==='removed')assert.match((await f.state()).automatic.message,/current provider connection/);
  } finally {resume?.(); svc.controller.abort(); await svc.done; await f.harness.lifecycle.dispose();}
});
test('manual OFF submitted while auto is saving prevents late ON rather than losing a CAS race', async () => {
  const f = await fixture('new-quota-provider'); let resume: (() => void) | undefined; const original = f.bb.storage.kv.set;
  Object.assign(f.bb, {storage: {...f.bb.storage, kv: {...f.bb.storage.kv, set: async (key: string, value: unknown) => {
    if ((value as any)?.pending && !resume) await new Promise<void>(r => {resume = r;}); await original(key, value);
  }}}});
  const svc = f.harness.behavior.runService('quota');
  try {
    await until(() => !!resume); const off = f.manual(false); await new Promise<void>(r => setImmediate(r)); resume!(); await off;
    assert.equal(f.n.calls.length, 1); assert.equal(f.n.calls[0]!.input.enabled, false); assert.equal((await f.state()).enabled, false);
    assert.equal((await f.bb.storage.kv.get<any>('automatic-v2:new-quota-provider')).pending, null);
  } finally {resume?.(); svc.controller.abort(); await svc.done; await f.harness.lifecycle.dispose();}
});
for (const changed of ['provider', 'model', 'host']) test(`SDK ${changed} changes during a held usage read cannot activate its old selection`, async () => {
  const f = await fixture('claude-code', ['acp-opencode']); let resume: (() => void) | undefined;
  f.setRead(async id => {const old = {[id]: usage()}; await new Promise<void>(r => {resume = r;}); return old;});
  const svc = f.harness.behavior.runService('quota');
  try {
    await until(() => !!resume);
    if (changed === 'host') f.setHost('other-host');
    else await f.harness.behavior.callRpc('economy_configure', {...initial(changed === 'provider' ? 'acp-opencode' : 'claude-code'), ...(changed === 'model' ? {primaryModel: 'another-main'} : {})});
    resume!(); await until(() => f.harness.realtimeSignals.length > 0); assert.equal(f.n.calls.length, 0);
  } finally {resume?.(); svc.controller.abort(); await svc.done; await f.harness.lifecycle.dispose();}
});
test('multiple undated windows without optional identity metadata can trigger without merging their measurements', async () => {
  for (const shape of [usage([window(99, {kind: 'custom'}), window(99, {kind: 'custom', label: 'Another'})])]) {
    const f = await fixture('acp-cursor'); f.setUsage(shape); const svc = f.harness.behavior.runService('quota');
    try {await until(() => f.harness.realtimeSignals.length > 0); const state = await f.state(); assert.equal(state.automatic.status, 'enabled'); assert.match(state.automatic.message, /conservative suppression/); assert.equal(f.n.calls.length, 1);}
    finally {svc.controller.abort(); await svc.done; await f.harness.lifecycle.dispose();}
  }
});
test('configuration identity changes with the main model while the native profile identity remains stable for restore', () => {
  const a = initial('claude-code'), b = {...a, primaryModel: 'another-main'};
  assert.equal(policyId(a), policyId(b)); assert.notEqual(configurationId(a), configurationId(b));
});

test('SDK account switch during the first usage await cannot use that old account reading to activate',async()=>{
 const f=await fixture('claude-code');let resume:(()=>void)|undefined,calls=0;
 f.setRead(async id=>{calls++;if(calls===1){const old={[id]:usage()};await new Promise<void>(r=>{resume=r;});return old;}return {[id]:usage([window()],'issuer:other-account')};});
 const svc=f.harness.behavior.runService('quota');
 try{await until(()=>!!resume);resume!();await until(()=>f.harness.realtimeSignals.length>0);assert.equal(f.n.calls.length,0);assert.equal(calls,2);assert.ok((await f.bb.storage.kv.get<any>('automatic-v2:claude-code')).pending);}
 finally{resume?.();svc.controller.abort();await svc.done;await f.harness.lifecycle.dispose();}
});

test('unsupported quota capability is rejected before saving auto and is not queried',async()=>{
 const f=await fixture('no-quota-provider');f.harness.sdk.stub('providers.list',async()=>[{id:'no-quota-provider',available:true,maintenance:{usage:false}}]);
 try{await assert.rejects(f.harness.behavior.callRpc('economy_configure',initial('no-quota-provider')),/does not expose quota/);const svc=f.harness.behavior.runService('quota');await until(()=>f.harness.realtimeSignals.length>0);svc.controller.abort();await svc.done;assert.equal(f.harness.inspection.sdk.callsTo('system.usageLimits').length,0);assert.equal(f.n.calls.length,0);}
 finally{await f.harness.lifecycle.dispose();}
});

for(const hasAccount of [false,true])test(`canonical dated windows without kind/id remain distinct and survive reorder/reset/OFF/reload (account metadata ${hasAccount})`,async t=>{
 const now=1_800_000_000_000;t.mock.timers.enable({apis:['Date','setTimeout'],now});
 const f=await fixture('canonical-quota-provider');
 const raw=(hourReset=now+3_600_000,reversed=false)=>{
  const windows=[{label:'Hourly',usedPercent:96,resetsAt:new Date(hourReset).toISOString()},{label:'Weekly',usedPercent:96,resetsAt:new Date(now+168*3_600_000).toISOString()}];
  return {status:'ok',...(hasAccount?{accountKey:'issuer:canonical'}:{}),windows:reversed?windows.reverse().map(w=>({...w,label:'Localized'})):windows};
 };
 f.setUsage(raw());let svc=f.harness.behavior.runService('quota');
 try{
  await until(()=>f.n.calls.length===1);assert.equal((await f.state()).enabled,true);await f.manual(false);
  svc.controller.abort();await svc.done;await f.reload();f.setUsage(raw(undefined,true));let signals=f.harness.realtimeSignals.length;svc=f.harness.behavior.runService('quota');
  await until(()=>f.harness.realtimeSignals.length>signals);assert.equal(f.n.calls.length,2);
  t.mock.timers.setTime(now+3_600_001);f.setUsage(raw(now+2*3_600_000,true));t.mock.timers.tick(30_000);await until(()=>f.n.calls.length===3);assert.equal(f.n.calls[2]!.input.enabled,true);
 }finally{svc.controller.abort();await svc.done;await f.harness.lifecycle.dispose();t.mock.timers.reset();}
});

test('connection-scope uncertain pending is never replayed after reload; a fresh low decision gets a new UUID and CAS',async()=>{
 const f=await fixture('unknown-account-provider');f.setUsage(usage([window()],null));
 let first=true;const attempts:string[]=[],register=f.n.capability.register;
 f.n.capability.register=d=>{const h=register(d);return {...h,set:input=>{attempts.push(input.requestId);if(first){first=false;throw Error('not sent');}return h.set(input);}};};
 await f.reload();let svc=f.harness.behavior.runService('quota');
 try{
  await until(()=>f.harness.realtimeSignals.length>0);assert.equal(f.n.calls.length,0);const prepared=await f.bb.storage.kv.get<any>('automatic-v2:unknown-account-provider');assert.equal(prepared.pending.sourceScope,'connection');
  svc.controller.abort();await svc.done;await f.reload();svc=f.harness.behavior.runService('quota');await until(()=>f.n.calls.length===1);
  assert.equal(attempts.length,2);assert.notEqual(attempts[0],attempts[1]);assert.equal(f.n.calls[0]!.input.expectedGeneration,0);assert.match((await f.state()).automatic.message,/current provider connection/);
 }finally{svc.controller.abort();await svc.done;await f.harness.lifecycle.dispose();}
});

test('connection-scope manual OFF survives reload and later issuer metadata; unknown/error cannot rearm',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=await fixture('unknown-account-provider');f.setUsage(usage([window()],null));let svc=f.harness.behavior.runService('quota');
 try{
  await until(()=>f.n.calls.length===1);await f.manual(false);svc.controller.abort();await svc.done;await f.reload();f.setUsage(usage());let signals=f.harness.realtimeSignals.length;svc=f.harness.behavior.runService('quota');await until(()=>f.harness.realtimeSignals.length>signals);assert.equal(f.n.calls.length,2);
  f.setUsage({status:'error',message:'unknown'});signals=f.harness.realtimeSignals.length;t.mock.timers.tick(30000);await until(()=>f.harness.realtimeSignals.length>signals);assert.equal(f.n.calls.length,2);
  f.setUsage(usage([window(94.99)]));signals=f.harness.realtimeSignals.length;t.mock.timers.tick(30000);await until(()=>f.harness.realtimeSignals.length>signals);
  f.setUsage(usage());t.mock.timers.tick(30000);await until(()=>f.n.calls.length===3);
 }finally{svc.controller.abort();await svc.done;await f.harness.lifecycle.dispose();t.mock.timers.reset();}
});

test('undated anonymous-window group preserves OFF through reorder/rename/reload/partial disappearance; all original members must recover',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=await fixture('canonical-quota-provider');
 const group=(values:number[])=>({status:'ok',windows:values.map(usedPercent=>({label:'Dynamic provider label',usedPercent,resetsAt:null}))});
 f.setUsage(group([96,20]));let svc=f.harness.behavior.runService('quota');
 try{
  await until(()=>f.n.calls.length===1);await f.manual(false);svc.controller.abort();await svc.done;await f.reload();let signals=f.harness.realtimeSignals.length;svc=f.harness.behavior.runService('quota');await until(()=>f.harness.realtimeSignals.length>signals);
  for(const values of [[20,96],[20],[96,20]]){f.setUsage(group(values));signals=f.harness.realtimeSignals.length;t.mock.timers.tick(30000);await until(()=>f.harness.realtimeSignals.length>signals);assert.equal(f.n.calls.length,2);}
  f.setUsage(group([20,20]));signals=f.harness.realtimeSignals.length;t.mock.timers.tick(30000);await until(()=>f.harness.realtimeSignals.length>signals);
  svc.controller.abort();await svc.done;await f.reload();f.setUsage(group([96,20]));svc=f.harness.behavior.runService('quota');await until(()=>f.n.calls.length===3);
 }finally{svc.controller.abort();await svc.done;await f.harness.lifecycle.dispose();t.mock.timers.reset();}
});

test('actual SDK Claude scoped-limit shape matches only the selected catalog family while shared windows remain applicable',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=await fixture('claude-code');
 f.harness.sdk.stub('providers.models',async()=>({models:[model('claude-sonnet-5-1'),model('claude-haiku-4-5')],modelLoadError:null}));
 await f.harness.behavior.callRpc('economy_configure',{...initial('claude-code'),primaryModel:'claude-sonnet-5-1',profile:{model:'claude-haiku-4-5',reasoningLevel:'default',serviceTier:'default'}});
 const shape=(sonnet:number)=>usage([window(20,{kind:'five-hour'}),window(20,{model:null}),window(99,{model:'opus'}),window(sonnet,{model:'sonnet'})]);
 f.setUsage(shape(20));const svc=f.harness.behavior.runService('quota');
 try{await until(()=>f.harness.realtimeSignals.length>=2);assert.equal(f.n.calls.length,0);f.setUsage(shape(95));t.mock.timers.tick(30000);await until(()=>f.n.calls.length===1);assert.equal((await f.state()).profile.model,'claude-haiku-4-5');}
 finally{svc.controller.abort();await svc.done;await f.harness.lifecycle.dispose();t.mock.timers.reset();}
});

test('actual SDK OpenCode Go rolling/weekly/monthly shape can trigger on any applicable shared window',async()=>{
 const f=await fixture('acp-opencode');const reset=new Date(Date.now()+86_400_000).toISOString();
 f.setUsage(usage([{label:'5 hour',kind:'five-hour',model:null,usedPercent:40,resetsAt:reset},{label:'Weekly',kind:'weekly',model:null,usedPercent:95,resetsAt:reset},{label:'Monthly',kind:'custom',model:null,usedPercent:60,resetsAt:reset}],null));
 const svc=f.harness.behavior.runService('quota');
 try{await until(()=>f.n.calls.length===1);assert.equal((await f.state()).enabled,true);assert.match((await f.state()).automatic.message,/current provider connection/);}
 finally{svc.controller.abort();await svc.done;await f.harness.lifecycle.dispose();}
});
