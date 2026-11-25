import {defineRpcContract, experimental_PluginRpcRefusal, type BbPluginApi} from '@get-bb/plugin-sdk';
import {z} from 'zod';
import {AutomaticDownshift, type AutomaticRecord, type QuotaSnapshot, type ModeOperation} from './lib/automatic';
import {nativeCapability, type NativeController} from './lib/native-contract';
import {readNativeQuota} from './lib/quota-source';
import {downshiftStateSchema, downshiftSetSchema, unavailableDownshift, type DownshiftState} from './lib/state';
import {catalogSchema,configurationSchema,checkSelection,type Catalog,type Configuration} from './lib/configuration';
import {policyId,configurationId} from './lib/policy-id';

const setupSchema=z.object({nativeAvailable:z.boolean(),configuration:configurationSchema.nullable()});
export const rpcContract=defineRpcContract({
 economy_state:{input:z.null(),output:downshiftStateSchema},
 economy_set:{input:downshiftSetSchema,output:downshiftStateSchema},
 economy_configuration:{input:z.null(),output:setupSchema},
 economy_catalog:{input:z.object({providerId:z.string().max(64).nullable()}),output:catalogSchema},
 economy_configure:{input:configurationSchema,output:setupSchema},
});
const missing='Requires the native bb.execution-policy/v1 capability. Stock BB is unsupported. See the package compatibility guide.';

