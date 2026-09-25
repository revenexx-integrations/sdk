---
'@revenexx/integrations-node-sdk': minor
---

PO-537: a node package decides the order of its nodes inside a palette folder.

**`INodeDescription.paletteOrder`** is an optional number: where a node stands
inside its innermost palette folder, among the nodes of the same package, lower
first. Nodes that declare one come before those that do not, and those that do
not keep the order the package lists them in `NODES`. So a package that lists
its main node first needs nothing at all; the field is for the case where the
array order is not the palette order.

The manifest already kept the order of `NODES`; that is now promised
(`package-manifest` AC-11), because the registry reads it as the fallback. The
field itself is carried as written, and nothing fills in a default (AC-12).

Additive: no package has to set it, and an older registry ignores it. The
registry and the palette start using it in *integrations* and
*studio-integrations* under the same ticket.
