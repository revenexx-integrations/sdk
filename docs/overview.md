# @revenexx/integrations-node-sdk

Shared TypeScript contract library for Revenexx integration nodes. Defines the interfaces every node must implement and ships helpers used by the node registry.

## Contents

- [Architecture](#architecture)
- [Types](#types)
- [Writing a Node](#writing-a-node)
- [Writing a Credential](#writing-a-credential)
- [Templates & Iteration](#templates--iteration)
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
| `slug` | `string` | Unique identifier, e.g. `revenexx:download` |
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

- `signal` — provided by the engine whenever a workflow run is cancelled or times out. Nodes MUST propagate it to any I/O they perform (`fetch`, database queries, `setTimeout`-based loops). Check `signal.aborted` at the start of long operations and throw an `AbortError` or simply let the downstream I/O reject. For HTTP requests, use the [`safeFetch` helper](#safefetch) instead of calling `fetch` directly.
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

### `safeFetch`

A drop-in wrapper around the global `fetch` that adds a **configurable timeout** and optional **retry** support, with correct `ctx.signal` integration.

```ts
import { safeFetch, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS } from '@revenexx/integrations-node-sdk';

const response = await safeFetch('https://api.example.com/data', {
  method: 'GET',
  signal: ctx.signal,            // workflow cancellation
  timeoutMs: 15_000,             // per-attempt timeout; capped at MAX_TIMEOUT_MS (120 s)
  retry: { attempts: 2, delayMs: 1_000 },  // optional: up to 2 retries
});
```

**Timeout constants:**

| Constant | Value | Meaning |
|---|---|---|
| `DEFAULT_TIMEOUT_MS` | 30 000 ms | Used when `timeoutMs` is omitted |
| `MAX_TIMEOUT_MS` | 120 000 ms | Hard cap — higher values are silently clamped |
| `DEFAULT_RETRY_ATTEMPTS` | 0 | No retries by default |
| `MAX_RETRY_ATTEMPTS` | 5 | Maximum allowed retry count |
| `DEFAULT_RETRY_DELAY_MS` | 1 000 ms | Default pause between retry attempts |

**Retry semantics:** retries happen only on thrown errors (network failures, timeouts). HTTP error responses are not retried — the node decides what to do with the status code. No retry occurs if `ctx.signal` has been aborted. If `ctx.signal` is aborted during the inter-attempt delay, the sleep is cut short immediately.

> **Idempotency:** `safeFetch` re-issues the full request on each retry. Only use `retry` with idempotent methods (GET, HEAD, OPTIONS, or explicitly idempotent POST/PUT endpoints). Retrying a non-idempotent write (e.g. a plain POST) risks duplicate side effects if the server already processed the first request before the connection failed.

**Error thrown on timeout:** `NodeError` with `code: 'TIMEOUT'` and a message that includes the actual effective timeout in milliseconds.

#### Config field factories

Use these to add standardised timeout and retry fields to a node's `description.config`:

```ts
import { timeoutConfigField, retryConfigFields } from '@revenexx/integrations-node-sdk';

const description: INodeDescription = {
  // …
  config: [
    timeoutConfigField({ default: 15_000 }),   // key: 'timeoutMs'
    ...retryConfigFields(),                     // keys: 'retryAttempts', 'retryDelayMs'
  ],
};

// In execute():
await safeFetch(url, {
  signal: ctx.signal,
  timeoutMs: config.timeoutMs as number,
  retry: {
    attempts: config.retryAttempts as number,
    delayMs: config.retryDelayMs as number,
  },
});
```

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
    slug: 'revenexx:my-node',
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
>   type: 'credentials-ref' as const, credentialType: 'revenexx:smtp', required: true }
>
> // execute:
> const smtp = await ctx.credentials.get(inputs['credentials'] as string);
> // smtp = { host, port, user?, password?, ... } resolved by the broker
> ```
>
> Credential *types* themselves are authored by extending the SDK base classes
> (`SimpleValueCredential`, `OAuth2ClientCredentialsCredential`, …) and exported
> as `CREDENTIALS`; see `docs/credentials.md` in the parent `integrations`
monorepo (not part of this SDK package).

Register the node in `integrations-nodes-core/src/index.ts`:

```ts
import { MyNode } from './nodes/my-node/MyNode.js';

export const NODES: INode[] = [
  new DownloadNode(),
  new MyNode(),
];
```

---

## Writing a Credential

A **credential type** describes a reusable, testable, multi-instance connection
(SMTP, an API key, an OAuth client, …). A node references it via a
`credentials-ref` config field; the broker resolves a live access-data blob at
execution time. Unlike a node, a credential's `test`/`resolve` logic runs in the
**credentials broker** (a side-container), never in workflow code.

You almost never implement `ICredential` from scratch — extend one of the SDK
base classes (`src/credentials.ts`), which supply the boilerplate for their
`authKind`:

| Base class | `authKind` | Use for |
|---|---|---|
| `SimpleValueCredential` | `static` | Non-expiring structured connections (SMTP, SFTP). `resolve` passes the config through unchanged. |
| `ApiKeyCredential` | `api-key` | Single-token systems (e.g. `revenexx:http-bearer`, `revenexx:deepl`). |
| `BasicAuthCredential` | `basic` | Username/password. |
| `OAuth2ClientCredentialsCredential` | `oauth2-client-credentials` | Service-to-service OAuth (2-legged); mints/refreshes access tokens. |
| `OAuth2AuthCodeCredential` | `oauth2-authcode` | Interactive 3-legged OAuth; also implement `ICredentialOAuthAuthorize` (`buildAuthorizeUrl` / `exchangeCode`). |
| `BaseCredential` | any | Lowest-level base the others extend; use directly only for a bespoke strategy. |

```ts
import { SimpleValueCredential } from '@revenexx/integrations-node-sdk';
import type {
  ICredentialContext,
  ICredentialDescription,
  ICredentialTestResult,
} from '@revenexx/integrations-node-sdk';

export class SmtpCredential extends SimpleValueCredential {
  readonly description: ICredentialDescription = {
    slug: 'revenexx:smtp',
    version: '1.0.0',
    name: { en: 'SMTP' },
    authKind: 'static',
    fields: [
      { key: 'host', label: { en: 'Host' }, type: 'string', required: true },
      { key: 'port', label: { en: 'Port' }, type: 'number', required: true },
      { key: 'user', label: { en: 'User' }, type: 'string' },
      { key: 'password', label: { en: 'Password' }, type: 'secret' },
    ],
  };

  // `resolve` is inherited from SimpleValueCredential (passthrough).
  async test(_ctx: ICredentialContext, config: Record<string, unknown>): Promise<ICredentialTestResult> {
    // … attempt a connection with `config`
    return { ok: true };
  }
}
```

Key contract points:

- `test(ctx, config)` returns `ICredentialTestResult` (`{ ok, message? }`) — it
  **does not** throw or return `void`. Called on-demand by the broker.
- `resolve(ctx, config, durableCreds)` returns `ICredentialResolveResult`
  (`{ credentials, expiresAt? }`). `durableCreds` holds system-managed long-lived
  secrets (e.g. a rotated `refresh_token`) and is `null` until they exist.
- `ICredentialField.type` is `'string' | 'number' | 'boolean' | 'select' | 'secret'`;
  `secret` fields are masked in the UI and never returned in plaintext by the public API.
- `ctx.persistDurableCreds?(...)` writes rotated durable creds back to storage
  (absent during pre-save tests where no instance exists yet).

Export credential instances as `CREDENTIALS` so the manifest step picks them up:

```ts
export const CREDENTIALS: ICredential[] = [new SmtpCredential()];
```

The end-to-end credentials architecture (broker, storage, token lifecycle) is
described in `docs/credentials.md` in the parent `integrations` monorepo (not
part of this SDK package).

---

## Templates & Iteration

**Templates** (`ITemplateDescription`) are ready-made workflow blueprints a node
package can ship for the editor's template gallery. Unlike `INode`/`ICredential`
a template carries no executable code — it is plain data, so a package exports
its `ITemplateDescription`s directly (no class wrapper) under the name the
manifest tool looks for:

```ts
export const TEMPLATES: ITemplateDescription[] = [/* … */];
```

`rvnxx-nodes manifest` folds this optional export into the manifest's
`templates[]`. The `definition` is a workflow blob authored against the grammar
named by `blobVersion`; the integrations server validates it on publish.
Optional `triggers` (`ITemplateTrigger[]`) are instantiated alongside the
workflow.

**Iteration** — a node that loops over a collection may also implement
`INodeWithIteration` (`extractItems(inputs, config): unknown[]`, pure and
synchronous). The worker detects it via the `isNodeWithIteration` type guard and
calls `extractItems` instead of relying on slug-based detection; it is the
designated dispatch point for future child-workflow execution.

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

The package is published to the public npm registry (`registry.npmjs.org`) under
the `@revenexx` scope. Releases are driven by [Changesets](https://github.com/changesets/changesets)
and triggered by a git tag — see [`versioning.md`](versioning.md) for the full
flow. In short:

```bash
npx changeset            # record the intended bump (patch/minor/major)
# main is protected — the version bump lands via a PR:
git switch -c release/next
npx changeset version    # bump package.json + CHANGELOG.md
git add -A && git commit -m "release: version packages" # -A also stages a first-time CHANGELOG.md
git push -u origin release/next   # open a PR → merge into main (CI `test` + 1 approval)
git switch main && git pull       # fast-forward to the merged version commit
npx changeset tag        # creates tag @revenexx/integrations-node-sdk@X.Y.Z (needs repo admin)
git push --follow-tags   # tag push runs .github/workflows/publish.yml → npm publish
```

The CI publish authenticates tokenlessly via OIDC trusted publishing (npmjs
trusts this repo's `publish.yml` workflow), so no secret is stored; nobody
publishes by hand.

---

## Consuming the Package

`@revenexx/integrations-node-sdk` lives on the default public npm registry, so no
`.npmrc` scope mapping or auth token is needed — just install it:

```bash
npm install @revenexx/integrations-node-sdk
```
