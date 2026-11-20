import type {DownshiftState} from './state';

export const downshiftPaletteAttribute='data-bb-downshift';
export const downshiftPaletteCacheKey='bb.downshift.last-confirmed-active.v1';
export type PaletteView={warm:boolean;confirmed:boolean};
type Root=Pick<HTMLElement,'setAttribute'|'removeAttribute'>;
type Cache=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
// Presentation only. Never writes theme preferences, inline CSS vars or server state.
export class DownshiftPalette {
 view:PaletteView={warm:false,confirmed:false};
 constructor(private root:Root,private cache:Cache|null){
  try {const raw=cache?.getItem(downshiftPaletteCacheKey);const saved=raw&&raw.length<512?JSON.parse(raw):null;
   this.view.warm=saved?.version===1&&saved?.active===true&&Number.isSafeInteger(saved?.generation)&&saved.generation>=0;
  } catch {} this.paint();
 }
 private paint(){if(this.view.warm)this.root.setAttribute(downshiftPaletteAttribute,this.view.confirmed?'confirmed':'unconfirmed');else this.root.removeAttribute(downshiftPaletteAttribute);}
 confirm(state:DownshiftState){
  if(!state.available){this.unconfirm();return this.view;}
  const active=state.enabled||state.phase==='on'||state.phase==='enabling'||state.phase==='disabling';
  // Only a successful, available OFF receipt can remove the last active appearance.
  if(active){this.view={warm:true,confirmed:true};try{this.cache?.setItem(downshiftPaletteCacheKey,JSON.stringify({version:1,active:true,generation:state.generation}));}catch{}}
  else if(state.phase==='off'&&!state.error){this.view={warm:false,confirmed:true};try{this.cache?.removeItem(downshiftPaletteCacheKey);}catch{}}
  else this.view={...this.view,confirmed:false};
  this.paint();return this.view;
 }
 unconfirm(){this.view={...this.view,confirmed:false};this.paint();return this.view;}
 dispose(){this.root.removeAttribute(downshiftPaletteAttribute);}
}
