# Native execution-policy dependency (release blocker)

## Verified base

Inspected upstream `get-bb/bb` main at
`df9619d8e8aac4aff00c0c3ff9b8ef4e2823e4f2` on 2026-11-19.
The installed build target is BB 0.49.0 / SDK 0.6.132. A separate unmodified npm
BB 0.49.0 installation is the stock compatibility test target.

The public `MessageDispatchHookDecision` in
[backend-contract.ts](https://github.com/get-bb/bb/blob/df9619d8e8aac4aff00c0c3ff9b8ef4e2823e4f2/packages/plugin-sdk/src/backend-contract.ts)
has only proceed, wait and reject. Its `requestedExecution` is input, not an
amendment. The final host send in
[online-rpc.ts](https://github.com/get-bb/bb/blob/df9619d8e8aac4aff00c0c3ff9b8ef4e2823e4f2/apps/server/src/services/hosts/online-rpc.ts)
sends `args.command` directly. No public effective-execution extension is present.
`system.usageLimits` supplies quota observations; it cannot change execution.

## Required upstream work

This candidate takes the explicit upstream-dependency route. It is **not** a
binary patch distribution, and the local interface below is **not** an existing
SDK API. No core patch or upstream issue/PR has been submitted. There is no
working native installer to run yet. Publication remains blocked.

Implement a generic server-owned `bb.experimental_executionPolicies` service
with descriptor protocol `bb.execution-policy/v1`. The exact proposed TypeScript
shape and required semantic identifiers are in `lib/native-contract.ts`.
The SDK export must retain the `experimental_` prefix and be added to
`docs/api_to_audit.md`, the Plugin Guide, and the backend API inventory.

The service, not the plugin, must own all of the following:

1. Attribute a registered policy to the calling plugin. Scope it to an existing
   provider and three execution fields: model, reasoning level, service tier.
   Reject competing owners for a provider; reject unsafe/unknown fields. There
   is no authority to change provider, permission mode, source, input or history.
2. Apply the effective overlay synchronously at the final host RPC boundary,
   after reconnect/preparation awaits, to new turns only. Explicit options,
   queued options, first turns, ordinary follow-ups and retry continuations
   pass that same boundary. Joins to active turns finish under their existing
   execution. Current generation is checked at the actual send, not before an
   await. Do not start dormant, archived, paused or failed work.
3. Keep requested/raw options distinct from effective values in durable native
   request provenance. Immutable activation snapshots include null inheritance,
   original Fast semantics and session choices. If any stored last-execution
   fallback can contain effective values, restore it by native request ID,
   including after append rollback, process restart and plugin removal. A
   compatibility reader must survive without the plugin being loaded.
4. Use monotonically increasing generation CAS and UUID request deduplication.
   Persist an operation before acknowledgment. A duplicate request returns its
   outcome; a reused UUID with a different action is refused. Delivery success
   followed by a journal write error must not cause another send.
5. Validate model and reasoning availability using BB's native catalog on the
   actual target host/project/environment. Cold catalog reads are bounded,
   deduplicated, have a negative cooldown, and recheck current mode after awaits.
   Unavailable hosts/models wait visibly without an expensive fallback.
6. Protect the immutable cycle from conflicting profile/session writes. Preserve
   independently resolved permissions/source and the original null/Fast
   resolution when OFF. Ordinary read-only observation never rewrites source.
7. Expose status, atomic set, change subscription, and lifecycle release. A
   release deactivates new overlays at safe boundaries while retaining native
   provenance/restore readers for every previous request. Unload is not a file
   deletion instruction. On native-service corruption, refuse Codex dispatch
   safely and expose an error rather than inferring OFF.

Concrete integration points at the verified base include:

- `apps/server/src/services/hosts/online-rpc.ts`: `requestHostOnlineRpcResponse`.
- `apps/server/src/services/threads/thread-events.ts`: request append and
  `getLastExecutionOptions` (source/effective provenance and restore).
- `thread-execution-plan.ts`: native option resolution and immutable source.
- `thread-execution-override.ts`: manual changes and sticky recovery.
- Native session-option patch and thread-creation paths: equivalent guards.
- Native dispatch before admission: host-scoped catalog preparation and wait.
- `apps/server/src/services/plugins/plugin-api.ts` and plugin lifecycle:
  per-plugin ownership, subscriptions and safe release.
- A server-owned durable service initialized before dispatch or stored
  last-execution reads, including when the originating plugin is not installed.

## Required native integration acceptance

A native implementation must supply an exact source commit, SDK/build version
and passing integration results before its descriptor can be accepted for a
release. A descriptor string alone is not proof.

Exercise explicit, inherited/null, queued, newly created, active/joined, offline,
cold-catalog and provider-rejection cases; another provider is unchanged.
Compare original source/settings, permissions, session choices and history.
Exercise ON -> OFF races during preparation and transport, native append rollback
after provenance write, repeated UUIDs, conflicting generations and corrupt
journals. Restart with an active cycle and then uninstall the plugin: old request
IDs still restore their original semantics, and no new overlay is applied.
Provider continuation on real subscribed hosts must be identified separately
from transport doubles. The package's local controller mocks do not prove it.

## Public installation and compatibility check

Until upstream ships the service and these tests, stock installations are
**unsupported** and remain read-only/disabled. No current BB version is claimed
as a supported native execution build by this candidate.

After a reviewed native release exists, install that explicit BB version using
its normal user-controlled update process, then build/install this package and
run `bb plugin rpc call economy economy_state --json`. Require `available:true`
and inspect the native build's integration evidence before enabling the mode.
This package contains no runtime patcher, silent restart, thread-option rewrite,
private runtime bridge or auto-update override.
