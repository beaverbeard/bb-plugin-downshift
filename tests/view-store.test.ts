import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore,switchChecked} from '../lib/view-store';
import {unavailableDownshift} from '../lib/state';

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
