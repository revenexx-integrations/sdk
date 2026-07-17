---
"@revenexx/integrations-node-sdk": minor
---

Add an always-on SSRF guard to `safeFetch`. Requests to private, loopback,
link-local or reserved targets (incl. the cloud metadata address) are now
rejected with `NodeError('BLOCKED_ADDRESS')`, and redirects are followed
manually with the guard re-checked on every hop (`NodeError('TOO_MANY_REDIRECTS')`
past 5 hops, `Authorization` dropped cross-origin). Exports the new `assertPublicUrl`
and `isBlockedAddress` helpers plus the `ssrfResolver` test seam. Best-effort: a
DNS-rebinding (TOCTOU) gap remains — see the README.
