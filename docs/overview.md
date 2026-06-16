# @revenexx/integrations-node-sdk

Shared TypeScript contract library for Revenexx integration nodes. Defines the interfaces every node must implement and ships helpers used by the node registry.

## Contents

- [Architecture](#architecture)
- [Types](#types)
- [Writing a Node](#writing-a-node)
- [Manifest Helpers](#manifest-helpers)
- [Publishing](#publishing)
- [Consuming the Package](#consuming-the-package)

---

## Architecture

```
integrations-node-sdk          (this package)
  └── INode, INodeDescription, INodeContext, INodeResult, ...

integrations-nodes-core        (consumes this package)
  └── DownloadNode implements INode
  └── ...more nodes
  └── dist/manifest.json       (built via extractManifests)
```

The SDK has no runtime dependencies and no logic beyond the manifest helpers. It exists solely to share the contract between node packages and the workflow engine.

---

## Types

### `INode`

The interface every node class must implement.

```ts
interface INode {
  description: INodeDescription;
  execute(ctx: INodeContext, inputs: Record<string, unknown>): Promise<INodeResult>;
}
```

---

### `INodeDescription`

Static metadata about the node. Read at registry build time — never at runtime.

| Field | Type | Description |
|---|---|---|
| `slug` | `string` | Unique identifier, e.g. `rvnxx:download` |
| `version` | `string` | Semver string |
| `category` | `NodeCategory` | `trigger \| action \| transform \| control \| io` |
| `name` | `LocalizedString` | Display name |
| `description` | `LocalizedString?` | Optional longer description |
| `icon` | `string?` | Icon identifier, e.g. `mdi:cloud-download` |
| `inputs` | `Record<string, IInputPort>` | Named input ports. Single-input nodes use the conventional key `'in'` |
| `outputs` | `IOutputPort[]` | One or more output ports |
| `config` | `IConfigField[]?` | User-configurable fields |

---

### `IInputPort`

| Field | Type | Description |
|---|---|---|
| `dataType` | `DataType` | Expected data type of the incoming value |
| `required` | `boolean?` | Whether the engine must provide a value for this port |
| `description` | `LocalizedString?` | Optional description shown in the UI |

**Port naming convention:** single-input nodes use `'in'` as the key in `inputs`. Multi-input nodes (fan-in) choose descriptive names, e.g. `'left'` / `'right'` for a merge node.

```ts
// Single-input
inputs: { in: { dataType: 'object', required: true } }

// Fan-in (merge / join)
inputs: {
  left:  { dataType: 'object', required: true },
  right: { dataType: 'object', required: true },
}
```

Inside `execute`, port values are accessed by the same key:

```ts
async execute(ctx, inputs) {
  const payload = inputs['in'];          // single-input
  const { left, right } = inputs;        // fan-in
}
```

---

### `INodeContext`

Injected into `execute()` at runtime by the workflow engine.

```ts
interface INodeContext {
  signal: AbortSignal;
  logger: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
  secrets: {
    get(key: string): Promise<string>;
  };
  credentials: {
    get(credentialsId: string): Promise<Record<string, unknown>>;
  };
}
```

- `signal` — provided by the engine whenever a workflow run is cancelled or times out. Nodes MUST propagate it to any I/O they perform (`fetch`, database queries, `setTimeout`-based loops). Check `signal.aborted` at the start of long operations and throw an `AbortError` or simply let the downstream I/O reject.
- `secrets.get(key)` resolves an **opaque** secret string by the key stored in a `secret-ref` config field.
- `credentials.get(credentialsId)` resolves the **structured** access data of a credential instance referenced by a `credentials-ref` config field (e.g. `{ host, port, user, password }` or `{ accessToken }`). The runtime fulfils it from the credentials broker; for token-based types it always returns a currently-valid token, so call it at execution time rather than caching the result.

---

### `INodeResult`

What `execute()` must return.

```ts
interface INodeResult {
  outputs: Record<string, unknown>;  // keyed by output port name
  branch?: string;                   // which output port to route through
}
```

---

### `NodeError`

A typed error class for unexpected or system-level failures inside `execute()`.

```ts
class NodeError extends Error {
  readonly code: string;
  readonly meta?: Record<string, unknown>;
}

throw new NodeError('AUTH_FAILED', 'Token expired', { userId: '123' });
```

#### Error-handling contract

There are exactly **two** ways a node may signal an error. Using both for the same condition, or mixing them arbitrarily, is a contract violation.

| Situation | Mechanism |
|---|---|
| Unexpected / system error (network down, credentials invalid, bug) | `throw new NodeError(code, message, meta?)` |
| Expected, routable error (e.g. HTTP 4xx, record not found) | `return { branch: '<error-port>', outputs: { ... } }` via a declared `kind: 'error'` output port |

**Engine behaviour when a `NodeError` is thrown:** the engine catches it, attempts to route through any `kind: 'error'` output port on the node, and if none exists, marks the workflow execution as failed.

**Do not** add an `error` field to `INodeResult.outputs` as a third path — that bypasses engine-level error handling entirely.

---

### `IOutputPort`

| Field | Type | Description |
|---|---|---|
| `kind` | `OutputKind` | `default \| branch \| error` — controls routing in the workflow engine |
| `dataType` | `DataType` | `any \| object \| array \| string \| number \| boolean` |
| `name` | `string?` | Port name, referenced in `INodeResult.branch` |
| `label` | `LocalizedString?` | Display label |
| `sourceFromConfig` | `string?` | Dynamically names the port from a config field value |
| `fallback` | `object?` | Fallback name/label when `sourceFromConfig` resolves to nothing |

---

### `IConfigField`

Describes a user-configurable input on the node. Rendered as a form field in the UI.

| `type` | Rendered as |
|---|---|
| `string` | Text input |
| `number` | Number input |
| `boolean` | Toggle |
| `select` | Dropdown (requires `options`) |
| `multiselect` | Multi-select (requires `options`) |
| `object` | Nested fields (requires `properties`) |
| `array` | Repeatable field (requires `items`) |
| `expression` | Expression editor |
| `secret-ref` | Secret-key picker — value is an opaque tenant secret key, resolved via `ctx.secrets.get()` at runtime |
| `credentials-ref` | Credential picker filtered by `credentialType` — value is a credential instance id, resolved via `ctx.credentials.get()` at runtime |

---

### `LocalizedString`

All user-visible text fields accept either a plain string or a locale map:

```ts
type LocalizedString = string | Record<string, string>;

// both valid:
name: 'Download'
name: { en: 'Download', de: 'Herunterladen' }
```

---

## Writing a Node

```ts
import type { INode, INodeContext, INodeResult } from '@revenexx/integrations-node-sdk';
import { NodeError } from '@revenexx/integrations-node-sdk';

export class MyNode implements INode {
  description = {
    slug: 'rvnxx:my-node',
    version: '1.0.0',
    category: 'action' as const,
    name: { en: 'My Node' },
    inputs: { in: { dataType: 'object' as const, required: true } },
    outputs: [
      { name: 'out', kind: 'default' as const, dataType: 'object' as const },
      { name: 'error', kind: 'error' as const, dataType: 'object' as const },
    ],
    config: [
      {
        key: 'credentials',
        label: { en: 'Credentials' },
        type: 'secret-ref' as const,
        required: true,
      },
    ],
  };

  async execute(ctx: INodeContext, inputs: Record<string, unknown>): Promise<INodeResult> {
    // Respect cancellation before starting I/O
    if (ctx.signal.aborted) throw ctx.signal.reason;

    const input = inputs['in'];

    let token: string;
    try {
      token = await ctx.secrets.get('my-secret-key');
    } catch {
      // Unexpected system error — throw NodeError, engine routes to error port
      throw new NodeError('SECRET_UNAVAILABLE', 'Could not resolve credentials');
    }

    ctx.logger.info('MyNode executing', { input });

    const response = await fetch('https://api.example.com/data', {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctx.signal,  // propagate cancellation to fetch
    });

    if (response.status === 404) {
      // Expected, routable error — use the error output port
      return {
        outputs: { message: 'Resource not found' },
        branch: 'error',
      };
    }

    if (!response.ok) {
      // Unexpected HTTP error — throw NodeError
      throw new NodeError('HTTP_ERROR', `Unexpected status ${response.status}`, {
        status: response.status,
      });
    }

    return {
      outputs: { result: await response.json() },
      branch: 'out',
    };
  }
}
```

> **Typed credentials variant.** For a structured, testable connection (SMTP,
> OAuth, …) declare a `credentials-ref` field instead of `secret-ref` and read
> it via `ctx.credentials.get()`:
>
> ```ts
> // config:
> { key: 'credentials', label: { en: 'SMTP' },
>   type: 'credentials-ref' as const, credentialType: 'rvnxx:smtp', required: true }
>
> // execute:
> const smtp = await ctx.credentials.get(inputs['credentials'] as string);
> // smtp = { host, port, user?, password?, ... } resolved by the broker
> ```
>
> Credential *types* themselves are authored by extending the SDK base classes
> (`SimpleValueCredential`, `OAuth2ClientCredentialsCredential`, …) and exported
> as `CREDENTIALS`; see `integrations/docs/credentials.md`.

Register the node in `integrations-nodes-core/src/index.ts`:

```ts
import { MyNode } from './nodes/my-node/MyNode.js';

export const NODES: INode[] = [
  new DownloadNode(),
  new MyNode(),
];
```

---

## Manifest Helpers

`extractManifest` / `extractManifests` pull the `INodeDescription` off node instances without executing them. Used by `integrations-nodes-core`'s build script to generate `dist/manifest.json`.

```ts
import { extractManifests } from '@revenexx/integrations-node-sdk';
import { NODES } from './index.js';

const manifests = extractManifests(NODES);
// → INodeDescription[]
```

---

## Publishing

The package is published to GitHub Packages (`https://npm.pkg.github.com`).

**Prerequisites — one-time setup:**

1. Create a GitHub Classic Personal Access Token with `write:packages` scope.
2. Add it to `~/.npmrc`:
   ```
   //npm.pkg.github.com/:_authToken=ghp_YOUR_TOKEN
   ```

**Release:**

```bash
# bump version in package.json first
npm run build
npm publish
```

Use `npm publish --dry-run` to verify what will be uploaded without actually publishing.

---

## Consuming the Package

Add a `.npmrc` to your project so npm knows where to find `@revenexx/` scoped packages:

```
@revenexx:registry=https://npm.pkg.github.com
```

Then install normally:

```bash
npm install @revenexx/integrations-node-sdk
```
