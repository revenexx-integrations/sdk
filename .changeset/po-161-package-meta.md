---
"@revenexx/integrations-node-sdk": minor
---

Read the node package's bundle label from the `package.json` `revenexx` group (`revenexx.displayName`, e.g. `{ "revenexx": { "displayName": "Business Central" } }`). `parsePackageMeta` exposes it and the CLI warns when it is absent. The label is read directly from `package.json` by the integrations registry — it is not carried in the built manifest, so `buildManifest` takes no `displayName` argument and emits no `package` block.
