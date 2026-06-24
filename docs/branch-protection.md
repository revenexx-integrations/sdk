# Branch & Release-Tag Protection

This repo ships its GitHub **rulesets as code** in [`.github/rulesets/`](../.github/rulesets/)
so the intended protections are reviewable and reproducible. GitHub does **not**
apply these files automatically — they are import sources for the UI.

## Why

`main` has no direct-push guard, and publishing creates a release tag
(`@revenexx/integrations-node-sdk@*`, see `.github/workflows/publish.yml`). Without
protection, anyone with push access can push to `main` or create a release tag and
thereby fire an `npm publish`. The two rulesets close both gaps.

## Files

| File | Target | What it enforces |
| --- | --- | --- |
| [`main.json`](../.github/rulesets/main.json) | default branch (`main`) | PR required (1 approval, dismiss stale, resolve conversations, squash/rebase only), required status checks `test` + `changeset` + up-to-date, linear history, no force-push, no deletion |
| [`release-tags.json`](../.github/rulesets/release-tags.json) | tags `@revenexx/integrations-node-sdk@*` | only **bypass actors** may create/update/delete release tags → protects the publish trigger (Repository admin **and** the release GitHub App are bypass actors) |
| [`branch-names.json`](../.github/rulesets/branch-names.json) | all branches **except** the allowed prefixes | restricts branch **creation**: only `feature/`, `hotfix/`, `bugfix/`, `chore/`, `release/`, `changeset-release/` (single segment each) and `dependabot/` (any depth) branches may be created (no bypass) |
| [`release-branches.json`](../.github/rulesets/release-branches.json) | branches `release/*` and `chore/*` | restricts `release/` and `chore/` branch **creation** to **repository admins** (the stand-in for "org members" — see note) |

The required status checks `test` and `changeset` are job names in
`.github/workflows/ci.yml`. `changeset` fails any PR that changes a package without
adding a changeset file (it self-skips on the `changeset-release/*` PR, whose
changesets are already consumed).

### Branch naming convention

`branch-names.json` enforces the allowed prefixes. Human branches are **single
level** — `feature/<desc>`, `hotfix/<desc>`, `bugfix/<desc>`, `chore/<desc>`,
`release/<desc>` — so `feature/a/b` is rejected. `dependabot/` is allowed at **any
depth** because Dependabot creates multi-segment branches
(`dependabot/npm_and_yarn/...`). `changeset-release/*` is excluded so the
`changesets/action` bot can create its `changeset-release/main` branch for the
“Version Packages” PR. `release-branches.json` then narrows `release/`
and `chore/` creation to repository admins; `feature/`, `hotfix/` and `bugfix/`
are open to any collaborator.

> **"Org members" caveat:** GitHub ruleset bypass actors are *repository roles or
> teams*, not raw org membership. The org currently has no teams and every
> collaborator is an admin, so `release/` + `chore/` creation is gated to the
> **Repository admin** role as the practical equivalent. When non-admin members
> should also create these, make a GitHub team and swap it into
> `release-branches.json`'s `bypass_actors`. On a public repo, non-collaborators
> cannot create branches in the repo at all (they fork), so the convention only
> applies to collaborators.

> **fnmatch gotcha:** in ref patterns `*` matches a single path segment and a
> *trailing* `**` also collapses to one segment — so `refs/heads/feature/*` allows
> exactly one level (`feature/login`, not `feature/a/b`). To match any depth (as
> Dependabot needs), the pattern must end in `**/*`, e.g.
> `refs/heads/dependabot/**/*`. Patterns must be full refs (`refs/heads/…`); the
> bare `feature/*` form is rejected by the API.

## How to apply

1. **Settings → Rules → Rulesets → New ruleset → Import a ruleset**
2. Upload `.github/rulesets/main.json`, save.
3. Repeat for `release-tags.json`, `branch-names.json` and `release-branches.json`.
   When updating existing rulesets after a change here (e.g. the `changeset`
   required check or the `changeset-release/*` exclude), edit the live ruleset to
   match — import only creates new ones.
4. On the **release-tags** ruleset, confirm the **Bypass list** contains
   **Repository admin** *and* the **release GitHub App** (the App actually pushes
   the tag — without it in the bypass list, publishing is blocked). Add the App by
   name in the UI so GitHub resolves its ID; the committed JSON carries it as a
   placeholder `Integration` entry with `actor_id: 0`. `release-tags.json` also
   ships `RepositoryRole` id `5` (= Repository admin); if the import rejects either
   entry, set the bypass actors in the UI instead.

## Status

The repo is **public**, so both rulesets are **active and enforced** (ruleset
enforcement needs GitHub Team/Enterprise *or* a public repo; going public unlocked
it). Keep these files in sync with the live rulesets — they remain the source of
truth and the import sources for the UI.

## Release GitHub App

The release workflow (`.github/workflows/publish.yml`) mints a token from a
dedicated **GitHub App** (repo secrets `APP_ID` + `APP_PRIVATE_KEY`, via
`actions/create-github-app-token`) and runs `changesets/action` with it, not the
default `GITHUB_TOKEN`. Three reasons:

1. **Checks must run on the “Version Packages” PR.** PRs/commits created by the
   default `GITHUB_TOKEN` do not trigger further workflows, so `test`/`changeset`
   would never run there and the PR could never satisfy the required checks. An App
   token triggers CI normally.
2. **Tag creation must pass the release-tag ruleset.** `GITHUB_TOKEN` cannot be a
   bypass actor; the App is added as an `Integration` bypass actor in
   `release-tags.json`, so the action may push the protected tag.
3. **No self-approval clash.** The App is a distinct identity (`app[bot]`), so the
   bot authors the “Version Packages” PR and a human maintainer can approve it (you
   cannot approve your own PR — which a personal token would require).

**Setup:** create a GitHub App (org-owned) with **Repository permissions →
Contents: Read and write** + **Pull requests: Read and write**; no webhook
(uncheck "Active"), no callback URL. Generate a private key, install the App on this
repo, then store `APP_ID` and the private key (`APP_PRIVATE_KEY`) as repo secrets.
Finally, add the App to the **release-tags** ruleset bypass list (see below).

> ⚠️ `release-tags.json` ships the App bypass entry with a **placeholder**
> `"actor_id": 0` (`actor_type: "Integration"`) — the real value is your App's ID,
> which is environment-specific. Easiest path: in the ruleset UI, add the App to the
> Bypass list by name (GitHub resolves the ID). If you keep editing the JSON, set
> `actor_id` to the App ID before importing.

## Effect on the release flow

Because `main` is protected with **no bypass actors**, the changeset version-bump
commit cannot be pushed directly to `main` — it lands via the bot-authored
**“Version Packages” PR** that a human approves and merges (satisfying the
`test` + `changeset` checks + 1 approval). Merging that PR makes the workflow run
`changeset publish`, which creates the release **tag** in CI; that tag push is
governed by the separate release-tag ruleset (Repository admin + the release App),
not by the `main` branch ruleset. See [`versioning.md`](versioning.md) for the full flow.

## Repository security features

Enabled at the repo level (free for public repos), complementing the rulesets:

- **Secret scanning** + **push protection** — blocks committing/pushing leaked secrets.
- **Dependabot alerts** + **security updates** — vulnerability alerts and automated
  fix PRs (version updates are configured separately in [`dependabot.yml`](../.github/dependabot.yml)).
