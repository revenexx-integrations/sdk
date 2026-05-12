# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build      # compile to dist/ (ESM + CJS + .d.ts)
npm run dev        # watch mode
```

There are no tests or lint scripts defined. Type-check manually with `npx tsc --noEmit`.

## Architecture

`@revenexx/integrations-node-sdk` is a tiny shared TypeScript library consumed by individual Revenexx integration node packages. It ships dual ESM/CJS output via `tsup`.

**Four source files, all public:**

- `src/types.ts` — all interfaces and union types that define the integration node contract:
  - `INode` — the interface every integration node must implement (`description` + `execute`)
  - `INodeDescription` — static metadata (slug, version, category, ports, config schema)
  - `INodeContext` — runtime context injected into `execute` (signal, logger, secrets)
  - `INodeResult` — what `execute` must return (output map + optional branch name)
  - Supporting types: `IInputPort`, `IOutputPort`, `IConfigField`, `IConfigOption`, `IConfigValidation`

- `src/errors.ts` — `NodeError` class for unexpected/system-level failures thrown inside `execute`.

- `src/extract.ts` — `extractManifest` / `extractManifests` helpers that pull the `INodeDescription` off one or many `INode` instances (used by the node registry to build manifests without running nodes).

- `src/index.ts` — barrel re-export of all modules.

**Key design constraints:**
- `IOutputPort.kind` (`'default' | 'branch' | 'error'`) controls routing in the workflow engine; `sourceFromConfig` lets the node dynamically name an output from a config field value.
- `IConfigField.type` `'secret-ref'` means the field value is a key resolved at runtime via `INodeContext.secrets.get()`.
- `LocalizedString` is `string | Record<string, string>` — all user-visible text fields accept either a plain string or a locale map.
- `INodeContext.signal` is always provided by the engine; nodes must propagate it to all I/O.
- Error contract: `throw NodeError` for unexpected errors, `return { branch: '<error-port>' }` for expected routable errors. Never mix both for the same condition.
