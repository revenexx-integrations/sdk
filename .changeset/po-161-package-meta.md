---
"@revenexx/integrations-node-sdk": minor
---

Read the bundle label from the `package.json` `revenexx` group. `parsePackageMeta` now reads `revenexx.displayName` (a namespaced group, e.g. `{ "revenexx": { "displayName": "Business Central" } }`) instead of a bespoke top-level `displayName` key, and the CLI warns when it is absent. The label is NOT carried in the built manifest — the integrations registry reads it straight from `package.json`, so `buildManifest` no longer accepts a `displayName` argument and never emits a `package` block.
