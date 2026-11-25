import test from 'node:test';
import assert from 'node:assert/strict';
import {createFakePluginHost} from '@get-bb/plugin-sdk/testing';
import plugin from '../server';
import {nativeProtocol,requiredSemantics} from '../lib/native-contract';
import {unavailableDownshift,type DownshiftState} from '../lib/state';
import {policyId} from '../lib/policy-id';
import type {Configuration} from '../lib/configuration';

const selected:Configuration={version:1,providerId:'review-provider',primaryModel:'main-model',profile:{model:'small-model',reasoningLevel:'default',serviceTier:'default'},autoEnabled:true};
const model=(id:string)=>({id,model:id,displayName:id,description:'',reasoningDiscovery:'known' as const,supportedReasoningEfforts:[],defaultReasoningEffort:'default',isDefault:false});
const usage=(usedPercent=97)=>({status:'ok',accountKey:'issuer:review-fixture',windows:[{label:'Window',kind:'weekly',usedPercent,resetsAt:null}]});
async function until(condition:()=>boolean){for(let i=0;i<1000&&!condition();i++)await new Promise<void>(r=>setImmediate(r));assert(condition(),'expected asynchronous milestone');}
async function fixture(){
 let quota:unknown=usage(),fail:'none'|'suppression'|'checkpoint'='none';
 let state={...unavailableDownshift(),available:true,error:null,profile:selected.profile};
 const calls:{enabled:boolean;expectedGeneration:number;requestId:string}[]=[],operations=new Map<string,boolean>();
 const capability={describe:()=>({protocol:nativeProtocol,semantics:requiredSemantics}),register:()=>({status:()=>state,set:(input:typeof calls[number])=>{
  if(operations.has(input.requestId)){assert.equal(operations.get(input.requestId),input.enabled);return state;}
  assert.equal(input.expectedGeneration,state.generation);calls.push(input);operations.set(input.requestId,input.enabled);
  if(input.enabled!==state.enabled)state={...state,enabled:input.enabled,phase:input.enabled?'on':'off',generation:state.generation+1};
  return state;
 },subscribe:()=>()=>{},release:()=>{}})};
 let host=createFakePluginHost({pluginId:'downshift',sdk:{providers:{list:async()=>[{id:selected.providerId,displayName:'Review Provider',available:true,maintenance:{usage:true}}],models:async()=>({models:[model('main-model'),model('small-model')],modelLoadError:null})},system:{config:async()=>({primaryHostId:'review-host'}),usageLimits:async()=>({[selected.providerId]:quota})}}});
 const install=async(bb:typeof host.bb)=>{
  const set=bb.storage.kv.set;
  Object.assign(bb,{experimental_executionPolicies:capability,storage:{...bb.storage,kv:{...bb.storage.kv,set:async(key:string,value:unknown)=>{
   if(fail==='suppression'&&key==='automatic-v2:review-provider'||fail==='checkpoint'&&key.startsWith('automatic-manual-v1:'))throw Error('test storage failure');
   return set(key,value);
  }}}});
  await plugin(bb);
 };
 await host.bb.storage.kv.set('configuration-v1',selected);await install(host.bb);
 return {get host(){return host;},get state(){return state;},calls,setFailure:(value:typeof fail)=>{fail=value;},setUsage:(value:unknown)=>{quota=value;},reload:async()=>{host=await host.harness.lifecycle.reload(install);},manual:async(enabled:boolean)=>{const current=await host.harness.behavior.callRpc('economy_state',null) as DownshiftState;return host.harness.behavior.callRpc('economy_set',{enabled,expectedGeneration:current.generation,configurationId:current.configurationId!,requestId:crypto.randomUUID()}) as Promise<DownshiftState>;},read:()=>host.harness.behavior.callRpc('economy_state',null) as Promise<DownshiftState>,offKey:`automatic-manual-v1:${policyId(selected)}`};
}
const cycle=async(f:Awaited<ReturnType<typeof fixture>>)=>{const before=f.host.harness.realtimeSignals.length,service=f.host.harness.behavior.runService('quota');try{await until(()=>f.host.harness.realtimeSignals.length>before);}finally{service.controller.abort();await service.done;}};

