---
"@revenexx/integrations-node-sdk": minor
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
