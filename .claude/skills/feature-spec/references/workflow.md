# Bringing specs and tests in line

The procedure behind the four modes. `SKILL.md` resolves the mode; this runs it.

- [0. Before editing anything](#0-before-editing-anything)
- [1. Establish what the behaviour actually is](#1-establish-what-the-behaviour-actually-is)
- [2. Map it onto spec files](#2-map-it-onto-spec-files)
- [3. Update the tests in the same pass](#3-update-the-tests-in-the-same-pass)
- [4. Record the ticket](#4-record-the-ticket)
- [5. Verify, and report honestly](#5-verify-and-report-honestly)

## 0. Before editing anything

State which mode was resolved and what is being treated as the source of truth. If the
input is ambiguous — a ticket id *and* a dirty working tree that touches something else
— ask rather than guess.

Run `git status` first. If the working tree has unrelated changes, say so; do not fold
them into the spec.

## 1. Establish what the behaviour actually is

**sync** — read the diff of the product files, skipping lockfiles, build output and
tests for now. Per change, decide: can a **consumer** observe a difference? Renames,
refactors and internal plumbing cannot. New states, new affordances, changed guards,
changed defaults, and copy that carries meaning can. If nothing observable changed, say
so and stop — do not manufacture ACs.

**ticket** — read the ticket, comments included; decisions often live there. Then find
how it was actually implemented: `git log --grep`, the merge commit, the pull request.
**The ticket is the intent, the code is the behaviour.** Where they disagree the code
wins, and the discrepancy goes in the report — it usually means the ticket was amended
verbally.

**backfill** — the risky mode, because there is no diff to anchor on. Seed an AC **only**
from behaviour that can be pointed at:

1. assertions in tests that pass today — that behaviour is verified, so write the AC and
   tag the existing test,
2. behaviour stated in `docs/*.md` or a ticket,
3. behaviour just **run and observed**.

Everything merely inferred from the source goes under `## Gaps` as a question, not into
an AC. Expect a backfilled spec to be mostly gaps at first. **Do not backfill more than
one spec per run** — the failure mode is volume: a corpus of plausible promises nobody
confirmed reads exactly like a corpus of real ones.

**revise** — read the spec AC by AC and check each against today's code and tests.
Report the ACs that no longer match *before* changing them.

## 2. Map it onto spec files

Which spec a promise belongs in is the granularity list in `SKILL.md` — work its ordered
list, do not decide it here. If the spec does not exist yet, create it; if it does, edit
in place:

- changed promise → edit the AC, **keep its id**
- promise that splits in two → the closer half keeps the id, the other takes the next
  free number
- genuinely new promise → new AC with the next free number
- removed behaviour → delete the AC (its number retires), **and** the tests that claimed
  it, **and** record the removal in `## Tickets`
- never leave a promise that the code contradicts

If the change spans two specs, edit both. If it spans five, this is probably a refactor
rather than a behaviour change — go back to step 1.

New specs need their row in the index, and a surface left deliberately unpromised needs
its row in the register (see `references/spec-anatomy.md`).

## 3. Update the tests in the same pass

For every AC touched at a proving layer, write or update the test and tag it. An AC that
cannot be proven yet is `todo` with a ticket — never a silent proving layer with no test
behind it.

Reuse the repo's existing scaffolding — fixtures, mock helpers, request builders — rather
than inventing a second way to set up state. If an element cannot be addressed by role or
accessible name, add the missing `aria-label` to the product rather than reaching for a
CSS selector: fixing the product is the better move.

**For any AC that asserts an absence, do not stop at green.** Revert the fix or break the
guard locally, confirm the test goes red, restore. Both halves of this caught a silently
vacuous test the first time they were applied — an absence assertion matching a
*different* button, and a canvas that never received the hover at all. See
`references/test-layers.md`.

## 4. Record the ticket

Append to the spec's `## Tickets` — one line on what this change contributed — and bump
`updated:` in the frontmatter. In **backfill** mode with no ticket to name, record the
ticket being worked under: the section must never be empty, because it is the history of
the promise.

## 5. Verify, and report honestly

- `spec:check` green. Read the failure direction; do not paper over it.
- Run the touched tests with the layer's `runHint` from the config. Green, not "should be
  green".
- Report: the mode and its source, specs touched, ACs added / changed / retired, the tests
  claiming them, everything left as `manual` or `todo` **with the reason**, and every gap
  opened. If a promise was left unverified, say it plainly.

The last item is the one that decides whether the corpus stays worth trusting. A run that
reports "done" over an AC nobody proved has spent the only thing this format buys.
