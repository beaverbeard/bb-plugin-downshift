export interface SetupDraft {base:string;provider:string;main:string;model:string;reasoning:string;tier:string;auto:boolean}
export const setupDraftKey='bb.downshift.setup.v1';
export const legacySetupDraftKeys=['bb.downshift.setup-settings.v1','bb.downshift.setup-overlay.v1'] as const;
const memory=new Map<string,SetupDraft|null>();
function stored(key:string):{present:boolean;value:unknown}{
 let raw:string|null=null;
 try{raw=sessionStorage.getItem(key);if(raw!==null)return {present:true,value:JSON.parse(raw)};}
 catch{return {present:raw!==null||memory.has(key),value:memory.get(key)};}
 return {present:memory.has(key),value:memory.get(key)};
}
function draft(value:unknown,base:string):SetupDraft|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const item=value as Record<string,unknown>;
 if(item.base!==base||!['provider','main','model','reasoning','tier'].every(k=>typeof item[k]==='string'&&item[k].length<=300)||typeof item.auto!=='boolean')return null;
 return {base,provider:item.provider as string,main:item.main as string,model:item.model as string,reasoning:item.reasoning as string,tier:item.tier as string,auto:item.auto};
}
export function readSetupDraft(key:string,base:string,legacyKeys:readonly string[]=[]):SetupDraft|null{
 const current=stored(key);
 if(current.present)return draft(current.value,base);
 for(const oldKey of legacyKeys){const previous=draft(stored(oldKey).value,base);if(previous){saveSetupDraft(key,previous);return previous;}}
 return null;
}
export function saveSetupDraft(key:string,value:SetupDraft|null){
 memory.set(key,value);
 try{sessionStorage.setItem(key,JSON.stringify(value));}catch{}
}
