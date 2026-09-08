---
"@revenexx/integrations-node-sdk": minor
---

The error shape and the `error` output every node package was building separately now
live here: `NodeErrorOutput`, `toErrorOutput`, `errorResult`, `toErrorResult`,
`httpErrorResult` and `errorPort`. Behaviour is unchanged — the code is the copy
`integrations-nodes-core` has been carrying, and `specs/error-handling.md` states the
rule it exists under, which until now was written twice in two places that disagreed.
