import type {QuotaSnapshot} from './automatic';

/** Whitelist native usage fields. Email, plan and provider account data stay out. */
export function nativeQuota(value: unknown, primaryModel: string, now = Date.now()): QuotaSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const codex = (value as Record<string, unknown>).codex;
  if (!codex || typeof codex !== 'object') return null;
  const entry = codex as Record<string, unknown>;
  if (entry.status !== 'ok' || !Array.isArray(entry.windows) || !entry.windows.length || entry.windows.length > 16) return null;
  const windows: QuotaSnapshot['windows'] = [];
  for (const raw of entry.windows) {
    if (!raw || typeof raw !== 'object') return null;
    const w = raw as Record<string, unknown>;
    const used = w.usedPercent;
    const resets = typeof w.resetsAt === 'string' ? Date.parse(w.resetsAt) : NaN;
    if (typeof used !== 'number' || !Number.isFinite(used) || used < 0 || !Number.isFinite(resets) || resets <= now) return null;
    // Native public usage has no mandatory duration identity. In that case, windows
    // with the same reset share a suppression key; raw source labels are not persisted.
    const minutes = typeof w.windowDurationMins === 'number' && w.windowDurationMins > 0 ? w.windowDurationMins : 1;
    windows.push({used_percent: used, remaining_percent: Math.max(0, 100 - used), window_minutes: minutes, resets_at: resets / 1000});
  }
  return {status: 'ok', scope: 'codex_account', model: primaryModel, checked_at: new Date(now).toISOString(), windows};
}
