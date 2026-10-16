---
feature: branch-selection
title: A node with several outputs says which one it took
where:
  - INodeResult — the `branch` a node returns
  - isMultiPort — whether a node's outputs are alternatives to choose between
  - assertBranchNamed — the check a node's own test runs on a result
  - outputProblems, outputWarnings — what the manifest build warns about in a node's output declaration
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
warns when they cannot (an error from the next major version on, PO-762); the rest is a
check the node's own tests run.

## Acceptance criteria

### AC-1 — A node with several outputs that returns no branch is flagged

- **Given** a node declaring two outputs
- **When** its result is checked with `assertBranchNamed` and carries no `branch`, or one
  that none of the declared outputs can produce
- **Then** the check throws, naming the node
- **Because** a result that names no output fires them all, and the fault shows only in
  a run, on the data of one record
- **And** a fixed output's name is always accepted; a generated output accepts the names
  it can produce (its fallback, the setting's value when the test passes the setting)
- **Pair** AC-2, the node with one output
- verify: unit

### AC-2 — A node with one output may leave the branch out

- **Given** a node declaring one output, or none — including one of kind `branch`, or
  one named from a setting
- **When** its result carries no `branch`
- **Then** the check passes
- **Because** there is nothing to choose between, and every node written before this
  rule is of this kind or already names its branch
- verify: unit

### AC-3 — What counts as several outputs

- **Given** a node declaring an `error` output beside another, or an output resolved
  while the author edits
- **When** `isMultiPort` is asked
- **Then** it answers yes; for a single output of any other kind it answers no
- **Because** the error output is a way out like the others, and a resolved set is not
  known when the package is built, so only naming the branch is safe
- verify: unit

### AC-4 — The build warns about several outputs that cannot be told apart

- **Given** a node declaring several outputs, a fixed one without a name or two with the
  same name, or a generated one whose fallback repeats a fixed name
- **When** the manifest is built with `rvnxx-nodes manifest`
- **Then** the build prints a warning naming the node and the output, and carries on
- **Because** a branch names an output; one that has no name or shares it cannot be
  chosen. It is a warning in 1.x so that no package stops building on a minor upgrade,
  and an error from the next major version (PO-762)
- verify: unit

## Gaps

**Known**

- **Whether `execute` returns a branch cannot be read from a declaration.** The build
  warns per AC-4 and holds nothing about the result; `assertBranchNamed` is the check, and it runs
  only where a node's tests call it. The worker is the other half and, from the integrations release that carries PO-751, fails a step of a
  multi-output node that comes back without a branch. PO-751.

## Tickets

- [PO-751](https://linear.app/revenexx/issue/PO-751) — a node with several outputs could
  return no branch, and then every output fired
- [PO-762](https://linear.app/revenexx/issue/PO-762) — the output warning becomes an error
  in the next major version
- [PO-746](https://linear.app/revenexx/issue/PO-746) — the rule that output ports are
  alternatives
