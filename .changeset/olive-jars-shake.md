---
"@revenexx/integrations-node-sdk": minor
---

The error shape and the `error` output every node package was building separately now
live here: `NodeErrorOutput`, `toErrorOutput`, `errorResult`, `toErrorResult`,
`httpErrorResult` and `errorPort`. It is the copy `integrations-nodes-core` has been
carrying, with two deliberate changes: `status` is now taken from a `NodeError` only
where it is a *finite* number, so a `NaN` no longer reaches the author as an empty
field; and `toErrorResult` / `httpErrorResult` take the port name as an optional second
argument, so a node whose failure output is not called `error` no longer branches to a
port it does not declare. `specs/error-handling.md` states the rule the shape exists
under, which until now was written twice in two places that disagreed.
