---
"@revenexx/integrations-node-sdk": minor
---

`safeFetch`'s `timeoutMs` now also bounds the answer's body, as a limit on how long it may go silent (IN-36). Up to the headers it is one budget per attempt, shared by the lookup and every redirect hop instead of starting again at each hop. Once the headers are in, each read of the body may wait `timeoutMs` for the next chunk: an answer that starts and then stalls ends as `NodeError('TIMEOUT')` in whatever reads it — `readArrayBuffer`, `readText`, `readJsonOrText` or the response's own `text()`/`json()` — and its connection is closed; until now it held the step until the run was cancelled. A download that keeps arriving is not cut off, however long it takes in total. A cancellation during the answer still ends it as the cancellation. The response `safeFetch` returns is now a copy of the runtime's, with the same status, headers and `url`. `timeoutConfigField`'s description says what the setting covers to the workflow author.
