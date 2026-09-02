# Test layers, claims, and proving a negative

How a repository's layers are declared, how each runner's claims are read, and what an
absence needs before it counts as proven.

- [Declaring the layers](#declaring-the-layers)
- [The ceiling is per repo](#the-ceiling-is-per-repo)
- [Picking one: how much has to stand up](#picking-one-how-much-has-to-stand-up)
- [Two tiers over one fileset](#two-tiers-over-one-fileset)
- [How a claim is read](#how-a-claim-is-read)
- [node:test has no listing, so it runs](#nodetest-has-no-listing-so-it-runs)
- [Go claims with an attribute, and pays a run](#go-claims-with-an-attribute-and-pays-a-run)
- [Absence needs a positive control, and proof](#absence-needs-a-positive-control-and-proof)
- [When no layer can prove it](#when-no-layer-can-prove-it)

## Declaring the layers

`suites` in `spec.config.json` is a map of layer name → `{ adapter, command, runHint }`,
plus the optional `fileset`, `container`, `workdir` and `nativeCwd` described below.
**The three layer names are global** — `unit`, `feature` and `e2e` mean the same thing in
every repository, because "pick the weakest layer that proves the promise" needs an
ordering, and freely-invented per-repo names have none. What the config says is which of
them *this* repository has: the gate builds its vocabulary as `Object.keys(suites)` plus
`manual` and `todo`, so a level naming a suite this repo does not declare is a hard error,
not a convention.

**Declare only the layers that exist.** A repo with two layers is not deficient — a repo
with an `e2e` layer it cannot actually run is, because every promise at that level then
depends on a suite nobody can list. A promise no declared layer can prove says `manual`
or `todo`.

**And never declare a layer to make a `verify:` line legal.** The reflex when the gate
says `unknown verify level` is to add the missing suite; with one runner in the repo the
only `command` to hand is the one an existing layer already uses, and the two suites then
list the same tests. That is loud rather than silent — every claim arrives twice, once per
suite, and the backward check refuses each claim whose AC does not name that suite, so the
first run fails on every AC of the older layer at once. The one case where two suites over
one set of files is deliberate has to say so: give both the same `fileset`, and they count
as one rung's two tiers rather than two layers. The fix is on the other side: the
promise belongs at a layer this repo has, or it is `manual` / `todo`.

A repository needing a genuinely fourth layer gives its name a place in the order and
records that, rather than treating the name as local vocabulary.

## The ceiling is per repo

**A listing that needs the dev stack names its `container`.** The command is then wrapped
in `docker compose exec -T` (with `workdir`, and the top-level `compose` file), which is
what a repo whose toolchain is only installed inside its containers needs. `--native` runs
every listing on the host instead — for CI, which installs the toolchains directly and has
no stack to exec into — and `nativeCwd` is the directory it runs in there. A suite with no
`container` ignores the flag.

What *is* local is the ceiling: what the harness here cannot reach at any layer. That is
the rule routing a promise out of the ordered set and into `manual` or `todo`, and it
belongs in the config — one copy per repo rather than one per spec — as `ceiling`, which
the gate does not read. A library that mocks its FTP, SMTP and storage transports writes
it as: *a criterion about the file actually arriving is `manual` with a reason, or `todo`
with a ticket — never `unit`.*

The ceiling is not the meaning of a layer. `unit` means what the table below says it
means everywhere; the ceiling says which promises this repo cannot carry that far.

## Picking one: how much has to stand up

The axis is not how many requests can break the promise — that question is stack-shaped
and dies in a repository with no requests in it. Ask instead how much of the system has to
stand up around the code under test before the promise is observable at all, and how that
code is reached:

| Layer | The system around it | Reached by | Example |
| --- | --- | --- | --- |
| `unit` | one seam, no application | calling the export directly, its surroundings faked | a budget's remainder is its ceiling less its commitments |
| `feature` | the application is assembled | programmatically, at one entry point | asking for the remaining budget answers with the remainder, and refuses an unknown cost centre |
| `e2e` | the whole thing runs | the way a consumer really reaches it — a browser, a real call | assign a budget in the UI, commit against it, and the figure on the screen reflects the commitment |

**Pick the weakest layer at which the promise is observable.** A promise about what stands
on a screen is `e2e` however few requests are involved, because the surface exists at no
other layer. A library, where no application stands up, has only `unit` — the upper half of
the ladder does not exist there, and its specs are not thereby under-verified.

**The middle layer is where discipline is needed.** It is the one everything drifts into,
because almost any promise can be squeezed through a single programmatic entry point if the
fixture does enough setup beforehand. The question is not what the test *can* be written
as: if the promise is only true once a consumer has walked a real path to it — a screen,
a session, a sequence carried across calls — the setup is standing in for the very thing
the promise is about, and it belongs one layer up.

**`manual` and `todo` are not below `unit`.** They sit outside the order: the layers answer
how deep the system must stand, those two answer whether the promise is proven at all. The
gate draws the same line — a level counts as proven when it names a declared suite, so a
fall to `manual` or `todo` reports as *no longer proven*, and "pick the weakest layer" is
never an invitation to pick `manual`.

## Two tiers over one fileset

Two suites that declare the same `fileset` enumerate the **same test files** and differ
only in the tier they run in: the mocked tier gating every pull request, and the real
stack nightly. The gate then reads a claim from either as legitimate, so an ordinary test
appearing in both listings is not a mismatched level — while the tier an AC names still
has to carry a claim of its own.

That is what makes the level answer one question: **is this promise gated on the way in?**
A test the mocked tier filters out (Playwright's `@real-only` and its equivalents) shows
up in the nightly listing alone, so an AC claiming the gated tier is reported as unproven
*and told where its claim did arrive* — the fix is one word in `verify:`, not a new test.
Reach for the nightly level only where the assertion cannot hold mocked: a name the real
backend gives a stream, bytes actually leaving object storage. Being awkward to mock is
not a reason, because a request-level override works in both tiers.

**A promise proved at two layers may name both** — `- verify: unit, feature` — and each
level then needs its own claimant; declare both and provide one, and the gate says which
is missing. Do not reach for it by default. A second level earns its place only when it
proves something the first cannot, typically a transformation whose result also has to be
observed from outside.

## How a claim is read

The gate never parses a test source. It asks each layer's runner what it collected, so
what is checked is what the runner actually has — a tag built in a helper, or a generated
test, still reports correctly.

| `adapter` | Listing | Claim lives in |
| --- | --- | --- |
| `playwright` | `playwright test --list --reporter=json` | a real tag, so `--grep` selects a feature |
| `vitest` | a flat `[{ name, file }]` array | the test title, since vitest exports no tags |
| `phpunit` | `--list-tests-xml=php://stdout` | a `#[Group]`, since PHPUnit has no tag field |
| `go` | the `attr` events of `go test -json` | `t.Attr("spec", …)`, a real attribute — a Go identifier cannot hold a tag |

Every title and every tag is scanned for either form, so a tag typed into a title still
counts and vice versa. Any runner that can print `[{ name, file }]` needs no adapter of its
own — declare it as `vitest`. A runner that can print neither shape needs a reporter of its
own before it can carry claims at all; jest, cypress and pytest are in that position, and
the installer says so rather than wiring a command that cannot run.

A PHPUnit test carries two groups, and only the first is read by the gate:

```php
// AC-4 — Asking for a foreign private skill directly reports it as absent
#[Group('spec:skill-visibility')]
#[Group('spec:skill-visibility:AC-4')]
public function test_private_skill_of_another_org_is_not_found(): void
```

The bare feature group carries no `AC-n`, so it is inert to the binding — it is what makes
`--group spec:<feature>` a usable filter for a human.

**How a skipped test surfaces depends on the runner, and one runner hides it.** Playwright's
listing exposes statically skipped tests, so the gate sees and rejects them by name; vitest's
listing omits them entirely, which arrives as "no test claims this". PHPUnit's listing is
static while its skips are runtime, so a `markTestSkipped` or an unmet requirement is
invisible here and the promise reads as proven. That is the one place a green gate over a
PHP layer is worth less than it looks, and the reason to run the suite as well as the gate.
Go is the other end of that scale: it reads a run, so a `skip` is an event like any other
and a promise resting on a skipped test is named rather than counted.

**A suite that cannot be listed is a hard stop, not zero coverage.** Treating "no tests
found" as "nothing is proven" would spray misleading errors over every AC, so the gate
reports the listing failure and says coverage is unknown until it is fixed.

## node:test has no listing, so it runs

`node --test` has no `--list` mode. The bundled `spec-claims-reporter.mjs` closes the gap
by turning a run into the listing the `vitest` adapter already reads:

```
node --test --test-reporter=./scripts/spec-claims-reporter.mjs \
     --test-name-pattern='@spec:' '<dir>/**/*.test.*'
```

Three properties follow, and the second is the one to know:

- **Only claiming tests run.** `--test-name-pattern='@spec:'` filters to the tests that
  carry a tag, so enumerating a layer costs a fraction of its suite.
- **A failing claiming test takes the listing down with it**, and the gate then reports
  coverage as unknown rather than absent. That is the honest reading — a promise whose own
  proof is red is not proven — but it means a red test surfaces twice, once from the suite
  and once from the gate.
- **The glob must be quoted** so node does the matching. A bare directory is read as a file
  name, and the run fails before collecting anything.

Suites are dropped from the listing (a `describe` reports like a test, and a suite named
after its feature would claim every AC in it), and so are skipped and `todo` tests, to
match what a vitest listing contains.

## Go claims with an attribute, and pays a run

A Go test **cannot** carry its claim in its name: `@` and `:` are not legal in an
identifier. So the claim is an attribute, which Go 1.25 added and which `go test -json`
emits as an event of its own:

```go
// AC-2 — A tenant named in the request body is refused on every write path
func TestMintRejectsABodySuppliedTenant(t *testing.T) {
	t.Attr("spec", "tenant-isolation:AC-2")
	…
}
```

**Make it the first statement.** The attribute is emitted when the call runs, so a claim
placed after the first assertion is lost from exactly the run that needed explaining —
the one that failed early.

The value omits the `spec:` prefix, because the key already carries it; a value that
spells it anyway is accepted rather than doubled. A subtest whose name carries
`[@spec:feature:AC-n]` is read too — every title is scanned alongside every tag — but
prefer the attribute: it survives a rename of the subtest.

**`go test -list` is not usable for this**, which is the whole reason this adapter reads a
run: it prints top-level function names and nothing else — no subtests, no attributes.
Three consequences, and the third is the one that shapes CI:

- **The test cache is not a hazard.** A cached package replays its recorded events,
  attributes included (measured on go1.27), and editing a test invalidates its own
  package — so a claim cannot be replayed out of a source that no longer carries it.
  `-count=1` in a suite's command is about a live stack, never about the adapter.
- **A failing claiming test takes the listing down with it.** `go test` exits non-zero,
  the gate reports the suite as unlistable, and coverage reads as *unknown* rather than
  absent — the honest reading, since a promise whose own proof is red is not proven.
- **A suite that needs a live stack can only be enumerated against one.** A layer behind
  `//go:build integration` is listed by running it, so the gate cannot answer at all with
  the stack down. Such a repository does not give the gate a job of its own: it puts
  `spec:check` in the job that already brings the stack up, after the suite it enumerates.

The layer split in a Go repo is the **package**, since one `go test` invocation is one
suite and nothing finer can be enumerated. Where a package holds both true unit tests and
tests that assemble the whole router through `httptest`, the package's declared layer wins
for every test in it — say so in `houseRules` rather than letting each spec decide, or the
same kind of proof lands on two different levels.

## Absence needs a positive control, and proof

An AC of the form "X is *not* offered" or "nothing happens" passes just as happily when the
test is broken, when the element is addressed wrongly, or when the feature vanished
everywhere. Two rules, both learned the hard way:

1. **Pair it.** Write the counterpart AC that proves the thing *is* offered where it should
   be, and have both tests reach the element through the *same* helper. Say so in the AC's
   `**Pair**` bullet — not in `**Because**` — so nobody later "simplifies" the pair apart.
   The two are aimed at different readers: a reason is for whoever reads the promise, a pair
   note for whoever maintains its test.

   **Nothing checks that an absence AC carries a pair note at all.** That half is on the
   author and the reviewer, so a green gate is not evidence the pair was written.

   **A criterion the note names has to exist, and that is checked**: retire or renumber one
   and every `**Pair**` pointing at it is reported, because a note whose job is "these two
   hold each other up" is worse than absent when it points at nothing. A note that names no
   criterion is fine — a promise whose own two halves control each other has nothing to
   resolve. Naming one in another spec works too; link it, and the ids after the link are
   read as that spec's.

2. **Prove the test can fail.** Revert the fix or break the guard locally, run the negative
   test, confirm it goes red, then restore. A negative test nobody has seen fail is
   decoration.

**One negative per guard.** If the promise is "this cannot be bypassed", the AC needs the
bypass attempt in it — a shortcut, a direct API call, a second click — and the test must
assert that nothing was sent.

## When no layer can prove it

Say `manual` with a `- reason:`, or `todo` with a `- ticket:` — this is where the repo's
[ceiling](#the-ceiling-is-per-repo) sends a promise. A wheel-zoom-to-cursor, a
max-height, a hover affordance — say `manual` and say why in one line.

`- ticket:` must be a real ticket id, checked for shape, and **never the ticket being worked
on right now**: that one is about to close, and the promise would be left pointing at
finished work.
