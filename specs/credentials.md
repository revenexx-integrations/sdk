---
feature: credentials
title: Standing in for the person who owns the account
where:
  - SimpleValueCredential, ApiKeyCredential, BasicAuthCredential — the settings-only kinds
  - OAuth2ClientCredentialsCredential, OAuth2AuthCodeCredential — the kinds that mint and refresh
docs:
  - docs/overview.md
updated: 2026-09-04
---

# Standing in for the person who owns the account

**Standing in for the person who owns the account** is what a credential does every
time a workflow runs without anybody watching. Somebody connected an account once, in a
browser, months ago; every run since has acted as them. What the node sees at that
moment is not what the person typed — it is whatever this package worked out from it,
which for half the kinds here means a token that has to be minted, may have expired,
and may come back rotated.

The kinds differ only in how much has to happen between the two. A key or a password is
handed straight on. A client-credentials account is exchanged for a token on every
resolve. An authorisation-code account is refreshed against a token the person granted
once, and the refresh token itself may be replaced in the act of using it — which has to
be written down, or the next run holds one that has already been spent.

Three things stay constant across all of them. The account details are the most
dangerous thing this package handles, so where they are sent is judged before they are
sent; what comes back is read under a limit rather than swallowed; and what comes back
from a failure is filtered before anyone sees it.

**A credential is never handed anywhere its destination has not been checked, and a
failure never repeats what the account said.**

## Acceptance criteria

### AC-1 — A credential that only carries settings hands them on unchanged

- **Given** a credential kind that needs no exchange — a host and a port, say
- **When** it is resolved
- **Then** the settings arrive at the node exactly as configured, with no expiry
- **Because** the kinds differ in what has to happen before the node can act, and for
  this one the honest answer is nothing — inventing an expiry would make every node
  handle a refresh that does not exist
- verify: unit

### AC-2 — A credential missing a required setting fails its test

- **Given** a credential whose description marks a setting required
- **When** it is tested without that setting
- **Then** the test comes back failed
- **Because** the test exists so somebody finds out while they are looking at the
  connection dialog, rather than at three in the morning in a run
- **Pair** AC-11, the same test with a complete configuration
- verify: unit

### AC-3 — A key credential hands the key on under one agreed name, or refuses

- **Given** an API-key credential
- **When** it is resolved
- **Then** the key arrives under the name every node expects
- **And** a resolve with no key fails rather than handing on nothing
- **Because** a node that received an empty key would send an unauthenticated request
  and report whatever the host says about it, which is never "your key is missing"
- verify: unit

### AC-4 — A username-and-password credential hands both on

- **Given** a basic-auth credential
- **When** it is resolved
- **Then** both parts arrive under the names every node expects
- verify: unit

### AC-5 — A client-credentials account is exchanged for a token that says when it expires

- **Given** a credential holding a client id and secret
- **When** it is resolved
- **Then** an access token comes back, together with the moment it stops being valid
- **And** testing such a credential reports success when the exchange works
- **Because** the engine has to know whether the token it holds is still usable; a token
  with no expiry has to be treated as either always fresh or never, and both are wrong
- verify: unit

### AC-6 — A token endpoint taken from configuration is judged before the secret is sent

- **Given** a credential whose token endpoint comes from its configuration rather than
  from a constant
- **When** that endpoint resolves to a private or reserved address
- **Then** the resolve fails and no request is made at all
- **Because** the endpoint is configuration, and configuration is not trusted input —
  a check that ran after the request would have already put the client secret on the
  wire to an address somebody chose
- **Pair** AC-5, the same exchange against an endpoint that resolves publicly
- verify: unit

### AC-7 — An authorisation link carries the proof the callback will be checked against

- **Given** a person is about to be sent to the provider to grant access
- **When** the link is built
- **Then** it asks for a code, names the application, carries the caller's state, and
  carries a challenge whose verifier is handed back to the caller
- **Because** without the challenge, a code intercepted on its way back can be redeemed
  by whoever intercepted it; without the state, the callback cannot be tied to the
  person who started
- verify: unit

### AC-8 — Exchanging the code yields something the next run can use

- **Given** a person has granted access and the code has come back
- **When** it is exchanged
- **Then** a refresh token comes back among the details to keep
- **Because** the code is spent once — if nothing durable comes out of that exchange,
  the connection lasts until the first access token expires and then asks the person
  again
- verify: unit

