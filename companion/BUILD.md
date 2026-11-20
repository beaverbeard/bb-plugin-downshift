# Assembly and reproduction

The carrier contains the accepted BB source build and published Downshift rc.6.
Its launcher is independent of BB's source tree. No installed `start-server.js`
was copied or patched. The original rc.6 archive, source tag and release asset are
unchanged.

To rebuild BB, follow `plugin/compatibility/NATIVE-INTEGRATION.md`: check out BB
`df9619d8e8aac4aff00c0c3ff9b8ef4e2823e4f2`, apply the included checksum-verified
43-file native patch and use Node 24.15.0/pnpm 9.15.0. The reviewed tree is
`ed4e544a27a63435166d6884a7b22f545032f2ef`. Its local review commit identifies
validation, rather than a public branch to check out. Normal compiler/minifier
output can differ; compare source identity and the resulting artifact checksums.

Run the assembly script from the carrier repository root with explicit inputs:

```sh
python3 assemble.py \
  --bb-tar /absolute/bb-app-0.50.1.tgz \
  --deps-root /absolute/deployed-bb-app/node_modules \
  --node-tar /absolute/node-v24.15.0-linux-x64.tar.xz \
  --toolchain-root /absolute/pinned-plugin-toolchain \
  --plugin-tar /absolute/bb-plugin-downshift-0.1.0-rc.6.tgz \
  --build-packages /absolute/bb/node_modules/.pnpm \
  --carrier-commit "$(git rev-parse HEAD)" \
  --out /absolute/new-companion-directory
```

Create the BB archive with `npm pack --ignore-scripts --offline` in its built
`packages/bb-app`. Deploy the locked production dependencies with pnpm 9.15.0:

```sh
corepack pnpm --filter=bb-app --prod deploy /absolute/deployed-bb-app --ignore-scripts
```

Download Node's exact official Linuxx64 archive and verify its published SHASUMS256.
Use the exact versions in `manifest.json` for the public npm plugin-build toolchain
(esbuild 0.28.2 and Tailwind 4.3.0); retain transitive versions and licenses. The
assembly records a complete runtime package/version inventory. It never downloads
provider credentials, calls a model or uses an installed production BB runtime.

`assemble.py` places the verified runtime, production dependencies, public
plugin-build dependencies and rc.6 plugin in a new directory. It removes source
maps and package-manager path metadata, fixes the pnpm self-reference to a
relative link, verifies every remaining link stays within the carrier and
retains licenses. For the exact checksum-pinned BB input it also normalizes
10 synthetic esbuild Zod namespace labels in8 built files: source comments and
initializer debug names only. Each occurrence must match its generated form;
per-file before/after hashes are recorded in the manifest. This removes builder
checkout labels without changing imports, execution logic or the native source
patch. The toolchain is resolved locally by BB's native resolver.
The plugin's only runtime dependency, Zod4.6.7, is included for native installation.

Per-file inventory and a deterministic tarball are generated after assembly.
Build inputs and final archive checksums are recorded separately. Reassembly
from these exact inputs is deterministic; rebuilding BB from source has its own
compiler/minifier nondeterminism and must receive fresh validation/checksums.
The assembler accepts only the reviewed input hashes; independently rebuilt
inputs require a new reviewed carrier candidate and matching input constants.