test('manual OFF after a suppression write failure remains off through reload and passive storage recovery',async()=>{
 const f=await fixture();
 try{
  await f.manual(true);await cycle(f);f.setFailure('suppression');
  const off=await f.manual(false);assert.equal(off.enabled,false);assert.equal(off.automatic?.status,'error');assert.match(off.automatic!.message,/will not resume itself after reload/);
  f.setFailure('none');await f.reload();await cycle(f);assert.equal((await f.read()).enabled,false);assert.equal((await f.read()).automatic?.status,'error');
  await f.reload();f.setUsage({status:'error',message:'unknown'});await cycle(f);assert.equal(f.calls.length,2);
  f.setUsage(usage());await f.reload();await cycle(f);assert.equal((await f.read()).enabled,false);assert.equal(f.calls.length,2);
  await f.manual(true);await f.manual(false);await f.reload();await cycle(f);assert.equal(f.calls.length,4);assert.equal((await f.read()).automatic?.status,'suppressed');
  f.setUsage(usage(90));await f.reload();await cycle(f);f.setUsage(usage());await f.reload();await cycle(f);
  assert.deepEqual(f.calls.map(x=>x.enabled),[true,false,true,false,true]);
 }finally{await f.host.harness.lifecycle.dispose();}
});

test('failed manual checkpoint save leaves a durable generation mismatch that cannot auto-resume',async()=>{
 const f=await fixture();
 try{await f.manual(true);await cycle(f);f.setFailure('checkpoint');const off=await f.manual(false);assert.equal(off.enabled,false);f.setFailure('none');await f.reload();await cycle(f);assert.equal((await f.read()).enabled,false);assert.equal((await f.read()).automatic?.status,'error');assert.equal(f.calls.length,2);}
 finally{await f.host.harness.lifecycle.dispose();}
});

test('a no-op OFF cannot claim a durable pause when suppression storage failed; a confirmed retry protects reload',async()=>{
 const f=await fixture();
 try{
  f.setFailure('suppression');await assert.rejects(f.manual(false),/pause could not be saved or confirmed/);assert.equal(f.state.generation,0);assert.equal(f.state.enabled,false);
  f.setFailure('none');await f.manual(false);assert.equal(f.state.generation,0);await cycle(f);await f.reload();await cycle(f);
  assert.equal((await f.read()).enabled,false);assert.deepEqual(f.calls.map(x=>x.enabled),[false,false]);
 }finally{await f.host.harness.lifecycle.dispose();}
});

for(const bad of ['missing','invalid','different-generation','different-policy'] as const)test(`unreconciled native OFF blocks auto when checkpoint is ${bad}`,async()=>{
 const f=await fixture();
 try{
  await f.manual(true);await cycle(f);await f.manual(false);
  if(bad==='missing')await f.host.bb.storage.kv.delete(f.offKey);
  else await f.host.bb.storage.kv.set(f.offKey,bad==='invalid'?{version:99}:{version:1,policyId:bad==='different-policy'?'different':policyId(selected),generation:bad==='different-generation'?1:2});
  await f.reload();await cycle(f);assert.equal((await f.read()).enabled,false);assert.equal((await f.read()).automatic?.status,'error');assert.equal(f.calls.length,2);
 }finally{await f.host.harness.lifecycle.dispose();}
});

test('fresh native generation zero remains eligible for automatic activation',async()=>{
 const f=await fixture();try{await cycle(f);assert.equal((await f.read()).enabled,true);assert.deepEqual(f.calls.map(x=>x.enabled),[true]);}finally{await f.host.harness.lifecycle.dispose();}
});
