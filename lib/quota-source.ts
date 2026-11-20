import type {BbPluginApi} from '@get-bb/plugin-sdk';
import {nativeQuota} from './quota';
import type {QuotaSelection, QuotaSnapshot} from './quota-snapshot';

export interface QuotaReading {quota: QuotaSnapshot | null; issue: string | null}
/** Uses the existing host-routed provider usage API, never a model request or a UI plugin. */
export async function readNativeQuota(sdk: BbPluginApi['sdk'], selection: QuotaSelection, signal: AbortSignal): Promise<QuotaReading> {
  const check = () => {if (signal.aborted) throw Error('Quota observation cancelled');};
  try {
    check();
    const hostId = (await sdk.system.config({signal})).primaryHostId;
    check();
    if (!hostId) return {quota: null, issue: 'Auto waits for a primary BB machine.'};
    const providers = await sdk.providers.list({hostId, signal});
    check();
    const provider = providers.find(p => p.id === selection.providerId && p.available);
    if (!provider?.maintenance.usage) return {quota: null, issue: 'This provider does not expose quota through BB. Auto waits for a provider usage source.'};
    const value = await sdk.system.usageLimits({providerId: selection.providerId, hostId, refresh: true, signal});
    check();
    if ((await sdk.system.config({signal})).primaryHostId !== hostId) return {quota: null, issue: 'The primary BB machine changed during the quota reading. Auto will read the new source.'};
    check();
    const quota = nativeQuota(value, {...selection, hostId});
    return {quota, issue: quota ? null : 'Auto waits for fresh finite quota windows applicable to your selected main model.'};
  } catch {return {quota: null, issue: 'Auto could not confirm provider quota. Unknown or failed readings never trigger a switch.'};}
}
