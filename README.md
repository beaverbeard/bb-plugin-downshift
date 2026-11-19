# Economy

A global Codex economy control, a remaining-quota bubble, and an automatic 5% quota threshold.

**Release status: local candidate, publication blocked.** Stock BB 0.49.0 / SDK
0.6.132 does not provide the native execution-policy capability this package
requires. The inspected upstream main also lacks it. Installing this candidate
on stock BB displays a disabled Economy control and a compatibility explanation.
It does not change execution. Do not list it as a working stock-BB plugin.

On a compatible native implementation, Economy uses `gpt-6-luna`, `medium`, and
`serviceTier=default` (Fast off) for Codex. Other providers keep their execution.
Active calls finish naturally; changes apply at the next native turn boundary.
Original model, reasoning, Fast/inheritance, permission and source options remain
owned by BB. The native service must preserve restoration across plugin removal.

## Automatic activation

With `autoEnabled` on (the default), a fresh native Codex usage reading at **5%
or less remaining in any active quota window** requests Economy once. Shared
Codex quota is accepted when a model-specific reading is unavailable. This
package's current public SDK adapter receives shared account windows only.

There is no automatic OFF. Manual OFF suppresses the current low window until
its reset. Unknown, expired, malformed or stale readings never activate the mode.
The observer checks every 30 seconds only on a compatible native build. It calls
BB's native usage API, not a model or an external account API. The UUID and CAS
generation of an uncertain activation survive reload; a newer manual change
wins. Shared subscription exhaustion is still a hard limit.

`primaryModel` defaults to `gpt-6.1-sol`; it identifies model-specific observations
when supplied by a compatible quota source. The SDK account-window adapter does
not infer a model-specific quota from labels.

## Remaining quota

A compact bubble beside Economy shows only the most restrictive confirmed
remaining Codex percentage. Visible 50–100% is green, 25–49% yellow, and 0–24%
red. The percentage is rounded to the nearest integer and color uses that same
visible integer. Missing, expired or stale data shows a neutral em dash. The
accessible label identifies shared versus model-specific quota and reset time.
The bubble never changes execution or spends a reset credit.

## Compatibility

See [the concrete upstream dependency](compatibility/UPSTREAM-DEPENDENCY.md).
The `engines` ranges express SDK/build compatibility only. They do **not** imply
that the required native capability exists. Runtime feature detection requires
`bb.execution-policy/v1` and every specified execution/restoration semantic.
There is no hidden installer, service restart, binary patch, polling-based
execution rewrite, thread-option mutation, or private runtime dependency.

## Build and inspect

```sh
npm ci --ignore-scripts
npm run check
npm test
bb plugin build .
npm pack --dry-run --ignore-scripts
npm pack --ignore-scripts
```

BB builds the source for Git installs. An npm archive includes the prebuilt
`dist` artifacts. The SDK and React are provided by BB; Zod is the only runtime
package dependency. Plugins run as full-trust server code in BB.

## Install and remove

Only install for evaluation on stock BB, or after the native dependency has
been implemented and its integration tests have passed:

```sh
bb plugin install . --yes
bb plugin rpc call economy economy_state --json
bb plugin disable economy
bb plugin uninstall economy
```

A stock installation must report `available:false` and a disabled switch. Its
read-only quota observer may run; it cannot activate the mode without core. Removing the plugin removes its UI and palette
attribute. On a compatible native build, deactivation and durable restore readers
belong to core, including after package removal. Never delete native provenance
journals or replace core with an old binary as an uninstall shortcut.

## Privacy and license

The package ships no account data, thread history, database, configuration or
credentials. Quota normalization discards account email, plan and other fields.
Screenshots for the candidate show an isolated empty BB instance and its actual
unsupported state. They do not demonstrate the proposed native execution hook.

MIT. The battery artwork is Phosphor Fill 2.1.1, MIT, with its license and exact
source revision under `assets/`.
