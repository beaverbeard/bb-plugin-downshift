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
export type QuotaView = {remaining: number | null; scope: 'model' | 'codex_account' | null; resetsAt: string | null; checkedAt: string | null};
export function quotaView(usage: QuotaSnapshot | null, primaryModel: string, now = Date.now()): QuotaView {
  const valid = confirmedQuota(usage, primaryModel, now);
  if (!valid) return {remaining: null, scope: null, resetsAt: null, checkedAt: null};
  const window = valid.windows.reduce((a, b) => a.remaining_percent <= b.remaining_percent ? a : b);
  return {remaining: window.remaining_percent, scope: valid.scope, resetsAt: new Date(window.resets_at * 1000).toISOString(), checkedAt: valid.checked_at};
}
export function quotaBubble(view: QuotaView | undefined, now = Date.now()): {label: string; tone: 'green' | 'yellow' | 'red' | 'unknown'; title: string} {
  const at = Date.parse(view?.checkedAt ?? ''), reset = Date.parse(view?.resetsAt ?? '');
  if (!view || view.remaining === null || !Number.isFinite(view.remaining) || view.remaining < 0 || view.remaining > 100
    || !Number.isFinite(at) || now - at > 360_000 || at - now > 60_000 || !Number.isFinite(reset) || reset <= now) {
    return {label: '—', tone: 'unknown', title: 'Codex quota remaining is unconfirmed or stale.'};
  }
  const value = Math.round(view.remaining);
  return {label: `${value}%`, tone: value >= 50 ? 'green' : value >= 25 ? 'yellow' : 'red',
    title: `${view.scope === 'model' ? 'Primary model' : 'Shared Codex'} quota remaining: ${view.remaining.toFixed(1)}%. Resets ${view.resetsAt}.`};
}
