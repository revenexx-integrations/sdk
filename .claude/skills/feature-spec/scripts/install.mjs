#!/usr/bin/env node
/**
 * Install the feature-spec gate into a repository — once, per repository.
 *
 * Copies the gate, writes a `spec.config.json` naming the runners this repo was
 * found to have, seeds the spec directory and its index, and wires the `spec:check`
 * script. Refuses to overwrite anything: an existing file is reported and kept, so
 * a second run is safe and tells you what is already in place.
 *
 *   node install.mjs [target-repo-root]      # defaults to the current directory
 *
 * What it detects, and what it cannot: runners are read from `package.json`,
 * `composer.json` and the repo's test directories, and a runner no adapter can list
 * is reported rather than approximated. Which layers this repo really has is a
 * judgement — the summary says which guesses to review. Nothing here is a
 * substitute for reading the config afterwards.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const assets = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'assets')
const root = resolve(process.argv[2] ?? '.')

const done = []
const kept = []
const review = []

const say = (list, msg) => list.push(msg)

const bail = (msg) => {
  console.error(`install: ${msg}`)
  process.exit(1)
}

// A target that is not a directory would otherwise surface as an `ENOTDIR` out of
// the first `mkdirSync`, several steps after the mistake was made.
if (!existsSync(root)) bail(`${root} does not exist — pass the repository root, or run this from inside it`)
if (!statSync(root).isDirectory()) bail(`${root} is a file, not a repository root`)

/** A malformed manifest is the repo's to fix, and says so here rather than throwing. */
const readJson = (path, what) => {
  if (!existsSync(path)) return null
  let parsed
  try { parsed = JSON.parse(readFileSync(path, 'utf8')) }
  catch (e) { bail(`${what} is not valid JSON — ${e.message}`) }
  // `null`, a number and an array all parse; none of them is a manifest, and
  // treating one as "absent" would print advice about a file that is right there.
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) bail(`${what} does not hold a JSON object`)
  return parsed
}

// ------------------------------------------------------------- detection -----

const has = rel => existsSync(join(root, rel))

const pkgPath = join(root, 'package.json')
const pkgText = has('package.json') ? readFileSync(pkgPath, 'utf8') : null
const pkg = readJson(pkgPath, 'package.json')
const deps = { ...pkg?.dependencies, ...pkg?.devDependencies }

const exec = has('pnpm-lock.yaml') ? 'pnpm exec'
  : has('yarn.lock') ? 'yarn'
    : has('bun.lockb') ? 'bun x'
      : 'npx'

// The same cascade for running a *script*, because the seeded index prints the gate's
// command for a reader who arrives without the skill — and `npm run` in a pnpm repo is
// a command that reader would have to translate before it worked.
const runScript = has('pnpm-lock.yaml') ? 'pnpm spec:check'
  : has('yarn.lock') ? 'yarn spec:check'
    : has('bun.lockb') ? 'bun run spec:check'
      : 'npm run spec:check'

/**
 * Which JS runner this repo uses. Only two shapes can be *listed* — vitest's JSON
 * and the `[{ name, file }]` the bundled reporter prints for `node --test` — so a
 * repo on jest, mocha or ava is told that, rather than handed a `node --test`
 * command that cannot run its tests. Guessing there was the sharper failure: the
 * config looked detected, and the suite it named had never been executed once.
 */
const JS_RUNNERS = [
  { dep: 'vitest', listable: true },
  { dep: 'jest', listable: false },
  { dep: 'mocha', listable: false },
  { dep: 'ava', listable: false },
]
const jsRunner = JS_RUNNERS.find(r => r.dep in deps)
const hasPlaywright = '@playwright/test' in deps || 'playwright' in deps
const hasCypress = 'cypress' in deps

const composer = readJson(join(root, 'composer.json'), 'composer.json')
const hasPhpunit = !!composer && (
  'phpunit/phpunit' in { ...composer.require, ...composer['require-dev'] }
  || has('phpunit.xml') || has('phpunit.xml.dist')
)
const hasArtisan = has('artisan')
const hasGo = has('go.mod')
const hasPython = has('pyproject.toml') || has('pytest.ini') || has('tox.ini') || has('requirements.txt')

/**
 * The test directory, and a case-insensitive lookup inside it: Laravel ships
 * `tests/Unit` and `tests/Feature`, and a case-sensitive match found neither, so
 * every PHP repo looked like one flat directory.
 */
