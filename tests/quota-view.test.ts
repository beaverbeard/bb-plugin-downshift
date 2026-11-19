import {test} from 'node:test';
import assert from 'node:assert/strict';
import {quotaBubble, quotaView, type QuotaSnapshot} from '../lib/quota-view';
const now=1_800_000_000_000;
function sample(values:number[]):QuotaSnapshot{return {status:'ok',scope:'codex_account',model:'primary',checked_at:new Date(now).toISOString(),windows:values.map(remaining=>({used_percent:100-remaining,remaining_percent:remaining,window_minutes:300,resets_at:now/1000+1800}))};}
test('quota bubble uses remaining percent and agreed 50/25 boundaries',()=>{
 for(const [value,tone] of [[100,'green'],[50,'green'],[49,'yellow'],[25,'yellow'],[24,'red'],[0,'red']] as const){
  const bubble=quotaBubble(quotaView(sample([value]),'primary',now),now);assert.equal(bubble.label,`${value}%`);assert.equal(bubble.tone,tone);assert.match(bubble.title,/Shared Codex/);
 }
 const rounded=quotaBubble(quotaView(sample([49.6]),'primary',now),now);assert.equal(rounded.label,'50%');assert.equal(rounded.tone,'green');
});
test('most restrictive confirmed active window wins, unavailable/stale is neutral',()=>{
 assert.equal(quotaBubble(quotaView(sample([70,24]),'primary',now),now).label,'24%');
 for(const s of [null,{...sample([5]),status:'error'},{...sample([5]),checked_at:new Date(now-360001).toISOString()}]){
  assert.deepEqual(quotaBubble(quotaView(s,'primary',now),now),{label:'—',tone:'unknown',title:'Codex quota remaining is unconfirmed or stale.'});
 }
 const fresh=quotaView(sample([5]),'primary',now);assert.equal(quotaBubble(fresh,now+360001).label,'—');
});
