# When the gate fails

Read which direction the failure comes from before fixing anything. Forward: a promise has
no proof. Backward: a proof points at no promise. The rule that outranks every entry below
— **never delete a tag, a test or a pair note to silence a message.** That turns a visible
gap into an invisible one, which is the state this format exists to prevent.

- [The binding](#the-binding)
- [Layers and verify](#layers-and-verify)
- [The written form](#the-written-form)
- [References between criteria](#references-between-criteria)
- [The index](#the-index)
- [The debt ratchet](#the-debt-ratchet)
- [The capability register](#the-capability-register)

## The binding

**"declares `verify: <layer>` but no `<layer>` test claims …"** — a promise was added or
changed. Write the test, or downgrade the level honestly to `todo` with a ticket.

**"claims @spec:…, but … has no AC-n"** — an id was renamed, renumbered or deleted while a
test still points at it. Restore the id, or update the test to the AC that replaced it. If
the behaviour is genuinely gone, delete the test *and* record the removal in the spec's
`## Tickets`.

**"claims @spec:…, but there is no `<feature>.md`"** — the spec was renamed or deleted.
Every tag carries the filename, so a rename is a retag.

**"every … test claiming … is skipped"** — the promise has a claimant but no proof. Un-skip
it, or say `todo` and name the ticket.

**"points at `X`, which does not resolve from `specs/`"** — a sibling spec is linked by
its bare filename (`other-feature.md`), the way a reader's click resolves it, never by a
path from the repo root. Both sibling links and the `docs:` companion are checked for
existence, so neither can rot in silence.

**"could not list a test suite"** — a listing failed, so coverage is unknown rather than
absent. Fix the suite first; every coverage message until then is unreliable. With a
node:test layer this also fires when a claiming test simply fails. Two variants worth
telling apart: **"failed in `<container>`"** means the dev stack is not up — start it, or
pass `--native` where the toolchain is installed on the host — and **"`adapter: "…"` is not
one of …"** means the config names a parser that does not exist, which is a config edit and
not a test failure.

**"it is only claimed from the `<other>` suite"** — the claim arrived, from the wrong tier.
Where the two suites share a `fileset` this is the `@real-only` case: the test never runs in
the gated tier, so either drop that filter or move the AC to the nightly level. Where they
do not, the test is in the wrong layer.

## Layers and verify

**"AC-n has unknown verify level `<layer>`"** — the vocabulary is `suites` in the config
plus `manual` and `todo`, and this repo does not declare that layer. Fix it on the spec's
side: name a layer this repo has, or say `manual` / `todo`. **Do not add the suite to make
the line legal** — with one runner in the repo the new suite ends up listing the same tests
as an existing one, every claim then arrives twice, and the backward check below refuses
each claim whose AC does not name that suite. Firing on every criterion at once is one
cause rather than many: `suites` is empty, so no proving level exists yet, and the message
says so when the map is.

**"claims … from the `<layer>` suite, but … declares `verify: <other>`"** — the level and
the suite disagree. Fix whichever is wrong; the layer names come from `suites` in the
config.

**"AC-n writes `verify:` above …"** — it goes last, under the promise it answers for. Only
`- reason:` and `- ticket:` may follow it.

**"names a level twice"** / **"combines `manual` or `todo` with a proving level"** — both are
statements about the whole promise, so either stands alone.

**"`## Tickets` must be the last section"** / **"`## Tickets` has an entry naming no
ticket"** — the section is always present and always last, one line per ticket. A line
there that names none is either prose that belongs in the intro or a ticket id that got
lost in an edit. Every bullet is read this way, not only `- ticket:` lines. Where a repo
records pull requests rather than tracker ids — `[#12](…/pull/12)` — the default
`ticketPattern` refuses that shape: widen the pattern to admit it, or drop the key and lose
ticket checking altogether. Worth deciding before the corpus grows.

**"names `- ticket: …`, which is not a ticket id"** — checked against `ticketPattern`. A link
whose text and href name different tickets is reported too.

## The written form

**"the first sentence names no subject in bold"** / **"opens on `…`, which is not in the
title"** — an intro opens by naming its subject, in words from the title. If the opening was
written to *arrive* at the subject, this is a rewrite: lead with the subject and let the
tension follow, then check the tension came with it.

**"frontmatter is missing `title:`"** — the key is case-sensitive, so `Title:` reads as
absent. It is required, because the opening sentence's subject is checked against it.

**"frontmatter says `title: …` and the heading says `# …`"** — a retitle moved one of the
two. Both are read, by different readers; decide which is current and make the other match.

**"`## Gaps` opens on a paragraph"** — drop it, or say it in the entry it is about. What the
section is, and that an entry waits on a decision, are what the heading and `**Undecided**`
already say.

**"`## Gaps` has a label line "…", which is not one of …"** — the three labels are the whole
set. Fix the spelling or pick the kind that fits. If the label was `**Elsewhere**`, the
entries belong in an `## Elsewhere` section above `## Gaps` — what another spec promises is
not a gap. Expect the ratchet to complain in the same run: an unrecognised label leaves its
entries unlabelled. **Move them rather than raising the figure.**

**"`## Elsewhere` comes after `## Gaps`"** — the boundary is read before the holes. Move the
whole section; nothing about its entries changes.

**"`## Elsewhere` entry … links no sibling spec"** — the link is the whole payload: the
section's value is that a reader may stop looking, and an entry pointing at nothing spends
exactly that. If nothing promises the subject, it is a gap — move it under a label, pointer
and all.

**"AC-n stands after AC-m — criteria keep numeric order"** — usually a retirement note
appended at the foot of the file. It belongs where the criterion stood.

**"names the implementation"** — a spec matched `implementationPattern`. Rewrite the sentence
in product language, or move it to the `docs/` companion. If the repo is on a stack the
pattern does not fit, widen the pattern in the config rather than the prose.

## References between criteria

**"AC-n pairs with `AC-m`, which this spec does not have"** — a pair note outlived the
criterion it names. Point it at the criterion that replaced it, or say in words what the
control is now. Do not delete the note: that separates the pair, which is the thing it exists
to prevent.

**"references `other.md` AC-n, which `other.md:NN` retired — it says: …"** — the promise moved
and this pointer stayed behind. The message quotes the retirement line, so the destination is
in the failure. If the sentence is *about* the retirement, it belongs in the retirement line
or in `## Tickets`, the two places this check does not read.

**"references AC-n of …, which has no such criterion and never retired one"** — a typo, a
renumbering left behind, or a cross-spec reference not written as `[other.md](other.md) AC-n`
and therefore read as this spec's own id.

**"writes a reference to `other.md` the wrong way round"** — `AC-1 of [other.md](other.md)` and
`[other.md](other.md)'s AC-1` both resolve against the wrong spec. The message carries the
rewrite.

## The index

**"does not list `<file>`"** — every spec belongs in the index as an entry of its own, opening
its row or bullet. A mention in prose, or inside another entry, does not count.

**"lists `<file>`, which does not exist"** — a spec was deleted or renamed and its row stayed
behind, leaving a broken link in the entry point of all places.

**"has no `## <indexRegister>` section"** — the config's `indexRegister` names the
section of the index where surfaces carrying no promise yet are recorded, and it is not
there. Rename the section back, or drop the key if this corpus keeps no register.

**"records a surface as unpromised and names PO-n, but X already lists PO-n in its `##
Tickets`"** — the work landed and the promise exists, so the register row outlived it.
Delete the row; the spec is now the record.

**"writes `<word>`, which `## <wordRegister>` retired in favour of `<word>`"** — the
index's words section settled this term and named the one it replaced, and the sweep
that should have gone with that decision missed this line. Replace the word, or take the
row out of the register because the decision changed. Code spans, fenced blocks and HTML
comments are exempt, so an identifier quoted from a payload never triggers it.

## The debt ratchet

**"N break the rule that … and the recorded debt is M"** — the figure in `formDebt` must equal
what the corpus actually contains, in both directions: adding a violation fails, and so does
fixing one without lowering the figure in the same change.

Three rules are held this way: a `## Gaps` entry under one of the three labels
(`unlabelledGaps`), a promise sentence of at most 25 words (`longPromises`), and a
`**Then**` or `**And**` stating one outcome (`compoundPromises`). The last two report
the criterion and the slot — `AC-4 **Then** (28 words)` — so the fix is always in one
bullet. For a compound promise it is nearly always the same fix: move the second outcome
into its own `**And**`.

**Where the figure is zero the corpus is fully migrated and the ratchet is an outright
gate** — fix the entry rather than raising the number. It stays a ratchet because a repo
adopting the gate starts with a corpus that predates the rule, and merging a branch written
against the old form raises it by a spec's worth at once.

What a ratchet cannot see is a **swap**: fix one violation and introduce another, and the
total is unchanged. It is a floor under new writing, not a guarantee about any one file.

## The capability register

Only where `register` is set in `spec.config.json`. The fields themselves are in
[`spec-anatomy.md`](spec-anatomy.md#the-registers-fields).

**"frontmatter is missing `since:`"** — on a corpus switching the register on, every spec
fires at once. Backfill each with the version it first shipped in: the manifest version of
the commit that added the spec if that commit raised it, otherwise the next higher one.
Not today's version for all of them — that dates every promise to the release that turned
the register on.

**"`since: …` is older than the first version that had specs"** — the backfill reached past
`floor`. Write `floor` as the `since:`; lower `floor` itself only if specs really existed
in that earlier version.

**"`since: …` is newer than the version this change ships"** — the spec was dated to the
coming release and the manifest was not raised yet. Raise `version` in the manifest in the
same change; the bump rule asks for that anyway.

**"is new since `<base>` and says `since: …`"** — a spec added in this change ships with the
manifest's version. Two causes besides a typo: the base raised the version while the branch
was open, so raise it again above the base and date the spec to that; or the spec is a
rename without `formerly:`, which the gate reads as a new feature — add
`formerly: [<old-id>]` and keep the old `since:`.

**"frontmatter is missing `visibility:`"** — there is no default on purpose. Decide who the
feature is for. When unsure, `internal` is the reversible choice: widening it later is a
version bump, while a public summary that was already read cannot be taken back.

**"is `visibility: internal` and carries a `summary:`"** — only the public register shows a
summary, so an internal spec carries none. It is usually what is left when a spec turned
internal: drop the line, and re-emit.

**"differs from its pin in `register.pinned`"** — a hand-set date was overwritten, most
often by a `--backfill-since` run from before the pin. Put the pin's value back. If the pin
itself is wrong, change it in `spec.config.json` together with its `reason`.

**"`register.pinned` names `<id>`, which is no spec"** / **"has no `reason`"** — a pin
follows its spec through a rename, and says why history is wrong for it.

**"is `visibility: public` and has no `summary:`"** / **"`summary:` runs to N words"** /
**"is more than one sentence"** — the summary is the one sentence an outside reader sees,
so write it for them rather than copying the intro, which opens on a bold subject and
carries the tension. `e.g.`, `i.e.`, `vs.` and `cf.` do not end a sentence; any other
abbreviation's full stop does — rephrase around it.

**"`formerly:` names `x`, which is a spec today"** — an alias may only name an id nobody
holds. If the old spec still exists, this is a split, not a rename: keep the old id on the
part that carries most of its promises, or retire it under `## Retired features` and name
both successors there.

**"`formerly: x` is also claimed by …"** — an old id leads to one feature. After a split,
name it in the successor a link to the old id should land on, and only there.

**"`features.json` … is stale, but only in `version`"** — the manifest's version was raised
and the file still carries the old one. Every version bump re-emits it: run
`npm run features` and commit the result with the bump. Console refuses a push whose
`features.json` names another version than the manifest.

**"`features.json` is missing"** / **"is stale"** — run `npm run features`
(`spec-check --emit`) and commit what it writes. Never edit the file by hand: the gate
compares it byte for byte with the emitted text. A merge conflict in it is resolved the
same way: take either side, then emit again. `--emit` writes nothing while other errors
stand (**"not written — the corpus has problems"**), so fix those first.

**"`version: …` is not above `<base>`'s …, but what the register shows changed"** — raise
the manifest's version. If the change felt like prose only, the features the message lists
say what reached the file: a title, `where:`, `docs:`, a criterion's heading,
`**Given**` / `**When**` / `**Then**` / `**And**`, its `verify:` layers, or a retirement
line. A changed `verify:` level counts, because the register shows how a promise is proven.

**"`<id>` was a feature at `<base>` and is gone"** — renamed: the new spec says
`formerly: [<id>]`. Removed: a row under `## Retired features` in the index, opening on the
id in code, not on a link — a link to the deleted file fails the index check
(**"lists `<file>`, which does not exist"**). The id has to open a list item; named in a
sentence, it records nothing.

**"`<id>` under `## Retired features` gives no reason"** — the row is
`` - `<id>` — <reason> ``. A link and a ticket alone are not a reason.

**"`<id>` is retired under `## Retired features`, but … still exists"** — either the spec
was not removed after all (drop the row) or its file is still there (delete it).

**"`<id>` has a second row under `## Retired features`"** — one row per id; merge them.
An item nested in a row, or an example in a fenced block, is not a row; an item nested under
a plain bullet (a year, a group) is. A fence closes only on its bare marker.

**"a fenced block under `## Retired features` is never closed"** — close it with its bare
marker (` ``` ` alone on the line); until then no row below it counts.

**"--backfill-since reads the whole history, and this clone is shallow"** — run
`git fetch --unshallow`, or `fetch-depth: 0` / `GIT_DEPTH: 0` in CI.

**"register.floor not written while specs are open"** — the settled specs would raise the
floor, and a listed spec whose date history cannot tell may be older. Settle the listed
specs by hand (`since:` each), then write `floor` yourself: the lowest `since:` of all
specs. Running `--backfill-since` again does not help, as it reads history only, never a
hand-set `since:`. A spec not shipped yet or new in this change never holds the floor
back, and a floor that only goes down is written anyway.

**"`--base`: no such commit"** — in CI, the checkout is shallow. Workflows installed from
1.4.0 on fetch the full history; an older one needs `fetch-depth: 0` (GitHub) or
`GIT_DEPTH: 0` (GitLab). Locally, the ref is mistyped or not fetched.

**"`register.manifest` names …, which could not be read"** / **"is not a plain x.y.z
version"** / **"names no `vendor` and `name`"** / **"`register.floor` is …"** — the config
or the manifest is wrong. Until the manifest is fixed, `features.json` is neither written
nor checked and the bump rule does not run; until `floor` is, no `since:` is checked
against it. The rest of the run is incomplete, not clean.

**"--emit writes the register file, and `register` … is not set"** — the repo has no
`register` key. Add it only if the platform lists this repo's features; `install.mjs`
offers it when a `manifest.json` names the repo an app.

**Notes, not failures.** A `· register:` line in the summary means a rule did not run. Each
is fine once and worth a look if it repeats:

- **"no base to compare against"** — locally, `origin/main` is not fetched. `git fetch
  origin main`, or pass `--base`.
- **"the base … is HEAD itself"** — the base is the checked-out commit, so only
  uncommitted edits are compared. Locally on `main` that is expected; in CI it follows a
  force-push to `main`, and the version-bump rule checked nothing: compare the pushed
  `features.json` with the one it replaced by hand.
- **"`<base>` has no `features.json` — the first one starts the register at …"** — expected
  on the change that switches the register on. That change raises the version: without a
  raise it fails (**"is not above …, and `<base>` has no `features.json`"**), because the
  platform never reads a version it has already approved again, so the file would never
  reach the register.
- **"carries a `features.json` that is not JSON"** / **"`manifest.json` has no x.y.z
  `version`"** — the base is broken, so the bump rule was skipped for this change. Check
  the version by hand.