const testDir = ['test', 'tests', '__tests__', 'spec'].find(d => has(d)) ?? null
const entries = testDir ? readdirSync(join(root, testDir), { withFileTypes: true }).filter(e => e.isDirectory()) : []
const sub = (...names) => {
  for (const name of names) {
    const hit = entries.find(e => e.name.toLowerCase() === name)
    if (hit) return `${testDir}/${hit.name}`
  }
  return null
}

const REPORTER = './scripts/spec-claims-reporter.mjs'
// The glob is quoted so node does the matching: a bare directory is read as a file
// name and the run fails before a single test is collected.
const nodeSuite = dir => ({
  adapter: 'vitest',
  command: `node --test --test-reporter=${REPORTER} --test-name-pattern='@spec:' '${dir}/**/*.test.*'`,
  runHint: `node --test --test-name-pattern='@spec:<feature>' '${dir}/**/*.test.*'`,
})
// `--json` comes last, after the positional: its value is OPTIONAL and is the file to
// write the listing into, so `--json ${dir}` makes vitest try to write its output over
// the test directory and the listing dies on EISDIR. `runHint` needs no such care —
// `-t` takes its value eagerly.
const vitestSuite = dir => ({
  adapter: 'vitest',
  command: `${exec} vitest list ${dir} --json`,
  runHint: `${exec} vitest run -t '@spec:<feature>' ${dir}`,
})
const phpunitSuite = dir => ({
  adapter: 'phpunit',
  command: `vendor/bin/phpunit --list-tests-xml=php://stdout ${dir}`,
  runHint: hasArtisan
    ? 'php artisan test --group spec:<feature>'
    : 'vendor/bin/phpunit --group spec:<feature>',
})

/**
 * A Go layer is one `go test` invocation over a set of packages. `-json` is what
 * makes it readable and `count=1` is deliberately NOT here: a cached package replays
 * its attributes, so the cache is sound for a listing, and paying for a full re-run
 * on every gate would be a cost with nothing bought. A suite that needs a live stack
 * adds `-count=1` itself, for the reason the stack gives it.
 */
const goSuite = (packages, tags = null) => ({
  adapter: 'go',
  command: `go test -json ${tags ? `-tags=${tags} ` : ''}${packages}`,
  runHint: `go test ${tags ? `-tags=${tags} ` : ''}-run '<Test…>' -v ${packages}`,
})

const suites = {}

if (hasPhpunit) {
  const unitDir = sub('unit')
  const featureDir = sub('feature', 'api', 'integration', 'functional')
  if (unitDir) suites.unit = phpunitSuite(unitDir)
  if (featureDir) suites.feature = phpunitSuite(featureDir)
  if (!unitDir && !featureDir && testDir) {
    suites.feature = phpunitSuite(testDir)
    say(review, `\`suites.feature\` covers all of \`${testDir}/\` — split it once this repo's own split is clear, then add the \`unit\` layer`)
  }
  if (!testDir) say(review, 'PHPUnit is here but no test directory was found — declare `suites` by hand, pointing each layer at the paths this repo actually uses')
  say(review, 'a PHP test claims its AC with `#[Group(\'spec:<feature>:AC-n\')]`, plus the bare `#[Group(\'spec:<feature>\')]` so `--group spec:<feature>` filters usefully')
  // Both stacks in one repo is the normal shape of a PHP service with a JS front
  // end, and the layer NAMES are what collide — so say it rather than picking one.
  if (jsRunner?.listable) {
    say(review, `\`${jsRunner.dep}\` is here too, and only the PHP layers were declared — add the JS ones under names of their own (\`unit-ui\`, say), because two suites cannot share a level`)
  }
}
else if (jsRunner && !jsRunner.listable) {
  // Detected, and deliberately not declared: naming the runner is the useful half.
  say(review, `\`${jsRunner.dep}\` is this repo's runner and no adapter can list it — declare the layer by hand with \`adapter: "vitest"\` and a command that prints \`[{ name, file }]\` (a reporter of a dozen lines), or move the claim-carrying tests to a runner that can. No suite was declared, because a layer nobody can enumerate makes every promise at that level unprovable`)
}
else if (testDir && (jsRunner || !hasGo)) {
  const unitDir = sub('unit')
  const featureDir = sub('feature', 'api', 'integration', 'functional')
  const suite = jsRunner ? vitestSuite : nodeSuite
  if (unitDir) suites.unit = suite(unitDir)
  if (featureDir) suites.feature = suite(featureDir)
  if (!unitDir && !featureDir) {
    // A flat test directory cannot be split by a command, and what it holds mostly
    // reaches an assembled application at one entry point — so it installs as one
    // `feature` layer. Splitting it later is a config edit plus a `git mv`, not a
    // change to the gate.
    suites.feature = suite(testDir)
    say(review, `\`suites.feature\` covers all of \`${testDir}/\` — split it into \`${testDir}/unit\` and \`${testDir}/feature\` if this repo has both, then add the \`unit\` layer`)
  }
  if (!jsRunner) say(review, 'no test runner was found in `package.json`, so the layers above assume `node --test` — check the commands actually run before trusting a green gate')
}
// Not `else`: a Go repo reaches here with nothing declared and everything fine — its
// tests live beside the code, so "no test directory" is the normal shape and the Go
// branch below is what declares the layer.
else if (!hasGo) {
  say(review, 'no test directory was found, so no layer could be declared — write `suites` by hand once the tests have a home, and until then every promise is `todo` with a ticket')
}

