import {z} from 'zod';
import {profileSchema} from './configuration';
const issue=z.object({threadId:z.string(),reason:z.string(),hostId:z.string().nullable().optional()});
export const economyStateSchema=z.object({configurationId:z.string().nullable().default(null),available:z.boolean(),phase:z.enum(['off','enabling','on','disabling']),generation:z.number().int().nonnegative(),enabled:z.boolean(),profile:profileSchema.nullable(),eligible:z.number().int().nonnegative(),ready:z.number().int().nonnegative(),pending:z.array(issue),unavailable:z.array(issue),conflicts:z.array(issue),error:z.string().nullable(),automatic:z.object({status:z.enum(['waiting','stale','enabled','suppressed','error']),message:z.string()}).optional()});
export type EconomyState=z.infer<typeof economyStateSchema>;
export const economySetSchema=z.object({enabled:z.boolean(),expectedGeneration:z.number().int().nonnegative(),requestId:z.uuid(),configurationId:z.string().min(1)}).strict();
export const unavailableEconomy=(error='This BB build does not provide the required native execution-policy capability.'):EconomyState=>({configurationId:null,available:false,phase:'off',generation:0,enabled:false,profile:null,eligible:0,ready:0,pending:[],unavailable:[],conflicts:[],error});
export const economyLabel=(s:EconomyState|null)=>!s?'Economy':!s.available?'Economy · setup':s.error?'Economy · error':s.phase==='disabling'?'Economy · restoring':s.phase==='enabling'?`Economy · waiting ${s.pending.length+s.unavailable.length}`:'Economy';
