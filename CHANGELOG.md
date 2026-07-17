# @revenexx/integrations-node-sdk

## 0.16.0

### Minor Changes

- 1edd7b3: Add optional `groups` to `INodeDescription`: a curated node-picker group path
  (localized labels, outermost first, max 4 levels), e.g.
  `[{ en: "Business Central" }, { en: "Sales Orders" }]`. The manifest CLI
  carries it verbatim; pickers without it keep deriving groups from the package
  and category.

## 0.15.0

### Minor Changes

- f51f001: Add response body size-cap + parsing helpers to the fetch module (PO-137): `readArrayBuffer`, `readText` and `readJsonOrText` enforce a hard byte cap (fast-reject on `Content-Length`, plus streaming enforcement since the header can be absent or lie), throwing `NodeError('RESPONSE_TOO_LARGE', …, { status })` on overrun. Adds `DEFAULT_MAX_RESPONSE_BYTES` (25 MiB) plus a `MAX_RESPONSE_BYTES` hard ceiling (100 MiB) that no per-node `maxBytes` can lift — enforced both in `maxBytesConfigField()`'s validation and at runtime in the `read*` helpers (via `clampResponseBytes`), mirroring `safeFetch`'s timeout clamp. `readJsonOrText` surfaces malformed JSON as `NodeError('RESPONSE_PARSE_ERROR', …, { status })` instead of a raw `SyntaxError`, keeping to the SDK error contract, and detects the JSON content type robustly (case-insensitive, `;`-parameters stripped, `+json` structured-syntax suffixes recognised, `application/jsonp` not mis-detected). These centralise the content-type sniffing previously duplicated across the HTTP/Upload/DeepL node sinks and guard the shared worker against a single oversized response exhausting its memory.
- bb3f945: Add a transport-agnostic retry/backoff primitive (PO-139): `withRetry`, `RetryableError`, `sleepWithSignal`, `backoffDelay`, `RetryPolicy` and `DEFAULT_RETRY_POLICY`, re-exported from the barrel. Connectors throw `RetryableError` (optionally carrying a server-dictated `retryAfterMs`) to opt an attempt into a retry; everything else is rethrown and terminal API errors modelled as values flow through unchanged. Backoff is exponential with full jitter, capped at `maxDelayMs`, and `Retry-After` takes precedence. The wait is abort-aware — cancelling the workflow (`ctx.signal`) stops the sleep and prevents any further attempt. No consumer changes; this is the shared mechanism connectors (BC/core/pipedrive) will adopt in follow-ups.

## 0.14.0

### Minor Changes

- 72aa7a0: Read the node package's bundle label from the `package.json` `revenexx` group (`revenexx.displayName`, e.g. `{ "revenexx": { "displayName": "Business Central" } }`). `parsePackageMeta` exposes it and the CLI warns when it is absent. The label is read directly from `package.json` by the integrations registry — it is not carried in the built manifest, so `buildManifest` takes no `displayName` argument and emits no `package` block.

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
