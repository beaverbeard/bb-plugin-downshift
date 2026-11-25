import {createPortal} from 'react-dom';
import {useCallback,useEffect,useLayoutEffect,useId,useRef,useState,useSyncExternalStore} from 'react';
import {useRpc,useRealtime,useRealtimeConnectionState,useSettings,type PluginAppBuilder} from '@get-bb/plugin-sdk/app';
import type {rpcContract} from './server';
import {downshiftLabel,downshiftStatusText,type DownshiftState} from './lib/state';
import {downshiftFailure,switchRequest,type DownshiftClientError,type SwitchRequest} from './lib/client';
import {DownshiftPalette,type PaletteView} from './lib/palette';
import {DownshiftSwitch,DownshiftSymbol} from './lib/downshift-switch';
import {downshiftView,switchChecked,type DownshiftView} from './lib/view-store';
import {headerInsertionPoint,headerParent,releaseEmptyHeaderDock} from './lib/header-dock';
import {DownshiftSetup} from './setup';
import './downshift.css';

export function DownshiftControl(){
 const [,repaint]=useState(0);
 useEffect(()=>{const timer=setInterval(()=>repaint(value=>value+1),30000);return()=>clearInterval(timer);},[]);
 const [host,setHost]=useState<HTMLElement|null>(null),headerMount=useRef(0);
 // Hiding the header switch keeps the state, the palette and the app-wide tint; it only skips the portal.
 // Wait for the saved value so a hidden switch does not flash in on a cold load.
 const settings=useSettings(),shown=!settings.isLoading&&settings.values?.showHeaderSwitch!==false;
 useEffect(()=>{
  // A new mount closes any popup, and a switch started under an earlier mount does not open one (see toggle).
  headerMount.current++;setDetails(false);
  if(!shown){setHost(null);return;}
  const target=document.createElement('div');target.className='bb-downshift-host';target.dataset.bbPluginRoot='';target.dataset.bbPlugin='downshift';
  let frame=0;
  const attach=()=>{frame=0;const parent=headerParent(),header=parent.hasAttribute('data-bb-header-addons')?null:parent;
   target.dataset.docked=header?'true':'false';
   if(target.parentElement!==parent){if(header)header.insertBefore(target,headerInsertionPoint(header));else parent.append(target);releaseEmptyHeaderDock();}
  };
  const observer=new MutationObserver(()=>{if(!frame)frame=requestAnimationFrame(attach);});observer.observe(document.body,{childList:true,subtree:true});
  attach();setHost(target);return()=>{observer.disconnect();cancelAnimationFrame(frame);target.remove();releaseEmptyHeaderDock();};
 },[shown]);
 const paletteOwner=useRef<DownshiftPalette|null>(null);
 const [palette,setPalette]=useState<PaletteView>({warm:false,confirmed:false});
 useLayoutEffect(()=>{let cache:Storage|null=null;try{cache=window.localStorage;}catch{}
  const owner=new DownshiftPalette(document.documentElement,cache);paletteOwner.current=owner;setPalette({...owner.view});
  return()=>{owner.dispose();paletteOwner.current=null;};
 },[]);
 const acceptState=useCallback((next:DownshiftState)=>{if(mutation.current&&mutation.current.configurationId!==next.configurationId)mutation.current=null;setState(next);const view=paletteOwner.current?.confirm(next);if(view)setPalette({...view});},[]);
 const rpc=useRpc<typeof rpcContract>();const connection=useRealtimeConnectionState();
 const [state,setState]=useState<DownshiftState|null>(null),[busy,setBusy]=useState(false),[details,setDetails]=useState(false),[error,setError]=useState<DownshiftClientError|null>(null);
 const mutation=useRef<SwitchRequest|null>(null);
 const live=useRef(true),serial=useRef(0),root=useRef<HTMLDivElement>(null);
 const refresh=useCallback(async()=>{const request=++serial.current;try{const next=await rpc.call('economy_state');if(live.current&&request===serial.current){acceptState(next);setError(current=>current?.kind==='connection'?null:current);}}catch{if(live.current&&request===serial.current){const view=paletteOwner.current?.unconfirm();if(view)setPalette({...view});setError({kind:'connection',message:'Server connection lost. State is unconfirmed.'});}}},[rpc,acceptState]);
 useEffect(()=>{live.current=true;void refresh();return()=>{live.current=false;};},[refresh]);
 useEffect(()=>{void refresh();},[connection,refresh]);useRealtime('economy-changed',()=>void refresh());
 useEffect(()=>{if(!details)return;const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setDetails(false);};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setDetails(false);};document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};},[details]);
 // fromHeader: only the header switch opens its own popup; the sidebar panel already shows the details.
 async function toggle(enabled = !state?.enabled,fromHeader=true){
  if(busy||!state?.available||!state.configurationId)return;
  // Retry an uncertain operation with the SAME UUID (same direction only); never invert based on stale local UI.
  const mount=headerMount.current,openDetails=(open:boolean)=>{if(fromHeader&&mount===headerMount.current)setDetails(open);};
  const input=switchRequest(mutation.current,enabled,state.generation,state.configurationId);mutation.current=input;setBusy(true);setError(null);serial.current++;
  try{const next=await rpc.call('economy_set',input);mutation.current=null;if(live.current){acceptState(next);openDetails(next.pending.length+next.unavailable.length+next.conflicts.length>0);}}
  catch(error){const failure=downshiftFailure(error);if(!failure.retry)mutation.current=null;await refresh();if(live.current){setError(failure.error);openDetails(true);}}
  finally{if(live.current)setBusy(false);}
 }
 const issueCount=(state?.pending.length??0)+(state?.unavailable.length??0)+(state?.conflicts.length??0);
 const automaticIssue=state?.automatic?.status==='stale'||state?.automatic?.status==='error';
 const warning=!!error||!!state?.error||issueCount>0||automaticIssue||!palette.confirmed;
 const label=palette.warm&&!palette.confirmed?'Downshift · ?':downshiftLabel(state);
 const switchLabel=`${busy?'Switching…':label}, ${state&&!state.available&&error?.kind!=='connection'?'not active':!palette.confirmed?'state unconfirmed':state?.enabled?`on · ${state.profile?.model??'selected model'}`:'off · original profiles'}`;
 // Published after commit, so the sidebar's toggle always carries the configuration and generation it displays.
 const view:DownshiftView={state,palette,busy,error,warning,toggle:enabled=>void toggle(enabled,false)};
 useEffect(()=>{downshiftView.set(view);});
 useEffect(()=>()=>downshiftView.set(null),[]);
 if(!host)return null;
 return createPortal(<div ref={root} className="bb-downshift" data-phase={state?.phase??'unknown'} data-warm={palette.warm||undefined} data-confirmed={palette.confirmed} data-warning={warning||undefined}>
  <div className="bb-downshift-pill">
   <DownshiftSwitch className="bb-downshift-switch" checked={switchChecked(view)} disabled={busy||!state?.available} busy={busy} label={switchLabel} onChange={enabled=>void toggle(enabled)}/>
   {warning&&<button type="button" className="bb-downshift-info" aria-label="Downshift details" aria-expanded={details} onClick={()=>setDetails(!details)}>!</button>}
  </div>
  {details&&<section className="bb-downshift-details" aria-label="Downshift status"><strong>Downshift</strong><DownshiftDetails view={view}/></section>}
 </div>,host);
}
function DownshiftDetails({view:{state,palette,error},ids}:{view:DownshiftView;ids?:{profile:string;status:string}}){
 return <>
  {state?.profile&&<p id={ids?.profile}>{state.profile.model} · {state.profile.reasoningLevel} · {state.profile.serviceTier}</p>}
  <p id={ids?.status} role="status">{downshiftStatusText(state,palette.confirmed,error?.kind==='connection')}{state?.enabled?`. Ready: ${state.ready} of ${state.eligible}`:''}</p>
  {(error||state?.error)&&<p role="alert">{error?.message??state?.error}</p>}
  {state?.pending.length? <p>Waiting for current turns to finish: {state.pending.length}. Work continues.</p>:null}
  {state?.unavailable.map((item,index)=><p key={`host-${item.threadId}-${index}`} role="alert">{item.hostId??'Host'}: {item.reason}</p>)}
  {state?.conflicts.map((item,index)=><p key={`conflict-${item.threadId}-${index}`} role="alert">{item.reason}</p>)}
  <p>Change models on the Downshift page in Plugins.</p>
  <p>Original settings are preserved. Turn Downshift off to change them.</p>
  {state?.automatic&&<p role="status">{state.automatic.message}</p>}
  <p className="bb-downshift-note">A smaller model can reduce quota use; shared subscription limits still apply.</p>
 </>;
}
const useDownshiftView=()=>useSyncExternalStore(downshiftView.subscribe,downshiftView.get);
/** Sidebar footer icon: the turtle while Downshift is (or was last confirmed) on, the rabbit otherwise. */
export function DownshiftModeIcon({className}:{className?:string}){
 const view=useDownshiftView();
 return <DownshiftSymbol downshift={!!view&&switchChecked(view)} className={className}/>;
}
/** Sidebar footer disclosure: the same switch and status as the header, for when the header switch is hidden or out of reach. */
export function DownshiftSidebarPanel(){
 const view=useDownshiftView(),panel=useRef<HTMLDivElement>(null),id=useId(),ids={profile:`${id}-profile`,status:`${id}-status`};
 // BB renders the panel before its footer trigger and leaves focus on the trigger; move focus in so Tab reaches the switch.
 useEffect(()=>{const node=panel.current;(node?.querySelector<HTMLButtonElement>('.bb-downshift-switch:not(:disabled)')??node)?.focus();},[]);
 if(!view)return <div ref={panel} tabIndex={-1} className="bb-downshift bb-downshift-panel"><p role="status">Loading Downshift…</p></div>;
 const {state,palette,busy,warning}=view;
 // A stable name; aria-checked carries on or off, and the model and phase come from the described-by text.
 return <div ref={panel} tabIndex={-1} className="bb-downshift bb-downshift-panel" data-phase={state?.phase??'unknown'} data-warm={palette.warm||undefined} data-confirmed={palette.confirmed} data-warning={warning||undefined}>
  <div className="bb-downshift-panel-row"><strong>Downshift</strong><DownshiftSwitch className="bb-downshift-switch" checked={switchChecked(view)} disabled={busy||!state?.available} busy={busy} label="Downshift" describedBy={`${ids.profile} ${ids.status}`} onChange={view.toggle}/></div>
  <DownshiftDetails view={view} ids={ids}/>
 </div>;
}
const modeIcon='downshift-mode';
export function registerDownshiftMode(app:PluginAppBuilder){
 app.slots.experimental_appOverlay({id:'downshift-mode',component:DownshiftControl});
 app.slots.settingsSection({id:'models',title:'Models',component:()=> <DownshiftSetup/>});
 // The overlay above feeds both through the view store. A footer item cannot follow a setting; More → Customize footer hides it.
 app.experimental_icons.register({name:modeIcon,component:DownshiftModeIcon});
 app.experimental_sidebarFooter.register({kind:'disclosure',id:'downshift',label:'Downshift',icon:modeIcon,component:DownshiftSidebarPanel});
}
