---
"@revenexx/integrations-node-sdk": minor
---

`safeFetch` reports every answered request — address, request headers, status — to a reporter the host installs under `CREDENTIAL_USE_REPORTER_SYMBOL` (IN-146), so the worker can tell a credential the service refused from one it accepted. Without a reporter nothing changes, and the body of the answer is never read.
