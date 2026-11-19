import {useRef,useState,type CSSProperties,type PointerEvent} from 'react';

const turtle='M19.31,5.6C18.09,5.56 16.88,6.5 16.5,8C16,10 16,10 15,11C13,13 10,14 4,15C3,15.16 2.5,15.5 2,16C4,16 6,16 4.5,17.5L3,19H6L8,17C10,18 11.33,18 13.33,17L14,19H17L16,16C16,16 17,12 18,11C19,10 19,11 20,11C21,11 22,10 22,8.5C22,8 22,7 20.5,6C20.15,5.76 19.74,5.62 19.31,5.6M9,6A6,6 0 0,0 3,12C3,12.6 3.13,13.08 3.23,13.6C9.15,12.62 12.29,11.59 13.93,9.94L14.43,9.44C13.44,7.34 11.32,6 9,6Z';
const rabbit='M199.28,149.8A71.58,71.58,0,0,0,193,129c19-37.94,30.45-88.28,17.34-110A22,22,0,0,0,190.94,8c-14.12,0-26,11.89-36.44,36.36-6.22,14.62-10.85,31.32-14,44.74a71.8,71.8,0,0,0-25,0c-3.13-13.42-7.76-30.12-14-44.74C91.1,19.89,79.18,8,65.06,8A22,22,0,0,0,45.64,19.08C32.53,40.76,44,91.1,63,129a71.58,71.58,0,0,0-6.26,20.76A52,52,0,1,0,128,225.52l-21.12-19.37a8,8,0,1,1,10.24-12.3L128,202.9l10.88-9.05a8,8,0,0,1,10.24,12.3L128,225.52a52,52,0,1,0,71.28-75.72Zm-126-36.53A218.45,218.45,0,0,1,58.4,67.08c-3.49-18.13-3.15-33,.93-39.72A6,6,0,0,1,65.06,24c6.61,0,14.52,9.7,21.72,26.62,5.93,13.94,10.35,30.12,13.33,43a71.72,71.72,0,0,0-26.88,19.64ZM100,176a12,12,0,1,1,12-12A12,12,0,0,1,100,176Zm56,0a12,12,0,1,1,12-12A12,12,0,0,1,156,176Zm20.55-69.17a71.89,71.89,0,0,0-20.66-13.2c3-12.89,7.4-29.07,13.33-43C176.42,33.7,184.33,24,190.94,24a6,6,0,0,1,5.73,3.36c4.08,6.74,4.42,21.59.93,39.72a218.45,218.45,0,0,1-14.83,46.19A72.6,72.6,0,0,0,176.55,106.83Z';
function Symbol({economy}:{economy:boolean}){return <svg viewBox={economy?"0 0 24 24":"0 0 256 256"} width="20" height="20" fill="currentColor" aria-hidden="true"><path d={economy?turtle:rabbit}/></svg>;}
type Gesture={id:number;x:number;y:number;start:number;position:number;moved:boolean;cancelled:boolean};
export function EconomySwitch({checked,disabled,busy,label,className,onChange}:{checked:boolean;disabled:boolean;busy:boolean;label:string;className:string;onChange(enabled:boolean):void}){
 const gesture=useRef<Gesture|null>(null),skipClick=useRef(0);
 const [position,setPosition]=useState<number|null>(null);
 const finish=(event:PointerEvent<HTMLButtonElement>,cancelled=false)=>{
  const current=gesture.current;if(!current||current.id!==event.pointerId)return;
  gesture.current=null;setPosition(null);
  if(current.moved||current.cancelled||cancelled)skipClick.current=Date.now()+400;
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  if(!cancelled&&!current.cancelled&&current.moved&&!disabled){const next=current.position>=.5;if(next!==checked)onChange(next);}
 };
 return <button type="button" className={className} role="switch" aria-checked={checked} aria-label={label} aria-busy={busy} disabled={disabled} title={label} data-dragging={position!==null||undefined} style={position===null?undefined:{'--economy-position':position} as CSSProperties}
  onPointerDown={event=>{if(disabled||event.button!==0)return;skipClick.current=0;gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,start:checked?1:0,position:checked?1:0,moved:false,cancelled:false};event.currentTarget.setPointerCapture(event.pointerId);}}
  onPointerMove={event=>{const current=gesture.current;if(!current||current.id!==event.pointerId||current.cancelled)return;const dx=event.clientX-current.x,dy=event.clientY-current.y;if(!current.moved&&Math.abs(dy)>8&&Math.abs(dy)>Math.abs(dx)){current.cancelled=true;setPosition(null);return;}if(Math.abs(dx)>6)current.moved=true;if(current.moved){event.preventDefault();current.position=Math.min(1,Math.max(0,current.start+dx/40));setPosition(current.position);}}}
  onPointerUp={event=>finish(event)} onPointerCancel={event=>finish(event,true)} onLostPointerCapture={event=>finish(event,true)}
  onClick={event=>{if((event.detail===0||Date.now()>=skipClick.current)&&!disabled)onChange(!checked);}}
  onKeyDown={event=>{if(disabled)return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();const next=event.key==='ArrowRight';if(next!==checked)onChange(next);}}}>
  <span className="economy-switch-track" aria-hidden="true"><span className="economy-switch-symbol economy-switch-original"><Symbol economy={false}/></span><span className="economy-switch-symbol economy-switch-economy"><Symbol economy/></span><span className="economy-switch-thumb"><Symbol economy={checked}/></span></span>
 </button>;
}
