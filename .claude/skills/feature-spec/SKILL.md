---
name: feature-spec
description: Keep a single point of truth for promised behaviour in specs/*.md and bind every promise to a test that proves it, via "@spec:feature:AC-n" tags a spec:check gate enforces in both directions. Use when writing or changing a feature spec, when a ticket changes promised behaviour, when wiring a test to an acceptance criterion, when spec:check fails, when asking which promises changed between two refs, or when installing the gate in a repository that has none yet. Invoke as "/feature-spec" followed by a ticket id, a spec path, or a feature area to bring a spec and its tests in line with reality.
version: 0.3.0
visibility: private
license: MIT
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
metadata:
  title: Feature Specs
  category: development
  tags: [specs, testing, documentation]
  keywords: [spec, acceptance-criteria, spec-check, verify, promise, gate]
  authors:
    - Wolfram Schmale
  homepage: https://github.com/revenexx/skills-catalog
  targets:
    - claude-code
---

# Feature specs

A repo with a `spec.config.json` keeps a **single point of truth for promised
behaviour** in `specs/*.md`, and binds every promise to a test that proves it.
`spec:check` enforces the binding in both directions, so a promise cannot be
changed, added or deleted without its tests coming along.

| Where | Question | Content |
| --- | --- | --- |
| `specs/*.md` | **What** | What the feature does, and what happens when the consumer acts. Reads like a promise. |
| `docs/*.md` | **How** | Technology, implementation decisions, contracts, trade-offs, why it was built this way. |

**The rule this all serves: change promised behaviour → change its spec in the same
commit, and its tests with it.** New behaviour, changed behaviour, removed
behaviour. A spec that lags behind the code is worse than no spec, because people
trust it.

**A consumer is anyone outside this repository who can observe the difference** — a
person clicking in a browser, an operator on a screen, a CLI, another service
calling the API. It is the word this format turns on, and the reason it is stated
here is that the narrower reading costs the most: a change to what an endpoint
answers is promised behaviour even though no pixel moved, and a repo with no UI at
all has consumers. What is *not* consumer-visible is anything only this repository
can tell apart — a rename, a refactor, a swapped dependency, a faster query with
the same answer. Which vocabulary those promises are stated in is `audience` in the
config; whether something is a promise at all is this paragraph.

## Resolve the mode before editing anything

| Input | Mode | What is the source of truth for the behaviour |
| --- | --- | --- |
| a branch, or nothing | **sync** | the branch diff |
| a ticket id | **ticket** | the ticket for intent, the code for behaviour |
| a feature area, free text | **backfill** | only what can be pointed at — see the guardrail |
| a spec path | **revise** | that spec, re-read against today's code |

**The input is whatever came with the invocation** — `/feature-spec PO-193`,
`/feature-spec specs/runs.md`, `/feature-spec the node palette`. With no input,
resolve from the current branch.

State the mode and the source before editing. Then follow
[`references/workflow.md`](references/workflow.md), which carries each mode's
procedure and closes on the report to give.

**The guardrail that governs backfill: a promise nobody confirmed is invention, and
invention is worse than silence.** Seed an AC only from behaviour that can be
pointed at — a test that passes today, a statement in `docs/` or a ticket, or
behaviour just run and observed. Everything merely inferred from source goes under
`## Gaps` as a question. Expect a backfilled spec to be mostly gaps; that is an
honest result, not a failure.

## What a spec never names

**A spec never names the implementation.** Its readers do not care about the code,
and a path in a spec rots silently on the first rename — nothing goes red. Pointers
run the other way: the code names its spec in a comment, tests name their AC in a
tag. This is checked, as `implementationPattern` in the config: out go source paths
and file names — `src/…`, `app/…`, anything ending `.ts`, `.vue`, `.php`, `.py` —
along with class, component and function names. `.md` stays in, deliberately, so
specs can link each other and their `docs/` companion. If the pattern does not fit
this repo's stack, widen it in the config rather than working around it in prose.

To say where something lives, use **the address a consumer reaches it by** — the
label they click, the route they call. Name a surface after the thing they reach
for, and add the address in brackets when the name alone is ambiguous or the surface
has no navigation entry. An address is not an implementation detail: it survives
every rename inside the code.

**The name is the copy the product ships**, not one a spec composes. Look it up rather
than writing it: a description standing in for a name — "the dialog that shows what a
run returned" — costs every reader a translation, and it hides whether the surface has
a name at all. **A surface the product does not name is a finding, not a licence to
invent one:** record the absence where the register would have held its row, because a
house name that appears in no interface sends the reader hunting for words that are not
there. Where names are looked up, and the two vocabularies a spec directory keeps, is
[`references/spec-anatomy.md`](references/spec-anatomy.md).

**Wire details follow the audience, declared once as `audience` in the config** — in
that repo's own words, because the line sits in a different place in every product.
For an operator on a screen, a status code or a payload key is implementation and
belongs in `docs/`; a spec says *that* a save was refused and that the user is told
which settings are at fault. For an integrator calling an API, the request and its
answer *are* the promise, so a refusal may name the status and the field it faults.
For a workflow author on a canvas, the ports and config keys they wire are the
product's vocabulary while the wire shape behind them is not. Read the declaration
before assuming which of these the repo is. Either way the implementation behind the
promise stays out.

**Documentation pointing at documentation is the good kind.** Link the `docs/`
companion from the frontmatter, and link a sibling spec by its bare filename
(`other-feature.md`) — the way a reader's click resolves it. Both are checked for
existence, so they cannot rot in silence.

## One spec per surface

**A surface is an address a consumer reaches deliberately and then works at, which
carries promises of its own.** A page qualifies; so does a dialog or a panel opened
and worked in; so does a route family an integrator calls. What does not: a popover,
a tooltip, a toast, an inline expander — they appear *at* something rather than
being somewhere, so they belong to the surface they appear on. The test is "own
address, own promises", not "own URL". Make this call once per surface, explicitly.

Work down this list and stop at the first line that fits:

1. **The surface already has a spec** → it goes there, unless it also holds
   elsewhere. Where a surface was already split by goal (item 3), it goes to the
   spec whose goal it serves — and if it serves none, that *is* a new goal: skip to
   item 5 and name the file after it.
2. **The same promise must hold on two or more surfaces** → promote it to its own
   spec, and have the surface specs link it rather than restate it. Its `where:`
   then lists every surface it reaches.
3. **The spec would grow past roughly a dozen promises *and* a subset carries its
   own nameable goal** → split along that goal, and let the goal name the file.
   Never split along screen regions or route prefixes. Both halves of the "and" are
   load-bearing: size alone is no reason to split, and a second goal inside a small
   spec is not urgent. **The dozen is a smell with a reason behind it, not a measured
   constant** — past that many promises a reader can no longer hold the spec in their
   head at once. Another repository may put the number elsewhere; the rule is the
   question, not the threshold.
4. **No promise of its own, while cross-surface specs already reach it** → leave it,
   and record it in the index under the register of what is not promised yet.
   "Covered only from across" is a state, not an oversight.
5. **None of the above** → a new spec, named after the surface, or after the goal
   when item 1 sent you here.
6. **Still none** → invent the unit that fits, then record it as a line in the
   index. The next person needs the precedent.

**When in doubt, one spec.** A file boundary is the expensive one, because AC ids
are permanent: moving a promise to another file gives it a new id and retags its
tests. Grouping *inside* a spec is free. Specs sit flat in the spec directory — the
filename is the feature id, tags carry no path separator, and the gate rejects a
subdirectory rather than skipping it silently. Grouping belongs in the index, and a
filename names its feature rather than its group — renaming a spec to fit a grouping
retags every test pointing at it. Directories are the way out where a corpus really
outgrows one level, at a threshold and a price named in
[`references/spec-anatomy.md`](references/spec-anatomy.md).

**One AC per promise, not per interaction.** "The banner lists what's incomplete" is
one AC. "The banner is amber, sits under the tab bar and uses a bullet list" is one
promise over-specified into three, and it breaks on every redesign that keeps the
promise intact.

## Writing the spec

**Two keys carry what a repository decided on top of this format, and both are read
before writing a spec rather than after.** `ceiling` says what the test harness here
cannot reach at any layer, so a promise beyond it is `manual` or `todo`. `houseRules`
names a file in the spec directory carrying the rest — what counts as a surface here,
a title convention, a vocabulary boundary finer than `audience` can state. Where that
file is more specific than this skill, it wins for this repo; it may narrow and extend
a rule, never switch off one the gate checks.

**The canonical template lives in
[`references/spec-anatomy.md`](references/spec-anatomy.md)** — frontmatter keys, the
annotated intro, one AC block, and every section's own note. Open it when writing or
restructuring a spec. It is the only copy on purpose: a format that exists in two
places is a format that changes in one of them.

The order is fixed, and most of it is checked:

| Section | | Holds |
| --- | --- | --- |
| frontmatter | required | `feature` (equals the filename), `title`, `where` (at least one, in product language), `updated` (a real date, not in the future); `docs:` optional |
| `# H1` | required | the same words as `title:` |
| intro | required | opens by naming its subject in bold, in words from the title; closes on one bold line carrying the promise; nothing bold between the two |
| `## Acceptance criteria` | required | `### AC-n — one promise`, then **Given** / **When** / **Then**, optional **And** / **Because** / **Pair**, and `verify:` last |
| `## Elsewhere` | optional | what *another* spec promises — and it sits above `## Gaps` |
| `## Gaps` | optional | what *this* spec does not promise, each entry under one of **Undecided** / **Known** / **Unreachable**, and the section opens on a label rather than a paragraph |
| `## Tickets` | required | always last, one line per ticket |

Each slot has one job, and `verify:` closes the criterion — the promise comes first,
the machine-readable line answering for it comes last. `- reason:` and `- ticket:`
say something about that line and are the only bullets that may follow it.

**A new spec is not finished until the index has a row for it.** `specs/README.md`
lists every spec, and the gate checks both directions — a spec missing from it, and a
row naming a file that is gone. Where the config names `indexRegister`, that section of
the index is the other half: a surface carrying no promise yet is recorded there with
the ticket that will promise it, and the row goes when the promise lands.

**Assert the outcome, not the mechanism.** "Nothing is persisted and the work is
offered back as paused" survives a refactor; a function call re-sent with a changed
flag does not. Name user-visible copy only when the copy *is* the promise.

**AC ids are permanent** — numbered in order of appearance, never reused, never
renumbered. When an AC is deleted its number retires; leave the gap and mark it in
place with one italic line naming where the promise went. When a promise changes,
edit it and keep the id.

## Verification levels

Every AC carries one `- verify:` line naming one or more **layers**. Three layers are
ordered, and the order is global — the same word means the same thing in every
repository. The axis is not how much can break the promise; it is how much of the
system stands up around the code under test, and how that code is reached:

| Layer | The system around it | Reached by |
| --- | --- | --- |
| `unit` | one seam, no application | calling the export directly, its surroundings faked |
| `feature` | the application is assembled | programmatically, at one entry point |
| `e2e` | the whole thing runs | the way a consumer really reaches it — a browser, a real call |

**Pick the weakest layer that actually proves the promise** — the weakest one at which
the promise is observable at all. A promise about what stands on a screen is `e2e`
because that is the only layer where the surface exists. A library, where no
application stands up, has only `unit`, and that is not a deficiency. A promise proved
at two layers may name both, and then each needs its own claimant; do not reach for
that by default.

**A layer is never declared to make a `verify:` line legal.** The layers follow the
repo's test harness, not the other way round: `suites` in the config says which of the
ordered set this repository can actually run — the gate rejects any other name — and a
promise no declared layer proves is `manual` or `todo`. Two suites that list the same
tests are not two layers: every claim then arrives twice, and the gate refuses
whichever half the criterion does not name — unless they declare one `fileset`
between them, which says they are one rung's two **tiers**, mocked in the
pull-request gate and against the real stack nightly. Then the level answers one
question only: is this promise gated on the way in? A test only the nightly tier runs
proves the nightly level, and the gate names where the claim did arrive instead of
reporting the promise unproven.

Two levels stand outside the order, and are not a fourth and fifth rung below `unit`.
The layers answer how deep the system must stand; these answer whether the promise is
proven at all:

| Level | Means | Requires |
| --- | --- | --- |
| `manual` | automating it is impractical, or would only restate the implementation | `- reason:` on one line |
| `todo` | promised, not yet verified | `- ticket:` naming the ticket that closes the gap |

`manual` and `todo` stand alone — both are statements about the whole promise, so
combining either with a layer that proves it says two opposite things at once, and
the gate rejects it. **A skipped test does not count**: fix it, or drop the AC to
`todo` with the ticket that will un-skip it. Never write a proving layer for
something intended to be tested later.

**`manual` and `todo` are first-class, not failures.** They keep unverified
behaviour visible. Mislabelling an AC so the gate goes green, or deleting a promise
because it is hard to test, is how a spec quietly stops being the truth.

## Binding a test to an AC

Two halves. The **tag** is the machine pointer the gate binds; a **comment carrying
the AC's own heading** says in words which promise this test defends, so a test file
reads as a list of promises and a mistagged test becomes visible.

```ts
// AC-2 — An invalid workflow cannot be activated from the editor header
test('the Activate button is disabled and says how many settings to fix',
  { tag: '@spec:workflow-validation:AC-2' }, async ({ page }) => { … })
```

Where a runner has no tag support, the claim goes in the title instead:

```js
// AC-1 — Subtracting from a budget leaves the remainder queryable
test('the remaining budget reflects a subtraction [@spec:cost-center-budget:AC-1]', …)
```

In Go the title cannot hold one at all — `@` and `:` are not legal in an identifier —
so the claim is an attribute, and it goes first so a run that fails early still carries it:

```go
// AC-2 — A tenant named in the request body is refused on every write path
func TestMintRejectsABodySuppliedTenant(t *testing.T) {
	t.Attr("spec", "tenant-isolation:AC-2")
	…
}
```

- The **title** says what the behaviour is, in plain language. The tag is the
  pointer, never the description.
- One AC may be claimed by several tests. One test may claim several ACs — but if it
  needs three tags it is usually three tests.
- The tag's feature must match the spec filename, its AC must exist, and the AC must
  name the layer whose suite the test lives in. All three are checked.
- Copy the heading verbatim above the test — one line per claimed AC, above any other
  comment the test carries. Nothing enforces this, deliberately: a scan can prove a
  heading is present but not that it is the *right* one, which is the whole value. So
  it falls to whoever edits an AC to bring the heading along, and the tag is what makes
  them open the test in the first place.

**An AC asserting an absence needs a positive control and proof it can fail.** Which
runner reads claims from where, how a layer's suite is enumerated, and how to prove
a negative test red: [`references/test-layers.md`](references/test-layers.md).

**This skill says which promise a test has to defend, not how to write one.** For the
harness, fixtures, roles and locators, use whatever testing skill the repo's stack
brings — and follow the repo's existing scaffolding over anything invented here.

## When the gate fails

It reports in both directions — a promise with no claimant, or a claim resolving to no
promise. Read which one, then fix the side that is wrong. The message catalogue, and the
one rule that outranks every entry in it:
[`references/troubleshooting.md`](references/troubleshooting.md).

## Which promises changed between two refs

`npm run spec:check -- --since <ref>` reports which promises were added, changed, retired or
moved — the question a release note asks, and one a diff of `specs/` cannot answer.
It is a report, not a gate, and always exits 0. See
[`references/promise-diff.md`](references/promise-diff.md).

## Install, once per repository

The gate is repo-supplied, not part of this skill's runtime. Install it with
`node scripts/install.mjs <repo-root>`: it vendors `assets/spec-check.mjs`, writes a
`spec.config.json` naming the runners it found, seeds the spec directory and its
index, and wires the `spec:check` script. It creates no file that exists already,
and prints both what it wrote and what to review.

**Read the review lines — they are where the guessing is admitted.** Claims are read
from a runner's own listing, and only four shapes can be read: Playwright, a flat
`[{ name, file }]` array (vitest, and `node --test` through the bundled reporter),
PHPUnit's `--list-tests-xml`, and the `attr` events of `go test -json`. A repo on
jest, cypress or pytest is told that its layer needs declaring by hand rather than
handed a command that cannot run its tests. The two adapters that read a **run**
rather than a listing — node:test and Go — buy tag support at the price of one: a red
proof reports its promise as *unknown* rather than unproven, and a Go layer behind a
build tag can only be enumerated against a stack that is up, so that repository runs
the gate inside the job which brings the stack up rather than in one of its own. A suite whose toolchain lives only in a dev container names that `container`
and runs there; `--native` forces every listing onto the host, which is what CI
wants.

Afterwards the gate runs as `npm run spec:check` (or the repo's own runner). Flags go
through the script, so a mode needs the separator: `npm run spec:check -- --since
origin/main`.

**A gate nothing runs is a document.** Where the repo has a pipeline, the installer
writes the job as a file of its own — never as an edit to a pipeline somebody else
wrote — and the notes for editing it live in that file. It cannot do the last step:
**a job that exists can still be ignored, so make `spec-check` a required check
before merge**, or a red gate merges anyway.

**`spec.config.json` documents itself** — every key carries a `$comment_<key>`
beside it explaining what it does and what dropping it costs. Read the config, not
a schema; there is no second place to keep in sync. Without a gate the format rules
in this skill still hold, they are simply unenforced.
