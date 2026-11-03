---
'@revenexx/integrations-node-sdk': minor
---

A failed `safeFetch` says whether the request was sent (PO-808). When no hop of any attempt put a byte on the wire — a refused address before the lookup or at connect time, a lookup timeout, an unsendable header or URL, a credential bound to another origin, or a connection that was refused, unresolved, unreachable or timed out while connecting — the error carries `meta.sent = false`. The new `mayHaveBeenSent(err)` reads it, and answers `true` for everything else. Errors from the runtime stay `TypeError`s with their `cause` unchanged.
