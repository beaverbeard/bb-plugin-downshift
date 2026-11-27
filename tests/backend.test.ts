import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {BbPluginApi} from '@get-bb/plugin-sdk';
import {experimental_scanPublicSdkOnly} from '@get-bb/plugin-sdk/testing';
import plugin from '../server';
import {nativeProtocol,requiredSemantics,type NativeExecutionPolicies} from '../lib/native-contract';
import {unavailableDownshift} from '../lib/state';
import type {Configuration} from '../lib/configuration';
import {policyId,configurationId} from '../lib/policy-id';

export const config:Configuration={version:1,providerId:'other-provider',primaryModel:'main-model',profile:{model:'small-model',reasoningLevel:'default',serviceTier:'default'},autoEnabled:false};
function host(capability?:unknown,initial:Configuration|null=config){
 const handlers:Record<string,(value?:any)=>any>={},cleanup:(()=>void|Promise<void>)[]=[],services:string[]=[],notices:string[]=[],signals:string[]=[];
 const storage=new Map<string,unknown>();if(initial)storage.set('configuration-v1',initial);
 const model=(id:string)=>({model:id,displayName:id,reasoningDiscovery:'known',supportedReasoningEfforts:[],defaultReasoningEffort:'default'});
 const bb={experimental_executionPolicies:capability,settings:{define:()=>({})},status:{needsConfiguration:(message:string)=>notices.push(message)},storage:{kv:{get:async(key:string)=>storage.get(key),set:async(key:string,value:unknown)=>{storage.set(key,value);}}},rpc:{register:(_contract:unknown,value:typeof handlers)=>Object.assign(handlers,value)},realtime:{publish:(channel:string)=>signals.push(channel)},background:{service:(id:string)=>services.push(id)},onDispose:(callback:()=>void|Promise<void>)=>cleanup.push(callback),sdk:{providers:{list:async()=>[{id:'other-provider',displayName:'Other Provider',available:true,maintenance:{usage:true}}],models:async()=>({models:[model('main-model'),model('small-model'),model('another-small-model')],modelLoadError:null})}}};
 return {bb:bb as unknown as BbPluginApi,handlers,services,notices,signals,cleanup,storage};
}
const operation=(configuration:Configuration=config)=>({enabled:true,expectedGeneration:0,requestId:'5072ce12-1ad6-4b1d-942c-e106ee17747a',configurationId:configurationId(configuration)});
function nativeFixture(){
 let releases=0,unsubscribed=0,mutations=0,changed=()=>{};
 const declarations:any[]=[];
 const native:NativeExecutionPolicies={describe:()=>({protocol:nativeProtocol,semantics:requiredSemantics}),register:declaration=>{
  declarations.push(declaration);let state={...unavailableDownshift(),profile:declaration.profile,available:true,error:null};
  return {status:()=>state,set:input=>{assert.equal(input.expectedGeneration,state.generation);mutations++;state={...state,enabled:input.enabled,phase:input.enabled?'on':'off',generation:state.generation+1};return state;},subscribe:callback=>{changed=callback;return()=>{unsubscribed++;};},release:()=>{releases++;}};
 }};
 return {native,declarations,get releases(){return releases;},get mutations(){return mutations;},get unsubscribed(){return unsubscribed;},changed:()=>changed()};
}
test('stock and incomplete capability cannot register or mutate',async()=>{
 for(const cap of [undefined,{}, ...['catalog-profile-validation','consistent-durable-registry'].map(missing=>({describe:()=>({protocol:nativeProtocol,semantics:requiredSemantics.filter(s=>s!==missing)}),register:()=>{throw Error('must not register');}}))]){
  const h=host(cap);await plugin(h.bb);assert.equal(h.handlers.economy_state!().available,false);assert.match(h.handlers.economy_state!().error,/stock BB/i);
  await assert.rejects(h.handlers.economy_set!(operation()),/native/);
 }
});
test('stock BB persists the model selection without registering or switching',async()=>{
 const h=host(undefined,null);await plugin(h.bb);
 assert.deepEqual(await h.handlers.economy_configure!(config),{nativeAvailable:false,configuration:config});
 assert.deepEqual(h.storage.get('configuration-v1'),config);assert.deepEqual(h.handlers.economy_configuration!(),{nativeAvailable:false,configuration:config});
 assert.equal(h.handlers.economy_state!().available,false);await assert.rejects(h.handlers.economy_set!(operation()),/native/);
 await assert.rejects(h.handlers.economy_configure!({...config,primaryModel:'unknown'}));assert.deepEqual(h.storage.get('configuration-v1'),config);
 const restarted=host(undefined,h.storage.get('configuration-v1') as Configuration);await plugin(restarted.bb);assert.deepEqual(restarted.handlers.economy_configuration!().configuration,config);
 const n=nativeFixture(),upgraded=host(n.native,h.storage.get('configuration-v1') as Configuration);await plugin(upgraded.bb);assert.equal(n.declarations.length,1);assert.equal(upgraded.handlers.economy_state!().available,true);
});
test('first install has no implied model; selection uses any available provider and survives reload',async()=>{
 const n=nativeFixture(),h=host(n.native,null);await plugin(h.bb);
 assert.equal(n.declarations.length,0);assert.equal(h.handlers.economy_configuration!().configuration,null);
 assert.equal(h.handlers.economy_state!().profile,null);await assert.rejects(h.handlers.economy_set!(operation()));
 const catalog=await h.handlers.economy_catalog!({providerId:'other-provider'});assert.equal(catalog.models.length,3);assert.equal(catalog.providers[0].usageSupported,true);
 await h.handlers.economy_configure!(config);assert.deepEqual(n.declarations[0],{id:policyId(config),providerId:config.providerId,profile:config.profile});
 assert.deepEqual(h.storage.get('configuration-v1'),config);
 const restarted=host(nativeFixture().native,h.storage.get('configuration-v1') as Configuration);await plugin(restarted.bb);assert.equal(restarted.handlers.economy_state!().configurationId,configurationId(config));
});
test('native subscription and handle release once; no mutations after disposal',async()=>{
 const n=nativeFixture(),h=host(n.native);await plugin(h.bb);n.changed();assert.equal(h.signals.length,1);
 assert.equal((await h.handlers.economy_set!(operation())).enabled,true);
 for(const dispose of h.cleanup)await dispose();n.changed();assert.equal(n.releases,1);assert.equal(n.unsubscribed,1);
 await assert.rejects(h.handlers.economy_set!(operation()));assert.equal(n.mutations,1);
});
test('changing profiles requires OFF; stale switch requests cannot target a newly configured profile',async()=>{
 const n=nativeFixture(),h=host(n.native);await plugin(h.bb);const next={...config,profile:{...config.profile,model:'another-small-model'}};
 await h.handlers.economy_set!(operation());await assert.rejects(h.handlers.economy_configure!(next),/Turn Downshift off/);assert.equal(n.releases,0);
 await h.handlers.economy_set!({...operation(),enabled:false,expectedGeneration:1});await h.handlers.economy_configure!(next);assert.equal(n.releases,1);
 await assert.rejects(h.handlers.economy_set!(operation()),/model selection changed/);assert.equal(n.mutations,2);
 assert.equal((await h.handlers.economy_set!(operation(next))).enabled,true);
});
test('forged models, reasoning, service tiers and unsupported automatic quotas fail before configuration writes',async()=>{
 const n=nativeFixture(),h=host(n.native,null);await plugin(h.bb);
 for(const bad of [{...config,primaryModel:'unknown'},{...config,profile:{...config.profile,model:'unknown'}},{...config,profile:{...config.profile,reasoningLevel:'invented'}},{...config,profile:{...config.profile,serviceTier:'fast'}}])await assert.rejects(h.handlers.economy_configure!(bad));
 assert.equal(n.declarations.length,0);assert.equal(h.storage.has('configuration-v1'),false);
});
test('failed native subscription releases the handle and preserves the registration error',async()=>{
 let releases=0;const h=host({describe:()=>({protocol:nativeProtocol,semantics:requiredSemantics}),register:()=>({status:()=>({}),set:()=>({}),subscribe:()=>{throw Error('failed');},release:()=>releases++})});await plugin(h.bb);assert.equal(releases,1);assert.match(h.handlers.economy_state!().error,/registration failed: failed/);
});
test('a native handle without release() reports a registration error instead of aborting startup',async()=>{
 const h=host({describe:()=>({protocol:nativeProtocol,semantics:requiredSemantics}),register:()=>({status:()=>({}),set:()=>({}),subscribe:()=>()=>{}})});await plugin(h.bb);
 assert.match(h.handlers.economy_state!().error,/registration failed: Invalid native controller/);assert.ok(h.handlers.economy_configuration);
});
test('a rejected native handle that can release is released',async()=>{
 let releases=0;
 const h=host({describe:()=>({protocol:nativeProtocol,semantics:requiredSemantics}),register:()=>({status:()=>({}),subscribe:()=>()=>{},release:()=>{releases++;}})});await plugin(h.bb);
 assert.match(h.handlers.economy_state!().error,/registration failed: Invalid native controller/);assert.equal(releases,1);
});
test('manual OFF still restores profiles when the suppression record cannot be saved',async()=>{
 for(const autoEnabled of [false,true]){
  const n=nativeFixture(),selected={...config,autoEnabled},h=host(n.native,selected);
  const set=h.bb.storage.kv.set;(h.bb.storage.kv as {set:typeof set}).set=async(key,value)=>{if(key.startsWith('automatic-'))throw Error('disk full');return set(key,value);};
  await plugin(h.bb);await h.handlers.economy_set!(operation(selected));
  const off=await h.handlers.economy_set!({...operation(selected),enabled:false,expectedGeneration:1,requestId:'1d1c4c11-7d0e-4a4e-9a51-2f8b8c1f3d6e'});
  assert.equal(off.enabled,false);assert.equal(n.mutations,2);
  const automatic=h.handlers.economy_state!().automatic;
  if(autoEnabled)assert.equal(automatic?.status,'error');else assert.equal(automatic,undefined);
 }
});
test('package uses public SDK imports only',async()=>{const result=await experimental_scanPublicSdkOnly(process.cwd(),{allow:[/^react$/, /^react-dom(?:\/server)?$/]});assert.deepEqual(result.violations,[]);assert.deepEqual(result.privateDependencies,[]);});
