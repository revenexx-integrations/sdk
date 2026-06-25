# @revenexx/integrations-node-sdk

## 0.12.1

### Patch Changes

- 859f577: docs: correct and expand the node-authoring examples in the README

  Fix the pseudo-code in the "Authoring a node" section so it matches the real
  contract and `integrations-nodes-core` conventions:

  - Use namespaced slugs (`revenexx:<slug>`) instead of a dotted path.
  - Give every output port a `name`; document that the `outputs` map key, the
    `branch` and the port `name` must match.
  - Call `NodeError(code, message)` with the correct argument arity.
  - Note that resolved config values arrive via the same `inputs` map.

  Adds three realistic examples (transform, control/branch, action with an error
  output and credentials) condensed from the core nodes.

## 0.12.0

### Minor Changes

- b662169: Add `safeFetch` helper with unified timeout (configurable, hard-capped at 120 s) and optional retry support. Exports `timeoutConfigField` and `retryConfigFields` factories for consistent node config declarations.

### Patch Changes

- b48f860: Update release process
