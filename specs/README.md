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

- [`ssrf-guard.md`](ssrf-guard.md) — what a request is allowed to reach: which targets
  are refused before a request is made, how each redirect hop is judged again, and what
  a refusal is allowed to tell the caller

## What is not promised yet

Every other surface in this package. The largest is the node and credential contract —
what `INode`, `INodeDescription` and `ICredential` guarantee an implementer, and the
*Key design constraints* in [`../CLAUDE.md`](../CLAUDE.md) that read as promises today
while living in a file nothing enforces. Also unpromised: the timeout, retry and
response-cap behaviour that shares a home with the guard but answers a different
question, the manifest envelope the registry consumes, and the credential base classes.

**None of these has a row yet, and that is the honest state rather than an omission.**
A row here names the ticket that will promise its surface, and no such ticket has been
filed — carving the rest of this package into surfaces is a decision somebody has to
make, not a line to invent here. The ticket that installed this gate is history in
`ssrf-guard.md` and cannot stand in for them.
