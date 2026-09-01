# Feature specs

What this package promises the code that depends on it, one spec per surface. Every
promise here is bound to a test that proves it; `npm run spec:check` holds the two
together in both directions.

**A surface here is one export, or one closely-bound family of exports, that a node
author reaches for by name.** This package has no screen: its consumers are the four
node packages and the worker, and they reach a promise by importing a name and calling
it. So the exported name is the address, which is why a criterion may write
`safeFetch` where a spec for a product with a UI would write the label on a button.
What stays out is the machinery behind the name — that is `docs/`, and
[`spec.config.json`](../spec.config.json) carries the boundary as `audience`.

## Specs

### Reaching a host

- [`ssrf-guard.md`](ssrf-guard.md) — what a request is allowed to reach: which targets
  are refused before a request is made, how each redirect hop is judged again, and what
  a refusal is allowed to tell the caller
- [`request-budget.md`](request-budget.md) — what one request may cost: how long an
  attempt may take, how often it is retried, how cancellation ends it, and how both
  budgets reach a workflow author as bounded settings
- [`response-reading.md`](response-reading.md) — reading what came back: the byte cap
  and where it is enforced, what is parsed as JSON and what is not, and the ceiling
  neither a node nor a workflow author can raise
- [`redirect-following.md`](redirect-following.md) — what a redirect does to the
  request: how many hops are allowed, what an unreadable target costs, and how the
  method and body change on the way

### Doing work that may fail

- [`retrying-an-operation.md`](retrying-an-operation.md) — asking again when it might
  work: which failures are asked twice, how the wait between attempts grows, and how a
  cancellation lands during one

### Acting as somebody's account

- [`credentials.md`](credentials.md) — standing in for the person who owns the account:
  what each credential kind hands a node, where a token endpoint may be reached, what a
  rotated refresh token obliges, and what a refusal may repeat

### What a built package hands over

- [`package-manifest.md`](package-manifest.md) — what a package tells the registry: the
  envelope, what appears only when a package has it, and what is taken from a package's
  own metadata
- [`node-images.md`](node-images.md) — the pictures a package ships: what is collected,
  what reaches the build, and which paths are refused

### What a node declares

- [`author-time-resolution.md`](author-time-resolution.md) — settings a node works out
  while somebody is editing: which markers reach the manifest, and how much of this
  mechanism this package does *not* hold
- [`localized-text.md`](localized-text.md) — reducing a label to the one word that gets
  drawn, and what happens when the language asked for was never written
- [`credential-type.md`](credential-type.md) — which credentials a node will accept, and
  why every reader sees the same list however the node wrote it

## What is not promised yet

Most of this package. The largest surface is the node and credential contract — what
`INode`, `INodeDescription` and `ICredential` guarantee an implementer, and the *Key
design constraints* in [`../CLAUDE.md`](../CLAUDE.md) that read as promises today while
living in a file nothing enforces. Also unpromised: the
manifest envelope the registry consumes, the image files a package ships beside it, the
retry primitive a node can drive itself, the author-time resolvers, the two helpers that
settle a loosely declared value, and the `rvnxx-nodes` CLI — which has no tests at all,
so a spec for it is test work before it is spec work.

**None of these has a row yet, and that is the honest state rather than an omission.**
A row here names the ticket that will promise its surface, and no such ticket has been
filed — carving the rest of this package into surfaces is a decision somebody has to
make, not a line to invent here. The ticket that installed this gate is history in
`ssrf-guard.md` and cannot stand in for them.
