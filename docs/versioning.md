# Versioning & Release Policy

`@revenexx/integrations-node-sdk` is the shared type surface between
every actor in the integrations stack:

- `integrations-nodes-core` (and any sibling node packages) implement
  `INode` from this SDK.
- `integrations-worker` imports `INode` to invoke node implementations
  at run time.
- `integrations-ui` reads `IConfigField` (and related types)
  to render config editors.

Because of this fan-out, even a minor type tweak can ripple through
three independently-deployed components. This document fixes the rules
so that ripple stays manageable.

## SemVer contract

| Bump  | What it means                                                                                                                          |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Patch | Implementation-only changes that consumers cannot observe: JSDoc, internal helpers, dist re-export tweaks that keep the public shape.  |
| Minor | New, **optional** type members and entirely new exports (a new node category, a new `IConfigField` type added to the union, etc.).     |
| Major | Anything else: renamed members, removed exports, changed semantics, narrowed types, required members added.                            |

Notable specifics:

- Adding a **new variant** to a union (e.g. `IConfigField.type = 'foo'`)
  is a **minor**: existing code is exhaustively-checking and gets a
  compiler error, but only because it newly has to handle the new
  variant. Treat it as additive.
- Removing a member of an existing variant is a **major**. The rename
  itself can be staged non-breakingly: add the new member as a
  **minor**, mark the old member with `@deprecated` so consumers get an
  IDE warning, and only delete the old member in the next **major**.
  Skipping the deprecation window and renaming in one step is still a
  major because the old name vanishes.
- Tightening the type of an existing field is a **major** even when the
  new type is a subtype of the old one, because consumers that
  produced the wider type stop type-checking.

## Release flow

```
1. Edit src/, update version in package.json per SemVer rules above.
2. npm run build          # tsup → dist/
3. npm publish            # publishConfig points at https://npm.pkg.github.com
4. Bump the dependency in every consumer:
     - integrations-nodes-core/package.json
     - integrations-worker/package.json
     - integrations-ui/package.json (if it imports the SDK)
   Run `npm install` in each consumer to refresh the lockfile.
5. For each consumer, re-register (nodes-core — via the Console / `update-dev.sh`; node packages are not published to npm) or rebuild (worker, ui).
```

The SDK is published to GitHub Packages under the `@revenexx` scope.
Every consumer's `.npmrc` (and the spawned worker's runtime `.npmrc`
under `NPM_GH_TOKEN`) must point that scope at
`https://npm.pkg.github.com`.

## Consumer pinning strategy

| Consumer                       | Pin style              | Why                                                                                       |
| ------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------- |
| `integrations-nodes-core`      | `peerDependencies` + `devDependencies` caret | Lets the worker pick the resolved version while still building locally. |
| `integrations-worker`          | Exact (`"x.y.z"`)      | The runtime install picks up the SDK transitively from the node packages; the worker's own dep is the source of truth for the major version. |
| `integrations-ui`              | Caret (`"^x.y.z"`)     | UI follows the latest minor automatically; majors are an explicit upgrade.                |

The worker's pin is the hard floor: when the worker pins SDK `0.4.0`
exactly, publishing a node package built against `0.5.x` will fail
bootstrap because `npm install --omit=dev` resolves a single SDK
version per install root.

## Breaking change checklist

When you have to ship a major:

1. Open an issue or RFC describing the breaking change + migration steps.
2. Bump SDK major and publish.
3. Bump SDK in `integrations-nodes-core`, adjust every node implementation, register a new major of nodes-core (via the Console / `update-dev.sh`).
4. Bump SDK in `integrations-worker`, adjust any direct uses, rebuild + push the image.
5. Bump SDK in `integrations-ui` if it consumes the changed types, rebuild + redeploy.
6. Re-register every previously-registered third-party node package against the new major; or document the floor for which packages remain supported.

There is currently no automated cross-repo CI guard against an SDK
major being merged without a matching consumer PR — be deliberate
about the ordering.

## Pre-1.0 stance

The SDK is currently in the `0.x` range, which means by SemVer convention
**every minor bump is allowed to break consumers**. We keep this pre-1.0
window short and stay disciplined about following the matrix above as
if we were already at 1.x; the only real difference is the leading
zero in the version. Plan a `1.0.0` release once the type surface
stops shifting weekly.

## Related documents

- [`overview.md`](overview.md) — the type surface the SDK exposes.
- `docs/adding-a-node.md` in the `integrations-nodes-core` repo — the
  consumer perspective.
- `docs/node-package-resolution.md` in the `integrations-worker` repo —
  how the SDK is resolved at run time.
