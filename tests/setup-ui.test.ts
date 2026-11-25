import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readSetupDraft,saveSetupDraft} from '../lib/setup-draft';
import {downshiftStatusText,unavailableDownshift,type DownshiftState} from '../lib/state';

const on:DownshiftState={...unavailableDownshift(),available:true,error:null,phase:'on',enabled:true,configurationId:'c'};
test('status text reports an unavailable server answer instead of a lost confirmation',()=>{
 assert.equal(downshiftStatusText(unavailableDownshift('Stock BB'),false,false),'Not active');
 assert.equal(downshiftStatusText(unavailableDownshift('Stock BB'),false,true),'State unconfirmed by server');
 assert.equal(downshiftStatusText(null,false,false),'State unconfirmed by server');
 assert.equal(downshiftStatusText(on,false,false),'State unconfirmed by server');
 assert.equal(downshiftStatusText(on,true,false),'On');
 assert.equal(downshiftStatusText({...on,phase:'off',enabled:false},true,false),'Off');
});
test('setup drafts are shared by key, tied to the saved base and cleared on save',()=>{
 const draft={base:'null',provider:'p',main:'m',model:'s',reasoning:'r',tier:'default',auto:false};
 saveSetupDraft('bb.downshift.setup.v1',draft);
 assert.deepEqual(readSetupDraft('bb.downshift.setup.v1','null'),draft);
 assert.equal(readSetupDraft('bb.downshift.setup.v1','{"saved":true}'),null);
 saveSetupDraft('bb.downshift.setup.v1',null);
 assert.equal(readSetupDraft('bb.downshift.setup.v1','null'),null);
});
