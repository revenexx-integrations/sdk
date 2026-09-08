# @revenexx/integrations-node-sdk

## 1.3.0

### Minor Changes

- 5dca91b: The error shape and the `error` output every node package was building separately now
  live here: `NodeErrorOutput`, `toErrorOutput`, `errorResult`, `toErrorResult`,
  `httpErrorResult` and `errorPort`. It is the copy `integrations-nodes-core` has been
  carrying, with two deliberate changes: `status` is now taken from a `NodeError` only
  where it is a _finite_ number, so a `NaN` no longer reaches the author as an empty
  field; and `toErrorResult` / `httpErrorResult` take the port name as an optional second
  argument, so a node whose failure output is not called `error` no longer branches to a
  port it does not declare. `specs/error-handling.md` states the rule the shape exists
  under, which until now was written twice in two places that disagreed.

## 1.2.0

### Minor Changes

- 33ace6a: Judge the address a connection lands on, not only the one that was checked (PO-184).

  `assertPublicUrl` resolves a target's hostname and approves its addresses; the
  connection that follows resolves the name **again**, on its own. A DNS answer
  that differs the second time — public while the guard looks, private when the
  socket opens — walked past the guard. That is DNS rebinding, and in this product
  the workflow author supplies the URL _and_ the DNS behind it, so the usual
  precondition for it is met by default rather than by exception.

  `safeFetch` now judges that second answer too. While a hop is in flight it
  watches undici's `undici:client:connected` diagnostics channel for the host it is
  reaching, runs the same address ruling over the connected socket's peer address,
  and destroys the socket when it is private or reserved. The channel is published
  synchronously, before the request is written, so a refused target receives no
  request bytes — the refusal still surfaces as
  `NodeError('BLOCKED_ADDRESS', …, { status: 0 })`, and still is not retried.

  What this does not do: the TCP handshake — and for `https:` the TLS handshake —
  with the refused address has already completed when the connection is judged.
  Nothing of the request follows it, but a bare connection is observable to
  whoever aimed the call there. `specs/ssrf-guard.md` records that, and the
  worker's network egress policy remains the layer that does not depend on this
  code being right.

  Four things a consumer can observe, which is why this is not a patch:

  - A call that only got through by rebinding now throws. No consumer could have
    depended on that without depending on a bypass of a documented refusal.
  - The first `safeFetch` call installs a `diagnostics_channel` subscriber in the
    host process. It judges only the **host and port** a `safeFetch` call is
    currently reaching, so the worker's own connections to internal services are
    untouched — that promise has two tests of its own, one for another host and one
    for another port on the same host. What it cannot do is tell whose connection a
    socket is: the announcement names the target, not the caller. A connection
    somebody else opens to a target a call is reaching is judged too, and
    `specs/ssrf-guard.md` records that.
  - The subscriber logs one warning, once per process, if it is ever handed a
    message it cannot read — the shape of that message belongs to Node's bundled
    undici, and a rename would otherwise take this half of the guard away in
    silence. The suite now runs on every Node major `engines` claims for the same
    reason.
  - `RVNXX_SSRF_ALLOW_PRIVATE` now relaxes both halves. Without that the local
    stack would pass the check and then lose its sockets.

  Not a major, although the SemVer table would read "changed semantics" that way:
  the behaviour that disappears is behaviour `specs/ssrf-guard.md` always refused,
  and a security fix that every consumer has to opt into by hand is a security fix
  that does not arrive.

