---
"@revenexx/integrations-node-sdk": major
---

`rvnxx-nodes manifest` stops the build when a node with several outputs has outputs a branch cannot tell apart — a fixed output without a name, two with the same name, a generated output whose fallback name repeats another output's, or two outputs named from the same setting — naming the node and the output, and writes no manifest. Up to 2.x the first three were a warning and the last two were not checked. To migrate, give every fixed output a unique `name`, every generated one a fallback name no other output uses, and each its own setting. `buildManifest` does not refuse such a node, and `outputWarnings` keeps its name.
