import {z} from 'zod';
import {profileSchema} from './configuration';
const issue=z.object({threadId:z.string(),reason:z.string(),hostId:z.string().nullable().optional()});
export const downshiftStateSchema=z.object({configurationId:z.string().nullable().default(null),available:z.boolean(),phase:z.enum(['off','enabling','on','disabling']),generation:z.number().int().nonnegative(),enabled:z.boolean(),profile:profileSchema.nullable(),eligible:z.number().int().nonnegative(),ready:z.number().int().nonnegative(),pending:z.array(issue),unavailable:z.array(issue),conflicts:z.array(issue),error:z.string().nullable(),automatic:z.object({status:z.enum(['waiting','stale','enabled','suppressed','error']),message:z.string()}).optional()});
export type DownshiftState=z.infer<typeof downshiftStateSchema>;
export const downshiftSetSchema=z.object({enabled:z.boolean(),expectedGeneration:z.number().int().nonnegative(),requestId:z.uuid(),configurationId:z.string().min(1)}).strict();
export const unavailableDownshift=(error='This BB build does not provide the required native execution-policy capability.'):DownshiftState=>({configurationId:null,available:false,phase:'off',generation:0,enabled:false,profile:null,eligible:0,ready:0,pending:[],unavailable:[],conflicts:[],error});
export const downshiftLabel=(s:DownshiftState|null)=>!s?'Downshift':!s.available?'Downshift · setup':s.error?'Downshift · error':s.phase==='disabling'?'Downshift · restoring':s.phase==='enabling'?`Downshift · waiting ${s.pending.length+s.unavailable.length}`:'Downshift';
