---
feature: localized-text
title: Reducing a label to the one word that gets drawn
where:
  - normalizeLocalized — how any user-visible text a package declares becomes one string
updated: 2026-09-01
---

# Reducing a label to the one word that gets drawn

**Reducing a label to the one word that gets drawn** is what has to happen between a
package and every surface that shows its text. A node author may write a label as a
plain string or as one string per language, and both are legal everywhere text is
declared — a node's name, a port's label, a config field's help. Whoever draws it has
no such choice: a palette entry, a column heading and a rendered page each need exactly
one string.

The awkward part is not the translation, it is what to do when the language asked for
is not among the ones written. Falling back to nothing leaves an unnamed entry that
cannot be searched for or clicked with confidence; falling back to the key leaves a
reader looking at an identifier. Both are worse than showing the label in a language
the reader did not ask for, which is the choice made here.

**A declared label always reduces to something, or to nothing — never to a blank that
looks like something.**

## Acceptance criteria

### AC-1 — A label written as one string arrives as that string, trimmed

- **Given** text declared as a plain string with surrounding whitespace
- **When** it is reduced
- **Then** the trimmed string comes back
- **Because** the padding is invisible where it was written and visible where it is
  drawn, in alignment and in anything that compares two labels
- verify: unit

### AC-2 — A label written per language yields the one asked for

- **Given** text declared as one string per language
- **When** it is reduced, with or without a language named
- **Then** the named language is used, and a default one when none was named
- verify: unit

### AC-3 — A language that was not written falls back to one that was

- **Given** a label written in languages that do not include the one asked for
- **When** it is reduced
- **Then** the first language carrying text is used rather than nothing
- **Because** a reader shown a label in the wrong language can still act on it; a reader
  shown nothing cannot, and the entry becomes unreachable rather than untranslated
- verify: unit

### AC-4 — A language present but blank is passed over

- **Given** a label whose entry for one language is empty or only spaces
- **When** it is reduced
- **Then** that entry is skipped and the next one carrying text is used
- **Because** a blank entry is the normal state of a half-finished translation, and
  treating it as an answer makes the fallback in AC-3 unreachable exactly when it is
  needed
- **Pair** AC-2, the same reduction where the entry has text
- verify: unit

### AC-5 — Nothing to show reduces to nothing, not to a blank

- **Given** text that is absent, empty, only spaces, or a map with no usable entry
- **When** it is reduced
- **Then** nothing comes back
- **Because** the caller has to be able to tell "no label was declared" from "a label
  was declared and is empty" — the first has a sensible fallback and the second does not
- **Pair** AC-1
- verify: unit

## Gaps

**Known**

- **Which language is asked for is never decided here.** The caller names it, so nothing
  in this package promises that two surfaces showing the same node agree on a language.
- **The fallback order is the order the languages were written in.** That is the author's
  declaration order rather than any ranking of languages, so which one a reader gets is
  incidental.

**Undecided**

- **Whether a label shown in a fallback language should be marked as such** is not
  settled. Nothing distinguishes a reduced label from one written in the language asked
  for.

## Tickets

- [PO-368](https://linear.app/revenexx/issue/PO-368) — backfilled this spec against the
  tests that already proved it; the helper itself predates the tracker's use here
