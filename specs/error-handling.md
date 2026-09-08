---
feature: error-handling
title: When a failing step ends the run, and when the workflow carries on
where:
  - errorPort — the `error` output a node declares when a failure is one the workflow can handle
  - errorResult, toErrorResult, httpErrorResult — what a node returns to take that output
  - toErrorOutput, NodeErrorOutput — the one shape every routed failure arrives in
  - NodeError — what a node throws when the run cannot sensibly continue
docs:
  - docs/overview.md
updated: 2026-09-08
---

# When a failing step ends the run, and when the workflow carries on

**A failing step ends the run**, or the workflow carries on — which means the step
hands it a second way out — the `error` output an author can wire to a different branch. Which of
the two is not the node author's taste. It follows from **where the fault came from**.

A fault in the author's own configuration ends the run: a required setting left empty,
an operator the node does not know. It is the same on every record the workflow will
ever process, no branch can repair it, and a workflow that quietly takes a fallback
around it hides a mistake the author wants to hear about at once.

A fault in the data this record carried is offered on the `error` output: a value that
should have arrived from an earlier step and did not. It differs per record — one
incomplete row among a thousand — and handling it is the ordinary business of an
integration.

A fault in the world around the run is offered there too: a request that timed out, an
address the guard refused, a far system that answered badly. Both answers would be
defensible for these, and the offer is what ships today.

**Where the fault came from decides, and the same fault decides the same way in every
node.**

## Acceptance criteria

### AC-1 — Every routed failure arrives in one shape

- **Given** any value a node caught — a `NodeError`, an abort, another `Error`, or
  something that is not an error at all
- **When** it is normalised for the `error` output
- **Then** it carries `code`, `message` and `status`: a `NodeError` keeps its own code
  and takes `status` from its `meta` where one is there, an abort becomes `TIMEOUT`, and
  anything else becomes `REQUEST_FAILED`; `status` is `0` wherever no status was read
- **Because** the editor offers the author fields to branch on before any run exists, so
  the three have to mean the same thing behind every node in every package
- verify: unit

### AC-2 — A routed failure names the output it took

- **Given** an error output ready to be returned
- **When** a node returns it
- **Then** the result carries the payload under the output's own name and names that
  same output as the branch taken
- **Because** the engine routes on the branch and the editor reads the payload from the
  port of that name; a result where the two disagree reaches neither
- verify: unit

### AC-3 — The error output a node declares carries the three fields and says what it is for

- **Given** a node declaring the shared error output
- **When** the manifest is built
- **Then** the output is named `error`, is of kind `error`, and declares `code`,
  `message` and `status` — and `body` as well where the node asked for it
- **And** its description states the rule above, so an author reading the port in the
  editor is told what will and will not reach it
- **Because** this is the only place the rule reaches the person it constrains most, and
  a port that arrived without it would leave every author to find out by running a
  workflow
- verify: unit

## Gaps

**Known**

- **This package holds the vocabulary; it cannot hold the classification.** The three
  classes above say which helper a node reaches for, and there is no node in this
  package to assert that against — so they are stated here and carried to the author by
  AC-3's port description, while the criteria that hold them belong to each node
  package's own specs. PO-442 carries the check that would hold them everywhere. What
  is promised here is the shape, the routing and the port.
- **The rule was stated in two places before it was stated here**, and they did not
  agree: the port's own description split on configuration against runtime, and
  `../CLAUDE.md` split on unexpected against expected. A required setting left empty is
  expected and a configuration fault at once, which is how four pairs of shipped nodes
  came to answer one situation two ways. Both now point here.

**Undecided**

- **Whether an author may demand that a runtime failure ends the run.** AC-3 offers the
  error output and nothing lets a workflow say it would rather stop — for a payment
  posted once, carrying on past a timeout is the wrong answer. A per-node setting is the
  obvious shape and is deliberately not built here, because a setting that can also turn
  AC-1 off would undo the classification.
- **What the two words on the port are allowed to be** — whether `code` is drawn from a
  closed set, and what `message` may contain. Recorded here because this is where the
  port is now declared, and recorded **once**: the same two questions already sit in the
  `## Gaps` of the error-contract spec in all four node packages, eight entries for two
  questions, which is what a shape with no single home does to a corpus. Whoever answers
  it retires those eight against the answer rather than adding a ninth. `message`
  carrying the far end's own wording is the half with a security edge — PO-345.

## Tickets

- [PO-442](https://linear.app/revenexx/issue/PO-442) — nothing said which failures end a
  run and which the workflow could carry on from: the three classes above, the shape and
  the port lifted out of `integrations-nodes-core` so every package reaches one copy
- [PO-134](https://linear.app/revenexx/issue/PO-134) — asked in June for the shape to be
  lifted into this package, and for the throw-or-route rule to be written down; the dead
  ports it named were fixed and these two were not