/**
 * Go, checked independently of everything above: a Go repository has no
 * `package.json` to be detected in and no test directory to split, because its tests
 * sit in the package they test. So the shape the branches above look for is absent by
 * design rather than missing, and only `go.mod` says anything.
 *
 * ONE layer is declared, over all packages, and that is not a guess about this repo —
 * it is the only split `go test` can be trusted to make on no information. The two
 * real discriminators are both local: a build tag (`//go:build integration`) and the
 * package list, and which packages assemble the application is a judgement no
 * detector can make. The review lines ask for it by name instead.
 */
if (hasGo) {
  if (Object.keys(suites).length) {
    say(review, 'a `go.mod` is here as well, and only the layers above were declared — give the Go layers names of their own (`unit-go`, say) if both stacks carry claims, because two suites cannot share a level')
  }
  else {
    suites.unit = goSuite('./...')
    say(review, '`suites.unit` runs `go test ./...`, every package — which is one layer over what are usually two. Split it if this repo has assembled-application tests (`httptest` against the whole router) beside its true unit tests: name the packages per layer, and remember the discriminator is then the PACKAGE, so a thin test in an assembled-application package still claims at the layer that package was given')
    say(review, 'if this repo has tests behind a build tag needing a live stack (`//go:build integration`), declare them as the `e2e` layer with `-tags=<tag>` and `-count=1` — `-count=1` because a cached PASS from before the stack was rebuilt is a green run that measured nothing. And note the consequence of reading a RUN: that listing needs the stack UP and the tests GREEN, so the gate belongs in the job that already brings the stack up')
    if (testDir) say(review, `a \`${testDir}/\` directory is here too and was NOT declared as a layer — if it holds tests of another stack, give it a suite under a name of its own`)
    say(review, "a Go test claims its AC with `t.Attr(\"spec\", \"<feature>:AC-n\")` as its first statement (Go 1.25+) — NOT in the test's name, which cannot hold one: `@` and `:` are not legal in an identifier. The attribute is emitted before the test can fail, which is what makes it readable even out of a run that goes red")
  }
}

if (hasPlaywright) {
  suites.e2e = {
    adapter: 'playwright',
    command: `${exec} playwright test --list --reporter=json`,
    runHint: `${exec} playwright test --grep '@spec:<feature>'`,
  }
  say(review, 'if these Playwright files run in two tiers — mocked on every pull request, real stack nightly — declare the second tier as its own suite and give both the same `fileset`, so a promise can say which tier gates it')
}
else if (hasCypress) {
  say(review, 'Cypress is here and no adapter can list it — declare the `e2e` layer by hand with a command that prints `[{ name, file }]`, or leave it out and keep those promises at `manual`')
}
else {
  say(review, 'no `e2e` layer was declared — no Playwright here. A promise no layer can prove says `manual` or `todo`, never a level without a claimant')
}

if (hasPython) {
  say(review, 'this looks like a Python repo: pytest has no listing this gate can read, so a pytest layer needs a small `--collect-only` reporter printing `[{ name, file }]`, declared as `adapter: "vitest"`')
}

const usesReporter = Object.values(suites).some(s => s.command.includes(REPORTER))

// ----------------------------------------------------------------- write -----

