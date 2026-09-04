---
feature: retrying-an-operation
title: Asking again when it might work
where:
  - withRetry — the retry loop a node wraps any operation in
  - RetryableError — how an operation says "this one is worth another ask"
  - backoffDelay, sleepWithSignal, DEFAULT_RETRY_POLICY — the pieces underneath
docs:
  - docs/overview.md
updated: 2026-09-01
---

# Asking again when it might work

**Asking again when it might work** is a decision the operation has to make, not the
loop around it. A rate limit, a connection reset and a lock held for another second
will all succeed on a second ask; a malformed request, a rejected credential and a
missing record will fail identically however many times they are tried, and retrying
them turns one clear failure into the same failure several seconds later.

So nothing here retries by default. The loop asks again only when the operation raises
a failure that declares itself retryable, and it raises anything else the moment it
sees it. What it adds on top is the part every caller would otherwise write again: a
wait that grows so a struggling service is not hammered, jitter so a hundred workers
recovering together do not synchronise into a second outage, a way for a host that
said *wait this long* to be obeyed, and a cancellation that lands during the wait
rather than after it.

**A failure that will not change is never asked twice.**

## Acceptance criteria

### AC-1 — An operation that succeeds is run once

- **Given** a node wraps an operation in the retry loop
- **When** it succeeds on the first attempt
- **Then** its value is returned and it is not run again
- **Because** the retry budget is a ceiling, never a number of attempts to use up
- verify: unit

### AC-2 — Only a failure that declares itself retryable is asked again

- **Given** an operation that fails
- **When** the failure does not declare itself retryable
- **Then** it is raised immediately and no further attempt is made
- **And** a failure that does declare itself retryable is asked again
- **Because** the operation is the only party that knows whether asking again could
  change the answer; a loop that guesses turns a rejected credential into the same
  rejection three waits later
- verify: unit

### AC-3 — The failure that survives every attempt is raised as it was

- **Given** an operation that declares itself retryable and fails on every attempt
- **When** the budget is exhausted
- **Then** that failure is raised, still carrying what it was given — the underlying
  cause it wrapped and any wait the host asked for
- **Because** the caller diagnoses from the last failure, and a loop that replaces it
  with one of its own has thrown away the only evidence
- **Pair** AC-1, the same loop where an attempt succeeds
- verify: unit

### AC-4 — The wait between attempts grows, and stops growing at its ceiling

- **Given** a policy with a base wait, a growth factor and a ceiling
- **When** attempts fail in succession
- **Then** each wait is the previous one multiplied by the factor, until the ceiling,
  after which every wait is the ceiling
- **Because** the first retry should be quick and the fifth should not be, and without
  a ceiling the same formula eventually waits longer than anyone is willing to
- verify: unit

### AC-5 — Jitter varies a wait without letting it exceed its ceiling

- **Given** a policy with jitter switched on
- **When** the wait for an attempt is computed
- **Then** it is somewhere between nothing and the wait that attempt would otherwise
  have had — never beyond it
- **Because** jitter exists so many workers recovering from one outage do not retry in
  step; a jitter that could overshoot would trade that for waits nobody predicted
- verify: unit

### AC-6 — A host that says how long to wait is obeyed, unless the figure is unusable

- **Given** a retryable failure that carries the wait its host asked for
- **When** the next attempt is scheduled
- **Then** that figure is used in place of the computed wait
- **And** a figure that is not a usable duration is ignored and the computed wait used
  instead
- **Because** a service that has told us when to come back knows better than our
  formula — and a nonsense figure taken literally would either hammer it immediately or
  wait forever
- verify: unit

### AC-7 — An operation already cancelled is never run

- **Given** the engine's signal has already aborted
- **When** the loop is entered
- **Then** the operation is not run even once, and the call ends with the abort
- **Because** the run is over; work started after that point cannot be used and its
  side effects are nobody's responsibility
- **Pair** AC-1, the same call with a signal that never aborts
- verify: unit

### AC-8 — Cancelling during a wait starts no further attempt

- **Given** a loop waiting before its next attempt
- **When** the signal aborts during that wait
- **Then** no further attempt is started and the call ends with the abort
- **Because** the wait is the longest part of a retry loop, so it is where a
  cancellation most often lands — and one that only takes effect afterwards reads to an
  operator as a hang
- **Pair** AC-1
- verify: unit

### AC-9 — A wait ends the moment it is cancelled, not when it elapses

- **Given** a wait in progress
- **When** the signal aborts
- **Then** the wait ends immediately with the abort rather than running its course
- **And** an uncancelled wait does run its course
- **Because** this is the mechanism AC-8 depends on, and a wait that swallowed the
  abort would make every cancellation as slow as the longest backoff
- verify: unit

### AC-10 — Each attempt is told which attempt it is

- **Given** an operation run through the loop
- **When** it is called
- **Then** it is told its attempt number, counting from one
- **Because** an operation that wants to widen a query, drop an optimisation or log
  differently on a later try cannot do any of it without knowing
- verify: unit

### AC-11 — Every retry is reported, with what was tried and how long the wait is

- **Given** a logger is passed to the loop
- **When** an attempt fails and another will follow
- **Then** it is warned about once per retry, naming the attempt, the ceiling, the wait
  and the failure
- **Because** a retry that succeeds leaves no trace in the result, so without this a
  service that is failing half the time looks exactly like one that is healthy
- verify: unit

### AC-12 — A caller that names no policy gets a lean one

- **Given** a node uses the loop without stating a policy
- **When** an operation fails retryably
- **Then** it is tried three times in all, waiting from 500ms and doubling to a ceiling
  of 30 seconds, with jitter on
- **Because** the defaults are what most nodes will actually run, so they are set for a
  worker shared by every workflow rather than for the most patient caller
- verify: unit

## Elsewhere

- **The retry budget on an HTTP request** is [`request-budget.md`](request-budget.md).
  That one is `safeFetch`'s own, offered to a workflow author as a setting; this spec is
  the primitive a node drives itself, for work that is not a request at all.

## Gaps

**Known**

- **Nothing here decides what is retryable.** The loop asks again only when a failure
  declares itself so, which means every operation wrapping a foreign error has to make
  that judgement itself. There is no shared ruling on, say, which status codes are worth
  another ask, and so no promise that two nodes will treat the same failure alike.

**Undecided**

- **Whether a retry budget should be shared across an operation's own internal calls**
  is not settled. Two nested loops each get their own budget, so the attempts multiply,
  and nothing here says whether that is intended.
- **What a node should do once the budget is exhausted** — raise, or route to an error
  port — is left to each node.

## Tickets

- [PO-139](https://linear.app/revenexx/issue/PO-139) — the transport-agnostic retry and
  backoff primitive, split out so it is not tied to HTTP: AC-1 through AC-12
- [PO-368](https://linear.app/revenexx/issue/PO-368) — backfilled this spec against the
  tests that already proved it
