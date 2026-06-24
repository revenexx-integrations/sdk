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

Versioning and publishing are driven by [Changesets](https://github.com/changesets/changesets);
you never edit `version` in `package.json` by hand. The publish is triggered by
a **git tag** (created by `changeset tag`), not by a merge to `main`.

**During development** — for every observable change, record the intended bump:

```
npx changeset                       # pick patch/minor/major + a summary line
git add -A && git commit            # commit the intent file together with your change
```

**When you want to cut a release** (locally, on `main`):

```
1. npx changeset version            # consumes intent files → bumps package.json + CHANGELOG.md
2. git add -A && git commit -m "release: version packages"  # -A so a first-time CHANGELOG.md is included
3. npx changeset tag                # creates tag @revenexx/integrations-node-sdk@X.Y.Z
4. git push --follow-tags           # tag push triggers .github/workflows/publish.yml
```

The tag push runs `.github/workflows/publish.yml`, which does
`npm ci → npm run release` (`changeset publish`) against the public npm registry
(`registry.npmjs.org`). Authentication is **tokenless** via OIDC trusted
publishing — npmjs is configured to trust this repo's `publish.yml` workflow, so
no `NPM_TOKEN` secret is stored (the workflow only needs `id-token: write`). This
also attaches a provenance attestation automatically. The build runs via the
`prepublishOnly` hook that `npm publish` fires for each package. The package is
scoped, so it is published with public access (`access: "public"` in
`.changeset/config.json`). `changeset publish` is idempotent — it only publishes
versions not already in the registry.

### Signed release tags

`changeset tag` shells out to `git tag <name> -m <name>` (an **annotated** tag);
there is no Changesets option to sign it. Since the tag is annotated, git's
`tag.gpgSign` setting applies — turn it on once and `changeset tag` signs
automatically (equivalent to your usual `git tag -s -a -m …`):

```bash
# GPG
git config user.signingkey <YOUR_KEY_ID>
git config tag.gpgSign true
# …or SSH signing (no prompt if the key is loaded in ssh-agent / has no passphrase)
git config gpg.format ssh
git config user.signingkey ~/.ssh/id_ed25519.pub
git config tag.gpgSign true
```

GPG will ask for your passphrase when the tag is created (once — this repo cuts a
single tag per release). Cache it via `gpg-agent` (`default-cache-ttl` in
`~/.gnupg/gpg-agent.conf`) or use SSH signing to avoid the prompt. For GitHub to
mark the tag **Verified**, register the key as a *Signing Key* under your account.
Tags are created **locally**, so this config lives on the maintainer's machine —
not in CI.

Prefer to keep tagging by hand? Skip `changeset tag` and create the tag yourself
with the trigger's name scheme:

```bash
V=$(node -p "require('./package.json').version")
git tag -s -a "@revenexx/integrations-node-sdk@$V" -m "@revenexx/integrations-node-sdk@$V"
git push --follow-tags
```

> **Caveat:** `changeset publish` publishes the version recorded in
> `package.json` at the **tagged commit** — the tag *name* is only the workflow
> trigger and is **not** validated against `package.json`. A hand-made tag whose
> version differs from `package.json` therefore still publishes the
> `package.json` version, not the one in the tag name. The `V=$(node -p …)`
> snippet above derives the tag from `package.json` precisely to keep them in
> sync; if you tag by hand, make sure the version matches.

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
