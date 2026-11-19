import {randomUUID} from 'node:crypto';
import {confirmedQuota, type QuotaSnapshot} from './quota-snapshot';
export type {QuotaSnapshot} from './quota-snapshot';
export interface ModeState {available: boolean; enabled: boolean; generation: number; error: string | null}
export interface ModeOperation {enabled: boolean; expectedGeneration: number; requestId: string}
export interface AutomaticRecord {
  version: 1;
  consumed: Record<string, number>;
  pending: {input: ModeOperation; keys: Record<string, number>; policyId?: string} | null;
  /** Manual OFF with unknown quota binds the first confirmed windows after recovery. */
  holdForFreshQuota?: boolean;
}
export interface AutomaticPorts {
  load(): Promise<AutomaticRecord | null>;
  save(value: AutomaticRecord): Promise<void>;
  mode(): ModeState | Promise<ModeState>;
  set(input: ModeOperation): ModeState | Promise<ModeState>;
  primaryModel: string;
  policyId?: string;
  now?: () => number;
  uuid?: () => string;
}
export type AutomaticView = {status: 'waiting' | 'stale' | 'enabled' | 'suppressed' | 'error'; message: string};

/** Quota observation only. The native controller remains the sole execution owner. */
export class AutomaticEconomy {
  view: AutomaticView = {status: 'waiting', message: 'Auto on at 5% remaining in any active Codex quota window.'};
  private record: AutomaticRecord | null = null;
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;
  constructor(private ports: AutomaticPorts) {}
  dispose() {this.disposed = true;}
  settled() {return this.queue;}
  private serialize(action: () => Promise<void>): Promise<void> {
    const result = this.queue.then(action);
    this.queue = result.catch(() => {});
    return result;
  }
  private async load() {
    if (this.record) return;
    const saved = await this.ports.load();
    // An unreadable record is an error, never permission to repeat a prior switch.
    if (saved && (saved.version !== 1 || (saved.holdForFreshQuota !== undefined && typeof saved.holdForFreshQuota !== 'boolean') || !saved.consumed || typeof saved.consumed !== 'object' || Array.isArray(saved.consumed)
      || Object.entries(saved.consumed).some(([key, expiry]) => !key || !Number.isFinite(expiry))
      || (saved.pending !== null && (!saved.pending || !saved.pending.input || saved.pending.input.enabled !== true
        || !Number.isSafeInteger(saved.pending.input.expectedGeneration) || saved.pending.input.expectedGeneration < 0
        || !/^[0-9a-f-]{36}$/i.test(saved.pending.input.requestId)
        || (saved.pending.policyId !== undefined && (typeof saved.pending.policyId !== 'string' || !saved.pending.policyId || saved.pending.policyId.length > 64))
        || !saved.pending.keys || typeof saved.pending.keys !== 'object' || Array.isArray(saved.pending.keys)
        || Object.entries(saved.pending.keys).some(([key, expiry]) => !key || !Number.isFinite(expiry)))))) {
      throw Error('Invalid automatic activation record');
    }
    this.record = saved ?? {version: 1, consumed: {}, pending: null};
  }
  private lowWindows(usage: QuotaSnapshot | null): Record<string, number> | null {
    const now = (this.ports.now ?? Date.now)();
    const valid = confirmedQuota(usage, this.ports.primaryModel, now);
    if (!valid) return null;
    const keys: Record<string, number> = {};
    for (const w of valid.windows) {
      if (w.remaining_percent <= 5) keys[`${valid.scope}:${valid.scope === 'model' ? valid.model : 'shared'}:${w.window_minutes}:${w.resets_at}`] = w.resets_at * 1000;
    }
    return keys;
  }
  /** Call before a manual OFF; low windows stay suppressed until their own reset. */
  suppress(usage: QuotaSnapshot | null): Promise<void> {
    return this.serialize(async () => {
      if (this.disposed) return;
      await this.load();
      if (this.disposed) return;
      const keys = this.lowWindows(usage);
      // Also suppress an uncertain in-flight automatic operation before manual OFF.
      const next: AutomaticRecord = {version: 1, consumed: {...this.record!.consumed, ...this.record!.pending?.keys, ...keys}, pending: null, holdForFreshQuota: keys === null};
      await this.ports.save(next); this.record = next;
      this.view = {status: 'suppressed', message: 'Manual off takes priority. Low windows are suppressed until reset.'};
    });
  }
  observe(usage: QuotaSnapshot | null): Promise<void> {
    return this.serialize(async () => {
      try {
        if (this.disposed) return;
        await this.load();
        if (this.disposed) return;
        const low = this.lowWindows(usage);
        if (low === null) {this.view = {status: 'stale', message: 'Auto waits for a fresh confirmed quota reading.'}; return;}
        const now = (this.ports.now ?? Date.now)();
        const consumed = Object.fromEntries(Object.entries(this.record!.consumed).filter(([, until]) => until > now));
        if (Object.keys(consumed).length > 64) throw Error('Automatic history requires review');
        const mode = await this.ports.mode();
        if (this.disposed) return;
        if (!mode.available || mode.error) {this.view = {status: 'error', message: 'Auto waits for a healthy native Economy controller.'}; return;}
        if (this.record!.holdForFreshQuota) {
          const confirmed = confirmedQuota(usage, this.ports.primaryModel, now)!;
          const windows = Object.fromEntries(confirmed.windows.map(w => [`${confirmed.scope}:${confirmed.scope === 'model' ? confirmed.model : 'shared'}:${w.window_minutes}:${w.resets_at}`, w.resets_at * 1000]));
          const next: AutomaticRecord = {version: 1, consumed: {...consumed, ...windows}, pending: null, holdForFreshQuota: false};
          await this.ports.save(next); this.record = next;
          this.view = {status: 'suppressed', message: 'Manual off during unknown quota is preserved until the confirmed windows reset.'};
          return;
        }
        const pending = this.record!.pending;
        if (pending && (pending.policyId !== this.ports.policyId || mode.enabled || mode.generation !== pending.input.expectedGeneration)) {
          const next: AutomaticRecord = {version: 1, consumed: {...consumed, ...pending.keys}, pending: null};
          await this.ports.save(next); this.record = next;
          this.view = mode.enabled ? {status: 'enabled', message: 'Economy is on. Automatic activation never turns it off.'}
            : {status: 'suppressed', message: 'A newer manual change takes priority until quota resets.'};
          return;
        }
        if (pending && !Object.keys(pending.keys).some(key => Object.hasOwn(low, key))) {
          // A reset/recovered quota cancels an unconfirmed old automatic request.
          const next: AutomaticRecord = {version: 1, consumed, pending: null};
          await this.ports.save(next); this.record = next;
          this.view = {status: 'waiting', message: 'Quota recovered; the previous automatic request was not repeated.'};
          return;
        }
        if (mode.enabled) {this.view = {status: 'enabled', message: 'Economy is on. Automatic activation never turns it off.'}; return;}
        const fresh = Object.fromEntries(Object.entries(low).filter(([key]) => !Object.hasOwn(consumed, key)));
        if (!pending && !Object.keys(fresh).length) {
          this.view = Object.keys(low).length ? {status: 'suppressed', message: 'This low quota window was already handled; waiting for reset.'}
            : {status: 'waiting', message: 'Auto on at 5% remaining in any active Codex quota window.'};
          return;
        }
        const operation = pending ?? {policyId: this.ports.policyId, input: {enabled: true, expectedGeneration: mode.generation, requestId: (this.ports.uuid ?? randomUUID)()}, keys: fresh};
        if (!pending) {const next: AutomaticRecord = {version: 1, consumed, pending: operation}; await this.ports.save(next); this.record = next;}
        if (this.disposed) return;
        const result = await this.ports.set(operation.input);
        if (!result.available || !result.enabled || result.error) throw Error('Activation not confirmed');
        const next: AutomaticRecord = {version: 1, consumed: {...consumed, ...operation.keys}, pending: null};
        await this.ports.save(next); this.record = next;
        this.view = {status: 'enabled', message: 'Economy enabled automatically at 5% or less remaining. Shared quota still applies.'};
      } catch {
        this.view = {status: 'error', message: 'Automatic activation is unconfirmed; the same operation will be checked again.'};
      }
    });
  }
}
