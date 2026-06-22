# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build      # compile to dist/ (ESM + CJS + .d.ts) via tsup
npm run dev        # tsup watch mode
npm test           # node --test via tsx over src/**/*.test.ts
npm run typecheck  # tsc --noEmit
```

There is no lint script (biome is not configured for the SDK). The SDK does
ship unit tests (`src/*.test.ts`) — run them with `npm test`.

## Architecture

`@revenexx/integrations-node-sdk` is a tiny shared TypeScript library consumed by individual Revenexx integration node packages. It ships dual ESM/CJS output via `tsup`.

**Source modules (all public, re-exported from `src/index.ts`):**

- `src/types.ts` — all interfaces and union types that define the node and credential contracts:
  - `INode` — the interface every integration node must implement (`description` + `execute`)
  - `INodeDescription` — static metadata (slug, version, category, ports, config schema)
  - `INodeContext` — runtime context injected into `execute` (signal, logger, secrets, credentials)
  - `INodeDescription.inputs` is `Record<string, IInputPort>` — single-input nodes use the conventional key `'in'`; fan-in nodes (merge, join) declare multiple named keys
  - `INodeResult` — what `execute` must return (output map + optional branch name)
  - `INodeWithIteration` / `isNodeWithIteration` — optional capability for nodes that drive iteration over a collection
  - Credential contract: `ICredential`, `ICredentialDescription`, `ICredentialContext`, `ICredentialField`, `ICredentialTestResult`, `ICredentialResolveResult`, `ICredentialOAuthAuthorize`, `isOAuthAuthorizeCredential`
  - Template contract: `ITemplateDescription`, `ITemplateTrigger` (plain-data workflow blueprints a package can ship)
  - Supporting types: `IInputPort`, `IOutputPort`, `IConfigField`, `IConfigOption`, `IConfigValidation`

- `src/credentials.ts` — abstract base classes that implement `ICredential` so credential authors only fill in the gaps: `BaseCredential`, `SimpleValueCredential`, `ApiKeyCredential`, `BasicAuthCredential`, `OAuth2ClientCredentialsCredential`, `OAuth2AuthCodeCredential`. Concrete credentials `extend` one of these (e.g. `SmtpCredential extends SimpleValueCredential`).

- `src/localized.ts` — `normalizeLocalized` helper that reduces a `LocalizedString` to a single plain string (shared by worker, UI and Laravel rendering).

- `src/errors.ts` — `NodeError` class for unexpected/system-level failures thrown inside `execute`.

- `src/extract.ts` — `extractManifest` / `extractManifests` (nodes) and `extractCredentialManifest` / `extractCredentialManifests` (credentials) helpers that pull the descriptions off one or many instances (used by the node registry to build manifests without running nodes).

- `src/manifest.ts` — `buildManifest` / `MANIFEST_VERSION` — wrap node, credential and template descriptions in the `{ manifestVersion, nodes, credentials, templates? }` envelope the registry expects (`credentials` and `templates` are added only when non-empty).

- `src/cli.ts` — the `rvnxx-nodes` CLI (`bin`); `rvnxx-nodes manifest` imports a package's built `dist/index.js`, reads its `NODES` (and optional `CREDENTIALS` / `TEMPLATES`) exports and writes `dist/manifest.json`.

- `src/index.ts` — barrel re-export of all modules.

The SDK also ships its own unit tests: `src/credentials.test.ts`, `src/localized.test.ts`, `src/manifest.test.ts`.

**Key design constraints:**
- `IOutputPort.kind` (`'default' | 'branch' | 'error'`) controls routing in the workflow engine; `sourceFromConfig` lets the node dynamically name an output from a config field value.
- `IConfigField.type` `'secret-ref'` means the field value is a key resolved at runtime via `INodeContext.secrets.get()`.
- `LocalizedString` is `string | Record<string, string>` — all user-visible text fields accept either a plain string or a locale map.
- `INodeContext.signal` is always provided by the engine; nodes must propagate it to all I/O.
- Error contract: `throw NodeError` for unexpected errors, `return { branch: '<error-port>' }` for expected routable errors. Never mix both for the same condition.
- `execute(ctx, inputs)` receives a `Record<string, unknown>` keyed by port name; single-input nodes read `inputs['in']`.
