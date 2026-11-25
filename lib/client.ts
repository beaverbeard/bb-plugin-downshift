import {experimental_PluginRpcCallError} from '@get-bb/plugin-sdk/app';
export type DownshiftClientError={kind:'connection'|'operation';message:string};
/** A confirmed refusal must not pin a stale CAS generation; an uncertain response keeps its UUID. */
export function downshiftFailure(error:unknown):{retry:boolean;error:DownshiftClientError}{
 const definite=error instanceof experimental_PluginRpcCallError && ['conflict','forbidden','invalid','invalid_input','invalid_json','unknown_method','not_found'].includes(error.code);
 return definite
  ?{retry:false,error:{kind:'operation',message:error.message}}
  :{retry:true,error:{kind:'operation',message:'Switch not confirmed. Retry checks the same operation.'}};
}
export type SwitchRequest={enabled:boolean;expectedGeneration:number;requestId:string;configurationId:string};
/** Retry an uncertain request with the SAME UUID, but only in the same direction; an opposite click is a new operation. */
export const switchRequest=(retained:SwitchRequest|null,enabled:boolean,generation:number,configurationId:string,uuid:()=>string=()=>crypto.randomUUID()):SwitchRequest=>
 retained?.enabled===enabled&&retained.configurationId===configurationId?retained:{enabled,expectedGeneration:generation,requestId:uuid(),configurationId};
