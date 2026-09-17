---
feature: offered-settings
title: The settings this package hands a node to offer
where:
  - timeoutConfigField — the request budget, as a setting
  - retryConfigFields — the retry budget, as two settings
  - maxBytesConfigField — the size cap, as a setting
docs:
  - docs/overview.md
updated: 2026-09-17
---

# The settings this package hands a node to offer

**The settings this package hands a node to offer** are the ones a node does not write
itself. A budget, a retry policy and a size cap are the same three questions in every
node that reaches a host, so this package answers them once and hands each node a
finished declaration to spread into its own.

A finished declaration is the whole point. A node author who spreads one of these is
saying *I do not need to think about this setting* — so whatever the helper leaves out
arrives in front of a workflow author anyway, in a node whose author believed the
question was settled. What was left out was everything a person reads: the setting came
with an English name, no explanation, and no second language, in packages whose own
rules require both. Twenty-eight call sites took it unchanged, and four branches of one
package each discovered it and each fixed it separately in an afternoon.

**A setting this package hands over is one a node author can spread without correcting
it.**

## Acceptance criteria

### AC-1 — A setting this package offers is written in every language the packages write

- **Given** a node spreads one of these settings into its own declaration, unchanged
- **When** a workflow author meets it in the editor
- **Then** its name and its explanation are both there, in each language the node
  packages write
- **Because** a helper that supplies half of what a package's own rules require is worse
  than one that supplies none: the node author reaching for it has already decided not
  to think about this setting, so what is missing reaches a workflow author rather than
  being noticed
- **Pair** AC-2, which is about what the explanation has to say once it is there
- verify: unit

### AC-2 — A setting says what it does, not only what it is called

- **Given** one of these settings
- **When** its explanation is read
- **Then** it says more than the name already did
- **Because** every one of these settings is a bare number, and a number whose label
  repeats itself leaves a workflow author guessing at what changing it costs — which of
  the three budgets it bounds, and whether it is spent once or at every hop
- verify: unit

## Elsewhere

- **What each of these settings is bounded by** is promised where that budget is:
  [`request-budget.md`](request-budget.md) AC-9 and AC-10 for the time a request may
  take and how often it is tried, [`response-reading.md`](response-reading.md) AC-11 for
  what an answer may weigh. This spec promises only that whatever they bound arrives
  legible; it does not restate a single bound.
- **How a name written in two languages becomes the one that gets drawn** is
  [`localized-text.md`](localized-text.md). Nothing here says which of the two a
  workflow author sees.

## Gaps

**Known**

- **Which languages the node packages write is not promised here.** English and German
  are what they write today and what the criteria are proven against, but nothing in
  this package refuses a third, and no criterion would go red on the day one arrives.
- **Nothing promises a node actually offers these.** A node that spreads one of these
  declarations and never reads the configured value has offered a workflow author a
  setting that changes nothing, and that is the node's promise to keep rather than this
  package's.
- **The existing call sites are not covered.** Around thirty nodes across four packages
  spread the older, English-only declaration, and they take the corrected one only when
  each package upgrades. Each is its own package's to fix.

**Undecided**

- **Whether a node may ask for different words** is not settled. A node that wants its
  own name for one of these settings replaces the whole declaration today; nothing here
  offers it a way to keep the bounds and change the wording.

## Tickets

- [PO-497](https://linear.app/revenexx/issue/PO-497) — AC-1 and AC-2: the helpers
  returned an English name and no explanation at all, so every package built on this one
  had to undo part of what the helper had just done
