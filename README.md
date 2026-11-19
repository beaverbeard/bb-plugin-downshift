# Economy

A global Codex Economy switch with automatic activation when confirmed quota
reaches 5%.

**Experimental: requires a companion BB source build. Stock BB is unsupported.**
The package includes an implemented, reviewable native integration for the exact
BB source revision in [NATIVE-INTEGRATION.md](compatibility/NATIVE-INTEGRATION.md).
This capability has not shipped upstream. On stock BB the control stays disabled
and explains the requirement; installing the UI alone does not change execution.

On the companion build, Economy uses `gpt-6-luna`, `medium`, and
`serviceTier=default` (Fast off) across Codex threads on that BB server. Other
providers keep their execution. Active calls finish naturally; new profiles
apply at native turn boundaries. BB preserves the original model, reasoning,
Fast/inheritance, permission and source semantics. Core retains durable restore
readers after the plugin is removed.

## Automatic activation

With `autoEnabled` on (the default), a fresh native usage reading at **5% or
less remaining in any active Codex quota window** requests Economy once. Shared
Codex quota is accepted when a model-specific reading is unavailable. The
current SDK adapter reads shared account windows on **BB's primary host**. It
does not add separate accounts together or estimate a model-specific quota.

There is no automatic OFF. Manual OFF suppresses the current window until its
reset. If quota is unknown when OFF is pressed, a durable barrier suppresses the
first fresh windows rather than immediately undoing the manual choice. Unknown,
expired, malformed or stale readings never activate the mode. The observer uses
BB's native usage API every 30 seconds; it does not start a model or use a
separate account API. It can switch execution only on the companion native build.
The UUID and CAS generation of an uncertain activation survive reload; a newer
manual change wins. Shared subscription exhaustion is still a hard limit.

`primaryModel` defaults to `gpt-6.1-sol`; it identifies model-specific observations
when supplied by a compatible quota source. Account windows remain labeled as
shared quota.

## Control

An icon switch slides between original profiles (rabbit) and Economy (turtle).
Click, tap or swipe it; Space and the arrow keys work from the keyboard.
OFF follows the selected BB theme; ON has an orange track. The removable warm
tint follows that same theme. Cached last-confirmed ON stays visibly unconfirmed
until the server responds. Warnings expose details when needed. All text is English.

This plugin has no quota percentage widget. Quota is read internally only for
automatic activation; an independent quota display can be installed separately.

## Native installation and compatibility

Follow [the companion build guide](compatibility/NATIVE-INTEGRATION.md). The
source helper checks an exact clean upstream checkout and the patch checksum.
It is read-only unless `--apply` is supplied. It never patches an installed
runtime, restarts a service or changes auto-update settings. Server and execution
hosts must use the compatible native build, including host protocol272.

The manifest engine ranges express SDK/build compatibility only. They do not
imply the required capability exists in stock BB. Runtime detection requires
`bb.execution-policy/v1` and every specified execution/restoration semantic.
There is no polling-based execution rewrite, mass thread-option mutation or
private runtime dependency.

## Build and inspect

```sh
npm ci --ignore-scripts
npm rebuild better-sqlite3
npm run check
npm test
bb plugin build .
npm pack --dry-run --ignore-scripts
npm pack --ignore-scripts
```

The development tests use the SDK’s real SQLite storage harness; native Node
build tools are needed if a compatible SQLite binary is unavailable.
BB builds source for Git installs. An npm archive includes prebuilt `dist`
artifacts. The SDK and React are provided by BB; Zod is the runtime dependency.
Plugins run as full-trust server code in BB.

## Install and remove

After choosing the companion server explicitly:

```sh
bb plugin install . --yes
bb plugin rpc call economy economy_state --json
bb plugin disable economy
bb plugin uninstall economy
```

Require `available:true` and no state error. A stock install reports
`available:false` and a disabled switch. Its quota observer remains read-only.
Removing the plugin removes its UI and palette attribute. Native provenance and
restore readers remain in core. Never delete their journals or replace core
with an older binary as an uninstall shortcut.

## Privacy and license

The package ships no account data, thread history, database, configuration or
credentials. Quota normalization discards account email, plan and unrelated
fields. Marketplace captures use a separate empty BB instance. Native transport
and scripted bridge tests are identified separately from real subscribed model
calls; no real model continuation is claimed without that evidence.

MIT. Phosphor Fill 2.1.1 artwork and its source revision are under `assets/`.
The upstream BB license accompanies the source patch under `compatibility/`.
