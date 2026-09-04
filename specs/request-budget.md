---
feature: request-budget
title: What one request may cost
where:
  - safeFetch — the request helper a node reaches a host through
  - timeoutConfigField, retryConfigFields — the settings a node offers its author
docs:
  - docs/overview.md
updated: 2026-09-01
---

# What one request may cost

**What one request may cost** is settled before it is made, because the thing at the
other end is not ours. A host that answers slowly, a host that answers never, and a
host that fails once and would answer on a second ask all look identical at the moment
a node calls out — and a workflow that simply waits is a workflow occupying a worker
until somebody notices.

So every call carries two budgets: how long one attempt may take, and how many
attempts there may be. Both have defaults, both can be raised by the node author or
handed to the workflow author as a setting, and both are bounded by a ceiling the
caller cannot lift. The third control is not a budget but an interruption — the
signal the engine passes in, which ends the call wherever it has got to.

**A call that has run out of budget fails; it does not linger.**

## Acceptance criteria

### AC-1 — A request that does not answer in time fails as a timeout

- **Given** a node calls `safeFetch` with a budget
- **When** the host has not answered by the time it runs out
- **Then** the call throws `TIMEOUT`, and the message names the budget it exceeded
- **Because** the caller has to be able to tell "this host is slow" from "this host
  said no" — they lead to different retries and different error ports
- **Pair** AC-2, the same call against a host that answers in time
- verify: unit

### AC-2 — A request that answers in time returns its response

- **Given** a node calls `safeFetch` with a budget
- **When** the host answers before it runs out
- **Then** the response is returned to the caller unchanged
- **Because** a budget nobody stays inside is a budget nobody keeps
- verify: unit

### AC-3 — A budget above the ceiling is treated as the ceiling

- **Given** a caller asks for a budget larger than the ceiling this package enforces
- **When** the request runs out of time
- **Then** the failure names the ceiling, not the figure that was asked for
- **Because** the ceiling exists so one workflow cannot pin a worker for as long as it
  likes, and a limit a caller can raise by asking is not a limit
- **Pair** AC-1, the same failure reached with a budget under the ceiling
- verify: unit

### AC-4 — Cancelling ends the call, before or during flight

- **Given** the engine's signal is passed to `safeFetch`
- **When** it aborts — whether before the call starts or while it is in flight
- **Then** the call ends with the abort, not with a timeout and not with a response
- **Because** cancellation is how a run is stopped, and a call that finishes anyway
  goes on to act on an answer nobody is waiting for
- verify: unit

### AC-5 — Cancelling outranks the budget when both end together

- **Given** a call whose signal aborts in the same moment its budget runs out
- **When** the failure is raised
- **Then** it is the cancellation, not the timeout
- **Because** the two mean opposite things to whoever reads the run: a timeout invites
  a retry and says something about the host, a cancellation says the answer is no
  longer wanted at all
- verify: unit

### AC-6 — A failed attempt is retried, and the last failure is the one raised

- **Given** a node allows a number of retries
- **When** every attempt fails
- **Then** the call makes exactly the attempts it was allowed, and raises the failure
  rather than swallowing it
- **Because** a caller has to see the reason the host could not be reached; a retry
  budget decides how often to ask, never whether to report
- **Pair** AC-7, the same configuration where an attempt succeeds
- verify: unit

### AC-7 — An attempt that succeeds after a failure returns its answer

- **Given** a node allows retries and the first attempt fails
- **When** a later attempt succeeds
- **Then** that response is returned and no further attempt is made
- **Because** the point of a retry budget is that a transient failure does not reach
  the workflow at all
- verify: unit

### AC-8 — Cancelling stops the retrying, without waiting the delay out

- **Given** a call with retries left, whose signal aborts
- **When** it aborts between two attempts, or while the delay before the next one is
  still running
- **Then** no further attempt is made and the call ends immediately, rather than after
  the remaining delay
- **Because** a cancellation that takes effect only after a multi-second backoff is a
  cancellation the operator experiences as a hang
- **Pair** AC-6, which is the same retry loop left uncancelled
- verify: unit

### AC-9 — The budget can be handed to the workflow author as a setting, bounded

- **Given** a node offers the request budget as one of its settings
- **When** the setting is declared
- **Then** it arrives as a number with the package default, a lower bound, and an
  upper bound that is the ceiling unless the node names a smaller one
- **Because** a node author should not have to restate the bounds, and a workflow
  author should not be able to type a number that defeats them
- verify: unit

### AC-10 — The retry policy can be handed over the same way

- **Given** a node offers its retry policy as settings
- **When** they are declared
- **Then** the number of attempts and the delay between them each arrive as a bounded
  number with the package default
- **Because** the same reasoning as AC-9: one declaration, bounds a workflow author
  cannot argue with
- verify: unit

### AC-11 — A refusal that cannot change is not asked again

- **Given** a call with retries allowed, whose target is refused for a reason that will
  be the same every time — a blocked address, a chain that never ends
- **When** it fails
- **Then** it fails once, without using any of the retry budget
- **Because** a retry can only change the outcome of something transient; asking again
  after a deterministic refusal spends the caller's time and the host's, and delays the
  failure by the whole backoff before saying the same thing
- **Pair** AC-6, a failure that is worth asking again
- verify: unit

## Elsewhere

- **Where a request is allowed to go at all** — the address rules, the redirect hops
  and what a refusal may disclose — is [`ssrf-guard.md`](ssrf-guard.md). A budget says
  how much a request may cost; that spec says whether it may be made.
- **How much of an answer is read, and as what**, is
  [`response-reading.md`](response-reading.md). The budget here bounds the request, not
  the body that comes back.
- **What following a redirect does to the request** is
  [`redirect-following.md`](redirect-following.md). Each hop gets its own budget, which
  is the `## Gaps` entry below.

## Gaps

**Known**

- **A budget that is not a usable number falls back to the package default.** It does,
  and no criterion here says so: the only tests that observe it watch the timer being
  scheduled rather than anything a caller can see, and a promise whose sole proof is a
  scheduling detail goes red on a refactor that keeps the promise intact.
- **The budget is per attempt and per redirect hop, not a cap on the whole call.** A
  redirect chain applies it again at each hop and every retry starts a fresh one, so a
  worst case runs to several multiples of the figure a workflow author typed. This is
  stated in the `docs/` companion and proven by nothing here, which is why it is not a
  criterion.

**Undecided**

- **Which failures are worth retrying is only half promised.** AC-11 says a refusal that
  cannot change is not asked again. What is still unstated is the other side: whether a
  host that answers with a rejection — a refused authorisation, a malformed request —
  should be asked again, or only one that fails to answer at all.
- **What a workflow author sees when the budget runs out is decided by each node.** A
  timeout is raised, not routed, so whether it surfaces as a failed run or as a branch
  that can be handled is not settled here.

## Tickets

- [PO-135](https://linear.app/revenexx/issue/PO-135) — `safeFetch` with one timeout and
  retry budget for every node, replacing per-node handling: AC-1 through AC-10
- [PO-368](https://linear.app/revenexx/issue/PO-368) — backfilled this spec against the
  tests that already proved it
