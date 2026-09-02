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

## The debt ratchet

**"N break the rule that … and the recorded debt is M"** — the figure in `formDebt` must equal
what the corpus actually contains, in both directions: adding a violation fails, and so does
fixing one without lowering the figure in the same change.

**Where the figure is zero the corpus is fully migrated and the ratchet is an outright
gate** — fix the entry rather than raising the number. It stays a ratchet because a repo
adopting the gate starts with a corpus that predates the rule, and merging a branch written
against the old form raises it by a spec's worth at once.

What a ratchet cannot see is a **swap**: fix one violation and introduce another, and the
total is unchanged. It is a floor under new writing, not a guarantee about any one file.
