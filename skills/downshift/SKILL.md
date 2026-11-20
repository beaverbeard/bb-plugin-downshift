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

A full shared quota cannot be bypassed by choosing a smaller model.

The companion implementation and exact clean-source helper are in
`compatibility/NATIVE-INTEGRATION.md`. The helper checks by default and applies
source only with `--apply`. Deploy its server and host artifacts explicitly;
protocol273 is required. Native provenance must remain after uninstall. The
quota adapter reads only the selected provider on the primary machine, never a
sum of accounts or unrelated providers. All user-facing Downshift text is English.
