import {createHash, randomUUID} from 'node:crypto';
import {z} from 'zod';
import {confirmedQuota, type QuotaSnapshot, type QuotaWindow} from './quota-snapshot';
export type {QuotaSnapshot} from './quota-snapshot';
export interface ModeState {available: boolean; enabled: boolean; generation: number; error: string | null}
export interface ModeOperation {enabled: boolean; expectedGeneration: number; requestId: string}
const keysSchema = z.record(z.string().regex(/^[a-f0-9]{64}$/), z.number().finite().positive().nullable());
const inputSchema = z.object({enabled: z.literal(true), expectedGeneration: z.number().int().nonnegative(), requestId: z.uuid()}).strict();
const recordSchema = z.object({version: z.literal(2), consumed: keysSchema,
  pending: z.object({input: inputSchema, keys: keysSchema, policyId: z.string().min(1).max(100), sourceId: z.string().regex(/^[a-f0-9]{64}$/), sourceScope: z.enum(['account','connection'])}).strict().nullable(),
  holdForFreshQuota: z.boolean(), recoveryCounts:z.record(z.string().regex(/^[a-f0-9]{64}$/),z.number().int().positive().max(64)).optional()}).strict();
const legacySchema = z.object({version: z.literal(1), consumed: z.record(z.string().min(1), z.number().finite()),
  pending: z.object({input: inputSchema, keys: z.record(z.string().min(1), z.number().finite()), policyId: z.string().min(1).max(64).optional()}).strict().nullable(),
  holdForFreshQuota: z.boolean().optional()}).strict();
export type AutomaticRecord = z.infer<typeof recordSchema>;
const manualCheckpointSchema=z.object({version:z.literal(1),policyId:z.string().min(1).max(100),generation:z.number().int().nonnegative()}).strict();
export type ManualCheckpoint=z.infer<typeof manualCheckpointSchema>;
export interface AutomaticPorts {
  load(): Promise<unknown>;
  save(value: AutomaticRecord): Promise<void>;
  manualCheckpoint?: {policyId:string;load():Promise<unknown>;save(value:ManualCheckpoint):Promise<void>};
  mode(): ModeState | Promise<ModeState>;
  confirm?(usage: QuotaSnapshot): Promise<QuotaSnapshot | null>;
  set(input: ModeOperation): ModeState | Promise<ModeState>;
  providerId: string;
  primaryModel: string;
  policyId: string;
  thresholdPercent?: number;
  now?: () => number;
  uuid?: () => string;
}
export type AutomaticView = {status: 'waiting' | 'stale' | 'enabled' | 'suppressed' | 'error'; message: string};

