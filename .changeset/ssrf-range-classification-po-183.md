---
"@revenexx/integrations-node-sdk": minor
---

Refuse an address unless a maintained classification calls it public (PO-183).

`isBlockedAddress` decided what was public by classifying the address **by
hand** — its own IPv4 and IPv6 parsers plus a list of range checks. That was a
deliberate limitation when the guard shipped: the list covered the ranges that
mattered most, and it was accurate about being incomplete. What it left out was
reserved address space that read as public and would have passed — carrier-grade
NAT `100.64.0.0/10`, multicast, the broadcast address, the documentation,
benchmarking and future-use bands, IPv6 deprecated site-local, and the
transitional ranges 6to4 `2002::/16`, Teredo `2001::/32` and NAT64
`64:ff9b::/96`, each of which can carry a private IPv4 address inside an IPv6
one.

The classification now comes from `ipaddr.js`, and the rule over it is stated the
other way round: an address is refused **unless** its range is `unicast`. That is
what makes the gap close for good rather than by one list getting longer —
nobody has to remember which reserved range was left out, and a range the
classification learns about later is refused without a change here. The one
exception the rule needs is the IPv4-mapped (`::ffff:a.b.c.d`) and deprecated
IPv4-compatible (`::a.b.c.d`) forms: they are a range of their own and never
`unicast`, so the embedded address is unwrapped and judged in its place, and a
public host written that way stays reachable. An address that cannot be parsed
is still blocked.

Two things a consumer can observe, which is why this is not a patch:

- **Targets that used to be allowed now throw `BLOCKED_ADDRESS`.** Every one of
  them is in reserved, non-public address space; none is a host anybody can
  legitimately serve an API from. `2001:db8::/32` — the documentation prefix — is
  the case the test matrix used to assert was allowed, and it is now refused.
- **The SDK has a runtime dependency for the first time.** `ipaddr.js` has no
  transitive dependencies and adds ~13.4 KB minified to a bundled workflow. That
  cost is the reason the classification is being handed over rather than extended:
  the alternative was keeping a parser and a range table correct here, in a
  package whose consumers cannot see it.

What this does not change: which addresses are checked, or when. Both halves of
the guard — the pre-flight ruling and the connected-socket judgement from PO-184
— run the same ruling as before, so the refusals arrive at exactly the same
points and in the same error shape. `RVNXX_SSRF_ALLOW_PRIVATE` still relaxes both.

The residual is now the dependency's vintage rather than our attention:
`ipaddr.js` is pinned, so a range the address registry sets aside after that
version was published reads as `unicast` until the pin moves forward.
`specs/ssrf-guard.md` records that as a *Known* gap, in place of the *Undecided*
one this closes.
