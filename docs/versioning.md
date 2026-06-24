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

Versioning and publishing are driven by [Changesets](https://github.com/changesets/changesets)
using the **automated** [`changesets/action`](https://github.com/changesets/action)
flow (`.github/workflows/publish.yml`). You never edit `version` in `package.json`
by hand and you never create the release tag by hand — the workflow does both.

**During development** — every PR records the intended bump as a changeset, and CI
**enforces** it (the `changeset` required check, see [`branch-protection.md`](branch-protection.md)):

```
npx changeset            # pick patch/minor/major + a summary line
npx changeset --empty    # …or this for a PR that intentionally needs no release
git add -A && git commit # commit the intent file together with your change
```

The [changeset-bot](https://github.com/apps/changeset-bot) also comments on every
PR whether a changeset is present (soft reminder on top of the hard check).

**Cutting a release is just merging a PR — no local steps:**

1. Merge feature PRs (each carrying its changeset) into `main`.
2. On every push to `main`, the workflow runs `changesets/action`. While
   unreleased changesets exist, it opens/maintains a PR titled
   **“Version Packages”** that has `changeset version` already applied
   (`package.json` bump + `CHANGELOG.md`).
3. When you want to ship, **merge the “Version Packages” PR** (it must pass the
   `test` + `changeset` checks and 1 approval, like any PR). The workflow runs
   again, finds no remaining changesets, and runs `changeset publish` →
   publishes to npm **and** creates+pushes the tag
   `@revenexx/integrations-node-sdk@X.Y.Z`.

> **Why a GitHub App, not `GITHUB_TOKEN`?** The workflow mints a token from a
> dedicated **GitHub App** (`secrets.APP_ID` / `APP_PRIVATE_KEY`, via
> `actions/create-github-app-token`) and runs `changesets/action` with it, because
> (a) PRs/commits made with the default `GITHUB_TOKEN` do **not** trigger other
> workflows, so the required `test`/`changeset` checks would never run on the
> “Version Packages” PR (making it unmergeable); and (b) the App is a bypass actor on
> the release-tag ruleset, so the action may push the protected tag. The App is also
> a **distinct identity** (`app[bot]`), so a human maintainer can approve the bot's
> “Version Packages” PR without the self-approval clash a personal token would cause.
> See [`branch-protection.md`](branch-protection.md) for the App permissions and
> ruleset interplay.

Publishing authenticates **tokenless** via OIDC trusted publishing — npmjs is
configured to trust this repo's `publish.yml` workflow, so no `NPM_TOKEN` is stored
(the workflow only needs `id-token: write`). This is also why the workflow keeps the
filename `publish.yml` even though it now opens PRs too: renaming it would break the
trusted-publisher binding. Publishing attaches a provenance attestation
automatically. The build runs via the `prepublishOnly` hook that `npm publish`
fires. The package is scoped, so it publishes with public access (`access: "public"`
in `.changeset/config.json`). `changeset publish` is idempotent — it only publishes
versions not already in the registry.

> **Branch protection is not bypassed.** The version bump still reaches `main` only
> through the (bot-authored) “Version Packages” PR that a human approves and merges
> — `main.json` has no bypass actor. Only the *tag* push uses the admin bypass.

### Release tags are created in CI

`changeset publish` creates the annotated tag in the workflow runner, so the
maintainer no longer tags locally — and there is no local GPG/SSH signing step.
If you ever need to publish manually (e.g. CI is down), you can still tag by hand;
note `changeset publish` publishes the version in `package.json` at the tagged
commit — the tag *name* is only a label and is not validated against it:

```bash
V=$(node -p "require('./package.json').version")
git tag -a "@revenexx/integrations-node-sdk@$V" -m "@revenexx/integrations-node-sdk@$V"
git push --follow-tags
```

Pick the bump in step `npx changeset` per the SemVer table above. After the SDK
release, bump the dependency in every consumer and re-publish (nodes-core) or
rebuild (worker, ui):

- `integrations-nodes-core/package.json`
- `integrations-worker/package.json`
- `integrations-ui/package.json` (if it imports the SDK)

Run `npm install` in each consumer to refresh the lockfile. This cross-repo
step is **not** automated by the SDK's publish workflow.

The SDK is published to the public npm registry (`registry.npmjs.org`) under the
`@revenexx` scope. Since it lives on the default registry, consumers need no
`.npmrc` scope mapping or auth token to install it — a plain `npm install
@revenexx/integrations-node-sdk` resolves it.

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
