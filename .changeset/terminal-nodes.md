---
"@revenexx/integrations-node-sdk": patch
---

Document that `INodeDescription.outputs` may be an empty array (PO-201). An
empty array marks a **terminal node**: the path ends there and no edge may
leave it — the mirror image of `inputs: {}` on a trigger. The canonical case is
`StopAndErrorNode`, which always throws and therefore has no success path to
wire; before this it declared a dummy port labelled "Never" purely to satisfy
the manifest schema, which left a dead handle on the editor canvas.

No type change: `outputs: IOutputPort[]` stays required and already accepted
`[]`. The actual constraint lived in the Integrations node-manifest schema
(`minItems: 1`), which has been relaxed on the server side; publishing a node
with `outputs: []` requires that change to be deployed first.
