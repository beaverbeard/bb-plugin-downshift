export interface SetupDraft {base:string;provider:string;main:string;model:string;reasoning:string;tier:string;auto:boolean}
const memory=new Map<string,SetupDraft>();
export function readSetupDraft(key:string,base:string):SetupDraft|null{
 try{
  const raw=sessionStorage.getItem(key),value=raw?JSON.parse(raw):memory.get(key);
  if(value&&value.base===base&&['provider','main','model','reasoning','tier'].every(k=>typeof value[k]==='string'&&value[k].length<=300)&&typeof value.auto==='boolean')return value;
 }catch{const value=memory.get(key);if(value?.base===base)return value;}
 return null;
}
export function saveSetupDraft(key:string,value:SetupDraft|null){
 if(value)memory.set(key,value);else memory.delete(key);
 try{if(value)sessionStorage.setItem(key,JSON.stringify(value));else sessionStorage.removeItem(key);}catch{}
}
