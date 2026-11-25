---
name: downshift
description: Check Downshift compatibility and its selected-provider mode or automatic quota threshold.
---

Read state with `bb plugin rpc call downshift economy_state --json`.
The candidate requires the native `bb.execution-policy/v1` capability. Stock BB
is unsupported: do not patch a runtime, change thread options, or treat polling
as an execution overlay. Follow the package compatibility guide.

New installs require an explicit main-model and Downshift-model selection from
BB’s live catalog. No provider or main model is preselected. OFF restores each
thread’s original profile. Optional auto uses the selected provider's native BB
quota on the primary machine at <=5% remaining. Exact primary-model limits and
real shared limits apply; Claude family matching uses explicit native metadata.
A low foreign-model limit alone cannot trigger it. A provider with no native
usage capability needs a quota source, never an estimated context/budget proxy.

Issuer keys give account scope. Without them the current provider/machine
connection is the scope: no invented identity and no replay of saved uncertain
connection decisions. A fresh decision gets a new UUID, durable save, another
fresh reading and native CAS. Undetectable account changes are not proven isolated.
Manual OFF is durable until dated reset or confirmed >5% recovery for undated
quota. Anonymous undated groups require all original members to recover;
unknown/error, reorder, label changes or disappearance are not recovery.
Never toggle a user's global mode merely for QA; no model calls are needed.

## RPC reference

Call any method with `bb plugin rpc call downshift <method> --json`. Methods
with input take `--input-file <path>` holding JSON. A refusal, such as a missing
native capability, a stale generation or a changed selection, exits non-zero
with a message. Read-only methods are safe to call at any time.

- `economy_state` (no input): the mode, phase, generation, profile, issue
  lists, `configurationId`, and the `automatic` status when auto is enabled.
- `economy_configuration` (no input): `{nativeAvailable, configuration}`,
  where `configuration` is the saved selection or `null`.
- `economy_catalog` with `{"providerId": null}`: the available providers and
  whether each one reports usage. With `{"providerId": "<id>"}` it also returns
  that provider's confirmed models, reasoning levels and service tiers.
- `economy_configure` with a full selection:
  `{"version":1,"providerId":"<id>","primaryModel":"<model>","profile":{"model":"<model>","reasoningLevel":"<id>","serviceTier":"default"},"autoEnabled":false}`.
  It checks the selection against the live catalog before saving and is
  refused when changing the selection unless Downshift is off and restoration
  has finished. An identical selection can return idempotently while on.
  `autoEnabled: true` requires a provider that reports usage.
- `economy_set` with
  `{"enabled":true,"expectedGeneration":<generation>,"requestId":"<new UUID>","configurationId":"<from economy_state>"}`
  switches the mode. Take `generation` and `configurationId` from a fresh
  `economy_state` for a new decision. If the result is uncertain, retry the
  exact original input, including `expectedGeneration`, `configurationId` and
  `requestId`; do not refresh a field under the old UUID. A new decision needs a new UUID. This changes the user's
  global mode: call it only when the user asks for a switch.

A full shared quota cannot be bypassed by choosing a smaller model.

The companion implementation and exact clean-source helper are in
`compatibility/NATIVE-INTEGRATION.md`. The helper checks by default and applies
source only with `--apply`. Deploy its server and host artifacts explicitly;
protocol273 is required. Native provenance must remain after uninstall. The
quota adapter reads only the selected provider on the primary machine, never a
sum of accounts or unrelated providers. All user-facing Downshift text is English.

## Recovery after a manual-state storage failure

Manual OFF remains available when saving automatic suppression fails. A native
OFF generation without a matching durable manual checkpoint pauses automatic
activation across plugin reloads. Unknown quota, recovery or a storage repair
alone never clears this pause. Turn Downshift on manually when the user is ready;
a successful manual switch and checkpoint save restore normal automatic behavior.
Old installations already off with no checkpoint take the same conservative
path. Do not toggle merely to clear this warning during QA.

A repeated OFF on an already-off native policy may not advance its generation.
If automatic suppression cannot be saved and no durable pause can be confirmed,
the RPC reports a refusal even though the current mode is off. Retry manual OFF
after repairing storage before reloading. A failed request is not a confirmed
durable pause; no temporary ON is used to manufacture a generation change.
