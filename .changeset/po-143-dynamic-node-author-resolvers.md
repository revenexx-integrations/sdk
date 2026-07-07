---
"@revenexx/integrations-node-sdk": minor
---

Add the dynamic-node author-time contract (PO-143): config fields may set `dynamic` / `dependsOn` and the new `dynamic-schema` type; outputs may set `resolveOutputs`; and `INode` gains optional `loadOptions` / `resolveConfigSchema` / `resolveOutputs` resolvers (with `INodeAuthorContext`) that run in the node-runtime host at author time. All additions are optional and backwards-compatible.
