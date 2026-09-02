/**
 * node:test reporter that lists the tests the gate can bind to.
 *
 * `node --test` has no `--list` mode, so a node:test suite cannot be enumerated
 * without running it. This reporter turns a run into the listing `spec-check.mjs`
 * expects: it prints `[{ name, file }, …]`, the shape `vitest list --json`
 * produces, so the suite is declared with `"adapter": "vitest"` and the gate needs
 * no adapter of its own.
 *
 * Two things it must get right, both to match that contract:
 *
 *   suites are dropped   a `describe` block reports like a test; only leaves can
 *                        carry a claim, and a suite named after its feature would
 *                        claim every AC in it
 *   skipped are dropped  the vitest listing omits them, and the gate reads a
 *                        missing test as "nothing claims this AC" — which is the
 *                        honest answer for a test that will not run
 *
 * Test output (`console.log`) arrives as `test:stdout` events and is ignored, so
 * stdout carries the JSON and nothing else.
 *
 * Usage — claims live in the test title, so only the claiming tests need to run:
 *
 *   node --test --test-reporter=./scripts/spec-claims-reporter.mjs \
 *        --test-name-pattern='@spec:'
 */
import { relative } from 'node:path'

export default async function* specClaimsReporter(source) {
  const tests = []

  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue

    const { name, file, skip, todo, details } = event.data
    if (details?.type === 'suite') continue
    if (skip || todo) continue

    // A failing test still counts as a claim: a listing cannot know the outcome
    // either, and the suite going red is the other half of the same signal.
    tests.push({ name, file: file ? relative(process.cwd(), file) : file })
  }

  yield JSON.stringify(tests)
}
