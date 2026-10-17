---
"@revenexx/integrations-node-sdk": patch
---

A URL with a user name or password in it, as the address of a call or of a redirect, is refused with `INVALID_URL` before anything is sent, and the message quotes no part of it. Until now the runtime refused it with the whole URL in the message, password and query string included, and that message reached the error port. A token exchange that its endpoint refuses names the endpoint by origin and path only (PO-763).
