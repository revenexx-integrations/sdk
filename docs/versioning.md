# Versioning & Release Policy

`@revenexx/integrations-node-sdk` is the shared type surface between
the components in the integrations stack that build against it:

- The **node packages** implement `INode` from this SDK and bundle it into
  the tarball they ship: `integrations-nodes-core`, `business-central`,
  `deepl` (own repo, `revenexx-integrations/deepl`), `pipedrive`,
  `example-node` — plus `integrations-node-devkit`, which builds against it.
- `@revenexx/studio-integrations` (the studio UI) does **not** depend on the
  package, and this is deliberate: the SDK's entry point re-exports the SSRF
  guard and pulls Node built-ins with it, which cannot go into a browser
  bundle. The parts the editor needs — the `IConfigField` shape, the `showIf`
  comparison vocabulary — are mirrored by hand in `src/runtime/types/` and
  `src/runtime/utils/settingCondition.ts`. So a type change the editor has to
  honour reaches it as a **separate, hand-written** change, never as a
  dependency bump, and nothing checks that the copy still matches. The note
  atop `settingCondition.ts` names the three implementations that have to
  agree.

`integrations-worker` is **not** an SDK consumer: it never imports the
SDK and does not depend on the package. It loads registered node
packages and executes workflows against the manifest they publish, so
its only coupling to the SDK is the manifest **schema** version
(`manifestVersion`, see [`overview.md`](overview.md)) — not the SDK's
TypeScript types or its semver. A type-only change that keeps the
manifest shape intact never reaches the worker.

Because of this fan-out, even a minor type tweak can ripple through the
independently-deployed components that build against the SDK. This
document fixes the rules so that ripple stays manageable.

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

> **Branch protection is not bypassed by the workflow.** The version bump still
> reaches `main` only through the (bot-authored) “Version Packages” PR that a human
> approves and merges — the App is not a bypass actor on the main-branch ruleset.
> Only the *tag* push uses the admin bypass. (The ruleset does list two human bypass
> actors; check with
> `gh api repos/revenexx-integrations/sdk/rulesets/18063253 --jq .bypass_actors`
> rather than assuming, because it decides who can merge a PR that nobody else has
> approved — and an author cannot approve their own.)

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

