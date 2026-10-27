---
"@revenexx/integrations-node-sdk": minor
---

`safeFetch`'s `timeoutMs` is now one budget per attempt that covers the lookup, every redirect hop and the answer's body, not only the time until the headers arrive (IN-36). An answer that starts and then stalls ends as `NodeError('TIMEOUT')` in whatever reads it — `readArrayBuffer`, `readText`, `readJsonOrText` or the response's own `text()`/`json()` — and its connection is closed; until now it held the step until the run was cancelled. A cancellation during the answer still ends it as the cancellation. The limit is stricter than before: a redirect chain and a slow body now share the budget instead of each hop getting it again, so a node that sets a long `timeoutMs` for large downloads should check that its figure still fits the whole transfer. `timeoutConfigField`'s description says so to the workflow author.
