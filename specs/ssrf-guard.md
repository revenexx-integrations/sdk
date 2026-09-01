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
