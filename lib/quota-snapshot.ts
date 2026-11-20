export interface QuotaWindow {
  id: string;
  classId: string;
  scope: 'shared' | 'model';
  model: string | null;
  usedPercent: number;
  remainingPercent: number;
  resetsAt: number | null;
}
export interface QuotaSnapshot {
  status: 'ok';
  providerId: string;
  hostId: string;
  sourceId: string | null;
  connectionId: string;
  sourceScope: 'account' | 'connection';
  identityError: string | null;
  groupedWindows: boolean;
  checkedAt: number;
  windows: QuotaWindow[];
}
export interface QuotaSelection {providerId: string; primaryModel: string}

/** Provider metadata can name a whole model family, not just a catalog model ID. */
export function appliesToModel(family: string, model: string, providerId: string): boolean {
  if (family.toLowerCase() === model.toLowerCase()) return true;
  // Claude's native scoped-limit metadata names the model family (never a UI label).
  // The CLI catalog uses claude-<family>-<version> or the exact family alias.
  return providerId === 'claude-code' && /^[a-z]+$/.test(family)
    && new RegExp(`^claude-${family}(?:-|$)`, 'i').test(model);
}
export function confirmedQuota(usage: QuotaSnapshot | null, selection: QuotaSelection, now = Date.now()): QuotaSnapshot | null {
  if (!usage || usage.status !== 'ok' || usage.providerId !== selection.providerId || !usage.hostId
    || !Number.isFinite(usage.checkedAt) || now - usage.checkedAt > 360_000 || usage.checkedAt - now > 60_000
    || !(usage.sourceId === null || /^[a-f0-9]{64}$/.test(usage.sourceId))
    || !/^[a-f0-9]{64}$/.test(usage.connectionId) || !['account','connection'].includes(usage.sourceScope)
    || !Array.isArray(usage.windows) || !usage.windows.length || usage.windows.length > 64) return null;
  const seen = new Set<string>();
  for (const w of usage.windows) {
    if (!w.id || !w.classId || w.id.length > 300 || !['shared', 'model'].includes(w.scope)
      || (w.scope === 'shared' ? w.model !== null : typeof w.model !== 'string' || !appliesToModel(w.model, selection.primaryModel, selection.providerId))
      || ![w.usedPercent, w.remainingPercent].every(Number.isFinite) || w.usedPercent < 0 || w.remainingPercent < 0 || w.remainingPercent > 100
      || Math.abs(Math.max(0, 100 - w.usedPercent) - w.remainingPercent) > 0.01
      || !(w.resetsAt === null || (Number.isFinite(w.resetsAt) && w.resetsAt > now))
      || (seen.has(w.id) && !usage.groupedWindows)) return null;
    seen.add(w.id);
  }
  return usage;
}
