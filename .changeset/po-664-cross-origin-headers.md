---
"@revenexx/integrations-node-sdk": patch
---

`safeFetch` no longer sends a key in a header of its own to another host when a redirect points there (PO-664). On a redirect to another origin it used to drop only `Authorization`, `Cookie` and `Proxy-Authorization`, so an `X-API-Key`, Brevo's `api-key`, Pipedrive's `x-api-token` or a header named in an HTTP Header Auth credential went along to the redirect target. Such a hop now keeps only `Accept`, `Accept-Encoding`, `Accept-Language`, `Content-Language`, `Content-Type`, `SOAPAction` and `User-Agent`, and drops every other header. A redirect within the same origin keeps every header, as before.
