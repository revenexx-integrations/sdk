# @revenexx/integrations-node-sdk

## 0.13.0

### Minor Changes

- 936e807: Add image definitions to nodes, credentials, and templates. A new `IImage` type
  lets a package declare associated images (screenshots, logos, banners) via the
  optional `images?: IImage[]` field on `INodeDescription`, `ICredentialDescription`,
  and `ITemplateDescription`. The `rvnxx-nodes manifest` CLI now copies every
  declared image file into `dist/` (preserving its sub-path) so `npm pack` ships
  it automatically, warning — rather than failing — for declarations whose file is
  missing on disk.
- 983de47: Add the dynamic-node author-time contract (PO-143): config fields may set `dynamic` / `dependsOn` and the new `dynamic-schema` type; outputs may set `resolveOutputs`; and `INode` gains optional `loadOptions` / `resolveConfigSchema` / `resolveOutputs` resolvers (with `INodeAuthorContext`) that run in the node-runtime host at author time. All additions are optional and backwards-compatible.

## 0.12.1

### Patch Changes

- 859f577: docs: correct and expand the node-authoring examples in the README

## 0.12.0

### Minor Changes

- b662169: Add `safeFetch` helper with unified timeout (configurable, hard-capped at 120 s) and optional retry support. Exports `timeoutConfigField` and `retryConfigFields` factories for consistent node config declarations.

### Patch Changes

- b48f860: Update release process
