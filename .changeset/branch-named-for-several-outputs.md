---
"@revenexx/integrations-node-sdk": minor
---

A node with more than one output must name the one it took: `INodeResult.branch` is documented as required for such a node, because a result without it made the worker fire every output (PO-751). New exports: `isMultiPort` (an `error` output counts; so do a `branch`-kind output and outputs named by `sourceFromConfig` or `resolveOutputs`), `assertBranchNamed(node, result)` for a node's own tests, `outputProblems` and the type `IBranchedNodeResult`. `rvnxx-nodes manifest` and `buildManifest` now refuse a node with several fixed outputs where one has no name or two share a name. A node with one output may still omit `branch`.

**Can break a package's build.** The manifest check is new: a package whose node declares several fixed outputs with a missing or duplicate `name` no longer builds after this upgrade. A single output of kind `branch`, or one named by `sourceFromConfig` or `resolveOutputs`, already counts as several. None of the eleven revenexx node packages is affected (checked by building each against this version); give every fixed output a unique `name` to fix it.
