import test from 'node:test';
import assert from 'node:assert/strict';
import {headerInsertionPoint} from '../lib/header-dock';

const row=(...children:{grow:boolean}[])=>{const items=children.map(item=>({...item}));return {header:{lastElementChild:items.at(-1)??null} as unknown as Element,items};};
const grows=(item:Element)=>(item as unknown as {grow:boolean}).grow;

test('the switch goes before a trailing actions cluster (thread pages)',()=>{
 const {header,items}=row({grow:true},{grow:false});
 assert.equal(headerInsertionPoint(header,grows),items[1]);
});
test('the switch goes after a trailing flex-grow title (settings pages)',()=>{
 const {header}=row({grow:false},{grow:true});
 assert.equal(headerInsertionPoint(header,grows),null);
});
test('an empty header row appends the switch',()=>{
 assert.equal(headerInsertionPoint(row().header,grows),null);
});
