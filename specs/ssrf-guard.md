---
feature: ssrf-guard
title: The SSRF guard
where:
  - safeFetch — the request helper a node reaches a host through
  - assertPublicUrl — the guard on its own, for a caller that opens its own request
  - isBlockedAddress — the address ruling, for a caller that already has one
docs:
  - docs/overview.md
updated: 2026-09-01
---

# The SSRF guard

**The SSRF guard** is what stands between a URL a workflow author typed and the
network the worker sits on. A node fetches where its configuration points it, and
that configuration is not trusted input: an author — or anyone who can reach the
author's workflow — can aim a node at `169.254.169.254` and read the cloud
metadata service, or walk an internal address range from a machine that is allowed
to reach it. Nothing downstream can tell that request apart from a legitimate one,
because it comes from the worker and it looks exactly like the fetch a node is
supposed to make.

So the ruling happens before the request does, and it is not optional. There is no
per-node opt-out and no caller-supplied escape hatch: every target is resolved and
judged, every redirect hop is judged again, and a refusal is a `BLOCKED_ADDRESS`
error rather than a response. The one relaxation that exists is an environment
variable the local development stack sets, and it cannot be reached from a
workflow.

**A request this package refuses is a request that was never sent.**

## Acceptance criteria

### AC-1 — A request to a private or reserved target is refused before it is sent

- **Given** a target whose host resolves to a private, loopback, link-local or
  otherwise reserved address
- **When** a node calls `safeFetch`
- **Then** the call throws `BLOCKED_ADDRESS` and no request is made at all
- **Because** a guard that refuses the *response* has already let the request reach
  the internal host — the timing, the connection and any side effect it caused are
  all observable to whoever aimed it there
- **Pair** AC-2 proves the positive half, and both reach the guard the same way —
  through `safeFetch` with the resolver answering a scripted address
- verify: unit

### AC-2 — A public target is allowed through, by each of the three ways in

- **Given** a target that resolves only to public addresses, or a public address on
  its own
- **When** it is judged — through `safeFetch`, through `assertPublicUrl`, or as a bare
  address through `isBlockedAddress`
- **Then** it passes every one of them, and the `safeFetch` route goes on to make the
  request and return its response
- **Because** a guard nobody can pass is a guard nobody keeps — and each way in needs a
  positive control of its own, or a refusal proved through one of them could as easily
  be that whole path being dead
- verify: unit

### AC-3 — One private address among the answers is enough to refuse the host

- **Given** a host that answers with several addresses, of which at least one is
  private or reserved
- **When** the target is judged
- **Then** the whole host is refused, not just the private answer
- **Because** which of several answers a connection ends up using is not ours to
  choose, so a host that can answer privately at all has to be treated as one that
  will
- **Pair** AC-2, reached the same way — `assertPublicUrl` with the resolver
  answering, differing only in whether one of the answers is private
- verify: unit

### AC-4 — Only http and https targets are accepted

- **Given** a target on any other scheme — `file:`, `ftp:`, anything
- **When** the target is judged
- **Then** it is refused with `BLOCKED_ADDRESS`
- **Because** the address rules only say something about hosts on the network; a
  scheme that reaches the local filesystem instead walks straight past them
- **Pair** AC-2, reached the same way — `assertPublicUrl` on a target that differs
  only in its scheme
- verify: unit

### AC-5 — A redirect cannot carry a request from a public target to a private one

- **Given** a public target that answers with a redirect to a private or reserved
  address
- **When** a node calls `safeFetch`
- **Then** the redirect is not followed and the call throws `BLOCKED_ADDRESS`
- **And** a redirect to a public target *is* followed, and the final response
  returned
- **Because** judging only the first hop makes the guard trivially bypassable by
  anyone who controls a public host: one 302 and the request lands wherever they
  point it
- verify: unit

### AC-6 — A redirect may not downgrade an https request to http

- **Given** an `https` target that answers with a redirect to an `http` address
- **When** a node calls `safeFetch`
- **Then** the redirect is refused
- **And** the opposite hop — `http` redirecting to `https` — is followed
- **Because** a caller that asked for a confidential channel does not lose it to a
  header the other end controls
- verify: unit

### AC-7 — Authentication-bearing headers do not cross an origin boundary on a redirect

- **Given** a request carrying `Authorization`, `Cookie` or `Proxy-Authorization`
- **When** it is redirected to a different origin
- **Then** those headers are dropped before the next hop is made
- **And** a redirect to the *same* origin keeps them, so an ordinary redirect within
  one host does not silently lose the caller's credentials
- **Because** otherwise any host that can answer with a 302 can harvest the
  credentials meant for somebody else
- verify: unit

### AC-8 — A refusal never discloses the address a hostname resolved to

- **Given** a hostname that was refused because it resolves to a private address
- **When** the caller reads the error
- **Then** it names the host they supplied and not the address it resolved to
- **And** a target the caller supplied *as* a literal address is echoed back, because
  it tells them nothing they did not already type
- **Because** the resolved address is an internal name-to-address mapping, and
  handing it back turns a blocked request into a working reconnaissance tool
- verify: unit

### AC-9 — An address the guard cannot parse counts as blocked

- **Given** an address that is not a well-formed IPv4 or IPv6 literal
- **When** it is judged
- **Then** it is treated as blocked
- **Because** the alternative fails open: every parser gap becomes a way through,
  and the gaps are exactly what an attacker looks for
- **Pair** AC-2, reached the same way — `isBlockedAddress` on a bare address,
  differing only in whether that address parses
- verify: unit

### AC-10 — The local-development opt-out never relaxes the protocol allowlist

