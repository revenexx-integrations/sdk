---
feature: response-reading
title: Reading what came back
where:
  - readArrayBuffer, readText, readJsonOrText — the ways a node takes an answer apart
  - maxBytesConfigField — the setting a node offers its author for the size cap
docs:
  - docs/overview.md
updated: 2026-09-01
---

# Reading what came back

**Reading what came back** is where a node stops being in control. The request was
ours; the answer is whatever the host chose to send, and it arrives before anything
has checked that it is a sane size or the shape the node expected. A body read
straight into memory is a body whose length the host decides — one oversized answer
and the worker is out of memory for every workflow sharing it, not just the one that
made the call.

So an answer is read through a cap rather than swallowed, and the cap is enforced as
the bytes arrive rather than after. Where the host declares a length up front the
answer is refused before its body is touched at all. Above every cap a node or a
workflow author can set sits a hard ceiling that neither can raise. On top of that
sits the small question of what the bytes *are* — text, or the JSON the host claims
they are — and a claim that turns out to be false is reported as such rather than
quietly handed on as text.

**No answer, however large, is read past the point where it costs the worker.**

## Acceptance criteria

### AC-1 — An answer within the cap is returned whole

- **Given** a node reads an answer with a byte cap
- **When** the body is at or below that cap
- **Then** the whole body is returned, the boundary included
- **Because** a cap that also rejects the last byte it allows is a cap nobody can
  reason about, and the off-by-one is invisible until a real answer sits on it
- verify: unit

### AC-2 — An answer that outgrows the cap while arriving is refused

- **Given** a host that sends more than the cap allows and declares no length
- **When** the body is read
- **Then** the read fails as `RESPONSE_TOO_LARGE` once the cap is passed, rather than
  after the whole body has arrived
- **Because** a cap enforced after the fact has already cost exactly the memory it
  exists to protect
- **Pair** AC-1, the same read against a body that stays under the cap
- verify: unit

### AC-3 — An answer that declares an oversized length is refused untouched

- **Given** a host that declares up front a length beyond the cap
- **When** the answer is read
- **Then** it is refused without its body being touched at all
- **Because** the declaration is free to check and the body is not; refusing on it
  costs nothing and saves the transfer
- **Pair** AC-1
- verify: unit

### AC-4 — An oversized answer is reported as oversized even if discarding it fails

- **Given** an answer past the cap whose body then fails to be discarded cleanly
- **When** the failure surfaces
- **Then** it is still `RESPONSE_TOO_LARGE`
- **Because** the caller has to see why the read failed, and a secondary failure
  during cleanup would otherwise mask the reason with something unactionable
- verify: unit

### AC-5 — A cap above the hard ceiling does not lift it

- **Given** a caller asks to read with a cap larger than the ceiling this package
  enforces — or with one that is zero, negative or not a number
- **When** the answer is read
- **Then** the ceiling applies
- **Because** the ceiling protects a worker shared by every workflow, so it cannot be
  something a single caller opts out of by asking for more
- **Pair** AC-1
- verify: unit

### AC-6 — Text is decoded as UTF-8

- **Given** a node reads an answer as text
- **When** the body contains characters outside ASCII
- **Then** they arrive intact
- verify: unit

### AC-7 — JSON is parsed when the answer says it is JSON, and only then

- **Given** a node reads an answer that may or may not be JSON
- **When** the host's content type says JSON — in any casing, with any parameters
  attached, or as one of the structured-syntax suffixes that end in `+json`
- **Then** the answer is parsed and the value returned
- **And** any other content type is returned as text, including ones that merely look
  like JSON by name
- **Because** the node's own branching turns on getting a value rather than a string,
  and a near-match treated as JSON fails later and further from the cause
- verify: unit

### AC-8 — An answer that claims to be JSON and is not is reported as such

- **Given** a host declares JSON and sends something that does not parse
- **When** the answer is read
- **Then** the read fails as `RESPONSE_PARSE_ERROR`
- **Because** silently handing back the raw text would make the node act on a string
  where it expected a value, and the trail back to the host that lied is gone
- **Pair** AC-7, the same read where the body does parse
- verify: unit

### AC-9 — The cap holds for JSON answers too

- **Given** an oversized answer that declares itself JSON
- **When** it is read
- **Then** it is refused for its size, before its shape is considered
- **Because** a cap that any one content type escapes is not a cap
- **Pair** AC-7
- verify: unit

### AC-10 — Reading without naming a cap uses the package default

- **Given** a node reads an answer without stating a cap
- **When** the body arrives
- **Then** the package default applies rather than no limit at all
- **Because** the failure mode of an unset cap is the one this whole spec exists to
  prevent, so the safe value is the one you get by not thinking about it
- verify: unit

### AC-11 — The cap can be handed to the workflow author as a setting, bounded

- **Given** a node offers the size cap as one of its settings
- **When** the setting is declared
- **Then** it arrives as a number with the package default and an upper bound, and
  that bound is the hard ceiling even when the node names a larger one
- **Because** a node author should not have to restate the ceiling, and neither they
  nor the workflow author should be able to declare their way past it
- **Pair** AC-5, which is the same ceiling enforced at the read rather than at the
  setting
- verify: unit

## Elsewhere

- **How long a request may take and how often it is tried** is
  [`request-budget.md`](request-budget.md). That budget bounds the request; the cap
  here bounds the answer.
- **Whether the request could be made at all** is
  [`ssrf-guard.md`](ssrf-guard.md).

## Gaps

**Known**

- **The cap counts bytes, not what they cost once parsed.** An answer that fits the cap
  can still expand into far more memory as a parsed value, and nothing here bounds
  that.

**Undecided**

- **Whether a node should see a refused answer as an error or as a branch** is not
  settled here. An oversized or unparseable answer is raised, and each node decides
  what its author sees.
- **What happens to an answer that declares one content type and sends another** is
  promised only for JSON. Nothing states how a mismatch is treated for any other type.

## Tickets

- [PO-137](https://linear.app/revenexx/issue/PO-137) — the size cap and the read
  helpers: AC-1 through AC-11
- [PO-368](https://linear.app/revenexx/issue/PO-368) — backfilled this spec against the
  tests that already proved it
