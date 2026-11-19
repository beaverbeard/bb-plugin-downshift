export interface QuotaSnapshot {
  status: string;
  scope: 'model' | 'codex_account';
  model: string;
  checked_at: string | null;
  windows: {used_percent: number; remaining_percent: number; window_minutes: number; resets_at: number}[];
}
export function confirmedQuota(usage: QuotaSnapshot | null, primaryModel: string, now = Date.now()): QuotaSnapshot | null {
  const checked = Date.parse(usage?.checked_at ?? '');
  if (!usage || usage.status !== 'ok' || !Number.isFinite(checked) || now - checked > 360_000 || checked - now > 60_000
    || !['model', 'codex_account'].includes(usage.scope) || (usage.scope === 'model' && usage.model !== primaryModel)
    || !Array.isArray(usage.windows) || !usage.windows.length || usage.windows.length > 16) return null;
  for (const w of usage.windows) {
    if (![w.used_percent, w.remaining_percent, w.window_minutes, w.resets_at].every(Number.isFinite)
      || w.used_percent < 0 || w.remaining_percent < 0 || w.remaining_percent > 100
      || Math.abs(Math.max(0, 100 - w.used_percent) - w.remaining_percent) > 0.01
      || w.window_minutes <= 0 || w.window_minutes > 525_600 || w.resets_at * 1000 <= now) return null;
  }
  return usage;
}
