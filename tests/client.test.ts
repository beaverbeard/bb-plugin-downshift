import {test} from 'node:test';
import assert from 'node:assert/strict';
import {switchRequest} from '../lib/client';

test('an uncertain switch request is retried only in the same direction',()=>{
 const retained={enabled:true,expectedGeneration:3,requestId:'5072ce12-1ad6-4b1d-942c-e106ee17747a',configurationId:'c'};
 assert.equal(switchRequest(retained,true,4,'c'),retained);
 assert.deepEqual(switchRequest(retained,false,4,'c',()=>'new'),{enabled:false,expectedGeneration:4,requestId:'new',configurationId:'c'});
 assert.deepEqual(switchRequest(retained,true,4,'other',()=>'new'),{enabled:true,expectedGeneration:4,requestId:'new',configurationId:'other'});
 assert.deepEqual(switchRequest(null,true,0,'c',()=>'new'),{enabled:true,expectedGeneration:0,requestId:'new',configurationId:'c'});
});