### AC-9 — A refresh token replaced during a refresh is written down, not just used

- **Given** a stored refresh token, and a provider that rotates it on use
- **When** the credential is resolved
- **Then** the new access token is returned **and** the replacement refresh token is
  persisted
- **Because** the old token is spent the moment it is used: a run that refreshes
  successfully and does not record the replacement has left the connection broken for
  the next one, and the failure surfaces hours later with nothing pointing back here
- verify: unit

### AC-10 — Resolving with no refresh token fails rather than returning nothing

- **Given** an authorisation-code credential with nothing stored to refresh against
- **When** it is resolved
- **Then** it fails
- **Because** the alternative is a node acting with no credential at all, which the
  host answers as an authentication failure — sending whoever debugs it to the provider
  rather than to the connection that was never finished
- **Pair** AC-9, the same resolve with a token present
- verify: unit

### AC-11 — A credential test says which setting is at fault, and passes when complete

- **Given** a credential whose configuration is incomplete
- **When** it is tested
- **Then** it fails and names the setting that is missing
- **And** the same test passes once the configuration is complete
- **Because** "it does not work" sends somebody back through every field; naming the
  one that is wrong is the whole value of a test button
- verify: unit

### AC-12 — A refusal from the token endpoint names the OAuth fields and nothing else

- **Given** a token endpoint that refuses, answering with the standard error fields and
  whatever else it chooses to include
- **When** the failure reaches the caller
- **Then** it carries the error and its description, and no other part of that answer
- **Because** the body of a token response is the least predictable thing this package
  handles and can carry anything the provider put there; passing it through verbatim
  puts it in logs, in run records and in front of whoever opens the failed run
- **Pair** AC-5, the same exchange where the endpoint answers successfully
- verify: unit

### AC-13 — The answer from a token endpoint is read under a cap

- **Given** a token endpoint that answers with far more than a token exchange could
  honestly need
- **When** the credential is resolved
- **Then** the resolve fails for the weight of the answer, and it fails that way
  whether the answer was a token or a refusal
- **Because** this is the one answer in the package no node's settings stand in front
  of, so there is nobody to offer the cap to and nobody to notice its absence — and a
  resolve runs in the worker every workflow shares, which is what reading an
  unbounded answer costs
- **Pair** AC-5, the same exchange against an endpoint that answers with a token
- verify: unit

## Elsewhere

- **The rules AC-6 judges an endpoint by** — which addresses count as private, how a
  redirect is judged, what a refusal may disclose — are
  [`ssrf-guard.md`](ssrf-guard.md). This spec promises only that a credential's own
  token endpoint is put through them.
- **What a cap does when an answer passes it**, and the ceiling standing above every
  cap, are [`response-reading.md`](response-reading.md). This spec promises only that
  the answer from a token endpoint is read through one — and that the figure is this
  package's rather than anybody's to choose.
- **How long the exchange may take, and how a cancelled run ends it**, are
  [`request-budget.md`](request-budget.md). Nothing here restates them; the token
  exchange is simply inside them.

## Gaps

**Known**

- **Nothing here promises when a token is refreshed.** A credential says when its token
  expires; whether the engine refreshes ahead of that, on expiry, or only after a
  request has already failed is the engine's decision and is not stated anywhere in this
  package.
- **Persisting the rotated token is promised, but not that it survives a crash between
  the two.** A refresh that succeeds and then fails to persist leaves a spent token
  stored, and nothing here says what recovers from that.

**Undecided**

- **What a node sees when a credential cannot be resolved at all** is not settled: a
  failure is raised, and whether that surfaces to the workflow author as a failed run or
  as something they can branch on is decided by each node.
- **Whether a credential may be resolved concurrently by two runs** is not promised. Two
  runs refreshing the same rotating token at once is exactly the case AC-9 is about, and
  nothing here states who wins.

## Tickets

- [PO-126](https://linear.app/revenexx/issue/PO-126) — the credential contract and these
  base classes, so a credential author fills in gaps rather than writing a kind: AC-1
  through AC-5 and AC-7 through AC-12
- [PO-185](https://linear.app/revenexx/issue/PO-185) — AC-6 and AC-13: the token
  exchange used a raw request, so the endpoint — which comes from configuration — was
  never judged, and the answer to it was read with no limit at all
- [PO-368](https://linear.app/revenexx/issue/PO-368) — backfilled this spec against the
  tests that already proved it
