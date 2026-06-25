---
"@revenexx/integrations-node-sdk": patch
---

docs: correct and expand the node-authoring examples in the README

Fix the pseudo-code in the "Authoring a node" section so it matches the real
contract and `integrations-nodes-core` conventions:

- Use namespaced slugs (`revenexx:<slug>`) instead of a dotted path.
- Give every output port a `name`; document that the `outputs` map key, the
  `branch` and the port `name` must match.
- Call `NodeError(code, message)` with the correct argument arity.
- Note that resolved config values arrive via the same `inputs` map.

Adds three realistic examples (transform, control/branch, action with an error
output and credentials) condensed from the core nodes.