- 56c2957: Refuse an address unless a maintained classification calls it public (PO-183).

  `isBlockedAddress` decided what was public by classifying the address **by
  hand** — its own IPv4 and IPv6 parsers plus a list of range checks. That was a
  deliberate limitation when the guard shipped: the list covered the ranges that
  mattered most, and it was accurate about being incomplete. What it left out was
  reserved address space that read as public and would have passed — carrier-grade
  NAT `100.64.0.0/10`, multicast, the broadcast address, the documentation,
  benchmarking and future-use bands, IPv6 deprecated site-local, and the
  transitional ranges 6to4 `2002::/16`, Teredo `2001::/32` and NAT64
  `64:ff9b::/96`, each of which can carry a private IPv4 address inside an IPv6
  one, and every IPv6 band nobody has been allocated.

  The classification now comes from `ipaddr.js`, and the rule over it is stated the
  other way round: an address is refused **unless** it is public unicast. That is
  what makes the gap close for good rather than by one list getting longer —
  nobody has to remember which reserved range was left out, and a range the
  classification learns about later is refused without a change here.

  Being public unicast is _determined_, not defaulted to. Asked which special range
  an address is in, the classification answers "none" for space it has no range
  for, and unallocated space answers that way — so for IPv6, where most of the
  space is unallocated, the criterion is that the address also sits inside
  `2000::/3`, the block IANA has handed out. Without that, `1000::/4`, `4000::/2`,
  `8000::/1` and `fe00::/9` would all read as public.

  The forms that carry one version inside the other are judged on the address they
  carry rather than on the wrapper: IPv4-mapped `::ffff:a.b.c.d`, the deprecated
  IPv4-compatible `::a.b.c.d`, and the NAT64 well-known prefix `64:ff9b::/96` — the
  last because on an IPv6-only network with DNS64 it is what every IPv4-only host
  resolves to, so refusing the prefix whole would refuse them all. A private
  address behind any of them is still refused; a public one stays reachable. 6to4
  and Teredo are refused whole, being legacy transition rather than infrastructure.
  An address that cannot be parsed is still blocked.

  Two things a consumer can observe, which is why this is not a patch:

  - **Targets that used to be allowed now throw `BLOCKED_ADDRESS`.** Every one of
    them is in reserved, non-public address space; none is a host anybody can
    legitimately serve an API from. `2001:db8::/32` — the documentation prefix — is
    the case the test matrix used to assert was allowed, and it is now refused.
  - **The SDK has a runtime dependency for the first time.** `ipaddr.js` has no
    transitive dependencies and adds ~13.4 KB minified to a bundled workflow. That
    cost is the reason the classification is being handed over rather than extended:
    the alternative was keeping a parser and a range table correct here, in a
    package whose consumers cannot see it.

  What this does not change: which addresses are checked, or when. Both halves of
  the guard — the pre-flight ruling and the connected-socket judgement from PO-184
  — run the same ruling as before, so the refusals arrive at exactly the same
  points and in the same error shape. `RVNXX_SSRF_ALLOW_PRIVATE` still relaxes both.

  The residual is now mostly the dependency's vintage rather than our attention:
  `ipaddr.js` is pinned to an exact version, so a range the address registry sets
  aside inside the allocated block after that version was published reads as
  `unicast` until the pin moves forward. What is still kept by hand is the one
  constant above — the boundary of the allocated block — which fails the safe way
  (space allocated outside it reads as refused, costing reachability and not
  safety) but is nonetheless ours to move. `specs/ssrf-guard.md` records both as
  _Known_ gaps, in place of the _Undecided_ one this closes.

### Patch Changes

- 65796f3: `BaseCredential.postForm` now reads the token endpoint's answer through
  `readText` under a 1 MiB cap instead of a bare `res.text()` (PO-185), so an
  OAuth token exchange can no longer read an answer of any size into the worker.

  This is the half of PO-185 that the previous change did not close. `safeFetch`
  hands back a `Response`; reading it is the caller's job, so routing `postForm`
  through the guard bounded where the request could go and how long it could take,
  but not how much came back. It is the one answer in the package that no node's
  settings stand in front of — nobody chooses a cap for a credential resolve — and
  it is read on every first use and every refresh, in a worker every workflow
  shares.

  **An answer past the cap now fails** with `NodeError('RESPONSE_TOO_LARGE')`
  where it previously succeeded, and the same holds for a refusal: both branches
  read one string, and an error body from a token endpoint is the less predictable
  of the two. The figure is deliberately far below `DEFAULT_MAX_RESPONSE_BYTES` —
  an OAuth token response is a small JSON object, and even an `id_token` with a
  fat claim set is tens of kilobytes — and it is not a setting, because there is no
  node author and no workflow author in front of this call to offer it to. Nothing
  that ships today comes near it.

  The RFC 6749 §5.2 error extraction is unchanged: a failure still carries only
  `error` and `error_description`, never the raw body.

  Alongside it, `readArrayBuffer`'s `Content-Length` fast-reject now discards the
  body before it throws, so a refused answer releases its connection instead of
  leaving it held. That exit was the only one out of a read that did not — the
  streaming overrun cancels, and `safeFetch` already cancels a redirect body ahead
  of every throw path — and it was unreachable until now, because `res.text()`
  always consumed the body on its way to the same failure. Routing `postForm`
  through a capped read is what reaches it, on the call this changeset is about.

## 1.1.0

### Minor Changes

