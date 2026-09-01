# Spec anatomy

The written form in detail. `SKILL.md` carries the shape; this carries the rules that
decide the cases it does not show.

- [The annotated file](#the-annotated-file)
- [The filename and the title do different jobs](#the-filename-and-the-title-do-different-jobs)
- [The intro's two bold spans](#the-intros-two-bold-spans)
- [Where each kind of sentence goes](#where-each-kind-of-sentence-goes)
- [Three kinds of gap, and the boundary beside them](#three-kinds-of-gap-and-the-boundary-beside-them)
- [Retiring an AC id](#retiring-an-ac-id)
- [Referring to another spec's criterion](#referring-to-another-specs-criterion)
- [Where a rejected alternative goes](#where-a-rejected-alternative-goes)
- [The index](#the-index)
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

**`**Because**` is product reasoning and nothing else.** A pair note goes to
`**Pair**`. An explanation of the *machinery* — requests in flight, caches, fan-out,
merge order — goes to the `docs/` companion and is linked from the frontmatter.

**As long as it needs to be, and not one line longer. There is no number**, on
purpose: a stated length reads as a length to reach, so a one-line reason grows a
second and a third that restate it, and a reason cut to fit a figure spends the only
thing the bullet is for. What actually makes a `**Because**` long is usually content
in the wrong slot — check that the pair note went to `**Pair**` and the machinery to
`docs/` before adding lines.

## Three kinds of gap, and the boundary beside them

| Label | Means | What it is waiting for |
| --- | --- | --- |
| `**Undecided**` | nobody has confirmed what the behaviour should be | a decision |
| `**Known**` | a limitation somebody decided to live with | nothing — name the ticket if one exists |
| `**Unreachable**` | the promise is agreed; the harness cannot reach it today | test-harness work |

Only the kinds a spec actually has get a label. Order them as above so two specs read
the same way. The set is closed: a fourth kind belongs in this table before it belongs
in a spec. `Undecided` is the default and the honest one.

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

It is one file and two readings. The inventory answers "where is the spec for this?".
The register — the section named by `indexRegister` — answers "what has no spec?", and
its rows name the ticket that will promise each surface. That is where item 4 of the
granularity list is recorded, so the index stops being a list of what exists and
becomes the map of what is and is not promised. Sections inside the inventory earn
their keep from the second surface onwards.

**Directories are the documented way out, and worth it somewhere past two dozen specs
— not before.** They cost the gate's flatness rule, the tag grammar, every existing
tag, the run hints that grep for them, and sibling-link resolution. Pay that once and
deliberately, or not at all.

## Where the names come from, and where they are written down

Two vocabularies earn their place in the spec directory's `README.md`, and they divide
by **source**. Neither is the register named by `indexRegister` above: that one records
surfaces carrying no promise yet, while these record what things are *called*.

| | Holds | Comes from |
| --- | --- | --- |
| **The surface register** | one row per surface: what it is called, how a reader reaches it, which spec promises it | the product settled it — it is only looked up |
| **The words** | the terms the product leaves open: roles, a thing named differently at two points of its life | we settled it — arguable, changed by agreement |

**In a translated product the register's entry is the message key, not the word.** The
catalogues already hold every language, so the key yields all of them and none can
drift from what is drawn; a written-out column per language is one more copy to keep
true, and the first to rot.

**Use, extend, create — in that order.** Use it before writing a spec, a ticket or a
pull request. Extend it when a spec promises a surface the register does not list yet.
Create it when descriptions start repeating — three texts calling one thing three ways
is the signal, and before that a register is furniture nobody reads.

Kept in the index they need nothing declared. In a file of their own they are prose
rather than specs, so name that file in `companions` or the gate reports it as a spec
missing its frontmatter.
