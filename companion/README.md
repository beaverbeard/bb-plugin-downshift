# Downshift companion · experimental Linux x64 preview

A ready-to-run, unofficial BB 0.50.1 companion with Downshift 0.1.0-rc.6, Node.js
and the native dependencies included. It runs the reviewed global execution
policy: Downshift applies at the next native turn boundary across eligible BB
threads. Running turns finish naturally; each thread retains its original profile
and history. The selected main and Downshift models use the same provider.

## Start

Extract the archive, open a terminal in its directory, then run:

```sh
./downshift verify
./downshift start --data-dir "$PWD/../downshift-data"
```

Open `http://127.0.0.1:39020`. In **Settings → Installed plugins → Downshift**, choose
your provider, main model and Downshift model from BB's native catalog. Saving a
selection leaves Downshift off. Use the rabbit/turtle switch when ready.
Optional automatic activation uses confirmed remaining quota at **5% or less**
for the selected main provider/model. Providers must supply usable quota through
BB's native usage contract; unknown, stale or unavailable quota cannot activate it.
See the included plugin's `compatibility/QUOTA-SOURCES.md` for account/connection
scope, shared windows and manual-off suppression.

The first start uses a new separate data directory, installs the included plugin
there and leaves it unconfigured. BB, Node.js, package managers and a compiler do
not need to be installed separately. Initial server/plugin startup works offline.
Model discovery, account login and model use require your own supported provider
and subscription/credentials. This archive contains no accounts or user data.

Keep the terminal open. **Ctrl+C** stops this instance. From another terminal:

```sh
./downshift cli --data-dir "$PWD/../downshift-data" -- plugin list --json
./downshift stop --data-dir "$PWD/../downshift-data"
```

Choose other unused ports when needed:

```sh
./downshift start --data-dir "$PWD/../downshift-data" --port 39026 --host-port 39027
```

Later `cli` and `stop` commands remember these ports from the instance marker.
The server binds to loopback. Remote access requires your own explicit tunnel or
BB Connect setup. The launcher performs no account login or service installation.

## Scope and lifecycle

This is an isolated evaluation distribution. Existing nonempty BB data directories
are refused. Existing BB services and installed runtimes are untouched. Moving or
upgrading an instance with existing data requires an operator-reviewed migration;
the first preview binds its marker to this exact distribution path and build.

The installed plugin source is copied into the new instance's data directory;
native BB may rebuild its artifacts using the included pinned toolchain. The
extracted distribution remains immutable. Uninstalling or disabling Downshift is
respected on restart. The launcher does not change a model selection, enable a
mode, send a prompt, install a service or restart another BB instance.

BB's normal native shutdown/restart and restore readers remain responsible for
policy journals and request provenance. Preserve the entire data directory after
using Downshift. Do not delete `execution-policies/` or replace this companion with
a stock BB runtime over those data. Existing-data upgrades and remote execution
hosts require separate compatibility review. Remote hosts need the matching native
protocol and semantic handshake, not just a matching BB version number.

## Compatibility and evidence

- Linux x86-64 with glibc **2.34+** and libstdc++ providing **GLIBCXX_3.4.29**.
- Tested on Ubuntu 22.04.5, glibc 2.35, with the included Node **24.15.0**.
- Alpine/musl, ARM, macOS, Windows and other server distributions are unvalidated.
- BB **0.50.1**, SDK **0.6.164**, host protocol **273**;
  `bb.execution-policy/v1` and `consistent-durable-registry` are required.
- The plugin is the exact published rc.6 source. Its original archive checksum,
  native source revision/patch and Node provenance are in `manifest.json`.

The native integration is an unofficial source patch and has not shipped in stock
BB. The included plugin's `compatibility/NATIVE-INTEGRATION.md` explains its
source build and durability contract. This carrier packages the already-reviewed
native outputs; the earlier native/SDK/transport tests remain retained evidence.
New carrier checks cover a relocated archive, native addons, fresh isolated
install, restart, uninstall and cleanup with external networking unavailable.
No subscribed model call or real remote-host continuation was used for these
checks. Production qualification and existing-data rollout are separate work.

`inventory.json` records file checksums and relative links. `./downshift verify`
detects corruption and unexpected files. Verify the archive SHA-256 against a
trusted release receipt before extracting: an inventory within an archive cannot
authenticate its own publisher.

## Sources and licenses

BB: https://github.com/get-bb/bb — MIT, copyright Michael Yong.
Downshift: https://github.com/beaverbeard/bb-plugin-downshift — MIT.
Node.js: https://nodejs.org/dist/v24.15.0/ — its full bundled license is retained.
The source patch and BB license are included under `plugin/compatibility/`.
`THIRD_PARTY_NOTICES.md`, runtime license files and the build-dependency notice
index retain third-party attribution. See `BUILD.md` for assembly inputs and
source-build reproduction. This preview is not an official BB release.
