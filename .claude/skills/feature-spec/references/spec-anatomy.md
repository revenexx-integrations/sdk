# Spec anatomy

The written form in detail. `SKILL.md` carries the shape; this carries the rules that
decide the cases it does not show.

- [The annotated file](#the-annotated-file)
- [The filename and the title do different jobs](#the-filename-and-the-title-do-different-jobs)
- [The intro's two bold spans](#the-intros-two-bold-spans)
- [Where each kind of sentence goes](#where-each-kind-of-sentence-goes)
- [How a promise sentence is written](#how-a-promise-sentence-is-written)
- [Three kinds of gap, and the boundary beside them](#three-kinds-of-gap-and-the-boundary-beside-them)
- [Retiring an AC id](#retiring-an-ac-id)
- [Referring to another spec's criterion](#referring-to-another-specs-criterion)
- [Where a rejected alternative goes](#where-a-rejected-alternative-goes)
- [The index](#the-index)
- [The register's fields](#the-registers-fields)
- [Where the names come from, and where they are written down](#where-the-names-come-from-and-where-they-are-written-down)

## The annotated file

```markdown
---
feature: workflow-validation      # must equal the filename (without .md)
title: Workflow validation & the activation gate
where:                            # where in the PRODUCT, never a file path — checked for at least one entry
  - Workflow editor — header and the banner above the canvas
  - Workflows list — a row's actions menu
docs:                             # the "how" companions, optional
  - docs/workflow-validation.md
updated: 2026-07-25               # checked: a real date, YYYY-MM-DD, not in the future
---

# Workflow validation & the activation gate

<!-- Intro: no heading of its own. Two or three paragraphs, and the FIRST thing a
     reader who knows nothing about the feature sees. It OPENS by naming its subject
     in bold, the way an encyclopaedia entry does, and CLOSES on one bold line
     carrying the promise. Between those two, nothing is bold. In between: what the
     feature is for and which tension it resolves.
     Enforced: a missing or stub intro fails, and so does a first sentence whose
     bold span is absent or not in the title. -->

## Acceptance criteria

### AC-1 — One promise, stated as an outcome

- **Given** the situation the consumer is in
- **When** they do the thing
- **Then** the observable outcome — what they see, what is or isn't persisted
- **And** (optional) a further outcome of the SAME action, when one promise has two
  observable halves
- **Because** (optional) why it must hold — product reasoning, as long as that takes
  and no longer
- **Pair** (required when the promise is an absence) which criterion proves the
  positive half, and that both tests reach the element the same way
- verify: e2e

## Elsewhere

<!-- Optional, and it comes BEFORE `## Gaps`: it is the boundary of the spec, not a
     hole in it. One entry per subject this surface shows and another spec promises —
     bold what it is, then link the sibling. Checked: it must sit above `## Gaps`,
     and an entry with no sibling link is rejected. -->

- **The essential point in bold**, then which spec promises it.

## Gaps

<!-- Optional. Behaviour that belongs to this feature and is not promised here.
     Entries are grouped under one of three bold labels. The section opens on its
     first label, with NO paragraph in between — checked. -->

**Undecided**

- **The essential point in bold**, then the detail. One entry per gap.

## Tickets

<!-- Always the LAST section, always present. Every ticket that shaped this feature,
     oldest first, ONE line each on what it contributed. Narrative that has to
     survive is indented beneath its ticket, so the one-line scan holds.

     An entry records the OUTCOME, not the path to it. Course corrections inside one
     working session collapse into the state the entry leaves behind. A change weeks
     later gets its own entry, because by then the earlier state really did hold. -->

- [AB-123](https://tracker.example/AB-123) — original gate: inactive saves freely,
  active must be valid
- [AB-456](https://tracker.example/AB-456) — reversed AC-2: the warning is now a
  refusal
  - It first shipped as a warning, on the argument that the operator knows better.
    Two support reports later the opposite was decided. Kept because it is the only
    record of why AC-2 reads as it does.
```

## The filename and the title do different jobs

They name the same spec and they are allowed to disagree. Each has one reader:

| | Reader | Shape |
| --- | --- | --- |
| **Filename** | somebody scanning the directory or the index | a noun phrase naming the thing, `<entity>-<aspect>` where that groups usefully — `credential-create.md`, `run-detail.md` |
| **Title** | somebody who has opened the file | the thing, as a person would say it — `Adding a credential`, `One run's record` |

So `credential-detail.md` opening on "Opening a credential" is not a defect. Aligning
them would cost whichever half is doing its job.

**The filename is the feature id**, so it is the expensive one — every tag carries it
and a rename touches all of them. Two things to get right first time:

- **It never names a component.** In prose the ban is checked; in a filename nothing
  checks it, and a filename outlives the prose. Ask what the product calls the
  surface, not what the directory does.
- **It is not a rename waiting to happen.** Where filename and title disagree about
  the *word* rather than the grammar — one says what the code calls it, the other
  what the product calls it — the filename is the one that is wrong.

**A title says the thing, and at most its scope. Never its thesis.** The half after a
dash earns its keep when it says what the spec *covers* — which two things, which of
several surfaces. It does not when it states what the spec *argues*: that is the
intro's closing bold line, and a thesis in the title is the same sentence a fourth
time after the index entry, the title and the opening. `title:` and the `# H1` must
say the same thing, and that is checked.

**A title that runs to three clauses is an abstract.** Cut it to the thing; the intro
sits directly underneath and has as much room as it needs.

One narrow exception: a short second half naming the *axis* the spec turns on rather
than summarising its conclusion — `Setting up a schedule — picked, not written`. The
test is whether it contrasts or restates.

## The intro's two bold spans

| Where | What | Job |
| --- | --- | --- |
| First sentence | the **subject**, taken from the title | tells a reader who landed here what this is about |
| Closing line | the **promise** | tells them what it would cost to break |

**Nothing else in an intro is bold.** Emphasising a term competes with both anchors
for the same signal, and a reader hunting the promise among six bold fragments has
lost the affordance the bold was for. Italics carry a term perfectly well. Unbolded
prose may follow the closing line — the promise is the last *bold* thing, not the
last text.

**The closing line names the one promise the surface would lose most by breaking**,
short enough to take in at a glance. It is not an index of the acceptance criteria:
that reading has no stopping rule, and a line that runs to a paragraph's length is a
paragraph in bold. Coverage is what the criteria list is for. A promise that will not
fit is a signal that the surface holds a second goal — split along it — not a licence
to write longer.

Where an intro was built to *arrive* at its subject, leading with the subject is a
rewrite rather than an insertion. Two things get lost in that move if nobody watches:
the tension, which has to be restated rather than cut, and the truth of the
replacement sentences. **Every sentence that survives maps to an AC or is plain
rationale for one** — a claim invented while rewriting an intro is the one defect no
gate can see.

## Where each kind of sentence goes

| Slot | Holds | Aimed at |
| --- | --- | --- |
| `**Given**` / `**When**` / `**Then**` | the promise itself | everyone |
| `**And**` | a further outcome of the same action | everyone |
| `**Because**` | why the promise must hold | whoever reads the promise |
| `**Pair**` | which criterion is its positive control | whoever maintains its test |
| `verify:` | whether this promise is proven, and how | anyone deciding whether to trust it |

**That table is the whole vocabulary of a criterion body**, and the gate holds it:
those bullets, the `verify:` line, and the two that say something about it —
`reason:` and `ticket:`. Nothing else. Not an unlabelled bullet, not a bullet under a
label the table does not list, not a loose paragraph. A label is **one word**, and
the sentence follows it: `- **Given** a cost centre with a budget`, never
`- **Given a cost centre** with a budget`. What the rule deliberately allows, because
a gate that refuses a correct document is worse than no gate:

- A bullet **wraps** onto further lines, which is the norm — and it may carry a
  further **indented** paragraph after a blank line. A paragraph at column 0 after a
  blank line is inside nothing, and that is the shape the rule refuses.
- A **nested** bullet is part of the bullet above it, whatever it opens on — and its
  text is read as part of that bullet, so changing it changes the promise. Only a
  bullet at the criterion's own indentation has to carry a label from the table, and
  only that one is read as the criterion's own — a `verify:` nested under a promise
  says something about that bullet and states no level.
- A **fenced block** is content, not structure, wherever it stands: a `- foo` line
  inside one is not a bullet, a `- verify:` line inside one states no level, and
  either fence marker counts, backticks or tildes. Its own indentation says whose it
  is — indented under a bullet it is that bullet's content, so changing it changes
  the promise; at the criterion's own edge it belongs to the criterion and ends the
  bullet above it, exactly as a paragraph there does.
- An **HTML comment** is not the body's text. It says something to whoever edits the
  file and nothing to whoever reads the promise, so it is neither refused nor read —
  the same exemption the settled-words sweep gives one.
- A **retirement notice** sits between two criteria rather than inside one, so it is
  where a criterion body ends — see [Retiring an AC id](#retiring-an-ac-id).

One bullet does not wrap: **`verify:`**, whose value is read off a single line. A
sentence written under it continues nothing, with or without a blank line between.
`reason:` and `ticket:` are prose and wrap like any other bullet, and they may be
**indented under the `verify:` line** as readily as written beside it — they say
something about that line, so nesting them under it is agreeing with the format.
`verify:` itself is read at the body's edge alone: one nested under a promise says
something about that bullet and states no level. A **numbered item**
wraps nothing either — Markdown starts a new list at `1.`, so the item is a line of
its own and the format has no place for one: name the part instead of counting it.

**The promise bullets stand at the body's own left edge**, alongside `verify:` and
not deeper than it. The edge is what "nested" means here, so a criterion that indents
its `**Given**` / `**When**` / `**Then**` under a `verify:` line at the margin has
written its whole promise inside something else: the gate reads no promise there, and
a criterion with none is refused rather than passed in silence.

A sentence the rule refuses is usually in the wrong section rather than the wrong
shape: one about a neighbouring spec belongs in `## Elsewhere`, one about something
nobody has decided in `## Gaps`, and one about why the promise must hold in
`**Because**` — which is the next rule.

**`**Because**` is product reasoning and nothing else.** A pair note goes to
`**Pair**`. An explanation of the *machinery* — requests in flight, caches, fan-out,
merge order — goes to the `docs/` companion and is linked from the frontmatter.

**As long as it needs to be, and not one line longer. There is no number**, on
purpose: a stated length reads as a length to reach, so a one-line reason grows a
second and a third that restate it, and a reason cut to fit a figure spends the only
thing the bullet is for. What actually makes a `**Because**` long is usually content
in the wrong slot — check that the pair note went to `**Pair**` and the machinery to
`docs/` before adding lines.

## How a promise sentence is written

The rules below are the promise slots' own, and they stop at the slot: the intro,
`**Because**` and `## Gaps` are prose and are governed by nothing here. Three of them
come from ASD-STE100, the controlled English the aerospace industry wrote so a
maintenance instruction could not be read two ways — a spec has the same reader problem
and one more, because a promise is also a test's brief.

**One promise per sentence, and the slot for the second one already exists.** A
`**Then**` stating two outcomes is two promises wearing one tag: the test that claims it
proves whichever half its author had in mind, and no reader can tell which. Split at the
join, and the second outcome becomes its own `**And**` — the slot exists for exactly
this. The join is almost always a semicolon or a comma before "and", and those are the
two shapes the gate counts — a semicolon inside a code span excepted, which is a
payload's punctuation and not the sentence's. A noun list joined on "and" alone ("the
budget and the buyer's limit") is one promise and is never reported. An Oxford list
("the amount, the date, and the state") *is* reported, and that is a known false
positive rather than a rule: separating it from a genuine three-clause promise needs a
parser, and the count is a ratchet, where being told to split a promise that did not
need it costs an `**And**` and being told nothing costs the rule.

**At most 25 words in a promise sentence** — `**Given**`, `**When**`, `**Then**` and
`**And**` alike. Not a style figure: past roughly that length a promise has stopped
being one sentence, and what pushed it over is nearly always a second promise, a reason
that belongs in `**Because**`, or machinery that belongs in `docs/`. Check those three
before rewording. Unlike `**Because**`, where a stated length would invite padding to
reach it, a promise has a natural size and the number names it.

What is counted is the sentence. A promise wrapped over three lines is one sentence and
is measured as one; a nested bullet beneath it is the detail of that single outcome and
is not measured at all — its own wrapped lines no more than its first — and neither is
a further paragraph the bullet carries after a blank line, nor a fenced block beneath
it: the sentence ended where the detail began. Both are still read as part of the
promise, so changing either is a promise change the `--since` report names. So the
criterion below promises nine words, not thirty-three,
and enumerating the columns beneath it costs nothing against either count:

```markdown
- **Then** the list shows one row per request line
  - the amount, in the currency the line was raised in
  - the date the line was raised
  - the state the line is in
```

**Present tense, and a hedge is content.** A spec says what happens, not what will
happen or what has happened. The exception runs the other way and matters more: "the
answer says the announcement is still owed" and "the announcement was not written" are
different promises, and a shorter sentence that promotes a hedge to a fact has not been
simplified — it has been changed. Never trade "may", "still" or "at most" for length.

**Active where the actor is a consumer or a named surface; passive everywhere else, and
that is correct.** This is where a spec parts company with ordinary plain-language
advice. Naming the actor is the standard fix for a passive sentence, and here the actor
of most promises is the application itself — which a spec never names. "The outcome is
recorded" is right; "the workflow service records the outcome" buys grammar with the one
thing this format bans. Use the active voice where the actor is the consumer, an
administrator, another product, or a surface the register holds; leave the rest passive.
Nothing counts this, for the same reason.

**One word, one meaning.** Two words for one action cost every reader a translation and
every author a decision, so the corpus settles one and the index records it — including
the words it replaced, which is what lets the gate sweep for the loser. See
[the words register](#where-the-names-come-from-and-where-they-are-written-down).

**The two counted rules are ratchets, not gates.** `formDebt.longPromises` and
`formDebt.compoundPromises` hold what the corpus contains today; new writing follows the
form and each touched spec pays down its share. A corpus adopting them starts at
whatever `spec:check` reports and works down, exactly as the gap labels did.

**And the limit of all of them: form is not substance.** A promise nobody confirmed is
still an invention after it has been split in two, shortened to 19 words and put in the
present tense — a clean, short, well-punctuated invention. These rules make a true
promise easier to read and a false one no less false.

## Three kinds of gap, and the boundary beside them

| Label | Means | What it is waiting for |
| --- | --- | --- |
| `**Undecided**` | nobody has confirmed what the behaviour should be | a decision |
| `**Known**` | a shortfall somebody decided to live with — the product would behave differently if it were as it should be | nothing — name the ticket if one exists |
| `**Unreachable**` | the promise is agreed; the harness cannot reach it today | test-harness work |

Only the kinds a spec actually has get a label. Order them as above so two specs read
the same way. The set is closed: a fourth kind belongs in this table before it belongs
in a spec. `Undecided` is the default and the honest one.

**A decision is not a gap, and `**Known**` is where decisions go to hide.** "We chose
not to warn", "the platform owns how long it is kept", "colours are not promised" all
read as limitations somebody lives with, and none of them is one: nothing falls short.
One question sorts them — **would the entry still be true of a perfect product?** If
it would, it is not a gap, and it goes where the format keeps that kind of statement:

| The entry records | Where it goes |
| --- | --- |
| a behaviour the product has on purpose — including something it deliberately does not offer, where offering it would be a regression | a criterion, with its test |
| something deliberately not promised because another layer owns it | the intro, one sentence naming the owner — or the sentence of the criterion it qualifies |
| something deliberately not promised because it is appearance or layout | the index's *how a spec is cut here*, once for the corpus |
| a promise another spec makes | `## Elsewhere` |
| a request that was declined | `## Tickets`, under that ticket (`## Where a rejected alternative goes`) |

What stays under `**Known**` is what a later ticket could fix: a control that cannot be
reached, a list that stops short, a name that says the wrong thing. A decision filed
there has no test holding it, and a reader scanning for what is broken reads it as
broken.

**A bold line, not a heading and not an inline lead-in.** Inside `## Gaps` a line that
is nothing but bold text is reserved for these three, which is how the gate tells a
label from prose — so a standalone bold sentence like `**Everything below waits on
PO-231.**` is read as a label and reported. Write it as part of the entry it belongs
to. Anywhere else in a spec, a bold line is just a bold line.

**`## Gaps` is what this spec does not promise; `## Elsewhere` is what another one
does.** What another spec promises is not a gap — it goes in `## Elsewhere`, above
`## Gaps`, and an entry there must link the sibling, because the section's whole value
is that a reader may stop looking.

**An entry that has to admit nothing promises the subject belongs in `## Gaps`**, with
its pointer inside the entry. This is the failure `## Elsewhere` attracts, and it is
worse than an ordinary gap: "the keyboard route is an open inventory in
`canvas-keyboard-shortcuts.md`" reads at a glance as *covered*, so the reader stops
looking at the one moment they should carry on. The test is one question: would a
reader following the link find a promise?

**`## Gaps` opens on its first label or entry — never on a paragraph.** What the
section is, and that an entry waits on a decision, are what the heading and
`**Undecided**` already say. Content that reads as an intro — that an existing AC
covers part of a gap, that everything below waits on one ticket — goes in the entry it
is about, where it travels with that entry.

## Retiring an AC id

An AC's number retires with it. **Mark the gap where it stood, in one italic line the
reader can see** — not at the foot of the file, and not as a heading (`### AC-1 —
retired` is an AC to the gate and would be asked for its `verify:` line):

```markdown
*AC-1 retired — what a card says is now template-card.md AC-1 and AC-2 (PO-243).*
```

Criteria keep numeric order and a retirement note keeps its place in it, so a reader
scanning for AC-5 finds its note between AC-4 and AC-6. That much is checked. Only the
leading id is read, so the note is free to say where the promise *went* without that
destination being taken for this spec's numbering — but the destination is checked like
any other reference, because that address is the one string the failure hands over.

## Referring to another spec's criterion

Write it `[other.md](other.md) AC-n`, and that form is checked. Ids following such a
link belong to it, including a run joined by "and", a comma, or a range. **The two
backwards orders are refused by name** — `AC-1 of [other.md](other.md)` and
`[other.md](other.md)'s AC-1` — because in either order the id resolves against the
wrong spec, and silently where this spec happens to own that number.

A reference to a criterion that no longer exists fails the gate wherever it stands,
resolved over whole bullets and paragraphs rather than single lines. Three exemptions:
the retirement line itself, `## Tickets` — both statements *about* an absence rather
than references to it — and a `**Pair**` bullet, which has its own looser resolution.

## Where a rejected alternative goes

A promise usually had competition. None of it is a promise, and the reason it stays
out is the reason code stays out: **nothing tests a rejected alternative, so the gate
cannot hold it** — it becomes the one part of a spec that goes stale without anything
going red. None of these homes is a new `##` section:

| The alternative is | Where it goes |
| --- | --- |
| a **trade-off with a route back** — a live cost someone may want to revisit | the `docs/` companion, named in one intro sentence that links it |
| a **discarded iteration** — built or mocked, and worse | the `docs/` companion, its own section or a `<details>` |
| **floated and never built** — the ticket asked, the answer was no | `## Tickets`, indented under that ticket |
| **still open** — nobody has decided | `## Gaps` under `**Undecided**` |

The last row is why this is not "keep alternatives out of specs": an alternative
nobody has ruled on is a decision the spec owes its reader.

**So write the intro in the present, and lead with the promise.** A rejected
alternative arrives in the past tense, and the past tense is the tell. Ask what the
old state is still doing: a **timeless argument in past-tense clothing** gets rewritten
in the present; a promise **about surviving the old state** — legacy data, a setting no
longer offered that still has to keep saving — keeps it, because there the past *is*
the subject; **neither** means it belongs in a row above.

Cutting the before-state can leave a dangling "what changed is …" further down, and can
take the *tension* with it — the tension usually restates in the present without the
history, and if it does not, it was the history.

## The index

The spec directory's `README.md` is how anyone finds a spec at all, and it is checked:
every spec appears as an entry **opening its own bullet or table row** (a mention in
prose, or inside another entry, does not count), every `.md` link resolves, and ticket
links get the same reading as in a spec.

**The inventory is identified negatively, so the sections around it have to be named.**
The gate reads the index as everything except the register (`indexRegister`) and the
four sections `indexAsides` names — because a corpus of any size groups its inventory
under headings of its own and adds to them, so naming the inventory positively would go
stale on the next group and take the check with it. Rename one of those headings and the
list in the config comes along, or that section is read as inventory again.

**Outside the inventory, an entry opens on bold text or a name — never on a link.** It
is the same rule as the config's, held by the writing instead: a bullet under *how a
spec is cut here* that opens with a link to a spec, or a register row whose first cell
is that link, would count as that spec's inventory entry and let the real row be deleted
with nothing going red. Bold the point and put the link inside the sentence; in the
register, the name goes in the first column and the spec in a later one. Both corpora
already write them this way, which is why the hole stayed shut before anything watched
it — and it is what still holds if the config drifts.

It is one file and several readings, and `SKILL.md` names the six sections and when
each of them starts. The inventory answers "where is the spec for this?" — sections
*inside* it earn their keep from the second surface onwards. The register named by
`indexRegister` answers "what has no spec?", and its rows name the ticket that will
promise each surface; that is where item 4 of the granularity list is recorded, and it
is what turns the index from a list of what exists into the map of what is and is not
promised. The two vocabulary sections answer "what is this called?" and have a section
of their own below.

**What *how a spec is cut here* holds is the reasoning, not the outcome.** The outcome
is already visible — the files are right there, and "the add-a-secret form lives in
`secrets.md`" is a fact the directory states better. An entry says which item of the
granularity list the call was, and what the other choice would have cost: *"the
add-a-secret form is part of `secrets.md`, not a surface of its own — it exists only to
put a row in the list behind it and holds no state the operator returns to. Not because
it is small: size alone never splits or merges a spec."* Written that way it answers the
next author before they reopen the argument, and it says which reasoning would have to
change for the call to change.

**Directories are the documented way out, and worth it somewhere past two dozen specs
— not before.** They cost the gate's flatness rule, the tag grammar, every existing
tag, the run hints that grep for them, and sibling-link resolution. Pay that once and
deliberately, or not at all.

## The register's fields

Only where `register` is set in `spec.config.json`; a repository without the key is
asked for none of this.

| Field | Holds |
| --- | --- |
| `since:` | the first version that shipped these promises, `x.y.z` — never below the config's `floor`, never above the manifest's version. A spec new in a change carries the version that change ships |
| `visibility:` | `public` or `internal`, with no default: either default would decide for the author who reads the spec. Internal specs, and every criterion of every spec, reach internal readers only |
| `summary:` | one sentence of at most 25 words, for a reader outside the company; required when public, and refused on an internal spec. It is the only sentence the public register shows, so it is written for that reader and not lifted from the intro |
| `formerly:` | the ids a renamed spec carried before, so a link or a learned mapping to the old id still lands |

**`visibility:` follows the reader who would notice.** `public` when a merchant or an
integrator notices the capability in the product or uses it deliberately. `internal` for
test tooling (backdating, say), for platform wiring between apps (events, vocabularies,
service entry, principal resolution), and for operational mechanics that have no user
action of their own (budgets, recompute). When in doubt, `internal`, with a line in the
PR body: making a spec public later is a patch bump, and taking a public one back is not
quiet.

**`since:` of a spec written before the rule** is the version it first shipped in, and
never earlier than `floor` — the first version that shipped specs at all. Earlier
availability was not recorded, and the register says so rather than guessing.
`spec-check --backfill-since` writes both from git history, read along the deployed line
— `origin/main`'s first parents, or HEAD's without `origin/main` — so it dates a spec
the same on `main` and on a branch that merged `main` in: the first release on that line
that contains the spec, where it landed if that commit raised the version, else the next
one that did. A version only a branch carried never counts, and a merge does not date a
spec to the release its other side shipped. The floor is the lowest of them. Renames are
followed, copies are not. Two kinds of spec are listed, left alone, and make the run
exit 1. One history cannot date — added twice, brought in by a merge, or behind a
release candidate whose parent has no readable version — may be older than every settled
one, so while one is listed the floor is only lowered, never raised. One not committed
or not shipped yet ships above HEAD's version and does not hold the floor back. A
shallow clone is refused. Whether a version was ever deployed is not in git, and neither
is whether a spec's file is older than its promise: read the list of written values
before committing them, and where history is wrong, pin the right date in
`register.pinned` — `{ "<feature>": { "since": "x.y.z", "reason": "…" } }`. The backfill
writes a pin instead of history, and `spec:check` fails a `since:` that differs from its
pin, so a later run cannot put the script's value back. A pin names an existing spec and
says why.

**What reaches `features.json` is what the register shows**: the fields above, `title`,
`where`, and each criterion's heading, its `**Given**` / `**When**` / `**Then**`
/ `**And**` and its layers — a retired one as its retirement line and the criteria it
names. Nothing else does, which is why the file measures the bump rule: an edit that
leaves it unchanged needs no release, and one that changes it needs one. `docs:` stays
out: its paths mean nothing outside the repository, and renaming a doc page is not a
release. The file also carries the manifest's `version`, so a version bump re-emits it.

**A spec that goes away** leaves the register, and whatever pointed at it has to be
told where. Renamed, the new spec says `formerly: [<old-id>]`. Removed, the index
records it under `## Retired features` — one row per id, the reason, and the spec
that carries its promises now, if any:

```markdown
## Retired features

- `list-to-order` — no order is placed from a list any more; the list becomes a cart,
  [list-to-cart.md](list-to-cart.md) (RAD-145)
```

The row opens on the id in code, not on a link: the spec it names no longer exists,
and the section is read as an aside rather than as inventory. After the id come a dash
and the reason, which is required; links to successor specs and the ticket are
optional. The gate reads rows only — an id named in a sentence of that section does not
record anything — and fails a row without a reason, a row for a spec that still exists,
and a second row for the same id. Rows stay after the release that retired the spec.

## Where the names come from, and where they are written down

Two vocabularies earn their place in the spec directory's `README.md`, and they divide
by **source**.

| | Holds | Comes from |
| --- | --- | --- |
| **The surface register** | one row per name a consumer reaches a promise by, and which spec promises it | the product settled it — it is only looked up |
| **The words** | the terms the product leaves open: the roles, a thing named differently at two points of its life | we settled it — arguable, changed by agreement |

**Use them before writing anything that names a surface** — a spec, a ticket, a pull
request, a commit body. A surface is named once, and every text about it uses that name;
the register is what makes that possible without anybody having to remember.

**Neither is the register named by `indexRegister`, and the boundary is stated here so
that no corpus has to argue it again.** Three sections of one file record three
different things: what carries no promise yet (`indexRegister`), what a thing is called
where the product decided (the surface register), and what a thing is called where
nobody did (the words). The difference is not tone, it is who can change the entry — a
name in the register changes when the product's copy changes and never otherwise, a
word in the words section changes by agreement between two authors. So extend the
register when a reader could point at the thing, and the words when two authors could
reasonably write two of them.

**The register's entry is whatever a consumer is actually holding when they come
looking**, which follows the product and not this format:

| The product is | The entry | Why |
| --- | --- | --- |
| translated | the message key | the catalogues already hold every language, so the key yields all of them and none can drift from what is drawn — a column per language is one more copy to keep true, and the first to rot |
| a UI in one language | the copy it ships | there is one string, and it is the one on the screen |
| a library, or an API | the exported name, or the route | there is no screen: a consumer reaches a promise by importing a name and calling it, so the name *is* the address |

**No column describes the surface.** A description beside the name is a second copy of
the spec's own opening sentence, and the copy is the one that rots; the link to the spec
is what the row is for. The other columns are the corpus's own call — how a reader
reaches it earns one where a surface can be reached two ways, and earns nothing where
the name is already the address.

**One row per name, not per surface.** A surface may own several names — three ways to
read an answer, five credential base classes — and whoever looks one up has only the
name in their hand. The reverse happens too: one name can carry three specs, and then
its row links all three, because none of them is the whole of what that name promises.

**A surface the product does not name is recorded beside the register, not in it.**
Every row in the table is a name to cite; a surface with no name has none, so it goes in
a short list under the register instead — the ones named after their content (a node's
configuration, `Run #123`), and the ones named by nothing at all. Each is a small
question rather than a defect: a name is worth adding only where a reader has to refer
to the thing. Recorded all the same, because otherwise the description that turns up in
a ticket reads as sloppiness rather than as the symptom it is — there was nothing to
look up.

**A words entry records the word that lost, and that is what makes the sweep
checkable.** Settling a word obliges replacing the loser everywhere it stands, in the
same change — and while the entry held only the winner, nothing could see a word that
drifted back, because a drifted term breaks no promise and every file stays green. So
the entry names both: the word that won opens it in bold, the words it replaced follow
the marker `Not:` to the end of that sentence, and each of them is then an error
wherever it still stands, in a spec or in the index.

```markdown
- **cost centre** — the money a request line is booked against. Not: *cost center*,
  *costcentre*.
- **approver** — whoever a request is waiting for. Not: *reviewer*.
```

The marker is what the gate reads (`wordRegister` in the config names the section), and
an entry without it is prose: a word this corpus simply uses, settled against nothing,
costs no row and is reported nowhere. Code spans, fenced blocks, HTML comments,
filenames, paths and link targets are swept over — an identifier in a payload is not
this corpus's vocabulary, and neither is the *reviewer* inside `reviewer-assignment.md`,
where the only repair would be a rename reaching every `@spec:` tag that names the
feature. The same exemptions hold where the register is READ: the worked example above
would otherwise retire *cost center* across any repository that copied it. A row therefore
arrives with its own sweep already done, which is why this one is an outright error and
not a `formDebt` ratchet like the promise-sentence counts: on the day the row is
written, the count it could ratchet is zero.

**A word a sibling corpus already settled is borrowed, and cited as borrowed.** Two
spec corpora in one product family share their roles and most of their nouns, and
deciding one of them twice produces the two truths this section exists to prevent, one
repository apart. Name where the entry came from, so the next author knows which end to
change — and where the sibling's product draws the line, that line wins over an argument
made here.

Kept in the index they need nothing declared. In a file of their own they are prose
rather than specs, so name that file in `companions` or the gate reports it as a spec
missing its frontmatter.
