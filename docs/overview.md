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
| `outputs` | `IOutputPort[]` | Output ports. Empty `[]` marks a terminal node — see below |
| `config` | `IConfigField[]?` | User-configurable fields |

**Terminal nodes.** `outputs` may be an empty array. That marks the node as a
dead end: the path ends there and the save-layer validation rejects any edge
leaving it. It is the mirror image of `inputs: {}` on a trigger node.

```ts
// A node that always fails the run — no success path to wire.
outputs: []
```

Do not confuse this with an **error port** (`kind: 'error'`): that is a
*reachable* path the engine flows into without aborting the run. A terminal
node has no path at all. A declared port that can never fire is a dead port
and confuses workflow authors.

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
  state: INodeState;
}
```

- `signal` — provided by the engine whenever a workflow run is cancelled or times out. Nodes MUST propagate it to any I/O they perform (`fetch`, database queries, `setTimeout`-based loops). Check `signal.aborted` at the start of long operations and throw an `AbortError` or simply let the downstream I/O reject. For HTTP requests, use the [`safeFetch` helper](#safefetch) instead of calling `fetch` directly.
- `secrets.get(key)` resolves an **opaque** secret string by the key stored in a `secret-ref` config field.
- `credentials.get(credentialsId)` resolves the **structured** access data of a credential instance referenced by a `credentials-ref` config field (e.g. `{ host, port, user, password }` or `{ accessToken }`). The runtime fulfils it from the credentials broker; for token-based types it always returns a currently-valid token, so call it at execution time rather than caching the result.
- `state` is what the workflow already knows from earlier runs — see [`INodeState`](#inodestate) below.

---

### `INodeState`

Without it a node is amnesiac: every run starts from nothing and has to
re-derive what happened last time from the target system, or write its
bookkeeping back into somebody else's data model. The store gives a workflow
four things it can remember, and the role of a namespace decides **when a write
becomes visible** — which is why these are four operations and not one
`get`/`set`.

Name the namespace through a `state-ref` config field rather than hardcoding it.
A literal would be a contract nothing checks — the author has to type the same
word into the workflow's State dialog, and the mismatch shows up as a 403 in the
first production run. The field gives them a picker instead, and narrows what the
node may reach: **a namespace is reachable only from the node whose config names
it**, so a node that declares no `state-ref` field reaches nothing at all and
every state call is refused.

Each example below therefore carries the config field it reads its namespace
from, and passes that value to every call — including the writes. The reach is
per node rather than per call, so a stray literal that happens to match a
sibling field's value still resolves, which is what makes the mistake surface
late rather than immediately.

```ts
config: [
  { key: 'articleMap', label: 'Article mapping', type: 'state-ref', stateRole: 'mapping' },
]

// Create or update? The question every ERP/PIM sync opens with. One `const`, so
// the read and the write cannot drift onto different namespaces.
const articleMap = inputs.articleMap as string;
const known = await ctx.state.mapping.get(articleMap, `pim:${id}`);

if (known === null) {
  const erpId = await createInErp(payload);
  await ctx.state.mapping.put(articleMap, `pim:${id}`, `erp:${erpId}`);
} else {
  await updateInErp(known, payload);
}
```

```ts
config: [
  { key: 'customerCursor', label: 'Customer cursor', type: 'state-ref', stateRole: 'cursor' },
]

// Incremental sync: read from the watermark, advance it at the end.
const customerCursor = inputs.customerCursor as string;
const since = await ctx.state.cursor.get(customerCursor) as { updatedAfter?: string } | undefined;
const page = await crm.customers({ updatedAfter: since?.updatedAfter });

// Only advance on a page that held something. An `undefined` watermark does not
// survive the hop to the store — it arrives as `{}`, and the next run reads no
// `updatedAfter` and resyncs everything, which is the one thing a cursor exists
// to prevent.
if (page.maxUpdatedAt) {
  await ctx.state.cursor.set(customerCursor, { updatedAfter: page.maxUpdatedAt });
}
```

```ts
config: [
  { key: 'orderDedupe', label: 'Processed orders', type: 'state-ref', stateRole: 'dedupe' },
]

// At-least-once delivery: the second copy of this event stops here. Pick the TTL
// with care: it is how long a duplicate is suppressed, and — because a claim
// outlives the attempt that made it — also how long a retried attempt is told it
// lost. A week covers Stripe's redelivery window; it also means a node that
// fails after claiming stays silent for a week. See `claim` in `src/types.ts`.
const orderDedupe = inputs.orderDedupe as string;
if (!(await ctx.state.claim(orderDedupe, event.id, { ttlSeconds: 604800 }))) {
  return { outputs: {}, branch: 'duplicate' };
}
```

```ts
config: [
  { key: 'articleHash', label: 'Article digest', type: 'state-ref', stateRole: 'digest' },
]

