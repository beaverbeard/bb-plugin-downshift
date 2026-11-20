import {createHash} from 'node:crypto';
import {appliesToModel, type QuotaSnapshot, type QuotaSelection} from './quota-snapshot';

export interface NativeQuotaSelection extends QuotaSelection {hostId: string}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Whitelist native quota fields; issuer identity and connection scope stay distinct. */
export function nativeQuota(value: unknown, selection: NativeQuotaSelection, now = Date.now()): QuotaSnapshot | null {
  if (!value || typeof value !== 'object' || !selection.hostId) return null;
  const raw = (value as Record<string, unknown>)[selection.providerId];
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;
  if ((entry.observedAt !== undefined && (typeof entry.observedAt !== 'number' || !Number.isFinite(entry.observedAt) || entry.observedAt < 0)) || entry.status !== 'ok' || !Array.isArray(entry.windows) || !entry.windows.length || entry.windows.length > 64) return null;
  const windows: QuotaSnapshot['windows'] = [];
  for (const item of entry.windows) {
    if (!item || typeof item !== 'object') return null;
    const w = item as Record<string, unknown>;
    if (w.unlimited === true) continue;
    if (typeof w.usedPercent !== 'number' || !Number.isFinite(w.usedPercent) || w.usedPercent < 0
      || typeof w.label !== 'string' || !w.label || w.label.length > 300
      || !(w.model === undefined || w.model === null || (typeof w.model === 'string' && w.model.length > 0 && w.model.length <= 300))) return null;
    const model = typeof w.model === 'string' ? w.model : null;
    if (model !== null && !appliesToModel(model, selection.primaryModel, selection.providerId)) continue;
    const reset = w.resetsAt === null ? null : typeof w.resetsAt === 'string' ? Date.parse(w.resetsAt) : NaN;
    if (reset !== null && !Number.isFinite(reset)) return null;
    if (reset !== null && reset <= now) continue;
    const kind = typeof w.kind === 'string' && ['five-hour', 'daily', 'weekly'].includes(w.kind) ? w.kind : 'custom';
    const explicitId = typeof w.id === 'string' && w.id.length > 0 && w.id.length <= 300 ? w.id : null;
    const classId = digest(explicitId === null ? ['native-window', kind, model, w.cost != null] : ['provider-id', explicitId, model]);
    const id = explicitId === null && reset !== null ? digest([classId, reset]) : classId;
    windows.push({id, classId, scope: model === null ? 'shared' : 'model', model,
      usedPercent: w.usedPercent, remainingPercent: Math.max(0, 100 - w.usedPercent), resetsAt: reset});
  }
  if (!windows.length) return null;
  const grouped = new Set(windows.map(w => w.id)).size !== windows.length;
  const conflicting = windows.some(w=>windows.some(other=>w.id===other.id&&w.resetsAt!==other.resetsAt));
  const accountKey = typeof entry.accountKey === 'string' && entry.accountKey.length > 0 && entry.accountKey.length <= 2048 ? entry.accountKey : null;
  const connectionId = digest(['connection', selection.providerId, selection.hostId]);
  return {status: 'ok', connectionId, sourceScope: accountKey === null ? 'connection' : 'account', providerId: selection.providerId, hostId: selection.hostId,
    sourceId: accountKey === null ? connectionId : digest(['account', selection.providerId, selection.hostId, accountKey]), checkedAt: typeof entry.observedAt === 'number' && Number.isFinite(entry.observedAt) ? entry.observedAt : now, identityError: conflicting ? 'The provider returned conflicting reset dates for the same stable quota window ID.' : null, groupedWindows:grouped, windows};
}
