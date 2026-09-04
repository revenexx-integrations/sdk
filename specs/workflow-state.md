---
feature: workflow-state
title: What a workflow remembers between runs
where:
  - INodeContext.state — the store a node reaches everything it remembers through
  - INodeState — the four roles a namespace can have: mapping, cursor, dedupe, digest
docs:
  - docs/overview.md
updated: 2026-09-02
---

# What a workflow remembers between runs

**What a workflow remembers between runs** is the difference between an integration and
a node that starts from nothing every time. Without it a node is amnesiac: it re-derives
what happened last time by reading it back out of the target system, or it writes its own
bookkeeping into somebody else's data model — a correlation id parked in a customer's
notes field, a "last synced" stamp on a record that has nothing to do with syncing.

So a node reaches four things instead, each named after the role of the namespace it
lives in. A *mapping* correlates an id on each side of an integration. A *cursor* records
how far an incremental read got. A *dedupe* namespace claims a key, so the second copy of
a delivery stops there — `claim` is that role's operation rather than a role of its own. A
*digest* remembers the hash of an entity, so an entity that has not changed costs nothing.
They are four operations rather than one pair of get and set because the role decides when
a write becomes visible, and that decision belongs to whoever runs the workflow rather
than to the node author.

What this package holds is the surface those calls are made through, which is narrower
than what the store does: the store lives in the engine, and `## Gaps` records what
follows from that.

**Every answer a node gets back is an ordinary value it branches on — an unknown
correlation and a lost claim included — and it can be written and tested without the
engine.**

## Acceptance criteria

### AC-1 — An unknown correlation is an answer, not a failure

- **Given** a node deciding whether to create a record in the target system or update the
  one already there
- **When** it asks a mapping namespace for the partner id of the key it holds
- **Then** it is answered either the partner id or `null`, and both are ordinary values it
  branches on
- **Because** create-or-update is the question every integration opens with, so a
  correlation that does not exist yet is the most ordinary answer there is; signalled as a
  failure it would make the common path the exceptional one
- verify: unit

### AC-2 — A claim that was refused is an answer, not a failure

- **Given** a node processing a delivery that may be the second copy of one it has already
  seen
- **When** it claims the key of that delivery
- **Then** it is told whether it got the claim, and a refusal is a value it routes to a
  duplicate branch rather than something thrown at it
- **Because** at-least-once delivery makes a duplicate the normal case, and a normal case
  that arrives as a failure gets handled as an incident
- **Pair** AC-1 — the same promise for the other of the two answers a store gives, and the
  granted claim asserted in the same read is what shows the refusal is distinguished
  rather than swallowed
- verify: unit

### AC-3 — A watermark keeps whatever shape the source counts in

- **Given** a node reading a source incrementally
- **When** it reads the watermark the last completed run left, and stages the one this run
  reached
- **Then** it is handed the committed value as it stands, and the value it stages is passed
  on exactly as written — a timestamp, a provider page token, whatever the source counts in
- **Because** how far a read got is the source's vocabulary and not this package's: a shape
  imposed here would fit whichever provider happened to be in mind when it was chosen
- verify: unit

### AC-4 — An entity that has not changed is known before anything is written

- **Given** a node syncing entities of which only a few have changed since the last run
- **When** it asks whether an entity still carries the digest it is holding
- **Then** the answer arrives before it writes anything, so a node told the entity is
  unchanged finishes without performing the write and without staging a new digest
- **Because** the whole point of a digest is the write that does not happen: an answer that
  only arrived afterwards would cost exactly what it was meant to save
- verify: unit

### AC-5 — A node that remembers can be exercised without the engine

- **Given** a node package testing a node that reads and writes what its workflow remembers
- **When** it builds the run context to exercise that node with
- **Then** the whole state surface can be stood in for by plain objects, in that package's
  own tests, with nothing imported from this package but the type
- **Because** a node's own tests are the only place its create-or-update and duplicate
  branches are ever checked; a store that could only be faked by standing up the engine
  would leave every node author choosing between a test against the real store and no test
  at all
- verify: unit

## Elsewhere

- **That a setting naming a namespace reaches the registry at all** is
  [package-manifest.md](package-manifest.md) AC-1: a node's description travels as
  declared, and a `state-ref` setting travels with it. What is drawn for it afterwards is
  in `## Gaps`.

## Gaps

**Known**

- **What the store does is the engine's promise; this surface is the package's.** The
  criteria above are about the calls a node makes — that each answer is a value, that a
  watermark keeps its shape, that the whole thing can be stood in for. That the answers are
  *true* — that a key answered `null` really has no correlation, that a granted claim really
  excludes a parallel run — is held where the store is, which is a different codebase.
- **When a write becomes visible is documented and held nowhere here.** A mapping and a
  claim take effect immediately, because a correlation discarded by a later failure is how
  the next run creates a duplicate; a cursor and a digest are staged and adopted only once
  the run completes, because a watermark that advances on a failed run leaves exactly the
  gap it exists to prevent. It is the reason there are four operations instead of one pair,
  it is written down in [../docs/overview.md](../docs/overview.md), and it is the engine's
  to keep.
- **A namespace is reachable only from the node whose configuration names it**, and an
  undeclared namespace is refused outright — which is why a node names its namespace
  through a `state-ref` setting rather than a literal, and why a node that declares no such
  setting reaches nothing. Both the grant and the refusal are the engine's.
- **Author time is read-only.** The write calls reject while somebody is testing a node in
  the editor, so a rehearsal leaves behind no correlation that a later production run would
  read as truth. Enforced by the node-runtime host.
- **The claim window's figures, and its second job.** `ttlSeconds` defaults to 604800 and
  is accepted between 1 and 31536000, and a claim outlives the attempt that made it — the
  holder is never identified, so a retry after a failure that struck *after* the claim is
  told `false` as well, which makes the figure a retry window as much as a
  duplicate-suppression one. Documented on the call; nothing here proves either half.
- **The rest of what a mapping promises**: that `side` says which side of the pair the key
  is on and never searches both, and that re-pointing one side of an existing pair is
  refused. Both are the store's.
- **What is drawn for a `state-ref` setting** — a picker listing the workflow's namespaces
  of that role, and the offer to declare a new one without leaving the node — is the
  editor's. Nothing in this package promises the marker means anything at all; see
  `## Elsewhere` for the part that does travel.

**Undecided**

- **What a node should do when a state call is refused** — an undeclared namespace, a write
  at author time — is not stated: whether it throws or routes to an error port. The error
  contract it would follow is itself unpromised, and is recorded as such in the register in
  [README.md](README.md).
- **Whether a shared namespace changes anything for a node.** A workflow declares each
  namespace private or shared, and nothing on this surface tells the two apart — so whether
  a node may assume it is alone in a namespace it writes to is open.
- **What a partition key separates**, and what a read without one answers after writes made
  with one, is not stated.
- **Who reads the metadata recorded beside a correlation**, and whether anything may rely on
  it surviving.

**Unreachable**

- **That every run gets a store at all.** The state member is required on the run context,
  so a context without one does not compile — which is how the promise is really held.
  Nothing in this suite asserts it: a compiler refusal is not a test result here, and every
  criterion above runs against a context that has one.

## Tickets

- [PO-374](https://linear.app/revenexx/issue/PO-374) — the store itself: the four roles, the
  visibility rule that makes them four operations, and the `state-ref` setting that names a
  namespace instead of hardcoding it
- [PO-368](https://linear.app/revenexx/issue/PO-368) — this spec, written against the tests
  PO-374 shipped; the store's own behaviour went to `## Gaps` rather than into a criterion
  this package cannot prove
