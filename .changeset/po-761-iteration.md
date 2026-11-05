---
"@revenexx/integrations-node-sdk": minor
---

The manifest says whether each node is a loop: `buildManifest` writes `iteration` on every node, `true` exactly when the node has `extractItems`, and `false` otherwise. It is derived from the code rather than declared, so the platform's save check and the worker recognise a loop by the same sign. The registry has to accept the key before a package built on this release can be registered.
