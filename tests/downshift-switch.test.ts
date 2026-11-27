import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {DownshiftSwitch} from '../lib/downshift-switch';

// The Node TSX runner uses classic JSX; BB supplies its own JSX runtime when building.
Object.assign(globalThis,{React});
const base={checked:true,disabled:false,busy:false,label:'Downshift',className:'bb-downshift-switch',onChange(){throw Error('render cannot switch models');}};
test('unavailable control is an inspectable button, not an asserted native ON switch',()=>{
 const html=renderToStaticMarkup(React.createElement(DownshiftSwitch,{...base,onUnavailable(){},expanded:true}));
 assert.match(html,/role="button"/);assert.match(html,/aria-expanded="true"/);
 assert.doesNotMatch(html,/aria-checked=|disabled=/);assert.match(html,/--downshift-position:1/);
});
test('available and busy controls preserve native switch accessibility',()=>{
 const html=renderToStaticMarkup(React.createElement(DownshiftSwitch,base));
 assert.match(html,/role="switch"/);assert.match(html,/aria-checked="true"/);assert.doesNotMatch(html,/aria-expanded=/);
 const busy=renderToStaticMarkup(React.createElement(DownshiftSwitch,{...base,busy:true,disabled:true}));
 assert.match(busy,/aria-busy="true"/);assert.match(busy,/disabled=""/);
});
