# Moving from Economy to Downshift

Downshift is the new public name and plugin ID. The Git repository is renamed;
old immutable tags and release assets remain unchanged. This is a separate BB
plugin identity, not an automatic storage or native-journal migration.

If you have never installed Economy, install Downshift normally on the supported
companion build and select your models explicitly.

If Economy is installed:

1. Keep the compatible companion server and execution hosts. Turn the old mode
   OFF yourself and wait for `phase: "off"`, no pending restoration and no state
   error. Active work must finish naturally. Do not delete any native journals.
2. Record your chosen provider, main model, smaller model, reasoning and service
   tier. Remove the old plugin only after restoration has completed:

   ```sh
   bb plugin rpc call economy economy_configuration --json
   bb plugin rpc call economy economy_state --json
   bb plugin uninstall economy
   ```

3. Install the reviewed Downshift release, then choose the same models in its
   Models section if you want to retain that selection:

   ```sh
   bb plugin install git:https://github.com/beaverbeard/bb-plugin-downshift.git@v0.1.0-rc.5 --yes
   bb plugin rpc call downshift economy_configuration --json
   bb plugin rpc call downshift economy_state --json
   ```

Do not run both identities together. Downshift does not copy the old plugin's
settings, automatic-activation history, browser cache or active mode. The new
installation remains unconfigured and OFF until you explicitly save a selection.
It does not adopt the old owner or enable a mode as part of installation.

Native ownership is keyed by plugin ID plus the profile declaration ID. The
profile-ID algorithm, native protocol, request markers and restoration format
are unchanged. Existing `economy` journals and provenance stay with their old
owner and remain readable by the companion core. Never rename or edit those
records, rewrite their owner, delete `execution-policies/`, or downgrade the
companion to an older reader as a branding operation.

The v1 RPC method names (`economy_state`, `economy_set`, `economy_configuration`,
`economy_catalog`, `economy_configure`) and realtime event `economy-changed`
remain stable technical contracts. Use the new plugin ID `downshift` as the RPC
target. User-facing text, browser caches, styles and assets use Downshift.

An existing private deployment may retain its original technical plugin ID,
RPC/storage keys and journal paths while presenting the Downshift name. Its
operator must update only presentation files and verify unchanged native state;
the public package does not attempt to discover or migrate such deployments.
