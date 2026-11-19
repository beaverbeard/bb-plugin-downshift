import test from 'node:test';
import assert from 'node:assert/strict';
import {createFakePluginHost} from '@get-bb/plugin-sdk/testing';
import plugin from '../server';
import {nativeProtocol,requiredSemantics} from '../lib/native-contract';
import {unavailableEconomy} from '../lib/state';

test('a failed native quota read publishes stale automatic status without exposing a percentage widget; disposal cancels observation',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let calls=0,released=0;
 const host=createFakePluginHost({pluginId:'economy',settings:{autoEnabled:true,primaryModel:'primary'},sdk:{system:{usageLimits:async()=>{calls++;if(calls>1)throw Error('native usage unavailable');return {codex:{status:'ok',windows:[{usedPercent:55,resetsAt:new Date(Date.now()+3600000).toISOString()}]}};}}}});
 const mode={...unavailableEconomy(),available:true,error:null};
 Object.assign(host.bb,{experimental_executionPolicies:{describe:()=>({protocol:nativeProtocol,semantics:requiredSemantics}),register:()=>({status:()=>mode,set:()=>{throw Error('No execution mutation is expected');},subscribe:()=>()=>{},release:()=>{released++;}})}});
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
