# Security Scanning

[`.github/workflows/security.yml`](../.github/workflows/security.yml) runs two
scanners over this repository: one for secrets in the git history, one for known
advisories in the dependency tree. It was proposed by the **PO-279** security
audit in `revenexx/integrations` (`docs/security/audit-2026-08.md`), which found
that nothing in the studio vertical scanned before it — a sweep of every repo for
`codeql|semgrep|gitleaks|trufflehog|trivy|osv-scanner|npm audit|composer audit`
returned zero matches.

The audit's full scanner has six layers and covers the whole vertical. This file
documents the per-repo half: the two layers that answer questions about *this*
repository alone.

> **Read this page rather than the sibling packages'.** `integrations-nodes-core`,
> `-business-central` and `-pipedrive` carry a copy, and three of its load-bearing
> claims are false here: this repo is **public**, so its rulesets are live *and*
> GitHub code scanning is available; it has **no runtime dependencies at all**;
> and its required checks are named `test` and `changeset`, not `ci`/`spec`.

## What runs, and when

| Layer | Tool | Answers |
| --- | --- | --- |
| Secrets | `gitleaks` 8.28.0 | Was a token, key or password ever committed here? |
| Dependencies | `osv-scanner` 2.2.3 | Does any package in `package-lock.json` have a known advisory? |

Triggers: every **pull request**, every **push to `main`**, **weekly** (Mondays
03:00 UTC), and **`workflow_dispatch`**. The weekly run is the one that carries
its weight — advisories are published against code that has not changed, so a
scan that only fired on a lockfile change would never see them.

The `push` trigger looks redundant next to `pull_request`, and the reason it is
not differs from the sibling repos'. Theirs is that a direct push to `main` is
possible because their rulesets are not live. Here the rulesets **are** live (see
[branch-protection.md](branch-protection.md)) and `main.json` has no bypass
actors, so nothing pushes to `main` directly. What does happen is that
`main.json` permits **squash and rebase only** — so the commit that lands on
`main` is not the ephemeral merge commit the `pull_request` run scanned, and
carries a patch set gitleaks has never seen. This trigger scans the history
`main` actually has.

The job name is `Scan`. It is **not** in the required-status-check list of
[`.github/rulesets/main.json`](../.github/rulesets/main.json) — that list is
`test` + `changeset`. See *Making it blocking* below.

### What the secrets layer is actually guarding here

Less than in the node packages, and it is worth being precise rather than
reassuring. This package ships **no credentials of its own** — it defines the
credential *contract* (`ICredential`, the `BaseCredential` hierarchy) that the
node packages implement. There is no devkit preview here running a real `resolve`
against live SMTP or SSH, so the class of accident that puts a working login into
a working tree does not arise the same way.

What raises the stakes instead is the other end: this package **is published**
(`npm publish` with `provenance: true`, via the release GitHub App — see
[branch-protection.md](branch-protection.md)) and **every** node package depends
on it. A token leaked from this repository is a token against the one dependency
all four node packages resolve. The two devDependency chains below are part of
the same picture: `@changesets/cli` and `tsup`/`tsx` both execute in CI, in the
job that holds the release App token.

## Non-blocking, but not silent

Both steps **report and pass**. Landing the workflow could not turn open pull
requests red, which is deliberate: a gate switched on before its baseline is
clean or explicitly accepted tends to get switched off within a week.

Two consequences of that choice are worth spelling out, because they are the
parts that are easy to get wrong.

**Findings go to the run summary, not only the job log.** Each step writes its
output to `$GITHUB_STEP_SUMMARY`, so the result is on the run's own page instead
of buried in a log nobody opens. This is a smaller claim than it sounds: it makes
findings legible to whoever *looks*, and nothing here pages anyone at 03:00 on a
Monday.