const put = (rel, contents, mode) => {
  const target = join(root, rel)
  if (existsSync(target)) return say(kept, rel)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, contents)
  if (mode) chmodSync(target, mode)
  say(done, rel)
}

const vendor = (name, rel) => {
  const target = join(root, rel)
  if (existsSync(target)) return say(kept, rel)
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(join(assets, name), target)
  chmodSync(target, 0o755)
  say(done, rel)
}

vendor('spec-check.mjs', 'scripts/spec-check.mjs')
if (usesReporter) vendor('spec-claims-reporter.mjs', 'scripts/spec-claims-reporter.mjs')

/**
 * On a second run the repo's own config is the authority. Reading the skill's copy
 * instead meant a repo that had renamed `specDir` got a second, wrongly-named spec
 * directory seeded beside its real one — by a run that was supposed to change
 * nothing.
 */
const defaults = readJson(join(assets, 'spec.config.json'), "the skill's spec.config.json")
const existing = readJson(join(root, 'spec.config.json'), 'the existing spec.config.json')
const config = existing ?? { ...defaults, suites }
if (!existing) {
  say(review, '`ceiling` is empty — fill in what this repo\'s harness cannot reach at any layer (a mocked transport, an external system), so a promise beyond it lands on `manual` or `todo` rather than on a layer that cannot prove it')
  say(review, `\`houseRules\` points at \`${config.specDir}/README.md\`, whose last sections are empty on purpose and fill at different times — the surface register with the first spec, because every spec's \`where:\` already holds the material; the words and the cuts when this repo has one to record. What must NOT go in there is anything this file already has a key for: \`suites\`, \`ceiling\`, \`audience\`, \`ticketPattern\`, \`indexRegister\` are settled here, and stating one twice produces two truths about one thing`)
}
put('spec.config.json', `${JSON.stringify(config, null, 2)}\n`)

const specDir = config.specDir ?? defaults.specDir
const register = config.indexRegister ?? defaults.indexRegister
/**
 * The index gets all six of its sections at install, the empty ones included. They are
 * the same six in every repository, and a heading that is already there is what makes
 * the next author fill it — the two this did not seed before are exactly the two nobody
 * wrote without being asked: the words a corpus had to settle, and the register of what
 * the product calls each surface.
 */
const runner = pkg ? runScript : 'node scripts/spec-check.mjs'
const indexExisted = existsSync(join(root, specDir, 'README.md'))
put(`${specDir}/README.md`, `# Feature specs

What this product promises, one spec per surface. Every promise here is bound to a
test that proves it; \`spec:check\` holds the two together.

## Specs

<!-- One entry per spec, opening its own bullet: a link to the spec, then one line
     of scope. The link has to open the bullet — the gate reads a mention inside
     another entry as no entry at all. Do not put an example link in this comment:
     every link in this file is checked for existing. -->

## ${register}

<!-- Surfaces that carry no promise of their own yet: what it is, and the ticket
     that will promise it. A row here is a state, not an oversight. -->

## How a spec is cut here

<!-- The granularity calls this repo has made, one entry each: which item of the
     skill's \`## One spec per surface\` list it was, and what the other choice would
     have cost. The reasoning, not the outcome — where a spec lives is a fact the
     directory already states. Empty until a cut here took an argument.
     An entry OPENS on bold text, never on a link. This heading is one of the four
     in \`indexAsides\`, so the gate already subtracts it from the inventory — the
     convention is what still holds if that heading is renamed and the config is
     not: a bullet read as inventory would count as a spec's index row and let the
     real one be deleted unnoticed. -->

## Words these specs use

<!-- Terms the product leaves open — the roles, a thing named differently at two
     points of its life — settled by agreement and written down so the next author
     follows them. Empty until two authors could reasonably write two words for one
     thing. Settling one obliges a sweep: replace the word that lost in every spec
     and here, in the same change, because nothing in the gate can see a drifted
     term. A word a sibling corpus already settled is borrowed and cited, not
     decided again. -->

## The surfaces, and what the product calls them

<!-- One row per name a consumer reaches a promise by, and the spec that promises it
     — the message key in a translated product, the shipped copy in a
     single-language one, the exported name or the route in a library. No column
     describing the surface: that is the spec's opening sentence, and the copy here
     is the one that rots. Read before a spec, a ticket or a pull request names a
     surface, so one surface is named once everywhere. This section starts with the
     first spec — every spec's \`where:\` already holds the material — and a surface
     the product does not name is listed underneath rather than given a house
     name. -->

## How this stays true

Every AC declares how it is verified, and every automated one is claimed by a test
tagged \`@spec:<feature>:AC-n\`. The gate fails the build when a promise has no
claimant, when a claim resolves to no promise, and when the index has stopped
matching the specs — so a promise cannot change without its tests coming along.
Behaviour nobody tests is not hidden: it is \`manual\` with a reason or \`todo\` with
a ticket, and the gate prints both on every run.

- Run the gate: \`${runner}\`
- Working on a ticket that changes behaviour: \`/feature-spec <ticket>\`
- Writing or editing a spec: the \`feature-spec\` skill carries the format rules
`)