- 180f2d1: A setting nested inside another one is typed as a full setting (PO-436).

  `IConfigField.properties` and `IConfigField.items` were typed as
  `IConfigFieldBase`, which carries no `properties` and no `items` of its own — so a
  nested setting could not itself group or repeat. That is the ordinary case, not an
  exotic one: `items.type: 'object'` plus `items.properties` is the repeating row
  every mapping-style setting is built from, and it needed a cast (`as IConfigField`)
  to type-check. The base's own members (`options`, `default`, `required`,
  `description`, `showIf`) were always available on a nested setting; only the
  nesting stopped at one level. The manifest schema permits it and the platform's
  config walker reads nested fields as first-class, so the type was the only place
  saying otherwise.

  Both are now `IConfigField`. Additive: a node that declared the narrower shape
  still type-checks, and the casts written to get around it can go.

## 1.0.0

### Major Changes

- 44382c9: Add `ctx.state` — the tenant state store a workflow remembers between runs (PO-374).

  `INodeContext` gains a `state` property, typed by the new `INodeState`: id
  mappings (`mapping.get` / `mapping.put`), incremental watermarks (`cursor.get` /
  `cursor.set`), processed-once claims (`claim`) and change detection
  (`digest.unchanged` / `digest.set`). The runtime has provided these since the
  engine-side change landed; this makes them typed and discoverable for node
  authors.

  The role of a namespace decides when a write becomes visible — mappings and
  claims immediately, cursors and digests only once the run completes — so these
  are four operations rather than a generic get/set.

  Nodes name a namespace through a new `state-ref` config field type (with
  `stateRole` narrowing it to one of the four roles), not through a literal in
  `execute`: the editor gives the author a picker, and the engine only lets a node
  reach the namespaces its own config names.

  Additive for node authors. Anything that _implements_ `INodeContext` (test
  helpers, mock contexts) must now supply `state`.

  **Major, and therefore 1.0.0.** `state` is a required member on `INodeContext`,
  which `docs/versioning.md` puts under Major — and the pre-1.0 stance is to follow
  that matrix as if the leading zero were not there. A required member on a minor
  is the one combination the policy rules out, and making `state` optional to earn
  the smaller bump would mean every node author writing `ctx.state?.` for something
  the engine always supplies, while mock contexts kept compiling without it — the
  exact gap this changeset exists to announce. So the version follows the type
  rather than the other way round.

### Minor Changes

- 2698bb2: Add `showIf` — a setting that says when it applies (PO-410).

  `IConfigField` gains an optional `showIf`: another setting's `key`, an `op` from
  the shared comparison vocabulary, and the `value` to compare against. A node
  that has a **Source** select and a field only read under one of its choices now
  says so once in its manifest, instead of explaining it in prose under the field
  — which the author reads last, having already filled it in.

  ```ts
  { key: 'path', label: 'Path to the date', type: 'string',
    showIf: { key: 'source', op: 'equals', value: 'field' } }
  ```

  New exports beside it:

  - `OPERATORS` / `Operator` / `isOperator` / `takesValue` — the fourteen
    comparison words, which are the same ones a condition node offers an author.
    They were written for those nodes and lived in `integrations-nodes-core`; a
    settings condition needs the same list, so it moved here and the node package
    re-exports it. One vocabulary, three readers.
  - `evaluate(left, op, right)` — what each word means. The answer table in
    `src/operators.test.ts` is the canonical statement of it, and is what the two
    implementations outside this package (the editor drawing the field, the
    platform validator deciding whether to demand it) are checked against.
  - `settingApplies(field, config)` — whether a setting applies given what is
    filled in so far. A field with no condition always applies.

  Additive: a node that says nothing behaves exactly as before, and so does a
  reader of the manifest that does not know the key. **Minor**, not major —
  `showIf` is optional and nothing existing changes shape.

  Two limits worth knowing before reaching for it. The driving key must be a
  literal, the same rule `dependsOn` already carries, and the platform's manifest
  constraints refuse a condition against an `expressionAllowed` field. And the
  editor honours this only from the studio version that ships PO-410's second
  half; until then a conditioned field is simply drawn as it is today.

### Patch Changes

