---
"@revenexx/integrations-node-sdk": minor
---

A node with more than one output must name the one it took: `INodeResult.branch` is documented as required for such a node, because a result without it makes every output fire (PO-751). New exports: `isMultiPort` (more than one declared output — an `error` output counts — or an output marked `resolveOutputs`; a single output of any kind is one way out), `assertBranchNamed(node, result, config?)` for a node's own tests, `outputProblems`, `outputWarnings` and the type `IBranchedNodeResult`. A node with one output may still omit `branch`. Nothing breaks.

`rvnxx-nodes manifest` now **warns** (the build continues; `buildManifest` is unchanged) when a node with several outputs has a fixed output without a `name`, two with the same `name`, or a generated output whose `fallback` name repeats a fixed one. From the next major version this is an error (PO-762). To fix it, give every fixed output a unique `name` and keep fallback names distinct from them.
