---
feature: output-fields
title: What an output says it carries
where:
  - IOutputPort.fields — the values a node declares an output to carry, by name
  - IOutputField — one declared value, its type and its sentence
docs:
  - docs/overview.md
updated: 2026-09-28
---

# What an output says it carries

**What an output says it carries** is the list of values a node declares on one of its
outputs — each with a type and a sentence — and it is the only thing the editor has to
offer the next step before anything has run. A value the declaration leaves out is a
value the author has to know about and type by hand.

A value is often a record rather than a single thing: a comparison hands back its
counts as one object of four numbers, and the number the author wants is one level
down. A declaration stays a flat list of names, and what is inside a value is declared
beside it under a dotted name — `counts` as an object, `counts.added` as a number —
which the editor offers as a path into the value, and the engine resolves the same way.

**A node declares a value inside a record by naming its path, and that name reaches
every reader of the manifest exactly as written.**

## Acceptance criteria

### AC-1 — A declared value reaches the manifest as declared, a dotted name included

- **Given** a node whose output declares a value and, beside it, a value inside it
  under a dotted name
- **When** the manifest is built and written out
- **Then** both arrive as declared: the dotted name is one name — not split, not
  folded into the value it points into, not dropped — and each keeps its type and its
  sentence
- **Because** the manifest is the only thing the editor reads before anything runs; a
  dotted name that arrived as anything else would offer the author a path the node
  never declared, or none at all
- verify: unit

## Gaps

**Known**

- **This package carries the dotted name; it does not read it.** That a dotted name is
  offered as a path and resolved as one is done by the editor and by the engine — two
  other codebases. Both did so when PO-408 was decided, read from their code rather
  than observed in a running editor, and nothing here would notice if either stopped.
- **A declared value cannot describe what is inside it, and that is the decision.**
  The registry's manifest schema refuses any member of a declared value beyond its type
  and its sentence, and the editor reads nothing else — so a value that described its
  own contents would be refused at publish and dropped in the editor: three codebases
  changed to buy what a dotted name already buys. What the dotted name costs instead is
  one declaration per path, with nothing tying `counts.added` to `counts` beyond the
  prefix (PO-408).
- **The emitted record must really be nested.** A dotted name is a path, so a node that
  emits a record with a literal `counts.added` key has declared a value nobody can reach
  — neither the editor's preview nor the engine finds it.
- **A node whose record is shaped by the author cannot declare it.** A node that writes
  its result to paths the author configured — the transform and set-fields nodes in the
  core package — knows none of those paths when its description is written, so no
  static declaration can name them; and a path the author builds from an expression is
  not known while the workflow is being edited, so no declaration of any kind can.
  Those paths stay unoffered rather than guessed.

**Undecided**

- **Whether a node whose record is shaped by the author should offer its configured
  paths through an output set resolved while editing.** The mechanism exists — see
  [author-time-resolution.md](author-time-resolution.md) — and would cover every path
  that is a literal; nobody has decided that those two nodes should use it.

## Tickets

- [PO-408](https://linear.app/revenexx/issue/PO-408) — a declared value could not say
  what is inside it: decided to stay flat, with a dotted name declaring a path into the
  value
  - Making a declared value nestable was weighed and set aside, on what the registry's
    schema and the editor were found to do on 28 September 2026: the one refuses the
    member, the other reads past it. Kept because it is the only record of why this
    spec promises a naming convention rather than a shape.
