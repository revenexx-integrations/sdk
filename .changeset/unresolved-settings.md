---
"@revenexx/integrations-node-sdk": minor
---

A node can ask whether a setting's placeholder found nothing in this record: `INodeContext.unresolvedSettings` and `wasUnresolved(ctx, path)` (IN-63). Such a setting arrives without a value, like one nobody configured; a list node checks before it drops an empty filter.
