---
"@revenexx/integrations-node-sdk": major
---

Add `ctx.state` — the tenant state store a workflow remembers between runs (PO-374).

`INodeContext` gains a `state` property, typed by the new `INodeState`: id
mappings (`mapping.get` / `mapping.put`), incremental watermarks (`cursor.get` /
`cursor.set`), processed-once claims (`claim`) and change detection
(`digest.unchanged` / `digest.set`). The runtime has provided these since the
engine-side change landed; this makes them typed and discoverable for node
authors.

The role of a namespace decides when a write becomes visible — mappings and
claims immediately, cursors and digests only once the run completes — so these
are four operations rather than a generic get/set.

Nodes name a namespace through a new `state-ref` config field type (with
`stateRole` narrowing it to one of the four roles), not through a literal in
`execute`: the editor gives the author a picker, and the engine only lets a node
reach the namespaces its own config names.

Additive for node authors. Anything that *implements* `INodeContext` (test
helpers, mock contexts) must now supply `state`.

**Major, and therefore 1.0.0.** `state` is a required member on `INodeContext`,
which `docs/versioning.md` puts under Major — and the pre-1.0 stance is to follow
that matrix as if the leading zero were not there. A required member on a minor
is the one combination the policy rules out, and making `state` optional to earn
the smaller bump would mean every node author writing `ctx.state?.` for something
the engine always supplies, while mock contexts kept compiling without it — the
exact gap this changeset exists to announce. So the version follows the type
rather than the other way round.
