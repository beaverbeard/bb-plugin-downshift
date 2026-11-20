import test from 'node:test';
import assert from 'node:assert/strict';
import {createFakePluginHost} from '@get-bb/plugin-sdk/testing';
import plugin from '../server';
import {nativeProtocol,requiredSemantics} from '../lib/native-contract';
import {unavailableDownshift} from '../lib/state';

test('a failed native quota read publishes stale automatic status without exposing a percentage widget; disposal cancels observation',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let calls=0,released=0;
 const host=createFakePluginHost({pluginId:'downshift',sdk:{system:{usageLimits:async()=>{calls++;if(calls>1)throw Error('native usage unavailable');return {codex:{status:'ok',windows:[{usedPercent:55,resetsAt:new Date(Date.now()+3600000).toISOString()}]}};}}}});
 const mode={...unavailableDownshift(),available:true,error:null};
 Object.assign(host.bb,{experimental_executionPolicies:{describe:()=>({protocol:nativeProtocol,semantics:requiredSemantics}),register:()=>({status:()=>mode,set:()=>{throw Error('No execution mutation is expected');},subscribe:()=>()=>{},release:()=>{released++;}})}});
 await host.bb.storage.kv.set('configuration-v1',{version:1,providerId:'codex',primaryModel:'primary',profile:{model:'small',reasoningLevel:'medium',serviceTier:'default'},autoEnabled:true});
 await plugin(host.bb);const service=host.harness.behavior.runService('quota');
 try{
  for(let i=0;i<40&&host.harness.realtimeSignals.length===0;i++)await new Promise<void>(resolve=>setImmediate(resolve));
  let state=await host.harness.behavior.callRpc('economy_state',null);assert.equal((state as any).automatic.status,'waiting');assert.equal('quota' in (state as object),false);assert.equal(calls,1);
  const signals=host.harness.realtimeSignals.length;t.mock.timers.tick(30000);
  for(let i=0;i<40&&host.harness.realtimeSignals.length===signals;i++)await new Promise<void>(resolve=>setImmediate(resolve));
  state=await host.harness.behavior.callRpc('economy_state',null);assert.equal((state as any).automatic.status,'stale');assert.equal(calls,2);assert.ok(host.harness.realtimeSignals.length>signals);
 }finally{service.controller.abort();await service.done;await host.harness.lifecycle.dispose();t.mock.timers.reset();}
 assert.equal(released,1);
});

test('reconfiguration drains an in-flight durable automatic preparation before loading a new profile',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const initial={version:1 as const,providerId:'codex',primaryModel:'primary',profile:{model:'small',reasoningLevel:'medium',serviceTier:'default'},autoEnabled:true};
 const model=(model:string)=>({id:model,model,displayName:model,description:'',reasoningDiscovery:'known' as const,supportedReasoningEfforts:[{reasoningEffort:'medium',description:''}],defaultReasoningEffort:'medium',isDefault:false});
 const host=createFakePluginHost({pluginId:'downshift',sdk:{providers:{list:async()=>[{id:'codex',displayName:'Codex',available:true,maintenance:{usage:true}}],models:async()=>({models:[model('primary'),model('small'),model('other-small')],modelLoadError:null})},system:{usageLimits:async()=>({codex:{status:'ok',windows:[{usedPercent:97,resetsAt:new Date(Date.now()+3600000).toISOString()}]}})}}});
 await host.bb.storage.kv.set('configuration-v1',initial);
 let mutations=0,registrations=0,releaseSave:(()=>void)|undefined;
 const original=host.bb.storage.kv.set;
 const pendingWrites:string[]=[];
 Object.assign(host.bb,{storage:{...host.bb.storage,kv:{...host.bb.storage.kv,set:async(key:string,value:unknown)=>{if(key==='automatic-v1:codex'&&!pendingWrites.length){pendingWrites.push(key);await new Promise<void>(resolve=>{releaseSave=resolve;});}await original(key,value);}}}});
 Object.assign(host.bb,{experimental_executionPolicies:{describe:()=>({protocol:nativeProtocol,semantics:requiredSemantics}),register:(declaration:any)=>{registrations++;return {status:()=>({...unavailableDownshift(),available:true,profile:declaration.profile,error:null}),set:()=>{mutations++;throw Error('No late activation allowed');},subscribe:()=>()=>{},release:()=>{}};}}});
 await plugin(host.bb);const service=host.harness.behavior.runService('quota');
 try{
  for(let i=0;i<80&&!releaseSave;i++)await new Promise<void>(resolve=>setImmediate(resolve));assert.ok(releaseSave);
  let finished=false;
  const change=host.harness.behavior.callRpc('economy_configure',{...initial,profile:{...initial.profile,model:'other-small'}}).then(value=>{finished=true;return value;});
  for(let i=0;i<20;i++)await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(finished,false);assert.equal(registrations,1);
  releaseSave();await change;assert.equal(registrations,2);assert.equal(mutations,0);
  const signals=host.harness.realtimeSignals.length;t.mock.timers.tick(30000);
  for(let i=0;i<80&&host.harness.realtimeSignals.length===signals;i++)await new Promise<void>(resolve=>setImmediate(resolve));
  assert.equal(mutations,0);const record=await host.bb.storage.kv.get<any>('automatic-v1:codex');assert.equal(record.pending,null);assert.ok(Object.keys(record.consumed).length);
 }finally{releaseSave?.();service.controller.abort();await service.done;await host.harness.lifecycle.dispose();t.mock.timers.reset();}
});

test('aborting the quota service during durable preparation blocks late ON before plugin disposal',async()=>{
 const host=createFakePluginHost({pluginId:'downshift',sdk:{system:{usageLimits:async()=>({codex:{status:'ok',windows:[{usedPercent:97,resetsAt:new Date(Date.now()+3600000).toISOString()}]}})}}});
 await host.bb.storage.kv.set('configuration-v1',{version:1,providerId:'codex',primaryModel:'primary',profile:{model:'small',reasoningLevel:'medium',serviceTier:'default'},autoEnabled:true});
 let mutations=0,releaseSave:(()=>void)|undefined;const original=host.bb.storage.kv.set;
 Object.assign(host.bb,{storage:{...host.bb.storage,kv:{...host.bb.storage.kv,set:async(key:string,value:unknown)=>{if(key==='automatic-v1:codex')await new Promise<void>(resolve=>{releaseSave=resolve;});await original(key,value);}}}});
 Object.assign(host.bb,{experimental_executionPolicies:{describe:()=>({protocol:nativeProtocol,semantics:requiredSemantics}),register:()=>({status:()=>({...unavailableDownshift(),available:true,error:null}),set:()=>{mutations++;throw Error('Late activation');},subscribe:()=>()=>{},release:()=>{}})}});
 await plugin(host.bb);const service=host.harness.behavior.runService('quota');
 try{
  for(let i=0;i<80&&!releaseSave;i++)await new Promise<void>(resolve=>setImmediate(resolve));assert.ok(releaseSave);
  service.controller.abort();releaseSave();await service.done;
  assert.equal(mutations,0);assert.ok((await host.bb.storage.kv.get<any>('automatic-v1:codex')).pending);
 }finally{service.controller.abort();releaseSave?.();await service.done;await host.harness.lifecycle.dispose();}
});