export default async function plugin(bb:BbPluginApi){
 const native=nativeCapability((bb as BbPluginApi&{experimental_executionPolicies?:unknown}).experimental_executionPolicies);
 const stored=await bb.storage.kv.get<unknown>('configuration-v1');
 const parsed=configurationSchema.safeParse(stored);
 let configuration:Configuration|null=parsed.success?parsed.data:null;
 let controller:NativeController|null=null,unsubscribe=()=>{},automatic:AutomaticDownshift|null=null;
 let configurationError=native?'Choose your main model and a Downshift model in Downshift settings.':missing;
 let latestQuota:QuotaSnapshot|null=null,quotaSignal:AbortSignal|null=null,disposed=false,reconfiguring=false,epoch=0,manualOffPending=0;
 let readingAbort=new AbortController();
 let operations:Promise<unknown>=Promise.resolve();
 const serialize=<T,>(action:()=>Promise<T>):Promise<T>=>{const result=operations.then(action);operations=result.catch(()=>{});return result;};
 const publish=()=>{if(!disposed)bb.realtime.publish('economy-changed',null);};
 const status=():DownshiftState=>{
  if(!controller)return unavailableDownshift(configurationError);
  try{return {...downshiftStateSchema.parse(controller.status()),configurationId:configuration?configurationId(configuration):null};}
  catch{return unavailableDownshift('The native controller returned an invalid state. No switch is allowed.');}
 };
 const set=(input:ModeOperation):DownshiftState=>{
  if(!controller||disposed)throw new experimental_PluginRpcRefusal({code:'conflict',message:configurationError});
  try{controller.set(input);return status();}
  catch(error){if(error instanceof Error&&(error as Error&{code?:string}).code==='execution_policy_conflict')throw new experimental_PluginRpcRefusal({code:'conflict',message:error.message});throw error;}
 };
 const release=()=>{epoch++;readingAbort.abort();readingAbort=new AbortController();automatic?.dispose();automatic=null;unsubscribe();unsubscribe=()=>{};controller?.release();controller=null;latestQuota=null;};
 const register=()=>{
  if(!native||!configuration||disposed)return;
  const config=configuration,id=policyId(config);
  try{
   const handle=native.register({id,providerId:config.providerId,profile:config.profile});
   // Validate before adopting the handle: release() on a malformed handle would throw out of the catch below and abort plugin startup.
   if(!handle||!['status','set','subscribe','release'].every(k=>typeof(handle as unknown as Record<string,unknown>)[k]==='function'))throw Error('Invalid native controller');
   controller=handle;
   unsubscribe=handle.subscribe(publish);
   automatic=new AutomaticDownshift({
    load:async()=>(await bb.storage.kv.get<AutomaticRecord>(`automatic-v2:${config.providerId}`))??(await bb.storage.kv.get<unknown>(`automatic-v1:${config.providerId}`))??null,
    save:value=>bb.storage.kv.set(`automatic-v2:${config.providerId}`,value),
    mode:status,set:input=>{if(disposed||reconfiguring||manualOffPending>0||!quotaSignal||quotaSignal.aborted||configuration!==config)throw Error('Configuration changed');return set(input);},
    providerId:config.providerId,primaryModel:config.primaryModel,policyId:configurationId(config),
    confirm:async()=>{if(!quotaSignal||disposed||reconfiguring||configuration!==config)return null;const read=await readNativeQuota(bb.sdk,config,AbortSignal.any([quotaSignal,readingAbort.signal,AbortSignal.timeout(12_000)]));return read.quota;},
   });
  }catch(error){configurationError=`Native Downshift registration failed: ${error instanceof Error?error.message.slice(0,500):'Invalid controller response.'}`;release();}
 };
 register();
 if(!native)bb.status.needsConfiguration(missing);
 bb.onDispose(async()=>{disposed=true;const previous=automatic;release();await previous?.settled();});
 const catalog=async(providerId:string|null):Promise<Catalog>=>{
  const signal=AbortSignal.timeout(12_000);
  const providers=(await bb.sdk.providers.list({signal})).filter(p=>p.available).map(p=>({id:p.id,label:p.displayName,usageSupported:p.maintenance.usage}));
  if(!providerId)return {providers,models:[],error:null};
  if(!providers.some(p=>p.id===providerId))return {providers,models:[],error:'This provider is unavailable.'};
  const result=await bb.sdk.providers.models({providerId,preferCached:false,signal});
  if(result.modelLoadError)return {providers,models:[],error:'BB could not confirm this model catalog. Check the provider connection and try again.'};
  const models=result.models.filter(m=>(!m.routeProviderId||m.routeProviderId===providerId)&&m.reasoningDiscovery!=='unknown').map(m=>({
   model:m.model,label:m.displayName,
   reasoningLevels:m.supportedReasoningEfforts.length?m.supportedReasoningEfforts.map(r=>({id:r.reasoningEffort,label:r.label??r.reasoningEffort})):[{id:m.defaultReasoningEffort,label:'Default'}],
   defaultReasoningLevel:m.defaultReasoningEffort,
   serviceTiers:[{id:'default',label:'Default'},...(m.supportedServiceTiers??[]).filter(t=>t.id!=='default').map(t=>({id:t.id,label:t.label??t.id}))],
  }));
  return {providers,models,error:models.length?null:'No confirmed models are available on the primary machine.'};
 };
 bb.rpc.register(rpcContract,{
  economy_state:()=>({...status(),...(configuration?.autoEnabled&&automatic?{automatic:automatic.view}:{})}),
  economy_configuration:()=>({nativeAvailable:!!native,configuration}),
  economy_catalog:input=>catalog(input.providerId),
  economy_configure:async input=>{
   if(!native||disposed)throw new experimental_PluginRpcRefusal({code:'conflict',message:missing});
   input=configurationSchema.parse(input);
   checkSelection(input,await catalog(input.providerId));
   return serialize(async()=>{
    if(disposed)throw Error('Downshift was unloaded.');
    if(controller&&JSON.stringify(input)===JSON.stringify(configuration))return {nativeAvailable:true,configuration};
    if(controller&&status().phase!=='off')throw new experimental_PluginRpcRefusal({code:'conflict',message:'Turn Downshift off and wait for restoration before changing models.'});
    reconfiguring=true;readingAbort.abort();readingAbort=new AbortController();
    try{
     await bb.storage.kv.set('configuration-v1',input);
     automatic?.dispose();await automatic?.settled();
     release();configuration=input;register();publish();
     if(!controller)throw new experimental_PluginRpcRefusal({code:'conflict',message:configurationError});
     return {nativeAvailable:true,configuration};
    }finally{reconfiguring=false;}
   });
  },
  economy_set:async input=>{
   // Suppression must finish before entering the mutation queue used by auto ON.
   // A manual OFF therefore remains the final operation even if an auto request was already prepared.
   if(!configuration||input.configurationId!==configurationId(configuration))throw new experimental_PluginRpcRefusal({code:'conflict',message:'The model selection changed. Refresh Downshift before switching.'});
   const current=automatic;if(!input.enabled)manualOffPending++;
   try{
   // OFF restores original profiles, so a failed suppression record must not block it. With auto on, pause auto for this load instead so it cannot re-enable.
   if(!input.enabled&&current)await current.suppress(latestQuota).catch(()=>{if(configuration?.autoEnabled&&automatic===current){current.dispose();current.view={status:'error',message:'Manual off could not be saved. Automatic activation is paused until Downshift reloads.'};}});
   return await serialize(async()=>{if(!configuration||input.configurationId!==configurationId(configuration))throw new experimental_PluginRpcRefusal({code:'conflict',message:'The model selection changed. Refresh Downshift before switching.'});const {configurationId:_selectionId,...operation}=input;const next=set(operation);publish();return next;});
   }finally{if(!input.enabled)manualOffPending--;}
  },
 });
 bb.background.service('quota',{
  async start(signal){
   quotaSignal=signal;
   while(!signal.aborted&&!disposed){
    const config=configuration,observer=automatic,version=epoch;
    if(config?.autoEnabled&&observer){
     const {quota,issue}=await readNativeQuota(bb.sdk,config,AbortSignal.any([signal,readingAbort.signal,AbortSignal.timeout(12_000)]));
     if(signal.aborted||disposed)return;
     if(version===epoch&&configuration===config&&!reconfiguring){latestQuota=quota;await observer.observe(quota);if(!quota&&issue)observer.view={status:'stale',message:issue};publish();}
    }
    await new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,30_000);signal.addEventListener('abort',done,{once:true});if(signal.aborted)done();});
   }
  },
 });
}
