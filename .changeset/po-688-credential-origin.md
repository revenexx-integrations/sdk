---
"@revenexx/integrations-node-sdk": minor
---

`safeFetch` can bind a request to the origin of the credential it carries: `credential: { origin }`. The request is then refused with `CREDENTIAL_ORIGIN` anywhere else, on the first hop and on every redirect, before the other host is looked up or sent anything, and wherever the secret sits: header, query, path or body. `crossOriginRedirect: 'strip'` lets a download follow its server to another host without its secret headers (PO-688).
