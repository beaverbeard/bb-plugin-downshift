# Quota sources and automatic decisions

Auto uses the existing SDK `system.usageLimits({providerId, hostId, refresh:true})`.
BB routes it to that host's `provider.usage` maintenance command and returns a
record keyed by the actual provider ID. This API is generic; Downshift has no
provider-name allowlist. It does not depend on a quota display plugin. The
existing execution-policy companion remains necessary for applying the profile;
this release adds no new core/SDK patch.

## Inputs and supported sources

The provider must be available, advertise `maintenance.usage`, and return
`status:ok` with a finite percentage and `resetsAt` as an ISO date or null. The
percentage is provider-reported quota, not an estimate from context tokens or
unbounded spending. Native account/plan fields are discarded; only source/window
hashes enter automatic storage. A successful forced native read is timestamped
at completion; an explicit provider `observedAt` is respected when present.
Read failures do not turn older data into a fresh observation.

| Native source | Quota semantics | Model filtering | Identity |
| --- | --- | --- | --- |
| Codex | Provider's shared subscription windows | Shared windows; exact model ID if supplied | Provider `accountKey` when available |
| Claude Code | Session/weekly shared and native scoped model-family limits | Exact ID; explicit Claude family adapter for native `window.model` | Provider `accountKey` when available |
| OpenCode Go / other ACP usage adapters | Native rolling/weekly/monthly or declared bounded quota | Exact model ID if supplied, otherwise shared | Issuer key when supplied, connection scope otherwise |
| Any other quota-capable BB provider | The same canonical `ProviderUsage` contract | Exact model IDs or genuine shared quota | Issuer key or connection scope |
| Provider without native usage capability | No observable quota | Not inferred | Auto waits for a provider usage implementation |

These are adapter contracts verified with SDK fixtures and native transport
doubles, not claims that a real subscribed model was called. Availability of a
main/Downshift model still requires a confirmed BB model catalog. No new service,
account, API key, provider subscription or model request is created by Downshift.

## Account scope and connection scope

When `accountKey` is supplied, the provider owns its issuer/account/organization
meaning. Source identity hashes provider, primary host and this opaque key. A
pending request can retry its UUID only when that same source, selection,
generation and low window are freshly confirmed.

`accountKey` is optional in the native contract. Without it, the source is the
current selected provider connection on BB's primary machine. This is explicitly
connection scope, not proof of issuer-account identity. Email, display labels,
credential contents and invented account IDs are never used. A saved uncertain
connection decision is cancelled before reevaluation, including after restart;
a fresh current low decision uses a new UUID. Native generation/CAS prevents a
new decision from overriding a newer manual change. A second forced read after
durable preparation must confirm the same current source and applicable low
window before the synchronous native set. An account swap invisible to native
metadata cannot be proven absent; connection scope does not claim that guarantee.

Manual OFF also writes conservative provider/host barriers, so disappearance or
later availability of account metadata cannot immediately undo OFF. Selecting a
different main model changes the UI/observer selection ID while preserving the
native profile ID used for restoration. Old in-flight readers are aborted and
epoch-checked. Primary-machine changes invalidate an in-flight reading.

## Windows and reset semantics

Native windows remain separate with their original numeric values. Labels and
array positions do not define durable identity. Explicit stable IDs take
precedence. Otherwise model scope, native kind, bounded-cost shape and dated
reset identify observable windows; two ordinary dated windows with different
reset dates remain distinct even without optional kind/model/ID metadata.

Any applicable low window can activate. Manual OFF consumes current windows:

- A dated window is suppressed until its recorded reset, even if its percentage
  temporarily recovers. A conservative class barrier prevents reset metadata
  appearing/disappearing or changing from prematurely undoing OFF.
- An undated window is suppressed until fresh confirmed remaining quota is
  strictly above 5%. Null is a real absent reset date; no date is invented.
- Indistinguishable undated windows form an observable decision group. Any-low
  can activate without averaging or discarding readings. OFF requires all
  original members to recover. Persisted member counts prevent a missing
  window from being treated as recovery. Label/order changes have no effect.
  If membership cannot be established, suppression can last longer; it is never
  relaxed on an unknown/error response or a partial inventory.

An uncertain dated/account request is retried only for the same cycle; a changed
reset cancels it. Storage corruption/failure stops activation. Recovery writes
are durable before a no-reset/group barrier is released. Legacy automatic-v1
records are retained and conservatively imported into automatic-v2 storage;
uncertain legacy requests are not replayed. Native journals, restoration
provenance and source thread options are untouched.

## Primary contracts

The implementation was checked against companion BB source and current upstream
`351cb84dc6391d3c6d16295e66578fe97232a25e`. The generic API is already present in
the companion base; no new host protocol is required for quota observation.

- [SDK system usage method](https://github.com/get-bb/bb/blob/351cb84dc6391d3c6d16295e66578fe97232a25e/packages/sdk/src/areas/system.ts)
- [Server host/provider routing and refresh](https://github.com/get-bb/bb/blob/351cb84dc6391d3c6d16295e66578fe97232a25e/apps/server/src/services/system/usage-limits.ts)
- [Canonical provider usage contract](https://github.com/get-bb/bb/blob/351cb84dc6391d3c6d16295e66578fe97232a25e/packages/provider-bridge-protocol/src/provider-maintenance.ts)
- [Claude scoped-limit adapter](https://github.com/get-bb/bb/blob/351cb84dc6391d3c6d16295e66578fe97232a25e/plugins/provider-claude-code/src/bridge/provider-maintenance.ts)
- [ACP/OpenCode usage adapter](https://github.com/get-bb/bb/blob/351cb84dc6391d3c6d16295e66578fe97232a25e/packages/provider-bridge-acp/src/bridge/opencode-usage.ts)
