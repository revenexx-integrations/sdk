---
'@revenexx/integrations-node-sdk': minor
---

An author-time resolver can keep an expensive result for the next call: `INodeAuthorContext.cache`, with `get` and `set` of JSON values (IN-82). The node runtime runs every `loadOptions`, `resolveConfigSchema` and `resolveOutputs` call in a fresh process, so a node's own memory never reached the second call — a settings dialog asking for a dropdown, a field set and the output ports did the same work three times. The store is optional and best-effort: it may be absent or miss, and a node reads it before doing the work, never instead of it. The runtime scopes it to the tenant, the node and its bundle.