- 73268de: The behaviour this package has always had is now written down and held to it. Eleven
  feature specs state 94 promises across the egress guard, redirect following, the request
  budget, response reading, the retry primitive, the credential base classes, the manifest
  envelope, the shipped image files, and the three helpers that settle what a node
  declares. Every
  promise names a test that proves it, and `npm run spec:check` refuses a change that
  moves one without the other.

  **No shipped code changed in this release.** `dist/` is byte-for-byte what the previous
  version published; the diff is specs, the gate that enforces them, and the tests that
  carry the new tags. The version exists to mark the point from which a change to what
  this package promises its consumers cannot land silently — from here, a promise that
  moves brings its spec and its test with it, or the gate is red.

  Three tests were found to be passing for the wrong reason while binding them, and are
  fixed:

  - **The redirect-bypass test never exercised the address guard.** It redirected
    `https` → `http` at a private target, which trips the downgrade check first — and both
    paths throw `BLOCKED_ADDRESS`, which was all the test asserted. It stayed green with
    the address guard switched off entirely. The hop now stays on `https`, so only the
    guard can refuse it.
  - **`OAuth2AuthCodeCredential.resolve` with no refresh token** asserted only _that_ it
    rejected. Without the guard clause the resolve goes on to post a refresh carrying no
    token, which fails against the network anyway. It now asserts the reason.
  - **The manifest's "credentials are omitted when empty" promise** was bound to a test
    proving the opposite half. Emitting an empty block left it green.

  None of the three changes behaviour — they close holes in the proofs of behaviour that
  was already correct.

- 9e6b950: `BaseCredential.postForm` now goes through `safeFetch` instead of a raw `fetch`
  (PO-185), so the `assertPublicUrl` SSRF guard covers every OAuth token exchange
  the SDK offers — client-credentials, auth-code and refresh all funnel through it.
  The token endpoint is not a constant: it comes from `tokenUrl(config)`, i.e. from
  a value typed into a credential form, so without the guard a credential could
  post its client secret at an internal address.

  Three behaviour changes come with it.

  **A token endpoint that resolves to a private or reserved address now fails**
  with `NodeError('BLOCKED_ADDRESS')` where it previously completed. That is the
  point of the change, but it is a break for anyone pointing an OAuth credential at
  an internal STS — and there is no production opt-out: `safeFetch` exposes no
  `lookup` option, and `RVNXX_SSRF_ALLOW_PRIVATE` is local-development only. Both
  credentials that ship today are unaffected, because both take their host from a
  hardcoded public constant rather than from config
  (`login.microsoftonline.com` in `business-central`, `oauth.pipedrive.com` in
  `pipedrive`); only the tenant path segment is config-derived. A credential that
  does derive its _host_ from config should expect the guard to apply.

  A token exchange is now bounded by `DEFAULT_TIMEOUT_MS` in addition to
  `ctx.signal`.

  Redirects are followed manually with each hop re-checked and `Authorization`
  dropped across an origin boundary — which means a 301/302 answer to the POST is
  downgraded to a bodiless GET, per the usual redirect rules. Real token endpoints
  do not redirect.

## 0.18.1

### Patch Changes

- d80e235: Document that `INodeDescription.outputs` may be an empty array (PO-201). An
  empty array marks a **terminal node**: the path ends there and no edge may
  leave it — the mirror image of `inputs: {}` on a trigger. The canonical case is
  `StopAndErrorNode`, which always throws and therefore has no success path to
  wire; before this it declared a dummy port labelled "Never" purely to satisfy
  the manifest schema, which left a dead handle on the editor canvas.

  No type change: `outputs: IOutputPort[]` stays required and already accepted
  `[]`. The actual constraint lived in the Integrations node-manifest schema
  (`minItems: 1`), which has been relaxed on the server side; publishing a node
  with `outputs: []` requires that change to be deployed first.

## 0.18.0

### Minor Changes

- 26a52ef: Add an always-on SSRF guard to `safeFetch`. Requests to private, loopback,
  link-local or reserved targets (incl. the cloud metadata address) are now
  rejected with `NodeError('BLOCKED_ADDRESS')`, and redirects are followed
  manually with the guard re-checked on every hop (`NodeError('TOO_MANY_REDIRECTS')`
  past 5 hops). On a cross-origin hop the `Authorization`, `Cookie` and
  `Proxy-Authorization` headers are dropped, and an `https`→`http` downgrade is
  refused. A hostname that resolves to a private address no longer echoes the
  resolved IP back to the caller. Exports the new `assertPublicUrl` and
  `isBlockedAddress` helpers (the guard is always on and not caller-opt-outable —
  there is no public resolver override). Best-effort: a DNS-rebinding (TOCTOU) gap
  remains — see the README.

## 0.17.0

### Minor Changes

- d0f8625: Add optional `search` to `INodeAuthorContext` — the operator's type-to-search term for the option list being resolved. Set only for `loadOptions` calls; providers may use it server-side or to filter the returned options.

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
