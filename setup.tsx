import {useEffect,useState,useRef} from 'react';
import {useRpc} from '@get-bb/plugin-sdk/app';
import type {rpcContract} from './server';
import type {Catalog,Configuration} from './lib/configuration';
import {readSetupDraft,saveSetupDraft} from './lib/setup-draft';

export function DownshiftSetup({onSaved}:{onSaved?:()=>void}){
 const rpc=useRpc<typeof rpcContract>();
 const draftKey=onSaved?'bb.downshift.setup-overlay.v1':'bb.downshift.setup-settings.v1';
 const draftBase=useRef<string|null>(null),initialized=useRef(false);
 const [catalog,setCatalog]=useState<Catalog>({providers:[],models:[],error:null});
 const [provider,setProvider]=useState(''),[main,setMain]=useState(''),[model,setModel]=useState(''),[reasoning,setReasoning]=useState(''),[tier,setTier]=useState('default'),[auto,setAuto]=useState(false);
 const [attempt,setAttempt]=useState(0);
 const [busy,setBusy]=useState(true),[error,setError]=useState(''),[saved,setSaved]=useState(false),[native,setNative]=useState(false);
 useEffect(()=>{let alive=true;initialized.current=false;setBusy(true);setError('');void(async()=>{
  try{
   const setup=await rpc.call('economy_configuration');if(!alive)return;setNative(setup.nativeAvailable);
   const base=JSON.stringify(setup.configuration),draft=readSetupDraft(draftKey,base),c=setup.configuration;
   draftBase.current=base;
   const values=draft??{provider:c?.providerId??'',main:c?.primaryModel??'',model:c?.profile.model??'',reasoning:c?.profile.reasoningLevel??'',tier:c?.profile.serviceTier??'default',auto:c?.autoEnabled??false};
   setProvider(values.provider);setMain(values.main);setModel(values.model);setReasoning(values.reasoning);setTier(values.tier);setAuto(values.auto);
   const list=await rpc.call('economy_catalog',{providerId:values.provider||null});if(alive){setCatalog(list);initialized.current=true;}
  }catch{if(alive)setError('Could not read Downshift settings. Try again.');}finally{if(alive)setBusy(false);}
 })();return()=>{alive=false;};},[rpc,attempt,draftKey]);
 useEffect(()=>{
  if(!initialized.current||draftBase.current===null)return;
  const current:Configuration={version:1,providerId:provider,primaryModel:main,profile:{model,reasoningLevel:reasoning,serviceTier:tier},autoEnabled:auto};
  const clean=JSON.stringify(current)===draftBase.current||(!provider&&!main&&!model);
  saveSetupDraft(draftKey,clean?null:{base:draftBase.current,provider,main,model,reasoning,tier,auto});
 },[provider,main,model,reasoning,tier,auto,busy,saved,draftKey]);
 async function chooseProvider(id:string){setProvider(id);setMain('');setModel('');setReasoning('');setTier('default');setAuto(catalog.providers.some(p=>p.id===id&&p.usageSupported));setSaved(false);setBusy(true);setError('');setCatalog(old=>({...old,models:[]}));try{setCatalog(await rpc.call('economy_catalog',{providerId:id}));}catch{setError('BB could not load this provider. Try again.');}finally{setBusy(false);}}
 const economic=catalog.models.find(m=>m.model===model);
 async function save(){if(busy)return;setBusy(true);setError('');setSaved(false);const value:Configuration={version:1,providerId:provider,primaryModel:main,profile:{model,reasoningLevel:reasoning,serviceTier:tier},autoEnabled:auto};try{const result=await rpc.call('economy_configure',value);draftBase.current=JSON.stringify(result.configuration);saveSetupDraft(draftKey,null);setSaved(true);onSaved?.();}catch(e){setError(e instanceof Error?e.message:'Could not save Downshift settings.');}finally{setBusy(false);}}
 return <div className="bb-downshift-setup">
  {!native&&!busy&&<p role="alert">This BB build needs the companion native integration. See the compatibility guide before enabling Downshift.</p>}
  <label>Provider<select value={provider} disabled={busy} onChange={e=>void chooseProvider(e.target.value)}><option value="" disabled>Choose your provider</option>{catalog.providers.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
  <label>What is your main model?<select value={main} disabled={busy||!provider} onChange={e=>{setMain(e.target.value);setSaved(false)}}><option value="" disabled>Choose your main model</option>{catalog.models.map(m=><option key={m.model} value={m.model}>{m.label}</option>)}</select></label>
  <label>Downshift model<select value={model} disabled={busy||!main} onChange={e=>{const m=catalog.models.find(m=>m.model===e.target.value);setModel(e.target.value);setReasoning(m?.defaultReasoningLevel??'');setTier('default');setSaved(false);}}><option value="" disabled>Choose a smaller model</option>{catalog.models.map(m=><option key={m.model} value={m.model}>{m.label}</option>)}</select></label>
  {economic&&<label>Reasoning<select value={reasoning} disabled={busy} onChange={e=>{setReasoning(e.target.value);setSaved(false);}}>{economic.reasoningLevels.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></label>}
  {economic&&economic.serviceTiers.length>1&&<label>Service tier<select value={tier} disabled={busy} onChange={e=>{setTier(e.target.value);setSaved(false);}}>{economic.serviceTiers.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>}
  {catalog.providers.find(p=>p.id===provider)?.usageSupported?<label className="bb-downshift-check"><input type="checkbox" checked={auto} disabled={busy} onChange={e=>{setAuto(e.target.checked);setSaved(false);}}/>Enable automatically at 5% remaining</label>:provider&&<p>This provider does not expose quota through BB. Automatic activation needs a provider usage source.</p>}
  <p>Downshift applies to {catalog.providers.find(p=>p.id===provider)?.label??'the selected provider'} threads. Turning it off restores each thread’s original profile. Choose a smaller model suited to your work; BB does not rank model cost.</p>
  {(error||catalog.error)&&<><p role="alert">{error||catalog.error}</p><button type="button" disabled={busy} onClick={()=>setAttempt(value=>value+1)}>Reload catalog</button></>}
  {saved&&<p role="status">Model selection saved.</p>}
  <button type="button" disabled={busy||!native||!main||!model||!reasoning} onClick={()=>void save()}>{busy?'Loading…':'Save model selection'}</button>
 </div>;
}
