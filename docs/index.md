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
| `src/types.ts` | All interfaces and union types: node contract (`INode`, `INodeDescription`, `INodeContext`, `INodeResult`, `IConfigField`, `INodeWithIteration`, …), credential contract (`ICredential`, `ICredentialDescription`, `ICredentialContext`, …) and template contract (`ITemplateDescription`, `ITemplateTrigger`) |
| `src/credentials.ts` | Abstract credential base classes (`BaseCredential`, `SimpleValueCredential`, `ApiKeyCredential`, `BasicAuthCredential`, `OAuth2ClientCredentialsCredential`, `OAuth2AuthCodeCredential`) — concrete credentials `extend` one of these |
| `src/localized.ts` | `normalizeLocalized` — reduce a `LocalizedString` to a single plain string |
| `src/errors.ts` | `NodeError` — typed error class for unexpected failures inside `execute` |
| `src/extract.ts` | `extractManifest` / `extractManifests` (nodes) and `extractCredentialManifest` / `extractCredentialManifests` (credentials) — pull descriptions off instances without executing them |
| `src/manifest.ts` | `buildManifest` / `MANIFEST_VERSION` — wrap node, credential and template descriptions in the `{ manifestVersion, nodes, credentials, templates }` envelope the registry expects |
| `src/cli.ts` | `rvnxx-nodes` CLI (`bin`) — shared manifest tooling for node packages |
| `src/index.ts` | Barrel re-export |

## `rvnxx-nodes` CLI

The SDK ships a `bin`, `rvnxx-nodes`, so every node package shares one
manifest toolchain instead of copying scripts. It operates on the
current working directory:

| Command | What it does |
|---|---|
| `rvnxx-nodes manifest` | Imports the package's built `dist/index.js`, reads its `NODES` (and optional `CREDENTIALS` / `TEMPLATES`) exports, and writes `dist/manifest.json` (`v0-draft` envelope). Run after `tsup`. |

> **No `publish`.** Node packages are not published from the repos themselves —
> registration goes through the Revenexx Console/Cockpit, and for local
> development `integrations/scripts/update-dev.sh` uploads the packed tarball to
> the admin API.

A consuming package wires the manifest step into its build:

```json
"scripts": {
  "build": "tsup && rvnxx-nodes manifest"
}
```

The `manifest` command requires the package to export `NODES: INode[]` from
its entry point. A `CREDENTIALS: ICredential[]` export is optional and, when
present, is folded into the manifest's `credentials[]`; likewise an optional
`TEMPLATES: ITemplateDescription[]` export is carried verbatim into the
manifest's `templates[]`.

## Quick links

- [API Reference & Node Authoring Guide](overview.md)
- [Versioning & Release Policy](versioning.md)
