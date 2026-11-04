---
feature: unresolved-settings
title: Whether a setting's placeholder found nothing in this record
where:
  - INodeContext.unresolvedSettings — the settings the engine names as having found nothing
  - wasUnresolved — asking for one of them
docs:
  - docs/overview.md
updated: 2026-11-04
---

# Whether a setting's placeholder found nothing in this record

**Whether a setting's placeholder found nothing in this record** is something a node
cannot see in the setting itself: such a setting arrives without a value, and so does a
setting nobody configured. For most settings that is the same thing. For a list
node's optional filter it is the opposite: no filter means the author wants
everything, a filter this record emptied means something went wrong, and a node that
cannot tell them apart lists everything in both cases.

So the engine names, beside the settings, the ones whose placeholder found nothing,
and a node asks for the one it cares about.

## Acceptance criteria

### AC-1 — A setting the engine names reads as found-nothing

- **Given** a run context naming `customer_id`, `filters.customer` and `lines[2].sku`
- **When** `wasUnresolved` is asked for one of those paths
- **Then** it answers yes, and no for any other path — a parent of a named path
  included
- **Because** a node decides per setting: the filter it would drop is one path, not
  the group it sits in
- verify: unit

### AC-2 — An engine that names nothing answers no for every setting

- **Given** a run context without the list, or with an empty one
- **When** `wasUnresolved` is asked for any path
- **Then** it answers no
- **Because** an engine deployed before the list, and a trial run that resolves no
  placeholder, name nothing; a node built on this answer behaves there as every node
  did before it could ask
- verify: unit

## Gaps

**Known**

- **Which settings are named is not this package's to promise.** The engine names a
  setting that is one placeholder whole, whose path does not exist or holds `null`, from
  any root and at any depth — promised by the engine in *integrations*, in its spec on expression resolution,
  which no test here can reach.
- **Nothing here makes a node ask.** A node that drops an empty filter without asking
  still lists everything. That a list or search node routes such a filter to its error
  output is a rule of the node packages, written in the skill they are built with, not a
  promise this package can hold.

## Tickets

- [IN-63](https://linear.app/revenexx/issue/IN-63) — the list and the question, decided
  in [PO-673](https://linear.app/revenexx/issue/PO-673) over handing a node `null` for a
  setting that found nothing
