import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore,switchChecked,controllerUnavailable,canDismissSavedAppearance,type DownshiftView} from '../lib/view-store';
import {unavailableDownshift} from '../lib/state';
import {DownshiftPalette,downshiftPaletteCacheKey} from '../lib/palette';

test('the view store notifies only on a new value and stops after unsubscribe',()=>{
 const store=createStore<number|null>(null);let calls=0;const stop=store.subscribe(()=>calls++);
 store.set(1);store.set(1);assert.equal(calls,1);assert.equal(store.get(),1);
 stop();store.set(2);assert.equal(calls,1);
});
test('the sidebar switch follows the confirmed state, else the cached appearance',()=>{
 const on={...unavailableDownshift(),available:true,enabled:true};
 assert.equal(switchChecked({state:on,palette:{warm:false,confirmed:true}}),true);
 assert.equal(switchChecked({state:on,palette:{warm:false,confirmed:false}}),false);
 assert.equal(switchChecked({state:null,palette:{warm:true,confirmed:false}}),true);
});
test('only an idle unavailable controller with an unconfirmed saved appearance permits dismissal',()=>{
 const warm={warm:true,confirmed:false},unavailable=unavailableDownshift();
 assert.equal(canDismissSavedAppearance({state:unavailable,palette:warm,busy:false}),true);
 assert.equal(controllerUnavailable({state:null}),false);
 for(const view of [
  {state:null,palette:warm,busy:false},
  {state:{...unavailable,available:true,enabled:true,phase:'on' as const},palette:warm,busy:false},
  {state:unavailable,palette:{warm:true,confirmed:true},busy:false},
  {state:unavailable,palette:warm,busy:true},
  {state:unavailable,palette:{warm:false,confirmed:false},busy:false}
 ])assert.equal(canDismissSavedAppearance(view),false);
});
test('sidebar-only dismissal updates the shared view without invoking its native toggle',()=>{
 const cache=new Map([[downshiftPaletteCacheKey,JSON.stringify({version:1,active:true,generation:6})]]);
 const palette=new DownshiftPalette({setAttribute(){},removeAttribute(){}},{getItem:k=>cache.get(k)??null,setItem:(k,v)=>{cache.set(k,v);},removeItem:k=>{cache.delete(k);}});
 palette.confirm(unavailableDownshift());let nativeCalls=0;
 const store=createStore<DownshiftView|null>(null);const observed:boolean[][]=[[],[]];
 const stops=observed.map(values=>store.subscribe(()=>values.push(switchChecked(store.get()!))));
 const view:DownshiftView={state:unavailableDownshift(),palette:{...palette.view},busy:false,error:null,warning:true,appearanceMessage:null,toggle(){nativeCalls++;},dismissSavedAppearance(){
  if(canDismissSavedAppearance(store.get()!)&&palette.dismissSavedAppearance())store.set({...view,palette:{...palette.view},appearanceMessage:'Saved appearance cleared. Switching remains unavailable.'});
 }};
 store.set(view);store.get()!.dismissSavedAppearance();
 assert.deepEqual(observed,[[true,false],[true,false]]);assert.equal(nativeCalls,0);assert.equal(cache.size,0);
 assert.equal(store.get()!.state!.available,false);assert.equal(store.get()!.palette.confirmed,false);
 stops.forEach(stop=>stop());
});
