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
| `src/manifest.ts` | `buildManifest` / `MANIFEST_VERSION` — wrap node descriptions in the `{ manifestVersion, nodes }` envelope the registry expects |
| `src/cli.ts` | `rvnxx-nodes` CLI (`bin`) — shared build/publish tooling for node packages |
| `src/index.ts` | Barrel re-export |

## `rvnxx-nodes` CLI

The SDK ships a `bin`, `rvnxx-nodes`, so every node package shares one
build/publish toolchain instead of copying scripts. It operates on the
current working directory:

| Command | What it does |
|---|---|
| `rvnxx-nodes manifest` | Imports the package's built `dist/index.js`, reads its `NODES` export, and writes `dist/manifest.json` (`v0-draft` envelope). Run after `tsup`. |
| `rvnxx-nodes publish` | Packs the package with `npm pack` and uploads the tarball to the integrations registry (`POST /api/v1/node-packages`). Reads `INTEGRATIONS_URL` / `INTEGRATIONS_TOKEN` / `INTEGRATIONS_INSECURE` (also from `./.env`). |

A consuming package wires these into its own scripts:

```json
"scripts": {
  "build": "tsup && rvnxx-nodes manifest",
  "publish": "NODE_OPTIONS=--no-warnings rvnxx-nodes publish"
}
```

The `manifest` command requires the package to export `NODES: INode[]` from
its entry point.

## Quick links

- [API Reference & Node Authoring Guide](overview.md)
- [Versioning & Release Policy](versioning.md)
