---
feature: branch-selection
title: A node with several outputs says which one it took
where:
  - INodeResult — the `branch` a node returns
  - isMultiPort — whether a node's outputs are alternatives to choose between
  - assertBranchNamed — the check a node's own test runs on a result
  - outputProblems — what the manifest build refuses in a node's output declaration
docs:
  - docs/overview.md
updated: 2026-10-15
---

# A node with several outputs says which one it took

**A node with several outputs says which one it took**, because its output ports are
alternatives: exactly one of them fires. A node with a
single output has nothing to choose, so it may leave the branch out. A node with more
than one has to name the one it took — otherwise the engine cannot tell which
connection to follow and would follow all of them, sending a record down the success
path and the error path at once.

An `error` output is an output like any other: a node offering `out` and `error` chooses
between two, and names `out` on success.

A declaration says how many outputs a node has but not what `execute` returns, so the
build holds only what a declaration can show — that the outputs can be told apart — and
the rest is a check the node's own tests run.

## Acceptance criteria

### AC-1 — A node with several outputs that returns no branch is flagged

- **Given** a node declaring two outputs
- **When** its result is checked with `assertBranchNamed` and carries no `branch`, or one
  that is none of the declared outputs
- **Then** the check throws, naming the node
- **Because** a result that names no output fires them all, and the fault shows only in
  a run, on the data of one record
- **Pair** AC-2, the node with one output
- verify: unit

### AC-2 — A node with one output may leave the branch out

- **Given** a node declaring one output, or none
- **When** its result carries no `branch`
- **Then** the check passes
- **Because** there is nothing to choose between, and every node written before this
  rule is of this kind or already names its branch
- verify: unit

### AC-3 — What counts as several outputs

- **Given** a node declaring an `error` output beside another, an output of kind
  `branch`, or outputs whose names come from a setting or are resolved while the author
  edits
- **When** `isMultiPort` is asked
- **Then** it answers yes
- **Because** the error output is a way out like the others, and for generated outputs
  the count is not known when the package is built, so only naming the branch is safe
- verify: unit

### AC-4 — The build refuses several fixed outputs that cannot be told apart

- **Given** a node declaring several fixed outputs, one without a name or two with the
  same name
- **When** the manifest is built
- **Then** the build fails and names the node and the output
- **Because** a branch names an output; one that has no name or shares it cannot be
  chosen, and the build is the last point that sees the declaration alone
- verify: unit

## Gaps

**Known**

- **Whether `execute` returns a branch cannot be read from a declaration.** The build
  holds AC-4 and nothing about the result; `assertBranchNamed` is the check, and it runs
  only where a node's tests call it. The worker is the other half and fails a step of a
  multi-output node that comes back without a branch. PO-751.

## Tickets

- [PO-751](https://linear.app/revenexx/issue/PO-751) — a node with several outputs could
  return no branch, and then every output fired
- [PO-746](https://linear.app/revenexx/issue/PO-746) — the rule that output ports are
  alternatives
