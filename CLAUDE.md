# CLAUDE.md

Guidance for Claude Code in this repository. Reasons and history live in
[`docs/`](docs/index.md); this file keeps what an agent has to obey.

## Commands

```bash
npm run build      # compile to dist/ (ESM + CJS + .d.ts) via tsup
npm run dev        # tsup watch mode
npm test           # node --test via tsx over src/**/*.test.ts
npm run lint       # biome check src (linter only — see below)
npm run typecheck  # tsc --noEmit
npm run spec:check # every promise in specs/ bound to the test that proves it
```

`lint`, `typecheck`, `test` and `build` run in the `test` job of `ci.yml`; `spec:check`
runs in a `spec` job of its own. `.github/rulesets/main.json` is an import source, not the
live ruleset — see [`docs/branch-protection.md`](docs/branch-protection.md), and
[`docs/security-scanning.md`](docs/security-scanning.md) for gitleaks and osv-scanner.

### biome: linter on, formatter off

- **No `fetch`, use `safeFetch`.** `style/noRestrictedGlobals` catches bare `fetch`,
  `nursery/noJsRestrictedProperties` catches `globalThis.fetch`. **`src/fetch.ts` is the
  one exception** (via `overrides`); a second exception is a second way past the SSRF
  guard. Test-file ignores stay per-line, never widened to a file.
- **Tests stub by assigning `globalThis.fetch` after import** — `safeFetch` calls that
  stub instead of undici's own `fetch`. Do not mock undici or the dispatcher.
- **The formatter is deliberately off.** Turning it on reformats most of the repo: its
  own commit, never a passenger.
- **`biome.json` takes no `//` comments and then fails silently** to built-in defaults —
  the `fetch` rule goes off with no error. If a rule seems not to fire, write a deliberate
  violation instead of trusting the output.

Why each of these is so: [`docs/linting.md`](docs/linting.md).

## Tickets and skills

Tracker: **Linear** · Team: **Integration Engineering** · Project: **Integration Studio** —
every new ticket from this repository goes there unless the ticket says why not. That
team's key is `IN`, which is where every new `IN-nnn` in this repository's commits and pull
requests comes from. It took Integration Studio over from Product Engineering on 20 October
2026, so a `PO-nnn` in the history is a ticket filed before the move, and keeps that number.

Before filing or retitling a ticket, read the `ticket` skill. It is maintained once, in
`integrations-meta/.claude/skills/ticket/SKILL.md`, and deliberately not copied here.
[`.claude/skills/`](.claude/skills/README.md) carries the rest.

**[`feature-spec`](.claude/skills/feature-spec/SKILL.md):** promised behaviour lives in
`specs/*.md`, and every promise is bound to the test that proves it (`spec.config.json`,
`scripts/spec-check.mjs`). **Change what this SDK promises its consumers → change the spec
in the same commit, and the test with it.** [`specs/README.md`](specs/README.md) is the
index and the only place that says how much is promised — do not restate the count here.
Because a library has no screen, a criterion may name an export (`safeFetch`) where a
product spec would name a button.

## Architecture

`@revenexx/integrations-node-sdk` is the shared contract library every Revenexx
integration node package depends on, shipped as dual ESM/CJS via `tsup`. Every module is
public and re-exported from `src/index.ts`; the contracts (`INode`, `INodeContext`,
`ICredential`, `ITemplateDescription`, …) live in `src/types.ts`, and the `rvnxx-nodes`
CLI in `src/cli.ts`. Tests sit beside the code as `src/*.test.ts`.

**Key design constraints** — part of the node and credential contract, which
`specs/README.md` records as not yet promised:

- `IOutputPort.kind` (`'default' | 'branch' | 'error'`) controls routing in the workflow engine; `sourceFromConfig` lets the node dynamically name an output from a config field value.
- `INodeDescription.outputs` may be an empty array (PO-201): that marks a **terminal node** (dead end — no edge may leave it), the mirror image of `inputs: {}` on a trigger. Only for nodes with genuinely no continuation, e.g. `StopAndErrorNode`, which always throws. Never declare a port that can never fire just to fill the field.
- **What an output carries (PO-408):** `IOutputPort.fields` stays a flat name → `{ dataType, description? }` map, and a value inside a record is declared beside it under a dotted name (`counts.added`) that the studio and the worker read as a path. Promised in [`specs/output-fields.md`](specs/output-fields.md); do not add a nested member to `IOutputField` — the registry's manifest schema refuses one.
- `IConfigField.type` `'secret-ref'` means the field value is a key resolved at runtime via `INodeContext.secrets.get()`.
- `LocalizedString` is `string | Record<string, string>` — all user-visible text fields accept either a plain string or a locale map.
- `INodeContext.signal` is always provided by the engine; nodes must propagate it to all I/O.
- **Error contract (PO-442):** where the fault came from decides, not the node author — a fault in the node's own configuration ends the run (`throw NodeError`), a fault in the data a record carried or in the world around the run takes the `error` output (`errorResult` / `toErrorResult`, or `httpErrorResult` where the port declares `body`). Never both for one condition. The rule and its three classes are promised in [`specs/error-handling.md`](specs/error-handling.md) and this line does not restate them: it was a second, differently-cut wording of the same rule, which is how four pairs of shipped nodes came to answer one situation two ways.
- `execute(ctx, inputs)` receives a `Record<string, unknown>` keyed by port name; single-input nodes read `inputs['in']`, fan-in nodes (merge, join) declare multiple named keys.
- **Dynamic (author-time) config/ports (PO-143):** a config field may set `dynamic: true` (+ `dependsOn`) so its `options` — or, for `type: 'dynamic-schema'`, its whole flat field set — are resolved while editing; an output may set `resolveOutputs: true` for a generic port set. A node supplies these via the optional `INode` resolvers `loadOptions` / `resolveConfigSchema` / `resolveOutputs`, which receive an `INodeAuthorContext` and run in the node-runtime host — **never** in `execute` (results are snapshotted into the workflow blob at save). Each resolver call runs in a fresh process; `ctx.cache` (optional, best-effort, JSON values) carries an expensive result to the next call of the same node (IN-82). A `dependsOn`-driving field must be a literal (no `expressionAllowed`).
- **When a setting applies (PO-410):** a config field may set `showIf: { key, op, value? }` — another field's key, an operator from `OPERATORS`, and what to compare against — and the editor draws it only while that holds. Not `dependsOn`, which sits beside it and re-*resolves* a dynamic field instead of deciding whether it is drawn. `evaluate` is what the fourteen operators mean and `settingApplies(field, config)` is the answer for one field; the vocabulary is shared with the condition nodes in `integrations-nodes-core`, which re-export it from here. A condition's driving key must be a literal too, and the platform refuses one against an `expressionAllowed` field.
