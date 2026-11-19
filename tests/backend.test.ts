import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {BbPluginApi} from '@get-bb/plugin-sdk';
import {experimental_scanPublicSdkOnly} from '@get-bb/plugin-sdk/testing';
import plugin from '../server';
import {nativeProtocol, requiredSemantics, type NativeExecutionPolicies} from '../lib/native-contract';
import {economyProfile, unavailableEconomy} from '../lib/state';

function host(capability?: unknown) {
  const handlers: Record<string, (value?: any) => any> = {};
  const cleanup: (() => void | Promise<void>)[] = [], services: string[] = [], notices: string[] = [], signals: string[] = [];
  const storage = new Map<string, unknown>();
  const bb = {
    experimental_executionPolicies: capability,
    settings: {define: () => ({get: async () => ({autoEnabled: true, primaryModel: 'primary'})})},
    status: {needsConfiguration: (message: string) => notices.push(message)},
    storage: {kv: {get: async (key: string) => storage.get(key), set: async (key: string, value: unknown) => {storage.set(key, value);}}},
    rpc: {register: (_contract: unknown, value: typeof handlers) => Object.assign(handlers, value)},
    realtime: {publish: (channel: string) => signals.push(channel)},
    background: {service: (id: string) => services.push(id)},
    onDispose: (callback: () => void | Promise<void>) => cleanup.push(callback),
    sdk: new Proxy({}, {get: () => {throw Error('Unexpected native SDK call');}}),
  };
  return {bb: bb as unknown as BbPluginApi, handlers, services, notices, signals, cleanup};
}
test('stock and partial capabilities cannot mutate or start background execution', async () => {
  for (const cap of [undefined, {}, {describe: () => ({protocol: nativeProtocol, semantics: []}), register: () => {throw Error('must not register');}}]) {
    const h = host(cap); await plugin(h.bb); const state = h.handlers.economy_state!();
    assert.equal(state.available, false); assert.match(state.error, /Stock BB/); assert.deepEqual(h.services, ['quota']);
    await assert.rejects(h.handlers.economy_set!({enabled: true, expectedGeneration: 0, requestId: '5072ce12-1ad6-4b1d-942c-e106ee17747a'}), /native/);
  }
});
test('registration is provider-scoped; native subscription and handle are released exactly once', async () => {
  let released = 0, unsubscribed = 0, changed: (() => void) | undefined, mutations = 0;
  let state = {...unavailableEconomy(), available: true, error: null};
  const native: NativeExecutionPolicies = {describe: () => ({protocol: nativeProtocol, semantics: requiredSemantics}), register: declaration => {
    assert.deepEqual(declaration, {id: 'economy', providerId: 'codex', profile: economyProfile});
    return {status: () => state, set: input => {mutations++; state = {...state, enabled: input.enabled, phase: input.enabled ? 'on' : 'off', generation: state.generation + 1}; return state;},
      subscribe: callback => {changed = callback; return () => {unsubscribed++;};}, release: () => {released++;}};
  }};
  const h = host(native); await plugin(h.bb); assert.deepEqual(h.services, ['quota']);
  changed!(); assert.equal(h.signals.length, 1);
  const result = await h.handlers.economy_set!({enabled: true, expectedGeneration: 0, requestId: '5072ce12-1ad6-4b1d-942c-e106ee17747a'});
  assert.equal(result.enabled, true); assert.equal(mutations, 1);
  for (const dispose of h.cleanup) await dispose(); changed!();
  assert.equal(released, 1); assert.equal(unsubscribed, 1); assert.equal(h.handlers.economy_state!().available, false);
  await assert.rejects(h.handlers.economy_set!({enabled: false, expectedGeneration: 1, requestId: '5072ce12-1ad6-4b1d-942c-e106ee17747a'}));
  assert.equal(mutations, 1);
});
test('invalid native status is unavailable and a failed subscription releases its handle', async () => {
  let release = 0;
  const native = {describe: () => ({protocol: nativeProtocol, semantics: requiredSemantics}), register: () => ({status: () => ({}), set: () => ({}), subscribe: () => {throw Error('failed');}, release: () => release++})};
  const h = host(native); await plugin(h.bb); assert.equal(release, 1); assert.equal(h.handlers.economy_state!().available, false); assert.deepEqual(h.services, ['quota']); assert.match(h.handlers.economy_state!().error, /Native Economy registration failed: failed/);
});
test('package uses public SDK imports only', async () => {
  const result = await experimental_scanPublicSdkOnly(process.cwd(), {allow: [/^react$/, /^react-dom$/]});
  assert.deepEqual(result.violations, []); assert.deepEqual(result.privateDependencies, []);
});