/**
 * An index that was already here is kept, like every other existing file — but it was
 * very likely seeded by an older version of this installer, which wrote three of the
 * six sections the skill's index table now names. Nothing else would say so: the gate
 * reads two sections and cannot miss what is absent, so without this line a repo
 * carries a three-section index indefinitely and the operator never learns why.
 */
if (indexExisted) say(review, `\`${specDir}/README.md\` was already here and was left alone — check it against the six sections the skill's index table names: the inventory, \`${register}\`, *how a spec is cut here*, *words these specs use*, *the surfaces, and what the product calls them*, and *how this stays true*. An older install seeded only the first two, the gate reads only those two, and nothing else will report the other four missing`)

if (pkg) {
  const scripts = pkg.scripts ?? {}
  if ('spec:check' in scripts) say(kept, 'package.json → scripts["spec:check"]')
  else {
    // Re-serialising the whole manifest reformats a file this script was asked to
    // add one line to, so the repo's own indent and line ending are carried over.
    // An empty existing value counts as present, hence `in` above: replacing it
    // silently would be the overwrite this script promises not to do.
    const indent = /^[ \t]+/m.exec(pkgText)?.[0] ?? 2
    const eol = pkgText.includes('\r\n') ? '\r\n' : '\n'
    pkg.scripts = { ...scripts, 'spec:check': 'node scripts/spec-check.mjs' }
    const body = JSON.stringify(pkg, null, indent).replaceAll('\n', eol)
    writeFileSync(pkgPath, pkgText.endsWith('\n') || pkgText.endsWith('\r\n') ? `${body}${eol}` : body)
    say(done, 'package.json → scripts["spec:check"]')
  }
}
else say(review, 'no `package.json` here — run the gate as `node scripts/spec-check.mjs`, and give it whatever this repo uses for a task runner')

// ------------------------------------------------------------------- ci ------

/**
 * A gate nothing runs is a document. So the pipeline gets the job too — written as a
 * file of its own, never as an edit to a pipeline somebody else wrote: patching YAML
 * costs comments and ordering, and silently rewriting the file a team argues over is
 * not a thing an installer should do.
 */
const RUN = 'node scripts/spec-check.mjs'
// No `package.json` means nothing to install with a JS package manager, and a job
// born with `npm ci` in it fails on its first run — so the step is dropped rather
// than filled in. What such a repo's layer really needs is its own toolchain, which
// the review lines below ask for by name instead of guessing at it here.
const INSTALL = !pkg ? null
  : exec === 'pnpm exec' ? 'pnpm install --frozen-lockfile'
    : exec === 'yarn' ? 'yarn install --frozen-lockfile'
      : exec === 'bun x' ? 'bun install --frozen-lockfile'
        : 'npm ci'
const SETUP = exec === 'pnpm exec' && pkg ? '      - uses: pnpm/action-setup@v4\n' : ''

const template = (name, setup) => readFileSync(join(assets, name), 'utf8')
  .replace('{{SETUP}}\n', setup)
  // The whole line goes, not just the placeholder: what is left of `- run:` with an
  // empty argument is a syntax error in one format and a no-op step in the other.
  .replace(/^.*\{\{INSTALL\}\}.*\n/m, INSTALL ? m => m.replace('{{INSTALL}}', INSTALL) : '')
  .replaceAll('{{RUN}}', RUN)

const ghWorkflows = join(root, '.github', 'workflows')
const hasGithub = existsSync(ghWorkflows)
const hasGitlab = existsSync(join(root, '.gitlab-ci.yml'))
const otherCi = ['.circleci/config.yml', 'Jenkinsfile', 'azure-pipelines.yml',
  'bitbucket-pipelines.yml', '.woodpecker.yml', '.drone.yml']
  .find(f => existsSync(join(root, f)))

