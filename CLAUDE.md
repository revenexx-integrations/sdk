# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build      # compile to dist/ (ESM + CJS + .d.ts) via tsup
npm run dev        # tsup watch mode
npm test           # node --test via tsx over src/**/*.test.ts
npm run lint       # biome check src (linter only — see below)
npm run typecheck  # tsc --noEmit
```

The SDK ships unit tests (`src/*.test.ts`) — run them with `npm test`. `lint`,
`typecheck`, `test` and `build` all run in the `test` job of `ci.yml`, which is a
required status check.

### biome: linter on, formatter off

`biome.json` (schema **2.5.x** — the 1.9 shape is a different config format)
enables the **linter only**. Three things about it are load-bearing:

- **The rule it exists for is `style/noRestrictedGlobals` on `fetch`.** This is
  the package that defines `safeFetch` and `assertPublicUrl`, and PO-185 was a
  raw `fetch` in `src/credentials.ts` posting OAuth client credentials at a URL
  taken from credential config — no SSRF guard. Use `safeFetch`.
  **`src/fetch.ts` is the one sanctioned exception** (`timedFetch`, called by
  `guardedFetch` *after* the guard has run) and is excepted via `overrides`.
  Adding a second exception means adding a second way to bypass the guard.
- **The formatter is deliberately disabled.** Biome disagrees with this repo's
  hand-wrapped source in 13 to 17 of 22 files depending on `lineWidth` (13 at its
  narrowest useful setting, 17 at the siblings' 200) — unlike its sibling
  node packages, the SDK was never biome-formatted. Turning it on is a repo-wide
  reformat: fine as its own commit, never as a passenger on another change. The
  sibling packages' `indentStyle`/`lineWidth` values stay in the file for whoever
  does it.
- **`biome.json` does not accept `//` comments, and fails silently.** Biome falls
  back to its built-in defaults with no error, which looks like a working config
  while the `fetch` rule is off and the formatter is reformatting to tabs. If a
  rule seems not to fire, probe it (write a deliberate violation) rather than
  trusting the output. Comments would need the file renamed to `biome.jsonc`,
  which the three sibling repos do not do.

See [`docs/security-scanning.md`](docs/security-scanning.md) for the scanners
(gitleaks, osv-scanner) and [`docs/branch-protection.md`](docs/branch-protection.md)
for the rulesets — which, unlike the sibling repos', are live, because this repo
is public.

## Architecture

`@revenexx/integrations-node-sdk` is a tiny shared TypeScript library consumed by individual Revenexx integration node packages. It ships dual ESM/CJS output via `tsup`.

**Source modules (all public, re-exported from `src/index.ts`):**

- `src/types.ts` — all interfaces and union types that define the node and credential contracts:
  - `INode` — the interface every integration node must implement (`description` + `execute`)
  - `INodeDescription` — static metadata (slug, version, category, ports, config schema)
  - `INodeContext` — runtime context injected into `execute` (signal, logger, secrets, credentials, state)
  - `INodeState` — the tenant state store a workflow remembers between runs (mapping / cursor / claim / digest); the role decides whether a write is immediate or only counts once the run completes
  - `INodeDescription.inputs` is `Record<string, IInputPort>` — single-input nodes use the conventional key `'in'`; fan-in nodes (merge, join) declare multiple named keys
  - `INodeResult` — what `execute` must return (output map + optional branch name)
  - `INodeWithIteration` / `isNodeWithIteration` — optional capability for nodes that drive iteration over a collection
  - Credential contract: `ICredential`, `ICredentialDescription`, `ICredentialContext`, `ICredentialField`, `ICredentialTestResult`, `ICredentialResolveResult`, `ICredentialOAuthAuthorize`, `isOAuthAuthorizeCredential`
  - Template contract: `ITemplateDescription`, `ITemplateTrigger` (plain-data workflow blueprints a package can ship)
  - Supporting types: `IInputPort`, `IOutputPort`, `IConfigField`, `IConfigOption`, `IConfigValidation`

- `src/credentials.ts` — abstract base classes that implement `ICredential` so credential authors only fill in the gaps: `BaseCredential`, `SimpleValueCredential`, `ApiKeyCredential`, `BasicAuthCredential`, `OAuth2ClientCredentialsCredential`, `OAuth2AuthCodeCredential`. Concrete credentials `extend` one of these (e.g. `SmtpCredential extends SimpleValueCredential`).

- `src/localized.ts` — `normalizeLocalized` helper that reduces a `LocalizedString` to a single plain string (shared by the UI and Laravel rendering).

- `src/errors.ts` — `NodeError` class for unexpected/system-level failures thrown inside `execute`.

- `src/extract.ts` — `extractManifest` / `extractManifests` (nodes) and `extractCredentialManifest` / `extractCredentialManifests` (credentials) helpers that pull the descriptions off one or many instances (used by the node registry to build manifests without running nodes).

- `src/manifest.ts` — `buildManifest` / `MANIFEST_VERSION` — wrap node, credential and template descriptions in the `{ manifestVersion, nodes, credentials, templates? }` envelope the registry expects (`credentials` and `templates` are added only when non-empty).

- `src/cli.ts` — the `rvnxx-nodes` CLI (`bin`); `rvnxx-nodes manifest` imports a package's built `dist/index.js`, reads its `NODES` (and optional `CREDENTIALS` / `TEMPLATES`) exports and writes `dist/manifest.json`.

- `src/index.ts` — barrel re-export of all modules.

The SDK also ships its own unit tests: `src/credentials.test.ts`, `src/localized.test.ts`, `src/manifest.test.ts`.

**Key design constraints:**
- `IOutputPort.kind` (`'default' | 'branch' | 'error'`) controls routing in the workflow engine; `sourceFromConfig` lets the node dynamically name an output from a config field value.
- `INodeDescription.outputs` may be an empty array (PO-201): that marks a **terminal node** (dead end — no edge may leave it), the mirror image of `inputs: {}` on a trigger. Only for nodes with genuinely no continuation, e.g. `StopAndErrorNode`, which always throws. Never declare a port that can never fire just to fill the field.
- `IConfigField.type` `'secret-ref'` means the field value is a key resolved at runtime via `INodeContext.secrets.get()`.
- `LocalizedString` is `string | Record<string, string>` — all user-visible text fields accept either a plain string or a locale map.
- `INodeContext.signal` is always provided by the engine; nodes must propagate it to all I/O.
- Error contract: `throw NodeError` for unexpected errors, `return { branch: '<error-port>' }` for expected routable errors. Never mix both for the same condition.
- `execute(ctx, inputs)` receives a `Record<string, unknown>` keyed by port name; single-input nodes read `inputs['in']`.
- **Dynamic (author-time) config/ports (PO-143):** a config field may set `dynamic: true` (+ `dependsOn`) so its `options` — or, for `type: 'dynamic-schema'`, its whole flat field set — are resolved while editing; an output may set `resolveOutputs: true` for a generic port set. A node supplies these via the optional `INode` resolvers `loadOptions` / `resolveConfigSchema` / `resolveOutputs`, which receive an `INodeAuthorContext` and run in the node-runtime host — **never** in `execute` (results are snapshotted into the workflow blob at save). A `dependsOn`-driving field must be a literal (no `expressionAllowed`).
