---
"@revenexx/integrations-node-sdk": minor
---

Carry package metadata in the built manifest. `buildManifest` now accepts an optional `NodePackageMeta` (`name`/`version`/`displayName`) and the CLI reads it from the package's `package.json`, writing a `package` block into `dist/manifest.json` and warning when `displayName` is absent. This gives the bundle label a typed SDK contract that the registry can read from the manifest instead of reaching into a bespoke `package.json` key.
