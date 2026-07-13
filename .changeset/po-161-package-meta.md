---
"@revenexx/integrations-node-sdk": minor
---

Carry the bundle label in the built manifest. `buildManifest` now accepts the package's `displayName` and emits it as a `package: { displayName }` block in `dist/manifest.json`; the CLI reads it from `package.json` and warns when it is absent. `name`/`version` are not duplicated into the manifest — the registry reads those from `package.json` directly. This gives the bundle label a typed SDK contract the registry can read from the manifest (with a `package.json` fallback for older tarballs).