- **Given** the local development stack has set `RVNXX_SSRF_ALLOW_PRIVATE`
- **When** a target on a non-http(s) scheme is judged
- **Then** it is still refused
- **Because** the switch exists so a developer can reach a service on their own
  machine, which is an address question — reaching the filesystem is not, and a
  relaxation that quietly widened to cover it would differ from production in a way
  nobody asked for
- verify: unit

### AC-11 — The refused set covers every shape a non-public address comes in

- **Given** an address that is loopback, private, link-local, unique-local or the
  unspecified address
- **When** it is judged
- **Then** it is refused, in either IP version and in the forms that embed one version
  inside the other
- **And** an address just outside one of those ranges is allowed
- **Because** the ranges are contiguous and the boundaries are where a hand-written
  check goes wrong — one octet out and the cloud metadata address reads as public, or a
  customer's real host becomes unreachable
- verify: unit

### AC-12 — A host that can be judged without asking DNS is judged without asking

- **Given** a target whose host is `localhost`, a name beneath it, or a literal address
- **When** it is judged
- **Then** the answer is reached without a name being resolved at all
- **Because** the resolver is the one part of this that talks to something we do not
  control; a name that never needed it should not be able to hang the guard, and a
  literal address is already the answer
- **Pair** AC-2, where a name that genuinely needs resolving does get resolved
- verify: unit

### AC-13 — A host that resolves to nothing is refused

- **Given** a name that resolves to no address at all
- **When** it is judged
- **Then** it is refused
- **Because** the ruling is "every address this resolves to is public", and no addresses
  would satisfy that vacuously — letting a name through to a connection that resolves it
  again, on its own terms
- **Pair** AC-2
- verify: unit

### AC-14 — An address written in a form the guard does not recognise is still caught

- **Given** a host written as a bare integer rather than as a recognisable address — the
  decimal form of a loopback address, say
- **When** it is judged
- **Then** it is refused, because it is handed to the resolver like any other name and
  the address that comes back is judged
- **Because** the obfuscated forms are what somebody probing this reaches for, and the
  guard does not have to recognise every one of them so long as nothing it fails to
  recognise gets through unjudged
- **Pair** AC-2
- verify: unit

### AC-15 — The local-development relaxation is off unless it is deliberately on

- **Given** the environment variable that relaxes the address rules
- **When** it is unset, or set to something that does not read as on
- **Then** the guard applies in full
- **And** it applies again as soon as the variable is removed, within the same process
- **Because** this is the one switch that turns the guard off, so the failure that
  matters is it being on when nobody meant it — a stale value in an environment, a
  default copied out of the development stack
- **Pair** AC-1, the same refusal with the switch absent
- verify: unit

### AC-16 — The guard gives up when the call it belongs to is cancelled

- **Given** a name being resolved as part of judging a target
- **When** the caller's signal aborts — before the resolve starts, or while it runs
- **Then** the guard ends with the abort rather than waiting for the resolver
- **Because** resolving a name cannot be interrupted at the system level, so without this
  a hung or hostile resolver decides how long the call takes and the budget the caller
  set means nothing
- verify: unit

## Elsewhere

- **What following a redirect does to the request** — how many hops are allowed, what a
  malformed target costs, and how the method and body change on the way — is
  [`redirect-following.md`](redirect-following.md). This spec promises only where a hop
  may go.
- **How long the call may take and how often it is tried** is
  [`request-budget.md`](request-budget.md).

## Gaps

**Known**

- **The address a host resolves to is checked, and then resolved again when the
  connection is opened.** Between those two moments an attacker's DNS can change its
  answer, so a target that passed the guard can still connect somewhere private —
  the DNS-rebinding race. Closing it needs the connected socket's address to be
  inspected rather than a name resolved twice, which is
  [PO-184](https://linear.app/revenexx/issue/PO-184). Until then this guard is a
  central defence and not an isolation boundary.
- **The guard assumes the worker opens its own connections.** If a global proxy
  dispatcher is ever installed, the target is resolved at the proxy instead and the
  address this guard judged is no longer the one the bytes reach. Nothing detects
  that from here; it is a property of how the worker is configured.

**Undecided**

- **Which reserved ranges count is settled by hand, and the set is not complete.**
  Carrier-grade NAT (`100.64.0.0/10`), the 6to4 and Teredo ranges and the broadcast
  address are not among the ones refused today.
  [PO-183](https://linear.app/revenexx/issue/PO-183) asks whether to keep extending
  the list or hand the question to a library, and no promise here states which
  ranges a caller may rely on until it is answered.
- **What a refusal costs a running workflow is not promised anywhere.** A blocked
  target throws rather than routing to an error port, so whether an author sees a
  failed run or a branch they can handle is decided by each node rather than here.

## Tickets

- [PO-135](https://linear.app/revenexx/issue/PO-135) — `safeFetch` itself, with its
  timeout and retry budget; no address ruling yet
- [PO-172](https://linear.app/revenexx/issue/PO-172) — the guard: AC-1 through AC-9,
  including the redirect hops and the non-disclosing error
- [PO-185](https://linear.app/revenexx/issue/PO-185) — routed the OAuth client-credentials
  token request through the guard, which had been reaching the network around it
- [PO-368](https://linear.app/revenexx/issue/PO-368) — backfilled this spec against the
  tests that already proved it, and installed the gate that now holds it
  - AC-11 through AC-16 came in a second pass, from proven behaviour the first pass left
    unbound. At sixteen criteria this is the largest spec here; if it grows again, the
    local-development relaxation (AC-10, AC-15) is the seam to split along — it is the one
    subject here about operating this package rather than about what the guard refuses.