Pick the bump in step `npx changeset` per the SemVer table above. The npm publish
is where this repo's job ends — and where
[the next section](#from-an-sdk-merge-to-a-running-workflow) begins. Nothing beyond
it is automated by this workflow.

The SDK is published to the public npm registry (`registry.npmjs.org`) under the
`@revenexx` scope. Since it lives on the default registry, consumers need no
`.npmrc` scope mapping or auth token to install it — a plain `npm install
@revenexx/integrations-node-sdk` resolves it.

## From an SDK merge to a running workflow

A published SDK version changes nothing on its own. It is a type surface: no
running process loads it, and no workflow sees it until a **node package** has
been rebuilt against it, re-registered, and pulled into a bundle. Six steps, in
four repos, and only the first two are automated.

| # | Where | What happens | Automated? |
|---|---|---|---|
| 1 | this repo | Merge the feature PR (with its changeset) → the workflow opens/updates the **“Version Packages”** PR | yes |
| 2 | this repo | Merge **“Version Packages”** → `changeset publish` → npm + release tag | yes |
| 3 | each node repo | `npm install` picks the new SDK up, `npm run build` rebuilds `dist/` and `dist/manifest.json` | **no** |
| 4 | each node repo | Changeset → “Version Packages” → merge → `v{version}` tag → the Console re-registers the tarball | tag→registration: yes |
| 5 | `integrations` | `workflows:build-bundles` recompiles every workflow bundle against the new tarball | **no** |
| 6 | worker pool | Downloads the new bundles by content hash on the next run | yes |

### Step 3 — the step that actually carries the change

Every node package declares the SDK twice: once as a caret range in
`dependencies`, and once by name in `bundledDependencies`. **The second one is
what ships.** `npm pack` copies the SDK out of the repo's `node_modules` into the
tarball, so the version that reaches a workflow is whatever was installed at pack
time — not what the range in `package.json` says. Consequences:

- **Within a major, no version string changes.** Every node package is on
  `^1.0.0`, so `1.1.0` is already in range. Running `npm install` and committing
  the refreshed `package-lock.json` *is* the upgrade. Editing `package.json` when
  the range already covers the new version accomplishes nothing.
- Below `1.0.0` this was not true — `^0.15.0` does not accept `0.16.0`, and each
  minor needed an explicit edit. That trap is gone above the leading one.
- **A green build is not evidence the new SDK shipped.** A node package compiles
  fine against the old copy; the tarball just carries the old copy too.
  `npm ls @revenexx/integrations-node-sdk` before `npm pack` is the check.
- The install root sets one SDK version for every package installed together —
  see [Consumer pinning strategy](#consumer-pinning-strategy).

### Steps 3–5, locally

`integrations/scripts/update-dev.sh` is the whole chain in one command. Step 5 of
that script walks every folder under `components/integrations/`, takes the ones
whose `build` runs `rvnxx-nodes manifest`, and does `npm install && npm run build
&& npm pack` plus an upload to
`POST /api/v1/admin/orgs/{org}/node-packages`; its step 7 then runs
`workflows:build-bundles`. It picks the node repos up by that build script, so a
new node repo is included without editing the script.

For a single package, by hand:

```bash
cd ~/rvnxx/components/integrations/core
npm install                                    # pulls the new SDK into node_modules
npm ls @revenexx/integrations-node-sdk         # confirm the version you expect
npm run build                                  # dist/ + dist/manifest.json
git add package-lock.json && git commit        # the lockfile is the record
```

…then release the node package normally (changeset → “Version Packages” → tag);
`docs/publishing.md` in that repo owns the rest.

### What does *not* have to happen

- **`integrations-worker` is never bumped.** It has no SDK dependency and never
  imports it. Node code reaches it inside content-addressed bundles that bake in
  their own SDK copy, so the worker's only coupling is the manifest **schema**
  version (`manifestVersion`) — a separate axis from this package's semver. A
  type-only change that leaves the manifest shape intact never reaches it.
- **`studio-integrations` is never bumped either** — but for the opposite reason,
  and it is the one that bites. It does not depend on the SDK at all (see the top
  of this document), so a change to a type the editor renders is *invisible* to it
  until somebody edits the mirrored copy by hand. Ask, for every change to
  `IConfigField`: does the editor have to draw this differently? If yes, that is a
  second PR in a second repo, and no build will remind you.
- **Already-registered workflows are not re-pinned.** A `nodeVersion` in a
  workflow blob selects the manifest an author sees, not an implementation kept
  running — every workflow gets the newly registered bytes on its next bundle
  build. `docs/publishing.md` in `integrations-nodes-core` spells this out.

## Consumer pinning strategy

| Consumer | Pin style | Why |
| --- | --- | --- |
| node packages (`core`, `business-central`, `deepl`, `pipedrive`, `example-node`) | Caret (`^1.0.0`) in `dependencies` **and** the package name in `bundledDependencies` | Follows the latest minor on the next `npm install`; the bundled copy is what ships in the tarball. |
| `integrations-node-devkit` | `>=1.0.0` | A build-time tool, deliberately loose so it works against whatever SDK the package under test uses. |
| `studio-integrations` | none — types mirrored by hand | The SDK entry point pulls Node built-ins and cannot enter a browser bundle. |
| `integrations-worker` | none | Consumes the published manifest; couples via `manifestVersion`, a separate axis from this package's semver. |

**No node package peers the SDK any more** — it is an ordinary `dependency`
that is additionally bundled, so each registered package carries its own copy
and two packages built against different SDK minors coexist without a shared
floor to negotiate. Only `integrations-node-devkit` still peers it, and loosely
(`>=1.0.0`), because it is a build-time tool that has to work against whatever
SDK the package under test brought.

The flip side is that an old SDK can sit in a registered tarball indefinitely
and nothing reports it: there is no resolution step that would notice. What a
given package shipped is readable from its tarball's
`node_modules/@revenexx/integrations-node-sdk/package.json`, and locally from
`npm ls @revenexx/integrations-node-sdk` in that repo.

## Breaking change checklist

When you have to ship a major:

1. Open an issue or RFC describing the breaking change + migration steps.
2. Bump SDK major and publish.
3. Bump the SDK in **every** node package — `integrations-nodes-core`,
   `business-central`, `deepl`, `pipedrive`, `example-node` — adjust every node
   implementation, and register a new major of each (via the Console /
   `update-dev.sh`). A major *does* need the caret edited by hand: `^1.x` will
   not take `2.0.0`.
4. Update `studio-integrations` by hand wherever it mirrors a changed type
   (`src/runtime/types/`, `src/runtime/utils/settingCondition.ts`), rebuild +
   release the module. Nothing there fails to compile if you skip this.
5. Re-register every previously-registered third-party node package against the new major; or document the floor for which packages remain supported.
6. Rebuild bundles (`workflows:build-bundles`) so running workflows pick the new
   tarballs up.

`integrations-worker` is deliberately absent from this list: an SDK
major does not touch it. The worker only needs a coordinated change
when the manifest **schema** version (`manifestVersion`) changes — a
separate axis from the SDK's semver.

There is currently no automated cross-repo CI guard against an SDK
major being merged without a matching consumer PR — be deliberate
about the ordering.

## How `1.0.0` happened

Through the `0.x` range, SemVer convention allowed every minor bump to break
consumers. The policy was to ignore that licence and follow the matrix above as
if the leading zero were not there. The one `0.x`-era rule still worth
remembering is the caret: `^0.15.0` did not accept `0.16.0`, so every SDK minor
needed an explicit version edit in every consumer. Above `1.0.0` it does not,
which is why step 3 of the rollout is an `npm install` and not an edit.

`1.0.0` was originally planned for the point at which the type surface stopped
shifting weekly. It arrived earlier and for a different reason: PO-374 added
`state` as a required member of `INodeContext`, the matrix puts a required member
under Major, and a Major on `0.18.1` is `1.0.0`. The alternative was to bend the
type to fit the version, which is the failure this document exists to prevent. So
`1.0.0` here records "the matrix was followed", not "the surface has settled" —
and the matrix keeps applying unchanged above the leading one.

## Related documents

- [`overview.md`](overview.md) — the type surface the SDK exposes.
- `docs/adding-a-node.md` in the `integrations-nodes-core` repo — the
  consumer perspective.
- `docs/publishing.md` in the `integrations-nodes-core` repo — steps 3–5 above
  from the node package's side: tarball shape, org namespace, re-registration.
- `docs/architecture/node-packages.md` and `docs/architecture/node-bundles.md`
  in the `integrations` repo — how a registered tarball becomes the bundle the
  worker pool runs. (The worker lives in that repo under `worker/`; there is no
  separate `integrations-worker` repository.)
