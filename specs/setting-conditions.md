---
feature: setting-conditions
title: A setting that says when it applies
where:
  - IConfigField.showIf — the condition a node writes on one of its settings
  - settingApplies — whether a setting applies, given what is filled in so far
  - OPERATORS, evaluate — the comparison vocabulary the condition is written in
docs:
  - docs/overview.md
updated: 2026-09-02
---

# A setting that says when it applies

**A setting that says when it applies** carries a condition on another setting — a
key, an operator, and the value to compare against — and is put in front of an author
only while that condition holds.

A node's settings are not all relevant at once. One choice decides what the rest of
the form means: a **Source** of *Now* leaves the field naming what to read with
nothing to do, a mapping that came from a file leaves the delimiter idle. Until now a
node could only say so in prose, in the sentence under the field — which the author
reads last, if at all, having already filled the field in.

The condition travels in the manifest, which is how an editor knows not to draw the
field at all; and it is written in the same comparison vocabulary an author already
meets in a condition node, so there is one set of words for comparing values in this
product rather than two.

**A node says once when a setting applies, and every reader of the manifest gets the
same answer.**

## Acceptance criteria

### AC-1 — A condition a node writes on a setting survives into the manifest

- **Given** a node whose setting declares a condition — a key, an operator, and where
  the operator takes one, a value
- **When** the manifest is built
- **Then** the condition is carried through as declared, and a setting that declares
  none carries none
- **Because** the manifest is the only thing an editor reads before anything runs; a
  condition lost here is a field drawn under a choice that makes it meaningless, which
  is the whole failure this exists to end
- verify: unit

### AC-2 — Whether a setting applies is answered from the condition and the values so far

- **Given** a setting with a condition, and the values an author has filled in — which
  mid-edit routinely means none of them
- **When** the setting is asked whether it applies
- **Then** it applies while the condition holds, does not while it fails, and always
  applies when it has no condition; a value that is not there reads as absent rather
  than as an error
- **Because** the answer is needed on every keystroke, before anything is saved and
  before anything is valid — a condition that threw on a half-filled form would be
  unusable exactly when it is needed
- verify: unit

### AC-3 — One comparison vocabulary, and each word means one thing

- **Given** the operators a condition may use
- **When** each is applied to a pair of values
- **Then** it answers as the answer table states, every operator in the vocabulary has
  a row in that table, and a word outside the vocabulary is refused
- **Because** these are the same words a condition node offers an author, and the same
  words a second implementation has to reproduce — the editor deciding whether to draw
  a setting, the platform deciding whether to demand one. A vocabulary whose meaning is
  written down in one place and guessed in the others is two vocabularies
- verify: unit

## Gaps

**Known**

- **This package holds the declaration and the meaning; it does not hold the
  behaviour.** Whether a field is *drawn* is the editor's, and whether a hidden field
  is still *demanded* of a saved workflow is the platform validator's — two other
  codebases. What this corpus can promise is that the condition survives into the
  manifest and that the words mean one thing; both of those are here.
- **The answer table travels by being copied, not by being imported.** The editor
  cannot import `settingApplies`: this package's entry point re-exports the SSRF guard,
  which pulls Node built-ins, so importing the root into a browser bundle drags
  `node:net` in with it. A subpath export for the pure half would fix that and is not
  built. Until it is, the second and third implementations transcribe these rows and
  assert their **count**, so a row dropped on either side fails — which is the least
  that works, and less than sharing one table. It was worth building: the first review
  of PO-410 found a real divergence this way, in a text comparison against a value that
  is not there, and no row here had exercised it. What the count still cannot see is a
  row *changed* on two sides in different ways.
- **What happens to the value of a setting that stops applying is not promised here.**
  The editor clears it, following the cascade it already runs for dynamic options
  (PO-410). Nothing in this package would notice either way.

**Undecided**

- **Several conditions on one setting.** One condition is what the library needs today.
  The type widens to a list compatibly, and `showIf: Condition | Condition[]` is the
  shape to reach for when a second one is wanted — but nothing says whether they would
  be joined by *and* or offer a choice of both.
- **`exists` and `isNotEmpty` answer the same question for a config value.** An unset
  key is `undefined` and a cleared text box is `''`, so both pairs of operators separate
  the same two states. Keeping all fourteen is deliberate — one vocabulary beats a
  subset with a footnote — but which of the two an author should reach for is not
  written down anywhere.
- **Whether a setting that drives a condition may itself be an expression.** Stated as a
  constraint in [`../CLAUDE.md`](../CLAUDE.md) and checked by the platform's manifest
  constraints, not here. It is the same limit `dependsOn` carries, and the same gap:
  see [author-time-resolution.md](author-time-resolution.md).

## Tickets

- [PO-410](https://linear.app/revenexx/issue/PO-410) — a setting could not say when it
  applies, so a node showed every field whatever the author chose: the condition, its
  vocabulary, and the two codebases that honour it
- [PO-143](https://linear.app/revenexx/issue/PO-143) — the config-field grammar this
  adds to, and the `dependsOn` marker a condition must not be confused with
