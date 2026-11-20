# Third-party notices

Zod is MIT, copyright Colin McDonnell. Builds may bundle its runtime. The
complete license is assets/ZOD-LICENSE.txt.

React, React DOM and the BB Plugin SDK are supplied by BB. They are not bundled
by this package. Development dependencies are not shipped in the npm archive.

Source maps are excluded from the published archive. BB's build tool can place
absolute development paths in a virtual Zod source-map source name. The runtime
JavaScript and metadata are included and are checked separately.

The native BB source integration is a patch to get-bb/bb, MIT. The full upstream
license is compatibility/BB-LICENSE.txt. No installed BB runtime is bundled.

## Branding and control symbols

The turtle branding and rabbit/turtle controls use Material Design Icons’
`rabbit` and `tortoise` under
Apache-2.0. The upstream license notice and full Apache license are included in
`assets/MATERIAL-DESIGN-LICENSE.txt` and `assets/APACHE-2.0.txt`. Exact source
revisions and hashes are in `assets/provenance.json`.
