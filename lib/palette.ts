import type {EconomyState} from './state';

export const economyPaletteAttribute='data-bb-economy';
export const economyPaletteCacheKey='bb.economy.last-confirmed-active.v1';
export type PaletteView={warm:boolean;confirmed:boolean};
type Root=Pick<HTMLElement,'setAttribute'|'removeAttribute'>;
type Cache=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
// Presentation only. Never writes theme preferences, inline CSS vars or server state.
export class EconomyPalette {
 view:PaletteView={warm:false,confirmed:false};
 constructor(private root:Root,private cache:Cache|null){
  try {const raw=cache?.getItem(economyPaletteCacheKey);const saved=raw&&raw.length<512?JSON.parse(raw):null;
   this.view.warm=saved?.version===1&&saved?.active===true&&Number.isSafeInteger(saved?.generation)&&saved.generation>=0;
  } catch {} this.paint();
 }
 private paint(){if(this.view.warm)this.root.setAttribute(economyPaletteAttribute,this.view.confirmed?'confirmed':'unconfirmed');else this.root.removeAttribute(economyPaletteAttribute);}
 confirm(state:EconomyState){
  if(!state.available){this.unconfirm();return this.view;}
  const active=state.enabled||state.phase==='on'||state.phase==='enabling'||state.phase==='disabling';
  // Only a successful, available OFF receipt can remove the last active appearance.
  if(active){this.view={warm:true,confirmed:true};try{this.cache?.setItem(economyPaletteCacheKey,JSON.stringify({version:1,active:true,generation:state.generation}));}catch{}}
  else if(state.phase==='off'&&!state.error){this.view={warm:false,confirmed:true};try{this.cache?.removeItem(economyPaletteCacheKey);}catch{}}
  else this.view={...this.view,confirmed:false};
  this.paint();return this.view;
 }
 unconfirm(){this.view={...this.view,confirmed:false};this.paint();return this.view;}
 dispose(){this.root.removeAttribute(economyPaletteAttribute);}
}
