---
feature: redirect-following
title: What a redirect does to the request
where:
  - safeFetch — every hop it follows on the caller's behalf
docs:
  - docs/overview.md
updated: 2026-09-01
---

# What a redirect does to the request

**What a redirect does to the request** is decided here rather than by the runtime,
because the runtime would follow a redirect chain without telling anyone where it went.
A node asks for one address; the host answers "not here, there", and the request that
eventually arrives somewhere may carry a different method, a different body and a
different destination from the one that was made.

Following hops by hand is what makes each of those checkable — and it makes this
package, not the transport, responsible for the parts a transport would take for
granted: that the chain ends, that a target which cannot even be read as an address is
refused rather than guessed at, that a connection is let go on every path out including
the failing ones, and that the method and body change the way the rules say and not the
way whichever host answered would prefer.

**Every hop is a decision this package makes, and a chain always ends.**

## Acceptance criteria

### AC-1 — A chain that does not end is stopped, and says so

- **Given** a host that keeps answering with another redirect
- **When** the allowed number of hops is used up
- **Then** the call fails as `TOO_MANY_REDIRECTS`, having made exactly that many requests
  and no more
- **Because** a loop otherwise runs until something else times out, and the failure that
  surfaces then names the timeout rather than the loop that caused it
- **Pair** AC-2, a chain that does end
- verify: unit

### AC-2 — A chain that ends returns the answer at the end of it

- **Given** a host that redirects once to another public target
- **When** the hop is followed
- **Then** the final response is returned to the caller
- **Because** following redirects has to be ordinary; a guard that only ever refused
  would push every node into handling 3xx itself
- verify: unit

### AC-3 — A target that cannot be read as an address is refused, not guessed at

- **Given** a redirect whose target cannot be resolved against the address it came from
- **When** the hop is considered
- **Then** the call fails and no request is made for it
- **Because** the alternative is guessing what was meant, and a guess here is a request
  to an address nobody wrote down
- **Pair** AC-2
- verify: unit

### AC-4 — The connection is let go on the way out, including the failing ways

- **Given** a redirect answer carrying a body, on a chain that is about to be refused for
  its length
- **When** the call fails
- **Then** that answer's connection is released rather than left held
- **Because** the body of a 3xx is never read, and a connection held on an error path
  leaks once per failure — which is exactly the path a misbehaving host puts a worker on
  repeatedly
- verify: unit

### AC-5 — A redirect that changes the meaning of the request changes the request

- **Given** a request carrying a body, answered by a redirect of the kind that turns a
  submission into a retrieval
- **When** the hop is followed
- **Then** the next request asks to retrieve, carries no body, and the first one is
  unchanged
- **Because** resending a submission to a new address is how one action becomes two; the
  rules for which redirects do this are not ours, and following them halfway is worse
  than not following them
- verify: unit

## Elsewhere

- **Where a hop is allowed to go** — the address rules, the refusal to downgrade the
  channel, and the headers dropped across an origin boundary — is
  [`ssrf-guard.md`](ssrf-guard.md) AC-5, AC-6 and AC-7. This spec is about what the
  request itself becomes.
- **Whether a refused hop is asked again** is [`request-budget.md`](request-budget.md)
  AC-11.

## Gaps

**Known**

- **A body that can only be read once cannot survive a hop that resends it.** The kinds
  of redirect that preserve the method resend the body as given, and a streamed body has
  already been consumed by the first hop — so it fails there. Nothing here promises
  otherwise, and the `docs/` companion says to pass a buffered body where a host may
  answer that way.
- **The hop budget is a constant, not a setting.** Unlike the request budget and the
  size cap, nothing offers it to a node or a workflow author.

**Undecided**

- **Whether the chain a request actually took should reach the caller** is not settled.
  Only the final response comes back, so a node cannot tell a direct answer from one
  reached after five hops, and neither can whoever reads the run.

## Tickets

- [PO-135](https://linear.app/revenexx/issue/PO-135) — `safeFetch`, which followed
  redirects through the runtime at first
- [PO-172](https://linear.app/revenexx/issue/PO-172) — hops became this package's
  decision so each could be judged: AC-1 through AC-5
- [PO-368](https://linear.app/revenexx/issue/PO-368) — backfilled this spec against the
  tests that already proved it