// 40 000 articles, 300 of them actually changed.
const articleHash = inputs.articleHash as string;
if (await ctx.state.digest.unchanged(articleHash, `article:${id}`, hash)) {
  return { outputs: { skipped: true } };
}
await writeToErp(payload);
await ctx.state.digest.set(articleHash, `article:${id}`, hash);
```

| Operation | Visible | Why |
|-----------|---------|-----|
| `mapping.put` | immediately | If the run creates the record and *then* fails, a discarded correlation makes the next run create it twice |
| `claim` | immediately, to every run | A claim invisible to parallel runs protects against nothing |
| `cursor.set` | when the run completes | A watermark that advances on a failed run leaves exactly the gap it exists to prevent |
| `digest.set` | when the run completes | A hash may only count once the write it describes went through |

Two rules worth knowing before you reach for it:

- **Namespaces must be declared.** A workflow lists what it may touch in its
  `state[]` block (name, role, and `private` — the default — or `shared`). An
  undeclared namespace is not merely undocumented; the engine refuses it.
- **Author time is read-only.** Testing a node in the editor is a rehearsal, so
  the write calls reject there: a correlation created by a test click would be
  indistinguishable from one a production run made.

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

> **`timeoutMs` is per network operation, not a total budget.** It bounds a *single* request — and, when the guard has to resolve DNS, the pre-flight resolve — for *one* hop. A redirect chain (up to `MAX_REDIRECTS` = 5) applies the budget to each hop independently, and each retry attempt starts a fresh budget, so a worst-case `safeFetch` call can run for several multiples of `timeoutMs`. This is the standard per-hop model; there is no single wall-clock cap over the whole call.

#### SSRF guard

`safeFetch` refuses to send a request to a private, loopback, link-local or otherwise reserved target — the classic **SSRF** foot-gun where an attacker-controlled URL steers a server-side request at internal infrastructure or the cloud metadata endpoint (`169.254.169.254`). The guard is **always on**; there is no per-node opt-out, because in Integration Studio every legitimate target is a public internet host.

What it does:

- Only `http:`/`https:` URLs are allowed; `localhost` (and `*.localhost`) and empty hosts are rejected outright.
- A literal-IP host is checked directly; a named host is resolved (`dns.lookup`, all addresses) and rejected if **any** resolved address is private/reserved. Blocked ranges: IPv4 `0/8`, `127/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`; IPv6 `::`, `::1`, `fc00::/7`, `fe80::/10`, and IPv4-mapped/-compatible forms (unwrapped and re-checked). The classification is hand-rolled and intentionally scoped to these ranges; some reserved bands are not yet covered (CGNAT `100.64/10`, 6to4/Teredo, `255.255.255.255`) — tracked in [PO-183](https://linear.app/revenexx/issue/PO-183) (migrate to `ipaddr.js`).
- The address the connection actually lands on is judged too. `safeFetch` subscribes to undici's `undici:client:connected` diagnostics channel while a hop is in flight and, for a host it is currently reaching, runs `isBlockedAddress` over `socket.remoteAddress`; a private peer gets `socket.destroy(…)`. The channel is published **synchronously, before the request is written**, so a refused target receives no request bytes at all — only the completed handshake (see the box below).
- Redirects are followed **manually** (`redirect: 'manual'`, up to `MAX_REDIRECTS` = 5) and the guard re-runs on **every hop**, so a public URL cannot bounce (via a 3xx `Location`) to a private one. A 3xx that downgrades `https`→`http` is rejected. On a **cross-origin** hop the authentication-bearing headers `Authorization`, `Cookie` and `Proxy-Authorization` are dropped (matching what browsers/undici strip). On 307/308 the original `body` is resent as-is: a one-shot `ReadableStream` body is already consumed by the first hop and will fail — use a `Buffer`/string body if the target may 307/308.

**Errors:** a blocked target throws `NodeError('BLOCKED_ADDRESS', …, { status: 0 })`; exceeding the redirect budget throws `NodeError('TOO_MANY_REDIRECTS', …)`. Neither is retried (retrying a deterministic block is pointless). The helpers `assertPublicUrl(url, { lookup })` and `isBlockedAddress(ip)` are exported for reuse.

**Local-development opt-out.** Setting the environment variable `RVNXX_SSRF_ALLOW_PRIVATE` to a truthy value (`1`/`true`/`yes`) relaxes the guard so a developer can point a node at `localhost` or an internal service while testing. It relaxes **both halves** — the pre-flight check and the connected-socket judgement, which would otherwise drop the dev stack's own sockets after the check had let them through. It relaxes only the private-range/loopback checks — the `http(s)`-only protocol allowlist stays enforced (a `file://` URL is still rejected). It is **off by default**, logs a one-time warning when active, and is set only by the local stack (`integrations/docker-compose.dev.yml`). Production never sets it, so the guard stays fully active there. This is an infrastructure/dev switch — it is **not** exposed as node config and cannot be toggled by a workflow author.

