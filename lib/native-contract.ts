import type {EconomyState} from './state';

/** Companion native contract, NOT an API present in stock BB.
 * See compatibility/NATIVE-INTEGRATION.md and the included exact source patch.
 */
export const nativeProtocol = 'bb.execution-policy/v1';
export const requiredSemantics = [
  'final-host-boundary', 'explicit-and-queued', 'preserve-source-and-null',
  'durable-request-provenance', 'immutable-cycle-snapshots', 'cas-and-request-dedup',
  'safe-native-boundaries', 'native-host-catalog', 'restore-after-unload',
] as const;
export interface NativeController {
  status(): EconomyState;
  set(input: {enabled: boolean; expectedGeneration: number; requestId: string}): EconomyState;
  subscribe(changed: () => void): () => void;
  /** Native service deactivates the overlay safely; restore readers outlive this handle. */
  release(): void;
}
export interface NativeExecutionPolicies {
  describe(): {protocol: string; semantics: readonly string[]};
  register(policy: {id: string; providerId: string; profile: {model: string; reasoningLevel: string; serviceTier: string}}): NativeController;
}
export function nativeCapability(value: unknown): NativeExecutionPolicies | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<NativeExecutionPolicies>;
  if (typeof candidate.describe !== 'function' || typeof candidate.register !== 'function') return null;
  try {
    const descriptor = candidate.describe();
    return descriptor.protocol === nativeProtocol && Array.isArray(descriptor.semantics)
      && requiredSemantics.every(s => descriptor.semantics.includes(s)) ? candidate as NativeExecutionPolicies : null;
  } catch { return null; }
}
