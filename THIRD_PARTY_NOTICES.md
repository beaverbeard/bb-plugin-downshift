# Third-party notices

The SVG battery icon is Phosphor Fill 2.1.1, MIT. Its source revision and SHA
are in assets/provenance.json; the complete license is assets/PHOSPHOR-LICENSE.txt.

Zod is MIT, copyright Colin McDonnell. Builds may bundle its runtime. The
complete license is assets/ZOD-LICENSE.txt.

React, React DOM and the BB Plugin SDK are supplied by BB. They are not bundled
by this package. Development dependencies are not shipped in the npm archive.

Source maps are excluded from the published archive. BB's build tool can place
absolute development paths in a virtual Zod source-map source name. The runtime
JavaScript and metadata are included and are checked separately.