> **Two halves, and the seam between them is where the race used to live.** The hostname is resolved to judge the target, and Node resolves it **again** when it opens the socket. Those two answers need not agree — **DNS rebinding, a TOCTOU race** — and here the workflow author supplies the URL *and* the DNS behind it, so the classic "the attacker must control DNS" precondition is met by default. Closed in PO-184 by judging the second answer as well: the peer address of every connection this package opens is checked, and a blocked one is destroyed before a request byte is written. `specs/ssrf-guard.md` AC-17 is the test, and it is also the canary — it reproduces the race with two scripted answers for one name, so if a future Node stops publishing that channel the suite goes red rather than the guard going quiet.
>
> **What remains: the handshake, and a connection somebody else opened.** A connection is judged once it stands, so the TCP handshake — and for `https:` the TLS handshake — with the refused address has already happened. Nothing of the request follows it, but whoever aimed the call there learns that something answers on that address and port, and a service that reacts to a bare connection has reacted. Second, connections are pooled per origin and only a *new* one is announced, so a socket something else in the process opened to the same host first could be reused unjudged. Both are recorded as gaps in the spec. A **network-level egress policy** on the worker is still the layer that does not depend on this code being right, and is worth having regardless.
>
> **Why the judgement, and not a dispatcher that pins the address.** Resolving once and connecting to exactly that address is the stronger design and it was measured before being dropped: it needs an `undici.Agent`, which needs the `undici` package — this SDK's first runtime dependency — and an npm-installed undici 8 `Agent` handed to Node's built-in `fetch` fails outright (`UND_ERR_INVALID_ARG`, "invalid onRequestStart method"), so the transport would have to become undici's `fetch` too, whose `Response` is not the global one. On top of that, undici 8 wants Node `>=22.19` against this package's `>=20.3`, and every node package is bundled into a single-file workflow bundle by the builder — undici bundles cleanly there, at **+532 KB minified per bundle**. Mutating `connectParams` on `undici:client:beforeConnect` to pin the address without the dependency was tried too and has no effect: the connection still resolves the original name.
>
> **The `lookup` option on `assertPublicUrl` is an internal test seam** — `safeFetch` deliberately exposes **no** such option (the guard is not caller-opt-outable); its tests drive the resolver via the `ssrfResolver` singleton instead. The connected-socket half is engaged by `safeFetch` only, and by design has no exported handle: a caller that runs `assertPublicUrl` and then opens its own request gets the check and not the second half.
>
> **Assumes direct egress.** The guard checks the *hostname's* resolved IPs. If a global proxy is ever installed (`undici.setGlobalDispatcher(new ProxyAgent(…))` / a `Dispatcher` that tunnels through a forward proxy), the real connection is opened by the proxy and the target is resolved *there* — the IP check no longer reflects where the bytes go, and neither does the connected-socket check, whose peer would be the proxy. Node's `fetch` does **not** honour `HTTP(S)_PROXY` by default, so this holds today; treat installing a global proxy dispatcher on the worker as a change that also needs its own egress control.

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

Note the difference from a node that declares **no** ports at all — that is a
property of [`INodeDescription.outputs`](#inodedescription), not of a port.

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
| `state-ref` | State-namespace picker filtered by `stateRole` — one of `mapping`, `cursor`, `dedupe`, `digest`. The value is the namespace NAME, passed to `ctx.state.*` at runtime. `dedupe` is the role behind `ctx.state.claim()`, which is the operation's name rather than the role's |

#### `showIf` — when a field applies, and how it differs from `dependsOn`

The two sit next to each other on a field and are easy to mistake for one another.
They answer different questions:

| | Question | Effect |
|---|---|---|
| `showIf` | Does this field apply at all? | The editor draws it, or does not |
| `dependsOn` | Whose change invalidates what this field resolved? | The editor re-resolves `loadOptions` / `resolveConfigSchema`, and clears the stale value |

```ts
{ key: 'source', label: 'Source', type: 'select', options: [
    { value: 'now',   label: { en: 'Now',        de: 'Jetzt' } },
    { value: 'field', label: { en: 'From field', de: 'Aus Feld' } },
] },
{ key: 'path', label: 'Path to the date', type: 'string',
  showIf: { key: 'source', op: 'equals', value: 'field' } },
```

- `op` is one of `OPERATORS`, the same fourteen a condition node offers an author:
  `equals`, `notEquals`, `contains`, `notContains`, `startsWith`, `endsWith`,
  `greaterThan`, `greaterThanOrEqual`, `lessThan`, `lessThanOrEqual`, `exists`,
  `notExists`, `isEmpty`, `isNotEmpty`. What each means is `evaluate`, and the answer
  table in `src/operators.test.ts` is the canonical statement of it.
- `value` is left out by the four that read presence rather than content (`exists`,
  `notExists`, `isEmpty`, `isNotEmpty`).
- The driving `key` must be a **literal** — a field that sets `expressionAllowed` may
  not be named by a condition, because applicability has to be decidable while the
  author is typing. The platform's manifest constraints refuse it.
- **A hidden field's value is cleared**, the same cascade `dependsOn` already runs.
  Switching away from a choice and back does not bring the old value with it.
- Ask `settingApplies(field, config)` for the answer rather than reading `showIf`
  yourself — a field with no condition always applies, and that default is what makes
  the key additive.

Do not reach for `dynamic-schema` to hide a declared field. It resolves a whole field
set from somewhere the node cannot know at build time; used for a condition it puts a
sandbox round trip, a loading state and a Retry button behind the question *should this
text box be drawn*.

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
synchronous). The runtime detects it via the `isNodeWithIteration` type guard and
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
