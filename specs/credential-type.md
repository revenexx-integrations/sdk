---
feature: credential-type
title: Which credentials a node will accept
where:
  - normalizeCredentialType — how a node's credential declaration becomes a list
updated: 2026-09-01
---

# Which credentials a node will accept

**Which credentials a node will accept** is declared once by the node author and read by
everything that has to offer a choice: the editor, when somebody picks a connection for
a node, and the engine, when it decides whether a saved workflow still holds together.

A node usually accepts one kind and says so as a single name. Some accept several — an
account connected by OAuth or by an API token do the same work for the node behind them
— and say so as a list. Making every reader handle both forms is how the two drift
apart: one reader supports the list, another does not, and a node that declared two
kinds silently offers one.

**However a node writes its declaration, every reader sees the same list.**

## Acceptance criteria

### AC-1 — A single name becomes a list of one

- **Given** a node declaring one credential kind as a bare name
- **When** the declaration is read
- **Then** it comes back as a list containing that name
- **Because** the reader should never have to ask which of the two forms it was handed
- verify: unit

### AC-2 — A list is kept as written, in order

- **Given** a node declaring several kinds
- **When** the declaration is read
- **Then** all of them come back, in the order they were declared
- **Because** the order is what an editor offers them in, and the first is what a person
  is most likely to pick — so it is the author's decision, not an incidental one
- verify: unit

### AC-3 — Nothing declared becomes an empty list, not an absence

- **Given** a node that declares no credential kind, or declares an empty one
- **When** the declaration is read
- **Then** an empty list comes back
- **Because** a node needing no connection is ordinary, and a reader that has to handle
  both an empty list and a missing value will eventually handle only one
- **Pair** AC-1
- verify: unit

### AC-4 — Names are tidied, and a kind named twice is listed once

- **Given** a declaration with padded names, blank entries, or the same kind twice
- **When** it is read
- **Then** names arrive trimmed, blanks are dropped, and each kind appears once — the
  first time it was named
- **Because** the list is drawn as a choice: a repeated entry is a choice between two
  identical options, and a padded name matches nothing when it is looked up
- **Pair** AC-2, the same read where every entry is already tidy
- verify: unit

## Gaps

**Known**

- **Nothing here checks that a declared kind exists.** A node may name a credential kind
  no package ships, and this reads it back unchanged; whether anything downstream
  notices is not promised in this package.

**Undecided**

- **Whether the order carries meaning beyond presentation** — a preference, a fallback —
  is not stated. AC-2 promises the order survives, not what a reader should do with it.

## Tickets

- [PO-136](https://linear.app/revenexx/issue/PO-136) — a node may accept several
  credential kinds, which is where the list form and AC-2 through AC-4 come from
- [PO-368](https://linear.app/revenexx/issue/PO-368) — backfilled this spec against the
  tests that already proved it
