import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readSetupDraft,saveSetupDraft,legacySetupDraftKeys} from '../lib/setup-draft';
import {downshiftStatusText,unavailableDownshift,type DownshiftState} from '../lib/state';

const on:DownshiftState={...unavailableDownshift(),available:true,error:null,phase:'on',enabled:true,configurationId:'c'};
test('status text reports an unavailable server answer instead of a lost confirmation',()=>{
 assert.equal(downshiftStatusText(unavailableDownshift('Stock BB'),false,false),'Switching unavailable');
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

for(const legacy of legacySetupDraftKeys)test(`an existing ${legacy} draft is migrated without deleting the original`,()=>{
 for(const key of legacySetupDraftKeys)saveSetupDraft(key,null);
 const key=`migration:${legacy}`,value={base:'null',provider:'p',main:'m',model:'s',reasoning:'default',tier:'default',auto:false};
 saveSetupDraft(legacy,value);
 assert.deepEqual(readSetupDraft(key,'null',legacySetupDraftKeys),value);
 assert.deepEqual(readSetupDraft(legacy,'null'),value);
 saveSetupDraft(key,null);
 assert.equal(readSetupDraft(key,'null',legacySetupDraftKeys),null);
 assert.deepEqual(readSetupDraft(legacy,'null'),value);
});
test('a shared draft or saved tombstone takes precedence over legacy drafts and changed bases',()=>{
 const key='migration:priority',old={base:'null',provider:'p',main:'old',model:'s',reasoning:'default',tier:'default',auto:false};
 saveSetupDraft(legacySetupDraftKeys[0],old);saveSetupDraft(key,{...old,main:'new'});
 assert.equal(readSetupDraft(key,'null',legacySetupDraftKeys)?.main,'new');
 assert.equal(readSetupDraft(key,'different',legacySetupDraftKeys),null);
 saveSetupDraft(key,null);assert.equal(readSetupDraft(key,'null',legacySetupDraftKeys),null);
});
