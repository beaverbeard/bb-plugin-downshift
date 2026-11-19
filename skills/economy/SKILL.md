---
name: economy
description: Check Economy compatibility and its selected-provider mode or automatic quota threshold.
---

Read state with `bb plugin rpc call economy economy_state --json`.
The candidate requires the native `bb.execution-policy/v1` capability. Stock BB
is unsupported: do not patch a runtime, change thread options, or treat polling
as an execution overlay. Follow the package compatibility guide.

New installs require an explicit main-model and Economy-model selection from
BB’s live catalog. No provider or main model is preselected. OFF restores each
thread’s original profile. Automatic activation is offered on for Codex during setup and currently supports
<=5% of any confirmed active shared Codex window on the primary host. Other
providers retain manual switching. It never automatically turns
OFF. Manual OFF suppresses a low window until reset. No model calls are needed
to observe usage. Never toggle a user's global mode merely for QA.

A full shared quota cannot be bypassed by choosing a smaller model.

The companion implementation and exact clean-source helper are in
`compatibility/NATIVE-INTEGRATION.md`. The helper checks by default and applies
source only with `--apply`. Deploy its server and host artifacts explicitly;
protocol273 is required. Native provenance must remain after uninstall. The
quota adapter observes the primary host's shared Codex account, not a sum of
accounts across machines. All user-facing Economy text is English.