> **Code scanning / SARIF *is* available in this repository — and this is the one
> place this page contradicts its siblings on a fact rather than a detail.** Their
> copies state that `--format sarif` plus `upload-sarif` needs GitHub Advanced
> Security, which a private repo on the free org plan does not have. True there,
> false here: this repo is **public**, which makes code scanning free. Measured
> 2026-08-26 — `GET /repos/{owner}/{repo}/code-scanning/alerts` answers `404 no
> analysis found` on this repo and `403 Advanced Security must be enabled` on
> `revenexx-integrations/core`. `404` means nothing has been uploaded yet; `403`
> means the door is shut.
>
> So the better reporting channel is open here, and the step summary is a choice
> rather than a limit. It is still the right first step — the four repos run one
> workflow and diverging this one early costs more than it returns — but SARIF
> upload is the natural next change for **this** repo, and it belongs with the
> notification problem the summary cannot solve. It needs `security-events:
> write`, a pinned `github/codeql-action/upload-sarif`, and a *writable* second
> mount for the report (see the `--report-path` note in *Making it blocking* —
> the repository mount is read-only and the container's working directory is `/`).

**A scan that did not run is a failure, not a pass.** Non-blocking means
*findings* do not fail the step. It must not mean that a 404'd image pull, a
mistyped flag or an empty mount also passes — a green `Scan` that scanned nothing
is worse than no scan, because it answers the question falsely. So each step
inspects the exit code:

| Tool | Tolerated | Fails the step |
| --- | --- | --- |
| `gitleaks` | `0` — `--exit-code=0` already maps *leaks found* onto 0 | anything else, i.e. gitleaks itself failing — **and** a run that reports `0 commits scanned` |
| `osv-scanner` | `0` (scanned, clean) and `1` (advisories found) | `127` scanner error, `128` **no packages found**, and any other code |

`128` is the one that matters. A mis-mounted `/src` finds nothing and, under a
blanket `|| true`, would have reported clean:

```console
$ docker run --rm -v "$EMPTY:/src:ro" ghcr.io/google/osv-scanner@sha256:fca9be44… scan source --recursive /src
No package sources found, --help for usage information.
$ echo $?
128
```

`gitleaks` has no equivalent code — it exits `0` when it finds nothing, including
when there was nothing it *could* have found. It gets **two** guards instead, and
they cover different halves.

The first is a precondition: a shallow checkout would hand gitleaks one commit and
get back a clean history it never saw, so the step refuses to run on one.
`git rev-parse --is-shallow-repository` answers `true` at depth 1 and `false` at
`fetch-depth: 0`.

The second is a postcondition, and it is the one that catches what the first
cannot. That `rev-parse` asks the **runner** about the **runner's** checkout;
gitleaks reads a bind mount, and `-v "$PWD:/repo:ro"` is resolved by the Docker
daemon against the host filesystem. Point that mount somewhere else — containerise
the job, move to a runner whose workspace is not a host path — and the container
gets an empty directory. gitleaks walks it to the end and says so, cheerfully:

```console
$ docker run --rm -v "$EMPTY:/repo:ro" ghcr.io/gitleaks/gitleaks@sha256:cdbb7c95… detect --source=/repo --redact --no-banner --no-color -v --exit-code=0
… ERR [git] fatal: not a git repository (or any parent up to mount point /)
… INF 0 commits scanned.
… INF no leaks found
$ echo $?
0
```

Exit `0`, "no leaks found", and an exit-code guard sees nothing wrong — the same
false green as osv-scanner's `128`, arriving by the one route an exit code cannot
report. So the step asserts the count rather than the code: it reads the
`N commits scanned` line out of the captured log and fails on `0` or on no such
line at all. `--no-color` is passed for that reason as much as for a readable run
summary — the line is otherwise wrapped in ANSI escapes.

The step summary is written **before** both checks, on purpose: a step that is
about to fail is exactly where the output is most wanted.

## Pinning

Everything this workflow executes is pinned to an immutable identifier, for one
reason: a tag is a label its owner can repoint, and whoever repoints it gets code
running inside a job that holds this repository's token (**PO-298**).

| What | Pinned as | Kept fresh by |
| --- | --- | --- |
| `actions/*` in all workflows | `@<commit-sha> # <tag>` | **Dependabot** — it understands both halves of that form |
| `ghcr.io/gitleaks/gitleaks` | `@sha256:<digest>` | **by hand** |
| `ghcr.io/google/osv-scanner` | `@sha256:<digest>` | **by hand** |

Dependabot's half is real rather than aspirational here:
[`dependabot.yml`](../.github/dependabot.yml) does configure the
`github-actions` ecosystem, weekly. Worth checking before trusting that sentence
in any repo that copies it.

"All workflows" is three files — `ci.yml`, `publish.yml` and `security.yml`
itself. One of them was the near-miss worth recording: `changesets/action@v1` was
a **branch, not a tag**, so it moved with every upstream push; it is now pinned to
the `v1.9.0` release commit. And in the sibling repos a job reached `main` while
this workflow sat on a branch, and the merge brought its unpinned `uses:` along
with no conflict, nothing failing and no check going red. Which is the whole
argument for grepping rather than trusting that a pinning pass stayed done:

```bash
grep -rn 'uses:' .github/workflows/   # every hit must carry @<sha> # <tag>
```

The hand-maintained half is a real cost, not an oversight: Dependabot's
`github-actions` ecosystem parses `uses:` values, and these two images are
referenced inside a `run:` shell command, which it does not read. To bump one,
pull the new tag, take the digest `docker pull` prints, and update the version in
the step name in the same edit:

```bash
docker pull ghcr.io/gitleaks/gitleaks:v8.29.0   # prints: Digest: sha256:…
```

A digest can also be resolved without pulling:

```bash
gh api /orgs/gitleaks/packages/container/gitleaks/versions --paginate \
  --jq '.[] | select(.metadata.container.tags[]? == "v8.28.0") | .name'
```

**Bumping them is not optional maintenance, and it is `gitleaks` that decays.**
Its detection rules ship *inside the binary*, so a pin left alone is a ruleset
left alone: a credential format introduced after 8.28.0 is one this repository
will never learn to recognise, and the scan stays green while missing it. That is
the same false-clean this workflow is otherwise built to rule out, arriving by a
route no exit code can report. `osv-scanner` is the milder case — it fetches
advisory data from `api.osv.dev` at run time, so only its extractors age, not its
knowledge. Both were current when pinned (8.28.0 July 2025, 2.2.3 October 2025);
treat the pair as a standing item rather than waiting for something to fail.

## Reproducing a run locally

Both steps are a single `docker run`, which is the point — there is no CI-only
magic to reproduce. From the repository root:

```bash
# Secrets, across the history reachable from HEAD
docker run --rm -v "$PWD:/repo:ro" \
  ghcr.io/gitleaks/gitleaks@sha256:cdbb7c955abce02001a9f6c9f602fb195b7fadc1e812065883f695d1eeaba854 \
  detect --source=/repo --redact --no-banner --no-color -v --exit-code=0

# Dependency advisories
docker run --rm -v "$PWD:/src:ro" \
  ghcr.io/google/osv-scanner@sha256:fca9be4446310094be881b63f6862879282647f121ad3326e91dd90afbf8ef50 \
  scan source --recursive /src
```

`-v` is not optional decoration. Without it 8.28.0 prints `leaks found: N` and
nothing else — no file, no line, no commit, no fingerprint — and a finding nobody
can locate is the same as a finding nobody reads. With it, each finding comes out
as a block naming the rule, the file and line, the commit and author, a
`Fingerprint` and a link straight to the blob. `--redact` still replaces the value
itself with `REDACTED`, so the output is safe to paste into a ticket.

The scanners need no credentials. `osv-scanner` needs outbound network to reach
`api.osv.dev`, which the default docker bridge already provides — the workflow
passes **no** `--network` flag. An earlier draft of it passed `--network host`,
which handed the container the runner's whole network namespace in exchange for
nothing.

### What gitleaks does and does not cover

It walks the history **reachable from the checked-out commit**. On a pull request
that is the merge commit, so `main` plus the branch; on the weekly run, `main`.
Commits that exist only on some other unmerged branch are not scanned.

They *could* be, and this is a choice rather than a limitation.
`actions/checkout` at `fetch-depth: 0` fetches every head, not one ref
(`git fetch … +refs/heads/*:refs/remotes/origin/* +refs/tags/*:refs/tags/*`), so
`--log-opts=--all` reaches them. It is not enabled because of what it would do
*later* — once findings fail, a pull request would go red over a secret on an
abandoned branch it has nothing to do with, which is how a gate gets switched
off. Turning it on belongs with step 2 of *Making it blocking*, and
scheduled-only.

Accepting a finding needs no extra flag. A fingerprint in `.gitleaksignore` at
the repository root is honoured even though the container's working directory is
`/`: gitleaks resolves the file against the scanned source, not the CWD (measured
on 8.28.0). `.gitleaks.toml` is read from the source in the same way. Neither
file exists here yet.

## The baseline

Measured 2026-08-26 against this branch:

| Layer | Result |
| --- | --- |
| Secrets | **clean** — the whole reachable history, no leaks |
| Dependencies | **6 advisories** across 3 package-versions (0 critical, 4 high, 1 medium, 1 low), out of 235 packages scanned |

Three package-versions for **two** names: `js-yaml` appears at both 3.14.2 and
4.2.0.

The secrets row deliberately carries no commit count. It would be the one number
here that moves with every commit to this repository, and it is not a finding — it
is proof that the scan was not a no-op. The step now proves that itself, by
failing on `0 commits scanned`. The dependency numbers stay exact, because there
the count *is* the finding and *is* what has to reach zero.

**Every finding is a devDependency, and here that is true by construction rather
than by inspection.** `package.json` has no `dependencies` key at all —
`npm ls --omit=dev --all` prints `(empty)`. This is the claim the sibling pages
reach for and cannot quite make: Business Central and Pipedrive have one and two
runtime dependencies and had to check; `integrations-nodes-core` has eight and
found six advisories in its production tree. Do **not** read core's "six in the
production tree" paragraph across to this package, and do not read this
paragraph across to core.

| Package | Advisories | Reached through |
| --- | --- | --- |
| `js-yaml` 3.14.2 | GHSA-52cp-r559-cp3m (7.5), GHSA-5p4m-2wfm-xmqj (7.5), GHSA-h67p-54hq-rp68 (5.3) | `@changesets/cli` → `@manypkg/get-packages` → `read-yaml-file` |
| `js-yaml` 4.2.0 | GHSA-52cp-r559-cp3m (7.5), GHSA-5p4m-2wfm-xmqj (7.5) | `@changesets/cli` → `@changesets/read` → `@changesets/parse` |
| `esbuild` 0.27.7 | GHSA-g7r4-m6w7-qqqr (2.5) | `tsup` (directly, and via `bundle-require`) |

All six are fixable by a version bump, and Dependabot's `dev-dependencies` group
already proposes that shape of change. The `esbuild` row shows why it has not
landed yet rather than why it cannot: `tsx` already resolves `esbuild` 0.28.1 —
the fixed version — while `tsup` pins the affected 0.27.7 in the same tree.

Being devDependencies does not make them free. Both chains run in CI, on
developer machines, and — as *What the secrets layer is actually guarding* above
notes — in the job that holds the release App token for a package every node
package depends on. They are a build-chain and release-chain finding rather than
something that ships to a running workflow. That distinction is the reason to
rank them, not a reason to discount them: **nothing this package publishes
contains any of them**, because it publishes `dist/` and nothing else (`files:
["dist"]`, no `bundledDependencies`).

## Making it blocking

The intended end state is that findings fail. Getting there:

1. Bring the dependency baseline to zero, or write down which advisories are
   accepted and why. Six fixable dev-tree advisories across two names is the
   smallest baseline of the four repos, so this is the repo where step 1 is
   actually finishable — start here rather than in core. "Accepted" needs
   somewhere to live before it means anything: `osv-scanner` reads an
   `osv-scanner.toml` of `[[IgnoredVulns]]` entries, each with a reason and an
   optional `ignoreUntil`, and neither that file nor a `--baseline-path` exists
   here yet. Until one does, the 6 findings can be fixed but not accepted — which
   is fine while the step is non-blocking and is the first thing that stops being
   fine when it is not. `gitleaks` needs no equivalent: its baseline is already
   clean, so flipping it to blocking is just the exit-code change in step 2.
2. **Restructure** the exit-code guards — do not merely shrink the tolerated
   set. Both guards currently rest on "a code we do not tolerate means the scan
   did not run", and that sentence stops being true the moment findings are
   meant to fail.

   - **gitleaks does not separate the two cases by exit code.** Drop
     `--exit-code=0` and it exits `1` on a leak — but it also exits `1` on a
     fatal error, `--exit-code=0` or not (`detect --source=/nope` → `FTL stat
     /nope: no such file or directory`, exit `1`, measured on 8.28.0). So keep
     `--exit-code=0` and gate on the report instead: add `--report-path` and
     fail when the report is a non-empty array. A guard that cannot tell "secret
     found" from "scanner broke" is not worth having.

     One mechanical detail, because it is the kind that costs an afternoon: the
     step mounts `$PWD:/repo:**ro**` and the container's working directory is
     `/`. A report written to the default location dies with the container, and
     one written under `/repo` fails on the read-only mount. `--report-path`
     needs a second, writable mount — `-v "$RUNNER_TEMP:/out"` and
     `--report-path=/out/gitleaks.json`. The SARIF upload noted above needs
     exactly the same second mount, so the two changes are cheaper together.
   - **osv-scanner does separate them**, so dropping `1` from its tolerated
     codes is enough — but the `::error::` line must stop saying *the scan did
     not run*, because `1` then reaches that branch and means the opposite.
3. Add `{ "context": "Scan" }` to `required_status_checks` in
   [`.github/rulesets/main.json`](../.github/rulesets/main.json) — otherwise
   "blocking" blocks nothing, because the ruleset lists the checks a pull request
   must satisfy by name. That list is `test` + `changeset` today.

**Step 3 takes effect immediately here, and that is the difference from the
sibling repos.** Their pages have to add "once the rulesets are live at all,
which needs a public repo or a paid org plan". This repo is public and all four
rulesets are `enforcement: active` — so editing `main.json` (and re-importing it;
see [branch-protection.md](branch-protection.md), import only creates, it does not
update) genuinely gates merges. Which cuts both ways: do not do it before step 1.

A useful intermediate step, if step 1 stays open for a while: let the **scheduled**
run fail while pull-request runs keep reporting. A failing scheduled workflow
notifies, which is the one thing the summary cannot do — and it costs nothing on
the secrets layer, whose baseline is already clean.
