---
"@revenexx/integrations-node-sdk": minor
---

Add an always-on SSRF guard to `safeFetch`. Requests to private, loopback,
link-local or reserved targets (incl. the cloud metadata address) are now
rejected with `NodeError('BLOCKED_ADDRESS')`, and redirects are followed
manually with the guard re-checked on every hop (`NodeError('TOO_MANY_REDIRECTS')`
past 5 hops). On a cross-origin hop the `Authorization`, `Cookie` and
`Proxy-Authorization` headers are dropped, and an `https`→`http` downgrade is
refused. A hostname that resolves to a private address no longer echoes the
resolved IP back to the caller. Exports the new `assertPublicUrl` and
`isBlockedAddress` helpers (the guard is always on and not caller-opt-outable —
there is no public resolver override). Best-effort: a DNS-rebinding (TOCTOU) gap
remains — see the README.