/** The source observer never writes thread options; native execution owns the switch. */
export class AutomaticDownshift {
  view: AutomaticView;
  private record: AutomaticRecord | null = null;
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;
  private manualPause=false;
  private threshold: number;
  private recoveryCounts:Record<string,number>={};
  constructor(private ports: AutomaticPorts) {
    this.threshold = ports.thresholdPercent ?? 5;
    if (!Number.isFinite(this.threshold) || this.threshold < 0 || this.threshold >= 100) throw Error('Invalid automatic threshold');
    this.view = this.waiting();
  }
  private waiting(): AutomaticView {return {status: 'waiting', message: `Auto on at ${this.threshold}% remaining in the selected provider’s applicable quota.`};}
  dispose() {this.disposed = true;}
  settled() {return this.queue;}
  get requiresManualRecovery(){return this.manualPause;}
  pauseForManualRecovery(message='Automatic activation is paused to preserve manual OFF. Turn Downshift on manually when ready; it will not resume itself after reload.'){
    this.manualPause=true;this.view={status:'error',message};
  }
  acknowledgeManualMode(mode:ModeState):Promise<void>{
    return this.serialize(async()=>{
      if(this.disposed)return;
      if(!mode.available||mode.error)throw Error('Native manual mode is not confirmed');
      const checkpoint=this.ports.manualCheckpoint;
      if(checkpoint)await checkpoint.save({version:1,policyId:checkpoint.policyId,generation:mode.generation});
      if(this.disposed)return;
      this.manualPause=false;
      this.view=mode.enabled?{status:'enabled',message:'Downshift is on. Automatic activation never turns it off.'}:{status:'suppressed',message:'Manual off takes priority until reset, or confirmed recovery for a quota with no reset date.'};
    });
  }
  async hasDurableOffPause(mode:ModeState):Promise<boolean>{
    const checkpoint=this.ports.manualCheckpoint;
    if(!checkpoint||mode.enabled)return false;
    try{
      const value=await checkpoint.load();
      const saved=value==null?null:manualCheckpointSchema.parse(value);
      if(mode.generation===0)return !!saved&&saved.policyId===checkpoint.policyId&&saved.generation!==0;
      return !saved||saved.policyId!==checkpoint.policyId||saved.generation!==mode.generation;
    }catch{return false;}
  }
  private async manualStateConfirmed(mode:ModeState):Promise<boolean>{
    const checkpoint=this.ports.manualCheckpoint;
    if(!checkpoint||mode.enabled)return true;
    let saved:ManualCheckpoint|null;
    try{const value=await checkpoint.load();saved=value==null?null:manualCheckpointSchema.parse(value);}
    catch{this.pauseForManualRecovery('Automatic activation is paused because the saved manual-mode checkpoint cannot be read. Manual switching is still available; turn Downshift on manually when ready.');return false;}
    if(this.disposed)return false;
    if(mode.generation===0&&(!saved||saved.policyId!==checkpoint.policyId))return true;
    if(saved?.policyId===checkpoint.policyId&&saved.generation===mode.generation)return true;
    this.pauseForManualRecovery();return false;
  }
  private serialize(action: () => Promise<void>): Promise<void> {
    const result = this.queue.then(action);
    this.queue = result.catch(() => {});
    return result;
  }
  private async load() {
    if (this.record) return;
    const saved = await this.ports.load();
    if (saved == null) {this.record = {version: 2, consumed: {}, pending: null, holdForFreshQuota: false}; return;}
    const parsed = recordSchema.safeParse(saved);
    if (parsed.success) {this.record = parsed.data;this.recoveryCounts=parsed.data.recoveryCounts??{}; return;}
    const legacy = legacySchema.parse(saved);
    const now = (this.ports.now ?? Date.now)();
    const hold = !!legacy.holdForFreshQuota || !!legacy.pending || Object.values(legacy.consumed).some(expiry => expiry > now);
    const next: AutomaticRecord = {version: 2, consumed: {}, pending: null, holdForFreshQuota: hold};
    await this.save(next); this.record = next;
  }
  private valid(usage: QuotaSnapshot | null) {return confirmedQuota(usage, this.ports, (this.ports.now ?? Date.now)());}
  private key(usage: QuotaSnapshot, w: QuotaWindow, connection = false, group = false) {
    return createHash('sha256').update(JSON.stringify([connection ? usage.connectionId : usage.sourceId, w.scope, w.model, group ? ['manual-class', w.classId] : w.id])).digest('hex');
  }
  private suppression(usage: QuotaSnapshot): AutomaticRecord['consumed'] {
    const result:AutomaticRecord['consumed']={};
    for(const w of usage.windows){
      result[this.key(usage,w)]=w.resetsAt;result[this.key(usage,w,true)]=w.resetsAt;
      const members=usage.windows.filter(other=>other.classId===w.classId);
      const expiry=members.some(other=>other.resetsAt===null)?null:Math.min(...members.map(other=>other.resetsAt!));
      for(const connection of [false,true]){
        const key=this.key(usage,w,connection,true);result[key]=expiry;
        if(expiry===null)this.recoveryCounts[key]=Math.max(this.recoveryCounts[key]??0,members.length);
      }
    }
    return result;
  }
  private async save(next:AutomaticRecord){
    const counts=Object.fromEntries(Object.entries(this.recoveryCounts).filter(([key])=>next.consumed[key]===null));
    next.recoveryCounts=counts;await this.ports.save(next);this.recoveryCounts=counts;
  }
  private blocked(usage: QuotaSnapshot, w: QuotaWindow, consumed: AutomaticRecord['consumed']) {
    return [this.key(usage,w),this.key(usage,w,true),this.key(usage,w,false,true),this.key(usage,w,true,true)].some(key=>Object.hasOwn(consumed,key));
  }
  private keys(usage: QuotaSnapshot, lowOnly = false): AutomaticRecord['consumed'] {
    return Object.fromEntries(usage.windows.filter(w => !lowOnly || w.remainingPercent <= this.threshold).map(w => [this.key(usage, w), w.resetsAt]));
  }
  suppress(usage: QuotaSnapshot | null): Promise<void> {
    return this.serialize(async () => {
      if (this.disposed) return;
      await this.load(); if (this.disposed) return;
      const valid = this.valid(usage), known = valid?.sourceId ? valid : null;
      const next: AutomaticRecord = {version: 2, consumed: {...this.record!.consumed, ...this.record!.pending?.keys, ...(known ? this.suppression(known) : {})}, pending: null, holdForFreshQuota: known === null || this.record!.holdForFreshQuota};
      await this.save(next); this.record = next;
      this.view = {status: 'suppressed', message: 'Manual off takes priority until reset, or confirmed recovery for a quota with no reset date.'};
    });
  }
  observe(usage: QuotaSnapshot | null): Promise<void> {
    return this.serialize(async () => {
      try {
        if (this.disposed||this.manualPause) return;
        await this.load(); if (this.disposed) return;
        if (usage?.identityError) {this.view = {status: 'error', message: usage.identityError}; return;}
        const valid = this.valid(usage);
        if (!valid) {this.view = {status: 'stale', message: 'Auto waits for fresh confirmed quota for the selected provider and model.'}; return;}
        if (!valid.sourceId) {this.view = {status:'stale',message:'Auto waits for a confirmed quota source.'};return;}
        const now = (this.ports.now ?? Date.now)();
        const consumed = Object.fromEntries(Object.entries(this.record!.consumed).filter(([, until]) => until === null || until > now));
        for (const w of valid.windows) {
          const members=valid.windows.filter(other=>other.classId===w.classId);
          for (const connection of [false,true]) {
            const group=this.key(valid,w,connection,true), key=this.key(valid,w,connection);
            if(consumed[group]===null)this.recoveryCounts[group]=Math.max(this.recoveryCounts[group]??0,members.length);
            const complete=members.length>=(this.recoveryCounts[group]??1);
            if(complete&&members.every(other=>other.remainingPercent>this.threshold)) {
              if(consumed[group]===null)delete consumed[group];
              if(consumed[key]===null)delete consumed[key];
              const undated=this.key(valid,{...w,id:w.classId,resetsAt:null},connection);
              if(consumed[undated]===null)delete consumed[undated];
            }
          }
        }
        if (Object.keys(consumed).length > 128) throw Error('Automatic history requires review');
        const mode = await this.ports.mode(); if (this.disposed) return;
        if (!mode.available || mode.error) {this.view = {status: 'error', message: 'Auto waits for a healthy native Downshift controller.'}; return;}
        if(!await this.manualStateConfirmed(mode))return;
        if (this.record!.holdForFreshQuota) {
          const next: AutomaticRecord = {version: 2, consumed: {...consumed, ...this.suppression(valid)}, pending: null, holdForFreshQuota: false};
          await this.save(next); this.record = next;
          this.view = {status: 'suppressed', message: 'Manual off is preserved for the first confirmed windows after recovery.'}; return;
        }
        const low = this.keys(valid, true);let pending = this.record!.pending;
        if (pending && (pending.policyId !== this.ports.policyId || pending.sourceId !== valid.sourceId || mode.enabled || mode.generation !== pending.input.expectedGeneration)) {
          const next: AutomaticRecord = {version: 2, consumed: {...consumed, ...pending.keys}, pending: null, holdForFreshQuota: false};
          await this.save(next); this.record = next;
          this.view = mode.enabled ? {status: 'enabled', message: 'Downshift is on. Automatic activation never turns it off.'}
            : {status: 'suppressed', message: 'The previous source, model selection or generation changed; its automatic request was cancelled.'}; return;
        }
        if(pending?.sourceScope==='connection') {
          // Issuer identity is unknown: never replay a persisted decision, even on the same connection.
          const next:AutomaticRecord={version:2,consumed,pending:null,holdForFreshQuota:false};
          await this.save(next);this.record=next;pending=null;
        }
        if (pending && !Object.keys(pending.keys).some(key => Object.hasOwn(low, key) && low[key] === pending.keys[key])) {
          const next: AutomaticRecord = {version: 2, consumed, pending: null, holdForFreshQuota: false};
          await this.save(next); this.record = next;
          this.view = {status: 'waiting', message: 'Quota recovered; the previous automatic request was not repeated.'}; return;
        }
        if (mode.enabled) {this.view = {status: 'enabled', message: 'Downshift is on. Automatic activation never turns it off.'}; return;}
        const fresh = Object.fromEntries(valid.windows.filter(w=>w.remainingPercent<=this.threshold&&!this.blocked(valid,w,consumed)).map(w=>[this.key(valid,w),w.resetsAt]));
        if (!pending && !Object.keys(fresh).length) {
          // Persist recovery even when it does not activate; a restart must not resurrect a no-reset barrier.
          const next: AutomaticRecord = {version: 2, consumed, pending: null, holdForFreshQuota: false};
          if (JSON.stringify(next) !== JSON.stringify(this.record)) {await this.save(next); this.record = next;}
          this.view = Object.keys(low).length ? {status: 'suppressed', message: 'This low quota was already handled; waiting for reset or confirmed recovery.'} : this.waiting(); return;
        }
        const operation = pending ?? {policyId: this.ports.policyId, sourceId: valid.sourceId, sourceScope:valid.sourceScope, input: {enabled: true as const, expectedGeneration: mode.generation, requestId: (this.ports.uuid ?? randomUUID)()}, keys: fresh};
        if (!pending) {const next: AutomaticRecord = {version: 2, consumed, pending: operation, holdForFreshQuota: false}; await this.save(next); this.record = next;}
        if (this.disposed) return;
        const confirmation = this.ports.confirm ? this.valid(await this.ports.confirm(valid)) : this.valid(valid);
        if (this.disposed) return;
        if (!confirmation || confirmation.identityError || confirmation.sourceId !== operation.sourceId
          || !Object.keys(operation.keys).some(key => Object.hasOwn(this.keys(confirmation, true), key) && this.keys(confirmation, true)[key] === operation.keys[key])) {
          this.view = {status: 'stale', message: 'The quota source changed or could not be confirmed after saving. No activation was sent.'}; return;
        }
        const result = await this.ports.set(operation.input);
        if (!result.available || !result.enabled || result.error) throw Error('Activation not confirmed');
        const next: AutomaticRecord = {version: 2, consumed: {...consumed, ...operation.keys}, pending: null, holdForFreshQuota: false};
        await this.save(next); this.record = next;
        this.view = {status: 'enabled', message: `Downshift enabled automatically at ${this.threshold}% or less remaining. ${valid.sourceScope==='connection' ? 'Source is the current provider connection; issuer account identity is unavailable.' : 'Quota is scoped to the provider account.'} Shared quota still applies.`};
      } catch {this.view = {status: 'error', message: 'Automatic activation is unconfirmed; its saved operation will be checked against the same source and selection.'};}
      finally {if(usage?.groupedWindows)this.view={...this.view,message:`${this.view.message} Windows without distinct provider IDs share conservative suppression; all members must recover.`};if(usage?.sourceScope==='connection'&&!this.view.message.includes('current provider connection'))this.view={...this.view,message:`${this.view.message} Source is the current provider connection; issuer account identity is unavailable.`};}
    });
  }
}
