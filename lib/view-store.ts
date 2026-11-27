import type {DownshiftState} from './state';
import type {DownshiftClientError} from './client';
import type {PaletteView} from './palette';

/** What the always-mounted overlay knows; host-rendered surfaces (sidebar footer icon and panel) read it here. */
export type DownshiftView={state:DownshiftState|null;palette:PaletteView;busy:boolean;error:DownshiftClientError|null;warning:boolean;appearanceMessage:string|null;dismissSavedAppearance():void;toggle(enabled:boolean):void};
export type Store<T>={get():T;set(next:T):void;subscribe(listener:()=>void):()=>void};
export function createStore<T>(initial:T):Store<T>{
 let value=initial;const listeners=new Set<()=>void>();
 return {get:()=>value,set(next){if(Object.is(value,next))return;value=next;for(const listener of listeners)listener();},subscribe(listener){listeners.add(listener);return()=>{listeners.delete(listener);};}};
}
export const downshiftView=createStore<DownshiftView|null>(null);
/** The switch position the UI shows: the confirmed state, or the cached appearance while unconfirmed. */
export const switchChecked=(view:Pick<DownshiftView,'state'|'palette'>)=>view.palette.confirmed?!!view.state?.enabled:view.palette.warm;
export const controllerUnavailable=(view:Pick<DownshiftView,'state'>)=>!!view.state&&!view.state.available;
export const canDismissSavedAppearance=(view:Pick<DownshiftView,'state'|'palette'|'busy'>)=>controllerUnavailable(view)&&!view.busy&&view.palette.warm&&!view.palette.confirmed;
