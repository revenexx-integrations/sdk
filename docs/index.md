# @revenexx/integrations-node-sdk

Shared TypeScript contract library for Revenexx integration nodes. Defines the interfaces every node must implement (`INode`, `INodeDescription`, `INodeContext`, `INodeResult`) and ships manifest helpers used by the node registry.

## Role in the stack

```
integrations-node-sdk          (this package — types & helpers only)
  └── integrations-nodes-core  (implements INode, ships dist/manifest.json)
        └── integrations-worker  (registers nodes, executes workflows)
```

The SDK has **no runtime dependencies** and no logic beyond the manifest helpers. It exists solely to share the contract between node packages and the workflow engine.

## Package contents

| Source file | Purpose |
|---|---|
| `src/types.ts` | All interfaces and union types (`INode`, `INodeDescription`, `INodeContext`, `INodeResult`, `IConfigField`, …) |
| `src/errors.ts` | `NodeError` — typed error class for unexpected failures inside `execute` |
| `src/extract.ts` | `extractManifest` / `extractManifests` — pull `INodeDescription` off node instances without executing them |
| `src/index.ts` | Barrel re-export |

## Quick links

- [API Reference & Node Authoring Guide](overview.md)
- [Versioning & Release Policy](versioning.md)
