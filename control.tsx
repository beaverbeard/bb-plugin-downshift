import {createPortal} from 'react-dom';
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useRpc,useRealtime,useRealtimeConnectionState,type PluginAppBuilder} from '@get-bb/plugin-sdk/app';
import type {rpcContract} from './server';
import {economyLabel,type EconomyState} from './lib/state';
import {economyFailure,type EconomyClientError} from './lib/client';
import {EconomyPalette,type PaletteView} from './lib/palette';
import {quotaBubble} from './lib/quota-view';
import './economy.css';

function Battery(){return <svg viewBox="0 0 256 256" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M200,56H24A16,16,0,0,0,8,72V184a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V72A16,16,0,0,0,200,56ZM64,160a8,8,0,0,1-16,0V96a8,8,0,0,1,16,0Zm40,0a8,8,0,0,1-16,0V96a8,8,0,0,1,16,0Zm40,0a8,8,0,0,1-16,0V96a8,8,0,0,1,16,0Zm96-72a8,8,0,0,0-8,8v64a8,8,0,0,0,16,0V96A8,8,0,0,0,240,88Z"/></svg>;}
export function EconomyControl(){
 const [,repaint]=useState(0);
 useEffect(()=>{const timer=setInterval(()=>repaint(value=>value+1),30000);return()=>clearInterval(timer);},[]);
 const [host,setHost]=useState<HTMLElement|null>(null);
 useEffect(()=>{
  const target=document.createElement('div');target.className='bb-economy-host';target.dataset.bbPluginRoot='';target.dataset.bbPlugin='economy';
  let frame=0;
  const attach=()=>{frame=0;const header=Array.from(document.querySelectorAll<HTMLElement>('[data-testid=app-page-header-content-row]')).find(item=>item.getClientRects().length>0);const parent=header??document.body;
   target.dataset.docked=header?'true':'false';
   if(target.parentElement!==parent){if(header)header.insertBefore(target,header.lastElementChild);else parent.append(target);}
  };
  const observer=new MutationObserver(()=>{if(!frame)frame=requestAnimationFrame(attach);});observer.observe(document.body,{childList:true,subtree:true});
  attach();setHost(target);return()=>{observer.disconnect();cancelAnimationFrame(frame);target.remove();};
 },[]);
 const paletteOwner=useRef<EconomyPalette|null>(null);
 const [palette,setPalette]=useState<PaletteView>({warm:false,confirmed:false});
 useLayoutEffect(()=>{let cache:Storage|null=null;try{cache=window.localStorage;}catch{}
  const owner=new EconomyPalette(document.documentElement,cache);paletteOwner.current=owner;setPalette({...owner.view});
  return()=>{owner.dispose();paletteOwner.current=null;};
 },[]);
 const acceptState=useCallback((next:EconomyState)=>{setState(next);const view=paletteOwner.current?.confirm(next);if(view)setPalette({...view});},[]);
 const rpc=useRpc<typeof rpcContract>();const connection=useRealtimeConnectionState();
 const [state,setState]=useState<EconomyState|null>(null),[busy,setBusy]=useState(false),[details,setDetails]=useState(false),[error,setError]=useState<EconomyClientError|null>(null);
 const mutation=useRef<{enabled:boolean;expectedGeneration:number;requestId:string}|null>(null);
 const live=useRef(true),serial=useRef(0),root=useRef<HTMLDivElement>(null);
 const refresh=useCallback(async()=>{const request=++serial.current;try{const next=await rpc.call('economy_state');if(live.current&&request===serial.current){acceptState(next);setError(current=>current?.kind==='connection'?null:current);}}catch{if(live.current&&request===serial.current){const view=paletteOwner.current?.unconfirm();if(view)setPalette({...view});setError({kind:'connection',message:'Server connection lost. State is unconfirmed.'});}}},[rpc,acceptState]);
 useEffect(()=>{live.current=true;void refresh();return()=>{live.current=false;};},[refresh]);
 useEffect(()=>{void refresh();},[connection,refresh]);useRealtime('economy-changed',()=>void refresh());
 useEffect(()=>{if(!details)return;const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setDetails(false);};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setDetails(false);};document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};},[details]);
 async function toggle(){
  if(busy||!state?.available)return;
  // Retry an uncertain operation with the SAME UUID; never invert based on stale local UI.
  const input=mutation.current??{enabled:!state.enabled,expectedGeneration:state.generation,requestId:crypto.randomUUID()};mutation.current=input;setBusy(true);setError(null);serial.current++;
  try{const next=await rpc.call('economy_set',input);mutation.current=null;if(live.current){acceptState(next);setDetails(next.pending.length+next.unavailable.length+next.conflicts.length>0);}}
  catch(error){const failure=economyFailure(error);if(!failure.retry)mutation.current=null;await refresh();if(live.current){setError(failure.error);setDetails(true);}}
  finally{if(live.current)setBusy(false);}
 }
 const issueCount=(state?.pending.length??0)+(state?.unavailable.length??0)+(state?.conflicts.length??0);
 const warning=!!error||!!state?.error||issueCount>0||!palette.confirmed;
 const label=palette.warm&&!palette.confirmed?'Economy · ?':economyLabel(state);
 const bubble=quotaBubble(state?.quota);
 if(!host)return null;
 return createPortal(<div ref={root} className="bb-economy" data-phase={state?.phase??'unknown'} data-warm={palette.warm||undefined} data-confirmed={palette.confirmed} data-warning={warning||undefined}>
  <div className="bb-economy-pill">
   <button type="button" className="bb-economy-switch" role="switch" aria-checked={state?.enabled??false} aria-label={`${label}, ${!palette.confirmed?'state unconfirmed':state?.enabled?'on':'off'}`} aria-busy={busy} disabled={busy||!state?.available} onClick={()=>void toggle()} title="Codex: Luna · medium · Fast off">
    <Battery/><span>{busy?'Switching…':label}</span>{state?.phase==='on'&&<span className="bb-economy-dot" aria-hidden="true"/>}
   </button>
   {warning&&<button type="button" className="bb-economy-info" aria-label="Economy details" aria-expanded={details} onClick={()=>setDetails(!details)}>!</button>}
  </div>
  <span className="bb-economy-quota" data-tone={bubble.tone} title={bubble.title} aria-label={bubble.title}>{bubble.label}</span>
  {details&&<section className="bb-economy-details" aria-label="Economy status">
   <strong>Economy · Codex only</strong><p>Luna · medium · Fast off</p>
   <p role="status">{!palette.confirmed?'State unconfirmed by server':state?.phase==='off'?'Off':state?.phase==='disabling'?'Restoring individual profiles':state?.phase==='enabling'?'Enabling at safe native boundaries':'On'}{state?.enabled?`. Ready: ${state.ready} of ${state.eligible}`:''}</p>
   {(error||state?.error)&&<p role="alert">{error?.message??state?.error}</p>}
   {state?.pending.length? <p>Waiting for current turns to finish: {state.pending.length}. Work continues.</p>:null}
   {state?.unavailable.map((item,index)=><p key={`host-${item.threadId}-${index}`} role="alert">{item.hostId??'Host'}: {item.reason}</p>)}
   {state?.conflicts.map((item,index)=><p key={`conflict-${item.threadId}-${index}`} role="alert">{item.reason}</p>)}
   <p>Original settings are preserved. Turn Economy off to change them.</p>
   {state?.automatic&&<p role="status">{state.automatic.message}</p>}
   <p className="bb-economy-note">A smaller model can reduce quota use; shared subscription limits still apply.</p>
  </section>}
 </div>,host);
}
export function registerEconomyMode(app:PluginAppBuilder){app.slots.experimental_appOverlay({id:'economy-mode',component:EconomyControl});}
