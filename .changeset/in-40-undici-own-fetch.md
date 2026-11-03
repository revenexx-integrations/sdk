---
'@revenexx/integrations-node-sdk': patch
---

`safeFetch` works on Node 26 again (IN-40). It sends through undici's own `fetch`, the one its guarded dispatcher belongs to, instead of the runtime's built-in `fetch` — Node 26 refused the SDK's undici 6 dispatcher and every request failed with `fetch failed`. A `fetch` a test puts in the global's place is still called instead, so package suites that stub `globalThis.fetch` keep working, and every answer is still the runtime's own `Response`.
