# Versioning & Release Policy

`@revenexx/integrations-node-sdk` is the shared type surface between
every actor in the integrations stack:

- [`integrations-nodes-core`](../../integrations-nodes-core/) (and any
  sibling node packages) implement `INode` from this SDK.
- [`integrations-worker`](../../integrations-worker/) imports `INode`
  to invoke node implementations at run time.
- [`integrations-ui`](../../integrations-ui/) reads `NodeManifestConfigField`
  (and related types) to render config editors.

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
- Renaming a member of an existing variant is a **major**. There is no
  "rename with deprecation" path in TypeScript; the old name simply
  vanishes.
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
5. For each consumer, re-publish (nodes-core) or rebuild (worker, ui).
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

The worker's pin is the hard floor: when the worker is on `^0.4.x`,
publishing a node package built against `0.5.x` will fail bootstrap
because `npm install --omit=dev` resolves a single SDK version per
install root.

## Breaking change checklist

When you have to ship a major:

1. Open an issue or RFC describing the breaking change + migration steps.
2. Bump SDK major and publish.
3. Bump SDK in `integrations-nodes-core`, adjust every node implementation, publish a new major of nodes-core.
4. Bump SDK in `integrations-worker`, adjust any direct uses, rebuild + push the image.
5. Bump SDK in `integrations-ui` if it consumes the changed types, rebuild + redeploy.
6. Republish every previously-published third-party node package against the new major; or document the floor for which packages remain supported.

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
- [`../../integrations-nodes-core/docs/adding-a-node.md`](../../integrations-nodes-core/docs/adding-a-node.md) — the consumer perspective.
- [`../../integrations-worker/docs/node-package-resolution.md`](../../integrations-worker/docs/node-package-resolution.md) — how the SDK is resolved at run time.
