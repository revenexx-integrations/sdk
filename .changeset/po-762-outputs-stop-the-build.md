---
"@revenexx/integrations-node-sdk": major
---

`rvnxx-nodes manifest` stops the build when a node with several outputs has outputs a branch cannot tell apart — a fixed output without a name, two with the same name, or a generated output whose fallback name repeats a fixed one — naming the node and the output, and writes no manifest. Up to 2.x this was a warning. To migrate, give every fixed output a unique `name`, and a generated output a fallback name no fixed output uses. `buildManifest` does not refuse such a node, and `outputWarnings` keeps its name.
