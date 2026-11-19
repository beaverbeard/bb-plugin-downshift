import {defineRpcContract, experimental_PluginRpcRefusal, type BbPluginApi} from '@get-bb/plugin-sdk';
import {z} from 'zod';
import {AutomaticEconomy, type AutomaticRecord, type QuotaSnapshot} from './lib/automatic';
import {nativeCapability, type NativeController} from './lib/native-contract';
import {quotaView} from './lib/quota-view';
import {nativeQuota} from './lib/quota';
import {economyProfile, economyStateSchema, economySetSchema, unavailableEconomy, type EconomyState} from './lib/state';

export const rpcContract = defineRpcContract({
  economy_state: {input: z.null(), output: economyStateSchema},
  economy_set: {input: economySetSchema, output: economyStateSchema},
});
const missing = 'Requires the native bb.execution-policy/v1 capability. Stock BB 0.49.0 is unsupported. See the package compatibility guide.';

export default async function plugin(bb: BbPluginApi) {
  const settings = await bb.settings.define({
    autoEnabled: {type: 'boolean', label: 'Automatically enable at 5% remaining', default: true},
    primaryModel: {type: 'string', label: 'Primary Codex model', default: 'gpt-6.1-sol'},
  }).get();
  // This property is a concrete upstream dependency, deliberately optional here.
  const native = nativeCapability((bb as BbPluginApi & {experimental_executionPolicies?: unknown}).experimental_executionPolicies);
  let controller: NativeController | null = null;
  let latestQuota: QuotaSnapshot | null = null;
  let disposed = false;
  const status = (): EconomyState => {
    if (!controller) return unavailableEconomy(missing);
    try {return economyStateSchema.parse(controller.status());}
    catch {return unavailableEconomy('The native controller returned an invalid state. No switch is allowed.');}
  };
  if (native) {
    try {
      const handle = native.register({id: 'economy', providerId: 'codex', profile: economyProfile});
      if (!handle || !['status', 'set', 'subscribe', 'release'].every(k => typeof (handle as unknown as Record<string, unknown>)[k] === 'function')) {
        handle?.release?.(); throw Error('Invalid native controller');
      }
      controller = handle;
      const unsubscribe = controller.subscribe(() => {if (!disposed) bb.realtime.publish('economy-changed', null);});
      bb.onDispose(() => {disposed = true; unsubscribe(); controller?.release(); controller = null;});
    } catch {controller?.release(); controller = null;}
  }
  if (!controller) bb.status.needsConfiguration(missing);
  const set = (input: z.infer<typeof economySetSchema>): EconomyState => {
    if (!controller || disposed) throw new experimental_PluginRpcRefusal({code: 'conflict', message: missing});
    try {return economyStateSchema.parse(controller.set(input));}
    catch (error) {
      if (error instanceof Error && (error as Error & {code?: string}).code === 'execution_policy_conflict') {
        throw new experimental_PluginRpcRefusal({code: 'conflict', message: error.message});
      }
      throw error;
    }
  };
  const automatic = new AutomaticEconomy({
    load: async () => (await bb.storage.kv.get<AutomaticRecord>('automatic-v1')) ?? null,
    save: value => bb.storage.kv.set('automatic-v1', value),
    mode: status, set,
    primaryModel: settings.primaryModel,
  });
  bb.onDispose(() => {disposed = true; automatic.dispose();});
  bb.rpc.register(rpcContract, {
    economy_state: () => ({...status(), quota:quotaView(latestQuota,settings.primaryModel), ...(settings.autoEnabled ? {automatic: automatic.view} : {})}),
    economy_set: async input => {
      if (!input.enabled) await automatic.suppress(latestQuota);
      const next = set(input); bb.realtime.publish('economy-changed', null); return next;
    },
  });
  bb.background.service('quota', {
    async start(signal) {
      while (!signal.aborted && !disposed) {
        try {
          const raw = await bb.sdk.system.usageLimits({providerId: 'codex', signal});
          if (signal.aborted || disposed) return;
          latestQuota = nativeQuota(raw, settings.primaryModel);
          if(controller&&settings.autoEnabled) await automatic.observe(latestQuota);
          bb.realtime.publish('economy-changed', null);
        } catch {latestQuota = null; if(controller&&settings.autoEnabled) await automatic.observe(null);}
        await new Promise<void>(resolve => {
          const done = () => {clearTimeout(timer); signal.removeEventListener('abort', done); resolve();};
          const timer = setTimeout(done, 30_000); signal.addEventListener('abort', done, {once: true});
          if (signal.aborted) done();
        });
      }
    },
  });
}
