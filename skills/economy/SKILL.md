---
name: economy
description: Check Economy compatibility and its global Codex mode or automatic quota threshold.
---

Read state with `bb plugin rpc call economy economy_state --json`.
The candidate requires the native `bb.execution-policy/v1` capability. Stock BB
is unsupported: do not patch a runtime, change thread options, or treat polling
as an execution overlay. Follow the package compatibility guide.

The installed settings default to automatic activation at <=5% of any confirmed
active Codex quota window, including shared quota. It never automatically turns
OFF. Manual OFF suppresses a low window until reset. No model calls are needed
to observe usage. Never toggle a user's global mode merely for QA.

A full shared quota cannot be bypassed by choosing a smaller model.

The companion implementation and exact clean-source helper are in
`compatibility/NATIVE-INTEGRATION.md`. The helper checks by default and applies
source only with `--apply`. Deploy its server and host artifacts explicitly;
protocol272 is required. Native provenance must remain after uninstall. The
quota adapter observes the primary host's shared Codex account, not a sum of
accounts across machines. All user-facing Economy text is English.
