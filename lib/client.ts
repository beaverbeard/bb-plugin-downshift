import {experimental_PluginRpcCallError} from '@get-bb/plugin-sdk/app';
export type DownshiftClientError={kind:'connection'|'operation';message:string};
/** A confirmed refusal must not pin a stale CAS generation; an uncertain response keeps its UUID. */
export function downshiftFailure(error:unknown):{retry:boolean;error:DownshiftClientError}{
 const definite=error instanceof experimental_PluginRpcCallError && ['conflict','forbidden','invalid','invalid_input','invalid_json','unknown_method','not_found'].includes(error.code);
 return definite
  ?{retry:false,error:{kind:'operation',message:error.message}}
  :{retry:true,error:{kind:'operation',message:'Switch not confirmed. Retry checks the same operation.'}};
}
