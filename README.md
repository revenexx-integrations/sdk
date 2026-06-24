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

Implement `INode`: a static `description` (the metadata the registry publishes)
plus an `execute` method. A few conventions the engine relies on:

- **`slug` is namespaced** — `<namespace>:<slug>`, e.g. `revenexx:text-replace`.
  It is the stable identity of the node across versions; not a dotted path.
- **Every output port carries a `name`.** `execute` returns an `outputs` map
  keyed by that port `name`, and sets `branch` to the port that fired. The key,
  the `branch` and the declared `name` must match — that triple is how the
  engine routes the result to the next node.
- **Config and inputs arrive in the same map.** The engine resolves each
  declared `config` field (keyed by its `key`) and the input ports (`'in'`, plus
  any named fan-in ports) into the single `inputs: Record<string, unknown>`
  handed to `execute`. So `inputs['in']` is the upstream payload and
  `inputs['<config-key>']` is the resolved config value.
- **`ctx.signal` is always provided** — propagate it to every I/O call.

#### Transform node — single input, single output

A `transform` node with one `'in'` port and one named `out` port. Mirrors
`TextReplaceNode` from `integrations-nodes-core`:

```ts
import type { INode, INodeContext, INodeDescription, INodeResult } from '@revenexx/integrations-node-sdk';
import { NodeError } from '@revenexx/integrations-node-sdk';

export class UppercaseNode implements INode {
  description = {
    slug: 'revenexx:text-uppercase',
    version: '1.0.0',
    category: 'transform',
    name: { en: 'Uppercase', de: 'Großschreiben' },
    description: { en: 'Upper-cases a string read from the input.' },
    icon: 'mdi:format-letter-case-upper',
    inputs: { in: { dataType: 'string', required: true } },
    outputs: [{ name: 'out', kind: 'default', dataType: 'string', label: { en: 'Result', de: 'Ergebnis' } }],
  } satisfies INodeDescription;

  async execute(ctx: INodeContext, inputs: Record<string, unknown>): Promise<INodeResult> {
    ctx.signal.throwIfAborted();
    const value = inputs['in'];
    if (typeof value !== 'string') {
      // NodeError(code, message, meta?) — a stable code plus a human message.
      throw new NodeError('INVALID_INPUT', 'expected a string on the `in` port');
    }
    return { outputs: { out: value.toUpperCase() }, branch: 'out' };
  }
}
```

#### Control node — branch outputs

A `control` node declares `kind: 'branch'` ports and routes by returning the
matching `branch`. Condensed from `ConditionIfNode`:

```ts
export class ConditionIfNode implements INode {
  description = {
    slug: 'revenexx:condition-if',
    version: '1.0.0',
    category: 'control',
    name: { en: 'If condition', de: 'Wenn-Bedingung' },
    icon: 'mdi:source-branch',
    inputs: { in: { dataType: 'any', required: true } },
    outputs: [
      { name: 'true', kind: 'branch', dataType: 'any', label: { en: 'True', de: 'Wahr' } },
      { name: 'false', kind: 'branch', dataType: 'any', label: { en: 'False', de: 'Falsch' } },
    ],
    config: [
      { key: 'field', label: { en: 'Field (dot-path)' }, type: 'string', required: true },
      { key: 'value', label: { en: 'Value' }, type: 'string', expressionAllowed: true },
    ],
  } satisfies INodeDescription;

  async execute(ctx: INodeContext, inputs: Record<string, unknown>): Promise<INodeResult> {
    const inputData = inputs['in'];
    const branch = inputs['field'] === inputs['value'] ? 'true' : 'false';
    // The fired port's name is both the outputs key and the branch.
    return { outputs: { [branch]: inputData }, branch };
  }
}
```

#### Action node — error output & credentials

An `action` node declares a `kind: 'error'` port for expected, routable
failures and reads a credential instance via a `credentials-ref` config field.
Condensed from `HttpRequestNode`:

```ts
export class HttpRequestNode implements INode {
  description = {
    slug: 'revenexx:http-request',
    version: '1.0.0',
    category: 'action',
    name: { en: 'HTTP Request', de: 'HTTP-Anfrage' },
    icon: 'mdi:web',
    inputs: { in: { dataType: 'object' } },
    outputs: [
      {
        name: 'response',
        kind: 'default',
        dataType: 'object',
        label: { en: 'Response', de: 'Antwort' },
        fields: { status: { dataType: 'number' }, body: { dataType: 'any' } },
      },
      {
        name: 'error',
        kind: 'error',
        dataType: 'object',
        label: { en: 'Error', de: 'Fehler' },
        fields: { code: { dataType: 'string' }, message: { dataType: 'string' } },
      },
    ],
    config: [
      { key: 'url', label: 'URL', type: 'string', required: true, expressionAllowed: true },
      {
        key: 'credentials',
        label: { en: 'Credentials', de: 'Anmeldedaten' },
        type: 'credentials-ref',
        credentialType: 'revenexx:http-bearer',
      },
    ],
  } satisfies INodeDescription;

  async execute(ctx: INodeContext, inputs: Record<string, unknown>): Promise<INodeResult> {
    const url = inputs['url'];
    if (typeof url !== 'string' || !url) {
      throw new NodeError('MISSING_URL', 'URL config field is required');
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const credentialsRef = inputs['credentials'];
    if (typeof credentialsRef === 'string') {
      const creds = await ctx.credentials.get(credentialsRef);
      if (typeof creds['token'] === 'string') headers['Authorization'] = `Bearer ${creds['token']}`;
    }

    try {
      const res = await fetch(url, { headers, signal: ctx.signal }); // always propagate ctx.signal
      const body = await res.json();
      if (!res.ok) {
        return {
          outputs: { error: { code: 'HTTP_ERROR', message: `${url} → ${res.status}` } },
          branch: 'error',
        };
      }
      return { outputs: { response: { status: res.status, body } }, branch: 'response' };
    } catch (err) {
      if (err instanceof NodeError) throw err;
      return { outputs: { error: { code: 'REQUEST_FAILED', message: String(err) } }, branch: 'error' };
    }
  }
}
```

**Error contract:** `throw NodeError(code, message, meta?)` for unexpected,
system-level failures; `return { outputs, branch: '<error-port>' }` for
expected, routable errors (a declared `kind: 'error'` port). Never mix both for
the same condition.

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
npx changeset            # record the intended bump (patch/minor/major)
# cut a release — main is protected, so the version bump lands via a PR:
git switch -c release/next
npx changeset version    # bump package.json + CHANGELOG.md
git add -A && git commit -m "release: version packages" # -A also stages a first-time CHANGELOG.md
git push -u origin release/next   # open a PR → merge into main (CI `test` + 1 approval)
git switch main && git pull       # fast-forward to the merged version commit
npx changeset tag        # tag @revenexx/integrations-node-sdk@X.Y.Z (needs repo admin)
git push --follow-tags   # tag push triggers the publish workflow
```

## License

[MIT](LICENSE) © revenexx GmbH
