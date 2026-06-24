# @revenexx/integrations-node-sdk

The shared TypeScript contract library for **Revenexx integration nodes**. It
defines the interfaces every integration node and credential must implement, and
ships the small helper toolchain the node registry uses to build manifests.

It has **no runtime dependencies** and contains no business logic beyond the
manifest helpers — it exists purely to share one contract between the node
packages and the workflow engine that runs them.

```
integrations-node-sdk          ← this package (types & helpers only)
  └── integrations-nodes-core  ← implements INode, ships dist/manifest.json
        └── integrations-worker ← registers nodes, executes workflows
```

## Installation

```bash
npm install @revenexx/integrations-node-sdk
```

Published to the public npm registry under the `@revenexx` scope — no registry
configuration or auth token needed.

## What's inside

| Module | Purpose |
| --- | --- |
| `types` | All interfaces and union types: the node contract (`INode`, `INodeDescription`, `INodeContext`, `INodeResult`, `IConfigField`, `INodeWithIteration`, …), the credential contract (`ICredential`, `ICredentialDescription`, …) and the template contract (`ITemplateDescription`, `ITemplateTrigger`). |
| `credentials` | Abstract base classes for credential authors: `BaseCredential`, `SimpleValueCredential`, `ApiKeyCredential`, `BasicAuthCredential`, `OAuth2ClientCredentialsCredential`, `OAuth2AuthCodeCredential`. Concrete credentials `extend` one of these. |
| `localized` | `normalizeLocalized` — reduce a `LocalizedString` (`string \| Record<string, string>`) to a single plain string. |
| `credentialType` | `normalizeCredentialType` — normalise a credential-type reference (`string \| string[] \| undefined`) to `string[]`. |
| `errors` | `NodeError` — typed error class for unexpected/system-level failures thrown inside `execute`. |
| `extract` | `extractManifest` / `extractManifests` (nodes) and `extractCredentialManifest` / `extractCredentialManifests` (credentials) — pull descriptions off instances without executing them. |
| `manifest` | `buildManifest` / `MANIFEST_VERSION` — wrap node, credential and template descriptions in the `{ manifestVersion, nodes, credentials, templates }` envelope the registry expects. |

Everything is re-exported from the package root, and the package ships dual
ESM/CJS output plus `.d.ts` types.

## Usage

### Authoring a node

Implement `INode`: a static `description` plus an `execute` method. Single-input
nodes read the conventional `'in'` port.

```ts
import type { INode, INodeContext } from '@revenexx/integrations-node-sdk';
import { NodeError } from '@revenexx/integrations-node-sdk';

export class UppercaseNode implements INode {
  description: INode['description'] = {
    slug: 'text.uppercase',
    version: '1.0.0',
    category: 'transform',
    name: 'Uppercase',
    inputs: { in: { dataType: 'string', required: true } },
    outputs: [{ kind: 'default', dataType: 'string' }],
  };

  async execute(ctx: INodeContext, inputs: Record<string, unknown>) {
    ctx.signal.throwIfAborted();
    const value = inputs['in'];
    if (typeof value !== 'string') {
      throw new NodeError('expected a string on the `in` port');
    }
    return { outputs: { out: value.toUpperCase() } };
  }
}
```

**Error contract:** `throw NodeError` for unexpected failures;
`return { outputs, branch: '<error-port>' }` for expected, routable errors.
Never mix both for the same condition. The engine always provides
`ctx.signal` — propagate it to all I/O.

### Building a manifest

Export a `NODES: INode[]` array from your package entry, then run the bundled
CLI after your build to emit `dist/manifest.json`:

```jsonc
// package.json
{
  "scripts": {
    "build": "tsup && rvnxx-nodes manifest"
  }
}
```

`rvnxx-nodes manifest` imports the package's built `dist/index.js`, reads its
`NODES` export (plus optional `CREDENTIALS: ICredential[]` and
`TEMPLATES: ITemplateDescription[]` exports) and writes the manifest envelope.
There is no `publish` subcommand — node packages are registered through the
Revenexx Console/Cockpit, not published from the repos.

You can also build a manifest programmatically:

```ts
import { buildManifest, extractManifests } from '@revenexx/integrations-node-sdk';

const manifest = buildManifest({ nodes: extractManifests(NODES) });
```

## Documentation

- [`docs/overview.md`](docs/overview.md) — full API reference & node-authoring guide
- [`docs/versioning.md`](docs/versioning.md) — SemVer policy & release flow

## Development

```bash
npm run build      # compile to dist/ (ESM + CJS + .d.ts) via tsup
npm run dev        # tsup watch mode
npm test           # node --test over src/**/*.test.ts
npm run typecheck  # tsc --noEmit
```

## Releasing

Versioning and publishing are driven by [Changesets](https://github.com/changesets/changesets)
and triggered by a git tag — the version is never edited by hand. The publish
runs in CI against the public npm registry with tokenless OIDC trusted
publishing. See [`docs/versioning.md`](docs/versioning.md) for the full flow.

```bash
npx changeset          # record the intended bump (patch/minor/major)
npx changeset version  # bump package.json + CHANGELOG.md
git commit -am "release: version packages"
npx changeset tag      # tag @revenexx/integrations-node-sdk@X.Y.Z
git push --follow-tags # tag push triggers the publish workflow
```

## License

[MIT](LICENSE) © revenexx GmbH
