---
"@revenexx/integrations-node-sdk": minor
---

`safeFetch` no longer sends a key in a header of its own to another host when a redirect points there (PO-664). On a redirect to another origin it used to drop only `Authorization`, `Cookie` and `Proxy-Authorization`, so an `X-API-Key`, Brevo's `api-key`, Pipedrive's `x-api-token` or a header named in an HTTP Header Auth credential went along to the redirect target. Such a hop now keeps only `Accept`, `Accept-Encoding`, `Accept-Language`, `Content-Language`, `Content-Type`, the conditional and range headers (`If-Match`, `If-None-Match`, `If-Modified-Since`, `If-Unmodified-Since`, `If-Range`, `Range`), `SOAPAction` and `User-Agent`, and drops every other header. The request body is still resent on a 307 or 308, to another origin too; that is PO-684. A redirect within the same origin keeps every header, as before.

`headerCrossesOrigin(name)` says whether a header of that name is kept on such a hop. The list is by name, so a credential whose header name the author chooses — the HTTP Header Auth credential in core — should refuse a name it answers `true` for, or a key sent as, say, `User-Agent` crosses with the harmless headers.
