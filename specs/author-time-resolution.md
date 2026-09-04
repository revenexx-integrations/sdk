---
feature: author-time-resolution
title: Settings a node works out while somebody is editing
where:
  - INode.loadOptions, resolveConfigSchema, resolveOutputs — the three resolvers a node may offer
  - the dynamic, dependsOn, dynamic-schema and resolveOutputs markers on a description
docs:
  - docs/overview.md
updated: 2026-09-01
---

# Settings a node works out while somebody is editing

**Settings a node works out while somebody is editing** are the ones that cannot be
written down in advance. A node reaching a customer's own system does not know which
objects that system has, which fields those objects carry, or what a given call gives
back — and none of it is the same for two customers. Declaring the settings statically
would mean either a free-text box for something that has a fixed set of answers, or a
list that is right for whoever the node was built against.

So a description may mark a setting as one to resolve rather than one to list, and
offer a resolver that fetches the answers while a workflow is being edited. The
markers travel in the manifest, which is how an editor knows to ask at all. The
resolvers themselves run in the node-runtime host, and what they return is written
into the saved workflow rather than fetched again at run time.

**A node can say a setting is resolved without saying what it resolves to, and every
reader of the manifest can tell.**

## Acceptance criteria

### AC-1 — What a node marks as resolved survives into the manifest

- **Given** a node marking settings as resolved, naming what each depends on, declaring
  a whole set of settings to be resolved together, and an output set to be resolved
- **When** the manifest is built
- **Then** every one of those markers is carried through as declared
- **Because** the manifest is the only thing an editor reads before anything runs; a
  marker lost here is a setting drawn as a plain text box, which is the failure this
  whole mechanism exists to avoid
- verify: unit

### AC-2 — A node that resolves nothing offers no resolvers

- **Given** a node whose settings and outputs are all fixed
- **When** it is written
- **Then** it carries none of the three resolvers, and is a complete node without them
- **Because** most nodes are static, and a mechanism that obliged every one of them to
  supply three empty functions would be paid for by the majority to serve the few
- **Pair** AC-1
- verify: unit

## Gaps

**Known**

- **Most of this subject is below rather than above, and that is the honest result.**
  Two criteria is what this package can actually be held to; the rule the whole mechanism
  depends on lives in the node-runtime host, which is a different codebase.
- **That the resolvers run while editing and never during a run is not promised here.**
  It is the rule the mechanism depends on — a resolver called during a run would reach a
  customer's system on every execution — and it is stated in `../CLAUDE.md` and
  enforced by the node-runtime host, which is a different codebase. Nothing in this
  package holds it.
- **That what a resolver returns is written into the saved workflow rather than fetched
  again is likewise unpromised here**, for the same reason: the host does the writing.
- **Two of the three tests covering this area exercise a node written inside the test
  rather than anything this package does.** One calls the fixture's own resolvers and
  checks it gets back what the fixture returns; the other checks that an object literal
  without resolvers has none. Neither is bound to a criterion, because binding them
  would put a proof in this corpus that cannot fail for a reason anybody cares about.

**Undecided**

- **What a resolver may assume about the context it is given** is not stated — whether
  credentials are always available, whether it may be called before the settings it
  depends on have values, and what it should return when they do not.
- **What happens to a saved workflow when a resolved set of settings later changes** is
  not settled. The saved copy is what runs, so a field that has since disappeared from
  the customer's system is still in the workflow, and nothing here says who notices.
- **Whether a setting that drives a dependency may itself be an expression** is stated
  as a constraint in `../CLAUDE.md` and is checked by nothing.

## Tickets

- [PO-143](https://linear.app/revenexx/issue/PO-143) — author-time settings and ports:
  the markers, the three resolvers, and the rule that they never run during execution
- [PO-368](https://linear.app/revenexx/issue/PO-368) — backfilled this spec against the
  one test that proves something about this package
