# Branch & Release-Tag Protection

This repo ships its GitHub **rulesets as code** in [`.github/rulesets/`](../.github/rulesets/)
so the intended protections are reviewable and reproducible. GitHub does **not**
apply these files automatically — they are import sources for the UI.

## Why

`main` has no direct-push guard, and publishing is triggered by a git tag
(`@revenexx/integrations-node-sdk@*`, see `.github/workflows/publish.yml`). Without
protection, anyone with push access can push to `main` or create a release tag and
thereby fire an `npm publish`. The two rulesets close both gaps.

## Files

| File | Target | What it enforces |
| --- | --- | --- |
| [`main.json`](../.github/rulesets/main.json) | default branch (`main`) | PR required (1 approval, dismiss stale, resolve conversations, squash/rebase only), required status check `test` + up-to-date, linear history, no force-push, no deletion |
| [`release-tags.json`](../.github/rulesets/release-tags.json) | tags `@revenexx/integrations-node-sdk@*` | only **bypass actors** may create/update/delete release tags → protects the publish trigger |

The required status check `test` is the job name in `.github/workflows/ci.yml`.

## How to apply

1. **Settings → Rules → Rulesets → New ruleset → Import a ruleset**
2. Upload `.github/rulesets/main.json`, save.
3. Repeat for `.github/rulesets/release-tags.json`.
4. On the **release-tags** ruleset, confirm the **Bypass list** contains
   **Repository admin** (and any release/CI identity that must create tags).
   ⚠️ Without at least one bypass actor, *nobody* can create the release tag and
   publishing is blocked. `release-tags.json` ships `RepositoryRole` id `5`
   (= Repository admin); if the import rejects it, drop the `bypass_actors` block
   and set the bypass actor in the UI instead.

## Plan limitation

This is a **private** repo. On the current GitHub plan, rulesets can be created
but are **not enforced** (status stays inactive / "evaluate"), and the REST API
returns `403`. Enforcement requires GitHub **Team/Enterprise** (or making the repo
public). Keep these files current regardless — they become live the moment the
plan allows enforcement.