if (hasGithub) {
  put('.github/workflows/spec-check.yml', template('ci-github.yml', SETUP))
  say(review, 'the workflow runs on pull requests, but a job that exists can still be ignored — add `spec-check` to the required status checks of the ruleset or branch protection guarding the default branch, or a red gate can merge')
}

if (hasGitlab) {
  put('.gitlab-ci.spec-check.yml', template('ci-gitlab.yml', ''))
  say(review, 'add `include: [{ local: .gitlab-ci.spec-check.yml }]` to `.gitlab-ci.yml` — the job was written to its own file so nothing you wrote was touched — and confirm "Pipelines must succeed" is on for merge requests')
}

if (!hasGithub && !hasGitlab) {
  const where = otherCi ? `\`${otherCi}\`` : 'no pipeline'
  say(review, `${where} here, so no CI job was written: add one step that installs dependencies and runs \`${RUN}\`, and make it required before merge. The runners have to be installed in that job, because the gate shells out to them`)
}

// The templates set up Node, because that is what the gate itself runs on. A layer on
// another toolchain needs that toolchain in the same job — the gate shells out to the
// runner, so a missing `composer install` surfaces as "could not list a test suite"
// rather than as a setup error, which is the confusing way round.
if ((hasGithub || hasGitlab) && Object.values(suites).some(s => s.adapter === 'go')) {
  say(review, 'the CI job that was written sets up Node only, because that is what the gate itself runs on — a `go` layer needs `actions/setup-go` in that SAME job, since the gate shells out to `go test`. And a Go layer reads a test RUN: if any suite needs a live stack, do not run the gate in a job of its own at all — put `node scripts/spec-check.mjs` in the job that already brings the stack up, and delete the workflow written here')
}

if ((hasGithub || hasGitlab) && Object.values(suites).some(s => s.adapter === 'phpunit')) {
  say(review, 'the CI job that was written sets up Node only, and a `phpunit` layer needs PHP and `composer install` in that same job — add them, and point the job at whatever image the repo\'s other PHP jobs use')
}

// --------------------------------------------------------------- summary -----

const runnerOf = s => s.command.includes(REPORTER) ? 'node:test' : s.adapter
const declared = Object.entries(config.suites ?? {}).map(([n, s]) => `${n} (${runnerOf(s)})`).join(', ')
console.log(`feature-spec installed into ${root}`)
// Which suites are in force is what the file on disk says, not what this run
// detected — those differ exactly when the config was already there and kept.
console.log(`\nlayers declared: ${declared || 'none — write `suites` by hand'}`)
if (done.length) console.log(`\nwritten:\n${done.map(f => `  + ${f}`).join('\n')}`)
if (kept.length) console.log(`\nalready present, left alone:\n${kept.map(f => `  = ${f}`).join('\n')}`)

if (existing) {
  say(review, 'this repo already had a `spec.config.json`, so it was left untouched — the layers above are the ones it declares, not the ones this run detected. Merge anything missing by hand')
  if (!existing.indexAsides) say(review, "this config has no `indexAsides`, so every section of the index except the register is read as the inventory — a bullet in the words section or the surface register counts as a spec's index row if a link opens it, and the real row can then be deleted in silence. Copy the key from the skill's `assets/spec.config.json` and check the four headings against the ones this index actually uses")
}
else {
  say(review, '`audience` is a placeholder describing an operator on a screen — restate it in this product\'s own words if its readers are integrators calling an API, workflow authors on a canvas, or anyone else; the `$comment` beside it carries three worked examples')
  if (!hasGo) say(review, '`implementationPattern` is TypeScript-shaped — widen it if this repo is on another stack, e.g. add `|\\b[\\w./-]+\\.(?:php|py|go)`')
  if (hasGo) say(review, '`implementationPattern` is TypeScript-shaped and this is a Go repo — widen it to catch what a spec must not name here, e.g. `(?:\\binternal/\\S+|\\bcmd/\\S+|\\b[\\w./-]+\\.go)`')
  say(review, 'read `spec.config.json` top to bottom once: every key carries a `$comment_<key>` saying what it does')
}
console.log(`\nreview:\n${review.map(r => `  ! ${r}`).join('\n')}`)
console.log('\nthen: run the gate once against the empty corpus — it should pass with nothing to check.')
