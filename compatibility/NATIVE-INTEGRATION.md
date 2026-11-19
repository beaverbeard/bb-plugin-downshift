# Native integration

Economy requires a companion BB source build. **Stock BB is unsupported and
keeps the control disabled.** The package includes a generic source patch for
BB 0.50.1 at upstream commit `df9619d8e8aac4aff00c0c3ff9b8ef4e2823e4f2`, with SDK
0.6.164. This integration has not shipped in upstream BB. Its exact revision,
patch checksum and validation evidence are in `native-manifest.json`. Its
`reviewedNativeCommit` identifies the local tested tree; it is not an upstream
commit to check out. Applying the included patch to `baseCommit` reproduces its
43 changed source files.

The integration implements the experimental `bb.execution-policy/v1` service.
Core owns effective execution, immutable original profiles, generation CAS,
UUID deduplication, durable request provenance, native host catalog checks and
restore readers. A plugin may register only model, reasoning level and service
tier for one provider. It cannot change the provider, input, permissions or
history. Economy registers the user-selected profile for one provider. Native catalogs
validate reasoning and service tiers. A model without reasoning choices accepts
only its known catalog default; no unsupported reasoning argument is sent.
The same native catalog normalization applies when restoring a profile. Unknown
discovery remains unavailable.
Economy also requires the `consistent-durable-registry` semantic. An older
companion that lacks this recovery check is not compatible with this release.

## Build from the exact source

Use a separate clean checkout. The helper checks the exact Git revision, clean
worktree and patch checksum. Its default is read-only. `--apply` changes source
files only; it never touches an installed runtime, restarts a service, changes
auto-update settings or starts a model call.

```sh
git clone https://github.com/get-bb/bb.git bb-native-execution
git -C bb-native-execution checkout df9619d8e8aac4aff00c0c3ff9b8ef4e2823e4f2
node compatibility/apply-native.mjs --source bb-native-execution
node compatibility/apply-native.mjs --source bb-native-execution --apply
cd bb-native-execution
corepack pnpm install --frozen-lockfile
corepack pnpm exec turbo run typecheck --filter=@bb/server --filter=@get-bb/plugin-sdk --filter=@bb/agent-runtime --concurrency=1
corepack pnpm exec turbo run test --filter=@bb/server --concurrency=1 -- src/services/execution-policies/
corepack pnpm exec turbo run test --filter=@bb/agent-runtime --concurrency=1 -- src/runtime.execution-policy.test.ts
corepack pnpm exec turbo run build --filter=bb-app --concurrency=1
```

This integration was validated on Linux x64 with Node 24.15.0. Other server
platforms have not been validated. The build requires BB's normal Node and native
build prerequisites. The patch
includes SDK declarations, a Plugin Guide card, the API audit entry and native
regression tests. It changes host protocol **271 to 273**: the companion server
and every execution host must use artifacts built from the same patched source.
The native handshake also requires `executionPolicyProtocol=bb.execution-policy/v1`.
A stock daemon with a coincidentally matching numeric protocol is rejected. An
old daemon must not be treated as compatible because its BB version matches. Deploy the reviewed build through BB’s normal explicit source
installation process; this package does not automate that deployment. For a new local
instance, the companion launcher can start both server and primary daemon:

```sh
BB_DATA_DIR="$PWD/.economy-evaluation" \
BB_SERVER_URL=http://127.0.0.1:38976 \
node packages/bb-app/dist/bb-app.js --data-dir "$PWD/.economy-evaluation" \
  --server-bind-host 127.0.0.1 --server-port 38976 --host-daemon-port 38977 \
  --bundled --no-in-app-updates
```

Choose unused ports and a new data directory. The two-port example is for a
POSIX shell; adapt environment assignment syntax on other platforms. For remote
execution hosts, use BB’s **Add machine** flow from that companion server: it
serves its exact host-only artifact. Do not substitute an npm stock daemon.
Existing-data deployment needs an explicit operator-managed upgrade and native
archive/backup; the source helper performs none of those operations.

For isolated evaluation, start the built server with a **fresh** explicit
`BB_DATA_DIR`, unused loopback server and host ports, and an explicit
`BB_SERVER_URL`. Run every CLI command with that same data directory and server
URL. A data directory alone does not override an inherited server URL.
Use `packages/bb-app/dist/bb-server.js` and the corresponding built CLI/daemon.
Do not point an evaluation instance at an existing BB database or journal.

## Install and check the plugin

After choosing the companion server explicitly, use its normal plugin install:

```sh
env -u BB_CLI -u BB_THREAD_ID -u BB_PROJECT_ID -u BB_ENVIRONMENT_ID \
  BB_DATA_DIR="$PWD/.economy-evaluation" BB_SERVER_URL=http://127.0.0.1:38976 \
  node packages/bb-app/dist/bb.js plugin install /path/to/bb-plugin-economy --yes
env -u BB_CLI -u BB_THREAD_ID -u BB_PROJECT_ID -u BB_ENVIRONMENT_ID \
  BB_DATA_DIR="$PWD/.economy-evaluation" BB_SERVER_URL=http://127.0.0.1:38976 \
  node packages/bb-app/dist/bb.js plugin rpc call economy economy_state --json
```

Open Economy’s Models section and choose a main and Economy model from the
current BB catalog. Setup does not enable the mode. Require `available:true`,
no state error, and the exact profile you selected. On activation, every target
host must confirm that profile through BB’s native catalog. Offline or unavailable hosts
remain visible and wait; there is no expensive or cross-provider fallback.
Observe the actual requested and effective execution in the native journal
under the selected data directory. Never enable a real global mode just to
check compatibility.

The most recent local QA evidence identifies what was tested and what used
scripted provider/transport doubles. It does not claim a real subscribed model
continuation where none was performed.

## Lifecycle and removal

Startup waits for native provider registration without requiring a reload.
A pending registration is unavailable and is cancelled when its owner unloads.
A normal plugin reload replaces a staged owner lease atomically. The old lease
cannot disable its replacement. A server shutdown suspends overlays without
forgetting the selected mode; restart resumes it only after the owner loads.
Without that owner, new overlays stay disabled and restore readers still run.

Disabling or uninstalling Economy deactivates new overlays. Active work finishes
naturally, and later turns use the original native profile. Core keeps request
provenance even after removal, including IDs written before a rolled-back event
append. Do not delete `execution-policies/`, remove the compatibility reader,
or replace the companion core with an older binary after using the feature.
Native server archives and imports preserve the core journal and its request
restore provenance. Native thread/host events update status without polling for
execution changes. A corrupt or missing existing journal blocks affected dispatch
rather than inferring OFF. A missing registry with retained journal files, or a
registry whose entries do not exactly match the journal inventory, blocks policy
registration, dispatch and provenance reads until operator recovery. Startup only
treats an absent or empty policy directory as a first installation; it does not
recreate a missing registry from guessed identities or reset surviving journals.
Preserve the directory and recover the matching registry and journals from a
verified backup before restarting. Recovery requires inspection of the complete
policy inventory and its backups.

The included helper has no reverse-runtime-patch or journal-deletion command.
