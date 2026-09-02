#!/usr/bin/env node
/* NOTICE: vendored by the revenexx skills catalog from
 * revenexx/studio-integrations@5e951a1, scripts/spec-check.mjs.
 *
 * Deviations from upstream — keep this list true when re-vendoring:
 *
 *   1. The failure summary pointed readers at `/spec-sync`, a slash command that
 *      exists in that repository and not in a repository the skill installs into. It
 *      now names the skill alone, which travels with the gate. The skill's four modes
 *      and `references/workflow.md` carry what the command carried.
 *   2. The `phpunit` adapter and its XML slicer are back, ported from
 *      revenexx/skills@8d933a1: claims are read from the `<groups>` block of
 *      `--list-tests-xml`. The slicer accepts `<tests>` and `<testSuite>` as the
 *      root, because PHPUnit has shipped either one and pinning one fails loudly on
 *      the other.
 *   3. A suite may name a `container` (with `workdir`, and the top-level `compose`),
 *      and its listing then runs through `docker compose exec -T`. `--native` forces
 *      every listing onto the host. Both come from the same upstream, which needed
 *      them because no container there mounts the docker socket.
 *   4. Suites sharing a `fileset` are two tiers over one set of test files, so the
 *      backward pass reads a claim from a sibling tier as extra proof rather than a
 *      mismatched level. Upstream achieved this by not checking the level per claim
 *      at all; doing it by declaration keeps the check for layers that really are
 *      separate.
 *   5. An unknown `adapter` reports as a config error, and an empty `suites` map says
 *      so once rather than calling every level unknown.
 *   6. A `go` adapter, which has no upstream: it reads `go test -json` and takes
 *      claims from the `attr` events `t.Attr("spec", "<feature>:AC-n")` emits (Go
 *      1.25+). It is the second adapter that reads a RUN rather than a listing, for
 *      the same reason the node:test reporter does — `go test -list` prints top-level
 *      function names and nothing else — and the first whose runner exposes a skip.
 */
/**
 * Feature-spec gate.
 *
 * Keeps the feature specs (what we promise — `specDir` in `spec.config.json`,
 * `specs/` here) and the test suites (what we verify) from drifting apart, in
 * BOTH directions:
 *
 *   forward   every AC with `verify: e2e|unit` has at least one test claiming it
 *             — a test that will not run does not count
 *   backward  every `@spec:<feature>:AC-n` tag in a test resolves to an AC that
 *             exists AND whose `verify:` names the suite it was found in — which
 *             may name more than one, for a promise proved at both levels
 *
 * The backward direction is the one that makes this sustainable: rewrite or
 * delete a promise and its tests go red immediately, so they have to be brought
 * along in the same change.
 *
 * Deliberately not a lint of the test sources: test claims are read from the
 * runners' own listings (`playwright test --list --reporter=json`,
 * `vitest list --json`), so no TypeScript is ever parsed here. That line was
 * tested and held in PO-213, which asked whether the AC-heading comment above a
 * test should be checked by scanning for it: a scan can prove a heading is
 * present but not that it is the RIGHT one, which is the whole value — so it
 * would trade a gap everybody can see for a green check that proves nothing. The
 * reason is recorded in the `feature-spec` skill, where the rule lives.
 *
 * It also answers a second question, and answers it as a report rather than as a
 * gate: `--since <ref>` says which promises were added, changed, retired or moved
 * between two points in this repository's history (PO-307). That mode parses the
 * corpus at both refs and nothing else — no format checks, no suite listing — and
 * always exits 0. It is a reading of the corpus, not a verdict on it: the two must
 * not be confused, because a gate that exits 0 proves something and this does not.
 *
 * Everything project-specific (paths, commands) is in `spec.config.json`.
 * Format rules: see the `feature-spec` skill.
 */

import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(root, 'spec.config.json'), 'utf8'))

/**
 * `--since <ref>` compares that ref against the working tree; `--since <a>..<b>`
 * compares two refs, and either side may be a date. `--since=<ref>` means the same:
 * `CLAUDE.md` teaches `changeset status --since=origin/main` two sections above the
 * one this mode is documented in, so the joined form is what muscle memory produces,
 * and reading only the space-separated one turned it into a silent gate run.
 *
 * Every other argument is refused, because the gate is what runs when nothing is
 * passed: `--snice origin/main` used to print a green gate summary and exit 0, so a
 * reader who asked what changed got an answer to a different question with nothing
 * saying so. One `..` at most, for the same reason — `<a>..<b>..<c>` dropped `<c>`
 * without a word.
 *
 * A bare `--` is dropped, because `pnpm spec:check -- --since main` passes it
 * through and refusing that form would be the tool being pedantic about the way
 * half the world writes a script argument.
 */
const argv = process.argv.slice(2).filter(a => a !== '--')
const sinceAt = argv.findIndex(a => a === '--since' || a.startsWith('--since='))
const joined = sinceAt >= 0 && argv[sinceAt].startsWith('--since=')
const sinceValue = sinceAt < 0 ? null : joined ? argv[sinceAt].slice('--since='.length) : argv[sinceAt + 1]
// Whatever the flag did not consume is an argument this script does not know, and a
// script that ignores one answers a question it was not asked.
const consumed = new Set(sinceAt < 0 ? [] : joined ? [sinceAt] : [sinceAt, sinceAt + 1])
/**
 * `--native` runs every suite's listing on this host instead of in the container it
 * declares. It exists for CI, which installs the toolchains directly and has no
 * stack to exec into; a suite that declares no `container` is unaffected either way.
 */
const nativeAt = argv.findIndex(a => a === '--native')
if (nativeAt >= 0) consumed.add(nativeAt)
const native = nativeAt >= 0
const unknown = argv.filter((_, i) => !consumed.has(i))
if (unknown.length) {
  console.error(`spec-check: unknown argument${unknown.length === 1 ? '' : 's'} — ${unknown.join(', ')}`)
  console.error('spec-check: the flags are `--since <ref>` / `--since=<ref>` / `--since <a>..<b>`, and `--native`')
  process.exit(2)
}
if (sinceAt >= 0 && !sinceValue) {
  console.error('spec-check: --since needs a ref — `--since origin/main` or `--since <a>..<b>`')
  process.exit(2)
}
const comparing = sinceAt >= 0
// Both halves default to `null`, and `null` is what the comparison reads as "the
// working tree" — so a one-ref `--since main` and an explicit `--since main..`
// mean the same thing, and neither can reach the git reader as `undefined`.
const refParts = comparing ? sinceValue.split('..').map(r => r.trim() || null) : []
if (refParts.length > 2) {
  console.error(`spec-check: too many refs in "${sinceValue}" — one \`..\` at most`)
  process.exit(2)
}
const [baseRef = null, headRef = null] = refParts
if (comparing && !baseRef) {
  console.error(`spec-check: no ref to compare from in "${sinceValue}"`)
  process.exit(2)
}

/**
 * Tests are written with a leading `@` (`@spec:feature:AC-1`) so Playwright
 * treats it as a tag and `--grep` works — but its JSON reporter reports tags
 * with the `@` stripped, hence the optional prefix here.
 */
const TAG_RE = /@?spec:([a-z0-9][a-z0-9-]*):(AC-\d+)/g
/**
 * What counts as naming the implementation. Project-specific, because the file
 * types a spec must not name are whatever this repo is written in — so it lives in
 * the config, with the TypeScript-shaped default this repo needs for a repository
 * that copies the gate without adjusting it. `.md` stays legal on purpose: a
 * sibling spec is documentation, and it gets its own existence check further down.
 */
const IMPL_RE = new RegExp(config.implementationPattern
  ?? '(?:\\bsrc/\\S+|\\b[\\w./-]+\\.(?:vue|ts|mjs|js))')
/** `### AC-1 — Title`, em dash or hyphen. */
const AC_HEADING_RE = /^###\s+(AC-\d+)\s*[—–-]\s*(.+?)\s*$/
/** A labelled bullet inside a criterion — `- **Given** …`. */
const SLOT_RE = /^\s*[-*]\s+\*\*([A-Za-z]+)\*\*\s*(.*)$/
/**
 * The bullets that carry the promise itself, as opposed to the ones that explain
 * it (`## Where each kind of sentence goes` in the `feature-spec` skill). Only
 * these are read into the comparison `--since` reports: a reworded `**Because**`
 * or a retargeted `**Pair**` changes what a reader is told about a promise, not
 * the promise, and a report that called those changed promises would cry wolf on
 * every review pass and stop being read.
 */
const PROMISE_SLOTS = new Set(['Given', 'When', 'Then', 'And'])
/**
 * The suites the config declares, plus the two levels that name no suite. Derived
 * rather than listed, so a repository that runs a third suite does not have to
 * edit the gate to say so.
 */
const SUITES = config.suites ?? {}
const VERIFY_LEVELS = new Set([...Object.keys(SUITES), 'manual', 'todo'])
/**
 * Suites that enumerate the same test files, keyed by suite id. Two suites share a
 * `fileset` when they are two *tiers* over one set of tests — the same UI files run
 * with the backend mocked in the pull-request gate and against the real stack
 * nightly. A claim then legitimately arrives from both listings, and only the tier
 * the AC names has to carry one; see the backward pass.
 */
const TIERS = new Map(Object.entries(SUITES).map(([id, suite]) => [
  id,
  new Set(Object.entries(SUITES)
    .filter(([other, s]) => other !== id && suite.fileset && s.fileset === suite.fileset)
    .map(([other]) => other)),
]))
/** `e2e|unit|manual|todo` — for the error messages. */
const LEVELS_SHOWN = [...VERIFY_LEVELS].join('|')
/**
 * A ticket id in this project's tracker (`ticketPattern` in the config, optional).
 * Whether the ticket is still open cannot be known offline — its *shape* can, and
 * that is what catches a `- ticket: TODO` or a `## Tickets` line naming none.
 */
const ticketRe = config.ticketPattern ? new RegExp(config.ticketPattern) : null
/** Markdown link, for checking that its text and its href name the same ticket. */
const MD_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g

/** A literal, made safe to embed in a RegExp source. */
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * One `##` section of a markdown file, and the same file without it — or `null`
 * when there is no such heading.
 *
 * Both halves are wanted at once, which is why this returns them together rather
 * than being called twice: a section that has to be read on its own also has to be
 * kept out of the reading of everything else, and computing the boundary in two
 * places is how the two readings come to disagree about where it is.
 *
 * It ends at the next heading of the same level or higher, so a section's own
 * subsections stay inside it. Every caller passes a `##` heading, where that is the
 * same thing as "the next `##`" — but a helper that opens at any level and closes
 * only at `##` would quietly swallow the rest of the document for a `###` one.
 *
 * `bodyLine` is the 1-based line on which `body` starts, so a caller that reports
 * positions can do so without finding the section a second time by hand. That was
 * the whole of a review finding: `measureForm` had its own idea of where a `## `
 * section ends, purely because this returned text and it needed line numbers.
 *
 * It is derived from the text actually consumed rather than from the heading's line,
 * because the `\s*$` closing the heading pattern is greedy under `m` and eats the
 * newline and any blank lines after it — so `body` does not begin a fixed number of
 * lines below the heading, and an offset assumed to be constant is off by however
 * many blank lines the author left.
 */
const splitSection = (text, heading) => {
  const opens = new RegExp(`^(#+)\\s+${escapeRe(heading)}\\s*$`, 'm').exec(text)
  if (!opens) return null
  const after = text.slice(opens.index + opens[0].length)
  const ends = after.search(new RegExp(`^#{1,${opens[1].length}}\\s`, 'm'))
  return {
    body: ends < 0 ? after : after.slice(0, ends),
    without: text.slice(0, opens.index) + (ends < 0 ? '' : after.slice(ends)),
    bodyLine: text.slice(0, opens.index + opens[0].length).split(/\r?\n/).length,
  }
}

const errors = []
const err = (where, message) => errors.push({ where, message })

/**
 * The first ticket id in a piece of text, or null.
 *
 * An AC id is skipped, because it is this format's own grammar and collides with
 * most trackers' shape — `AC-3` satisfies `[A-Z][A-Z0-9]*-\d+`, so a link labelled
 * `AC-3 of readonly-canvases` pointing at a ticket read as one ticket named while
 * another is linked, and a `- ticket: AC-3` passed as a ticket somebody can pick up.
 * The collision comes from here, so it is answered here rather than in every
 * project's `ticketPattern`. It is unconditional, which is the one place this
 * script constrains the tracker it is pointed at: a team whose key is literally
 * `AC` cannot be checked, because the gate would reject a correct file. That is
 * written into `$comment_ticketPattern` so a repository copying this finds it in
 * the config it is adjusting, rather than here.
 */
const ticketIn = (text) => {
  if (!ticketRe || !text) return null
  for (const [id] of text.matchAll(new RegExp(ticketRe.source, 'g'))) {
    if (!/^AC-\d+$/.test(id)) return id
  }
  return null
}

/**
 * Every ticket a piece of text names, AC ids aside.
 */
const ticketsIn = (text) => new Set(
  !ticketRe || !text
    ? []
    : [...text.matchAll(new RegExp(ticketRe.source, 'g'))].map(m => m[0]).filter(id => !/^AC-\d+$/.test(id)),
)

/**
 * A link whose text names one ticket and whose href points at another sends the
 * reader to the wrong work. Applied to every spec and to the index, which is mostly
 * ticket references now that it also records the surfaces carrying no promise yet
 * — one reading, one place, so teaching it something teaches it once.
 */
const checkTicketLinks = (where, text) => {
  for (const [, label, href] of text.matchAll(MD_LINK_RE)) {
    const named = ticketIn(label)
    const pointed = ticketIn(href)
    if (named && pointed && named !== pointed) {
      err(where, `links \`${named}\` to the URL of \`${pointed}\` — a copy-paste that sends the reader to the wrong ticket`)
    }
  }
}

// ---------------------------------------------------------------- specs -----

/**
 * Parses one spec file into `{ feature, acs: [{ id, title, verify, reason,
 * ticket, slots, line }] }`. Parsing is intentionally shallow: an AC is a
 * `### AC-n` heading, and its metadata are `- key: value` bullets anywhere in its
 * body, so prose stays free-form.
 *
 * `slots` are the labelled bullets that carry the promise — `**Given**`,
 * `**When**`, `**Then**`, `**And**`, in the order written, each joined back into
 * one line. Nothing but the `--since` comparison reads them; the format checks
 * below have never needed to look inside a criterion, and still do not.
 */
function parseSpec(file) {
  return parseSpecText(file, readFileSync(join(root, config.specDir, file), 'utf8'))
}

/**
 * The same parse, given the text rather than a path — because `--since` reads a
 * spec out of a git object and there must be exactly one reading of the format.
 * A second parser written for the report would agree with this one on the day it
 * was written and drift from then on, which is the failure the gate itself exists
 * to prevent, one level up.
 *
 * Pure on purpose: it records no errors. The format checks below run over the
 * working tree only, and a corpus read out of history must not be able to fail
 * them — a ref written before a rule arrived would report violations at lines
 * nobody can go and fix.
 */
function parseSpecText(file, text) {
  const lines = text.split(/\r?\n/)
  // Frontmatter only: a `## Tickets` line reading "updated: …" is prose, and the
  // fields below are the file's own metadata. The block is the text up to the
  // second `---`, which is where every spec's frontmatter ends.
  //
  // Comments come off once, here, because every field below reads to the end of
  // its line: a `feature: runs      # must equal the filename` — the form the
  // skill's own template prints — otherwise reads as a field that is missing, and
  // a gate that rejects a correct file teaches people to distrust it. The `\s`
  // lookbehind is YAML's own rule, a `#` opens a comment only when whitespace
  // precedes it, so a `where: Editor#1` keeps its hash.
  const fm = (/^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '')
    .replace(/(?<=^|\s)#.*$/gm, '')
  const feature = /^feature:\s*(\S+)\s*$/m.exec(fm)?.[1] ?? null
  const updated = /^updated:\s*(\S+)\s*$/m.exec(fm)?.[1] ?? null
  // Read as the whole rest of the line rather than a token: a title is a sentence,
  // and quotes around it are YAML's rather than part of the name.
  const title = /^title:[ \t]*(\S.*?)\s*$/m.exec(fm)?.[1].replace(/^(['"])(.*)\1$/, '$2') ?? null
  // `where:` is a YAML list; what matters is that it names at least one place.
  // The indentation is optional because YAML's is: a sequence may sit at the key's
  // own column, and rejecting that form would be the gate wrong about a correct
  // file — the failure mode this whole parser was fixed for.
  const whereBlock = /^where:\s*\r?\n((?:[ \t]*[-*].*\r?\n?)+)/m.exec(fm)?.[1] ?? ''
  // The block form is what every spec uses and what the skill shows; the inline
  // form is valid YAML too, and reporting it as missing would be the gate being
  // wrong about a file that is right. Reached only when the block form did not
  // match — which is why the comment strip above matters here too: a `where:` whose
  // entries were deleted but whose comment stayed would otherwise be "named" by the
  // comment text, and that is the new-spec case this check exists for.
  const whereInline = /^where:[ \t]*(\S.*?)\s*$/m.exec(fm)?.[1] ?? ''
  const where = (whereBlock ? whereBlock.split(/\r?\n/) : [whereInline])
    .map(l => l.replace(/^[ \t]*[-*]\s*/, '').replace(/^\[|\]$/g, '').trim())
    .filter(Boolean)
  const acs = []
  const sections = []
  // Prose between the `# Title` and the first `##` — the unheadinged intro that
  // says what the feature is about at all.
  let intro = ''
  // The `# Title` itself, kept rather than skipped: the intro's opening subject is
  // checked against it, which is what makes the two agree on what the thing is called.
  let heading1 = ''
  let afterTitle = false
  let current = null
  // The labelled bullet being read, so a wrapped line joins the slot it belongs to
  // rather than being dropped. A `**Then**` that runs to three lines is the norm in
  // this corpus, and a comparison that read only the first would call two different
  // promises identical.
  let open = null

  // Start after the frontmatter's closing `---`. A full-line YAML comment matches
  // `^#\s` just as a heading does, so scanning from line 0 let the frontmatter's
  // own comments open the intro and appended the remaining metadata lines to it —
  // in a parser that strips those comments a few lines above precisely so the gate
  // never rejects a correct document. It could not produce a wrong verdict while
  // nothing read `intro` closely; the opening-subject rule does.
  const fmEnd = lines[0] === '---' ? lines.indexOf('---', 1) : -1

  for (const [i, line] of lines.entries()) {
    if (i <= fmEnd) continue
    if (/^#\s/.test(line)) { afterTitle = true; heading1 = line.replace(/^#\s+/, '').trim(); continue }
    if (/^##\s/.test(line)) { afterTitle = false; sections.push(line.replace(/^##\s+/, '').trim()) }
    else if (afterTitle && line.trim() && !line.startsWith('---')) intro += `${line.trim()} `

    const heading = AC_HEADING_RE.exec(line)
    if (heading) {
      current = { id: heading[1], title: heading[2], verify: null, levels: [], shown: '', reason: null, ticket: null, slots: [], line: i + 1 }
      acs.push(current)
      open = null
      continue
    }
    // A non-AC `##`/`###` heading ends the current AC block (e.g. `## Gaps`).
    if (/^#{1,3}\s/.test(line)) { current = null; open = null; continue }
    if (!current) continue
    // A labelled bullet opens a slot and closes the one before it; a bullet with no
    // label — or one this format does not know — closes without opening, so its text
    // cannot be appended to the promise above it.
    const slot = SLOT_RE.exec(line)
    if (slot) {
      open = PROMISE_SLOTS.has(slot[1]) ? { label: slot[1], text: slot[2].trim() } : null
      if (open) current.slots.push(open)
      continue
    }
    const meta = /^\s*[-*]\s*(verify|reason|ticket):\s*(.+?)\s*$/.exec(line)
    if (meta) { current[meta[1]] = meta[2].replace(/^`|`$/g, '').trim(); open = null }
    // A slot is continued by anything that is not a bullet at column 0, and ended by a
    // blank line. Both halves matter, and both were wrong in a way the report could not
    // admit to: `/^\s*[-*]\s/` also matched an *indented* bullet, so a sub-bullet under
    // a `**Then**` closed the slot and its text never reached the fingerprint — a
    // changed promise read as untouched. And with no blank-line branch, a paragraph
    // written between the promise and its `**Because**` was glued onto the promise, so
    // prose moving read as the promise moving. A confident wrong answer either way,
    // which is the one thing this report may never give.
    else if (open && line.trim() && !/^[-*]\s/.test(line)) { open.text += ` ${line.trim()}`; continue }
    else if (/^[-*]\s/.test(line)) open = null
    else if (open && !line.trim()) open = null
    // `verify:` may name more than one level: an AC proved at the logic seam AND
    // through the UI is proved twice, and before PO-213 it had to pick one — which
    // made the honest second test a claim the gate rejected. Kept as a list, plus the
    // form the messages quote: the raw text carries the backticks every spec writes
    // around a level, and quoting it broke `verify: \`unit\`, \`e2e\`` across the
    // message — legible errors are this script's whole product.
    if (meta && meta[1] === 'verify') {
      current.levels = current.verify.split(',').map(v => v.trim().replace(/^`|`$/g, '')).filter(Boolean)
      current.shown = current.levels.join(', ')
    }
  }
  return { file, feature, title, updated, where, acs, sections, heading: heading1, intro: intro.trim(), text }
}

// Flat on purpose: a feature id equals its filename, and a spec tucked into a
// subdirectory would be invisible here — no format check, no coverage check, no
// error. Say so instead of silently skipping it.
/**
 * Documents that live in the spec directory but are not specs — a glossary, a
 * conventions note. They carry no acceptance criteria and must not be read as a
 * spec that forgot them. `README.md` is excluded separately, because it is the
 * index and has checks of its own.
 */
const companions = config.companions ?? []

const specEntries = readdirSync(join(root, config.specDir), { withFileTypes: true })
for (const entry of specEntries) {
  if (entry.isDirectory()) err(`${config.specDir}/${entry.name}`, 'specs must be flat — a spec in a subdirectory is never checked; move it up and name the file after its feature')
}

const specFiles = specEntries
  .filter(e => e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md' && !companions.includes(e.name))
  .map(e => e.name)
  .sort()

// ------------------------------------------------------------- promises ------

/**
 * `--since`: which promises were added, changed, retired or moved between two
 * refs (PO-307).
 *
 * It sits here, above every check below, because a corpus read out of history is
 * not a corpus anybody can fix. Let it through the format rules and a ref from
 * before a rule existed reports violations at lines that only exist in the past —
 * so this mode reads both corpora with `parseSpecText` and returns, and the
 * `process.exit(0)` at the end of the block is what keeps that promise.
 *
 * **What counts as a change is the promise, not the prose.** A criterion's title,
 * its `**Given**`/`**When**`/`**Then**`/`**And**` and the levels its `verify:`
 * claims — nothing else. The corpus is rewritten wholesale often enough (38 intros
 * in one change, 112 gap entries relabelled in another) that a report counting
 * those would answer "everything changed" to the one question worth asking.
 *
 * **It reports and does not judge**, which is why it always exits 0. Two refs can
 * differ for perfectly good reasons and this cannot tell which; a reader decides.
 *
 * The config is the working tree's, at both refs — `specDir`, `companions`. A
 * comparison across a change that moved the spec directory is therefore wrong, and
 * loudly so (everything added, everything retired) rather than quietly.
 */
if (comparing) {
  // `stderr` is captured rather than inherited, because two of the calls below are
  // questions and not commands: asking a ref for a spec directory it never had is
  // how "every promise was added since then" is discovered, and git says `fatal:`
  // about it into the middle of the report.
  const git = args => execFileSync('git', args, {
    cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  })
  const isSpec = name => name.endsWith('.md') && name !== 'README.md' && !companions.includes(name)
  /**
   * A date, in the two forms somebody actually types. It is deliberately a narrow
   * pattern rather than "whatever git accepts": `git rev-list --before=` reads an
   * expression it cannot parse as *now* and answers `HEAD` without complaining, so a
   * mistyped ref would compare `HEAD` with itself and report that no promise changed
   * — a confident wrong answer, which is the one thing a report must never give.
   * Anything not matching this is a ref, and an unknown ref is an error.
   */
  const DATE_LIKE = /^(?:\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?|yesterday|last (?:week|month|year)|\d+ (?:day|week|month|year)s? ago)$/i

  /**
   * One side of the comparison, as `{ given, sha }` — what was typed, and the commit
   * it names. `null` is the working tree, which is the other side of a one-ref
   * comparison.
   *
   * A date is answered with the last commit on `HEAD` before it, which is what "how
   * did this look a month ago" means on the branch you are standing on.
   */
  const sideOf = (ref) => {
    if (ref === null) return { given: null, sha: null }
    try { return { given: ref, sha: git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim() } }
    catch { /* not a ref — a date, or a typo */ }
    if (!DATE_LIKE.test(ref)) {
      console.error(`spec-check: no such ref — ${ref}`)
      process.exit(2)
    }
    // `\d{4}-\d{2}-\d{2}` is a shape, not a date, and `git rev-list --before=` answers
    // an impossible one with *now* — so `--since 0000-00-00` resolved to HEAD and
    // reported that no promise had changed, which is the failure the pattern above
    // exists to prevent. Reject what no calendar can read at all instead of quoting a
    // commit nobody asked for — and stop there: a date that merely rolls over
    // (2026-02-30) is let through, because JS and git roll it the same way, both to
    // 2 March. Refusing it here would be this script disagreeing with the tool it is
    // asking, and the answer that case already gives is honest.
    if (/^\d{4}-/.test(ref) && Number.isNaN(new Date(`${ref.replace(' ', 'T')}Z`).getTime())) {
      console.error(`spec-check: not a date — ${ref}`)
      process.exit(2)
    }
    const sha = git(['rev-list', '-1', `--before=${ref}`, 'HEAD']).trim()
    if (!sha) {
      // Not an error the caller can fix by rephrasing, so say what there is instead:
      // asking for a month back in a repository three weeks old is a fair question
      // with a factual answer.
      const rootSha = git(['rev-list', '--max-parents=0', 'HEAD']).trim().split('\n').pop()
      const when = git(['log', '-1', '--format=%ad', '--date=short', rootSha]).trim()
      console.error(`spec-check: nothing on HEAD before ${ref} — this history starts ${when} (${rootSha.slice(0, 7)})`)
      process.exit(2)
    }
    return { given: ref, sha }
  }

  const [base, head] = [sideOf(baseRef), sideOf(headRef)]
  /**
   * What to call a side in the report: what was typed, and what it turned out to be.
   * A sha typed by hand is usually abbreviated, so it is compared as a prefix — a
   * `1f3452 (1f3452a)` would be the report explaining a thing to itself.
   */
  const shown = side => side.sha === null
    ? 'the working tree'
    : side.sha.startsWith(side.given) ? side.sha.slice(0, 7) : `${side.given} (${side.sha.slice(0, 7)})`

  /**
   * Every spec at a ref, parsed. A missing spec directory reads as an empty corpus
   * rather than an error: a ref from before the specs existed is a legitimate thing
   * to compare against, and the answer — every promise added — is the true one.
   */
  const corpusAt = (ref) => {
    if (ref === null) return new Map(specFiles.map(f => [f, parseSpecText(f, readFileSync(join(root, config.specDir, f), 'utf8'))]))
    let listing = ''
    try { listing = git(['ls-tree', '--name-only', `${ref}:${config.specDir}`]) } catch { return new Map() }
    return new Map(listing.split('\n').filter(isSpec).sort()
      .map(f => [f, parseSpecText(f, git(['show', `${ref}:${config.specDir}/${f}`]))]))
  }

  const norm = s => s.replace(/\s+/g, ' ').trim()
  /**
   * The promises at a ref, keyed `feature:AC-n` — the same pointer a test's tag
   * carries, so a line of this report can be pasted into a `--grep`.
   *
   * The feature comes from the frontmatter and falls back to the filename, which
   * the gate below holds equal anyway; here the fallback matters because a spec in
   * history may predate the field.
   */
  const promisesAt = (corpus) => {
    const out = new Map()
    for (const spec of corpus.values()) {
      const feature = spec.feature ?? spec.file.replace(/\.md$/, '')
      for (const ac of spec.acs) {
        out.set(`${feature}:${ac.id}`, {
          feature,
          id: ac.id,
          title: norm(ac.title),
          slots: ac.slots.map(s => ({ label: s.label, text: norm(s.text) })),
          levels: [...ac.levels].sort(),
        })
      }
    }
    return out
  }

  /** Everything but where it lives, so a promise carried to another spec can be recognised there. */
  const shape = p => JSON.stringify([p.title, p.slots, p.levels])
  const order = [...PROMISE_SLOTS]
  const byLabel = (slots) => {
    const m = new Map()
    for (const s of slots) m.set(s.label, [...(m.get(s.label) ?? []), s.text])
    return m
  }
  /** Which slots read differently — by label, so the report can say *what* moved. */
  const slotsChanged = (a, b) => {
    const [A, B] = [byLabel(a.slots), byLabel(b.slots)]
    return [...new Set([...A.keys(), ...B.keys()])]
      .filter(l => JSON.stringify(A.get(l) ?? []) !== JSON.stringify(B.get(l) ?? []))
      .sort((x, y) => order.indexOf(x) - order.indexOf(y))
  }
  /**
   * A promise that stopped being proven. The ticket that asked for this report calls
   * it the most important kind of change, so it gets a marker of its own rather than
   * a level pair at the end of a line a reader skims.
   *
   * Proven means a level that names a suite, which is why the test is against the
   * config's own `suites` rather than a list here: a repository that runs a third
   * suite gets it counted without editing this. `manual` and `todo` name none, so
   * `todo → manual` moves between two unproven states and is an ordinary change —
   * asking whether either level was *added* said it stopped being proven when it had
   * never started.
   */
  const proven = levels => levels.some(l => l in SUITES)
  const dropped = (a, b) => proven(a.levels) && !proven(b.levels)

  const [before, after] = [corpusAt(base.sha), corpusAt(head.sha)]
  const [was, now] = [promisesAt(before), promisesAt(after)]

  const added = [...now.keys()].filter(k => !was.has(k))
  const retired = [...was.keys()].filter(k => !now.has(k))
  const changed = [...now.keys()].filter(k => was.has(k) && shape(was.get(k)) !== shape(now.get(k)))

  // A promise carried from one spec to another reads as retired-and-added, and that
  // is the answer to the wrong question: the change under review is a move. Matched
  // on the shape alone, so only an untouched promise is recognised — move it *and*
  // edit it and the report says retired and added, which is the honest reading when
  // nothing can tell which of two edited promises the old one became.
  const moved = []
  for (const gone of [...retired]) {
    const match = added.find(k => shape(now.get(k)) === shape(was.get(gone)))
    if (!match) continue
    moved.push([gone, match])
    retired.splice(retired.indexOf(gone), 1)
    added.splice(added.indexOf(match), 1)
  }

  const files = new Set([...before.keys(), ...after.keys()])
  const filesTouched = [...files].filter(f => before.get(f)?.text !== after.get(f)?.text)
  const drops = changed.filter(k => dropped(was.get(k), now.get(k)))

  // Both sides named as typed *and* as resolved, because a date or a branch name is
  // not a fact — `origin/main` means something different after a fetch, and a report
  // quoted in a release note has to say which commits it read.
  console.log(`spec-check · ${shown(base)} → ${shown(head)} · ${was.size} promises → ${now.size}`)
  console.log('')

  const byKey = (a, b) => a.localeCompare(b, 'en', { numeric: true })
  for (const k of [...added].sort(byKey)) console.log(`  + ${k}  ${now.get(k).title}`)
  for (const [gone, match] of [...moved].sort((x, y) => byKey(x[0], y[0]))) {
    console.log(`  → ${gone} → ${match}  ${now.get(match).title}`)
  }
  for (const k of [...changed].sort(byKey)) {
    const [a, b] = [was.get(k), now.get(k)]
    const parts = [
      ...(a.title === b.title ? [] : ['title']),
      ...slotsChanged(a, b),
      ...(a.levels.join(', ') === b.levels.join(', ') ? [] : [`verify: ${a.levels.join(', ')} → ${b.levels.join(', ')}`]),
    ]
    // Every other difference is named by a label, and the one that is not would
    // otherwise print an empty line under the criterion: `**Then**` and `**When**`
    // swapped reads as unchanged label by label, and the promise is still not what
    // it was.
    if (!parts.length) parts.push('the order its bullets are written in')
    console.log(`  ${dropped(a, b) ? '!' : '~'} ${k}  ${b.title}`)
    console.log(`      ${parts.join(' · ')}`)
  }
  for (const k of [...retired].sort(byKey)) console.log(`  − ${k}  ${was.get(k).title}`)

  const counts = [
    added.length && `${added.length} added`,
    changed.length && `${changed.length} changed${drops.length ? ` (${drops.length} no longer proven)` : ''}`,
    retired.length && `${retired.length} retired`,
    moved.length && `${moved.length} moved`,
  ].filter(Boolean)

  const plural = n => `${n} spec file${n === 1 ? '' : 's'}`
  if (counts.length) {
    console.log(`\n${counts.join(', ')} · ${plural(filesTouched.length)} changed in all.`)
  } else {
    // The sentence a release note wants, and the one nobody can produce by hand.
    console.log(`${plural(filesTouched.length)} changed, no promise touched.`)
  }
  // Anything the corpus read recorded before this mode began — `specs must be flat` is
  // the one that bites — printed in the gate's own rendering, because the report is not
  // a second opinion about how a problem reads. It judges nothing, so the exit code
  // stays 0; but a promise this report could not even see is worth a line, and saying
  // "no promise touched" over a spec it never opened is the silence worth breaking.
  if (errors.length) {
    console.error(`\n${errors.length} problem${errors.length === 1 ? '' : 's'} the report read past:`)
    for (const e of errors) console.error(`  × ${e.where}\n    ${e.message}`)
  }
  process.exit(0)
}

// The index is how anyone finds a spec at all, and an index goes stale in
// silence — so it is checked like everything else here.
const readmePath = join(root, config.specDir, 'README.md')
const readme = existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : null

/**
 * The index, split into the inventory and everything in it that is not an inventory.
 *
 * The inventory answers "where is the spec for this?". The register answers "what has
 * no spec?", and its second column names specs on purpose — as the neighbours a
 * surface is *not* promised by. So a register row is a place in this file where a spec
 * being named is evidence of the opposite of being listed, and reading the whole file
 * as an inventory lets a spec's real row be deleted while a mention of it elsewhere
 * keeps the check quiet.
 *
 * The register is sliced once, here, so the two checks below cannot disagree about
 * where it starts and ends. `indexRegister` names the section because its heading is
 * this project's copy — without the key there is no register and the whole file is the
 * inventory, which is what it was before PO-267.
 *
 * `indexAsides` names the rest: the sections that record how a spec is cut here, the
 * words this corpus settled and what the product calls each surface. Every one of them
 * cites specs by link, so before they were subtracted a bullet in any of them counted
 * as an inventory entry if a link happened to open it. The inventory cannot be
 * identified the other way round — positively, by naming the sections that ARE one —
 * because a corpus of any size groups its inventory under headings of its own and adds
 * to them, so that list would go stale on the next group and take the check with it.
 * What this cannot see is a renamed aside: it falls out of the list and is read as
 * inventory again, which is the old behaviour rather than a new failure. That is why
 * an entry in those sections opens on bold text or a name rather than on a link — the
 * convention holds when the config has drifted.
 */
const register = readme !== null && config.indexRegister
  ? splitSection(readme, config.indexRegister)
  : null
const inventory = (config.indexAsides ?? []).reduce(
  (text, heading) => {
    if (text === null) return null
    const aside = splitSection(text, heading)
    return aside ? aside.without : text
  },
  register ? register.without : readme,
)

// An entry of its own, not a mention: the link has to open its line, after a
// bullet or a table's first pipe — required, not optional. Optional was the same
// false negative one shape along: a wrapped prose line that happens to begin with
// a link counted as an entry, and `node-inspector.md` could lose its inventory row
// and still pass, "listed" by the third line of a bullet in `## How a spec is cut
// here`. Before that it was a substring test, which counted any occurrence
// anywhere in the file, including the nine specs the register names.
const indexEntryRe = file =>
  new RegExp(`^[ \\t]*[-*|][ \\t]*\\[[^\\]]*\\]\\((?:\\./)?${escapeRe(file)}(?:#[\\w.-]+)?\\)`, 'm')
for (const file of specFiles) {
  if (inventory !== null && !indexEntryRe(file).test(inventory)) {
    err(`${config.specDir}/README.md`, `does not list ${file} — every spec belongs in the index as an entry of its own, opening its row or bullet (a mention in prose, or inside another entry, does not count)`)
  }
}
// And the other direction. The index is excluded from `specFiles` below, so it
// also escaped the sibling-link check every other spec gets — which left a
// deleted spec's row in the index as a broken link in the entry point of all
// places, in silence (PO-213). Same resolution as a sibling link: from the
// index's own folder, the way a reader's click resolves it.
if (readme !== null) {
  // The fragment is optional and dropped: an index row may link straight at a
  // promise (`runs.md#ac-3`), and matching only the bare form let exactly the row
  // this check exists for slip through — the anchored one.
  const linked = new Set([...readme.matchAll(/\]\(((?:\.\/)?[\w.-]+\.md)(?:#[\w.-]+)?\)/g)].map(m => m[1]))
  for (const rel of linked) {
    if (rel.replace(/^\.\//, '') === 'README.md') continue
    if (!existsSync(resolve(root, config.specDir, rel))) {
      err(`${config.specDir}/README.md`, `lists \`${rel}\`, which does not exist — a spec was deleted or renamed and its row stayed behind`)
    }
  }
  // Ticket links in the index get the same reading as in a spec. This used to
  // matter little, because the index linked specs and specs linked tickets — but
  // the index now also records the surfaces that carry no promise yet (PO-267),
  // and a row there is mostly a ticket reference: the surface, and who is going
  // to promise it. A row pointing at the wrong ticket sends the next reader to
  // finished work and the gap looks claimed, which is the failure that register
  // exists to prevent. Same rule as everywhere else here — a wrong reference has
  // to be found by the build and not by the reader.
  checkTicketLinks(`${config.specDir}/README.md`, readme)
}

/** feature id -> spec */
const specs = new Map()

for (const file of specFiles) {
  const spec = parseSpec(file)
  const expected = file.replace(/\.md$/, '')
  const where = `${config.specDir}/${file}`

  if (!spec.feature) err(where, 'frontmatter is missing `feature: <id>`')
  else if (spec.feature !== expected) err(where, `frontmatter \`feature: ${spec.feature}\` must match the filename (\`${expected}\`)`)
  if (!spec.acs.length) err(where, 'no acceptance criteria — a spec without an `### AC-n — …` heading promises nothing')

  // `updated:` and `where:` are part of the file shape the format prescribes, and
  // both were unchecked — so `updated:` went stale exactly as silently as
  // everything else this gate exists to catch, and a new spec could omit either
  // without anyone noticing (PO-213).
  if (!spec.updated) err(where, 'frontmatter is missing `updated: YYYY-MM-DD` — the date the promises here were last true')
  else {
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(spec.updated)
    // Round-tripped rather than merely parsed: `new Date('2026-02-30')` is a real
    // date in March, so a typo would otherwise pass as valid.
    const iso = d && new Date(`${spec.updated}T00:00:00Z`)
    if (!d || Number.isNaN(iso?.getTime()) || iso.toISOString().slice(0, 10) !== spec.updated) {
      err(where, `frontmatter \`updated: ${spec.updated}\` is not a date — write it as YYYY-MM-DD`)
    }
    // A day of slack, because CI can run west of whoever wrote the date. Anything
    // beyond that is a typo in the year or the month, and it would make the field
    // read as fresher than the spec is.
    else if (iso.getTime() > Date.now() + 86_400_000) {
      err(where, `frontmatter \`updated: ${spec.updated}\` is in the future — it says when these promises were last true`)
    }
  }
  if (!spec.title) err(where, 'frontmatter is missing `title:` — the name a reader is given, and what the opening sentence has to agree with. The key is case-sensitive')
  if (!spec.where.length) err(where, 'frontmatter is missing `where:` — name the place in the PRODUCT these promises are kept, one entry per surface (never a file path)')
  // The same title in two places, so the two have to agree. A retitle touches both
  // lines in one file and it is easy to move one — and the halves are read by
  // different things: the H1 is what a reader sees and what the opening-subject rule
  // below is measured against, the frontmatter is what the index and any tooling
  // reads. Drift means one of them is quietly wrong, with nothing to say which.
  if (spec.title && spec.heading && spec.title !== spec.heading) {
    err(where, `frontmatter says \`title: ${spec.title}\` and the heading says \`# ${spec.heading}\` — a retitle moves both, and nothing else can tell which of the two is the current one`)
  }

  // A reader who doesn't know the feature has to be able to start here: prose
  // straight after the title, before any section, saying what this is about.
  if (spec.intro.length < 80) err(where, 'no introduction — the text between the `# Title` and the first `##` section must say what the feature is about')
  // An intro opens by naming its subject in bold, the way an encyclopaedia entry
  // does, so a reader who arrived from a link or the index knows within one
  // sentence whether this is the right file. The words come from the title, which
  // is what makes the two agree on what the thing is called — and what makes this
  // checkable at all. The closing bold line is the intro's other anchor and is not
  // checked; see the skill's `## The intro's two bold spans`, in references/spec-anatomy.md.
  else {
    // Any non-space start opens the next sentence, not only a capital: a second
    // sentence beginning on a backtick, a digit or a lowercase identifier would
    // otherwise never be split off, and a bold subject sitting in sentence two
    // would satisfy a rule that is about sentence one.
    const firstSentence = spec.intro.split(/(?<=[.!?])\s+(?=\S)/)[0] ?? spec.intro
    const subject = /\*\*(.+?)\*\*/.exec(firstSentence)
    const flat = t => t.replace(/\s+/g, ' ').trim()

    if (!subject) {
      err(where, `the first sentence names no subject in bold — open on \`${flat(spec.heading).split(/\s+[—–]\s+/)[0]}\` in \`**bold**\`, so a reader knows in one sentence what this is about`)
    }
    else if (!flat(spec.heading).toLowerCase().includes(flat(subject[1]).toLowerCase())) {
      err(where, `opens on \`${flat(subject[1])}\`, which is not in the title \`${flat(spec.heading)}\` — the subject a reader is given first has to be the one the title names`)
    }
  }
  // A spec is read by people who don't care about the code — and a file path in
  // it rots silently on the first rename. Pointers go the other way: the code
  // names its spec. Say *where* in the product instead ("editor → tab History").
  for (const [i, line] of spec.text.split(/\r?\n/).entries()) {
    const path = IMPL_RE.exec(line)
    if (path) err(`${where}:${i + 1}`, `names the implementation (\`${path[0]}\`) — that belongs in docs/; a spec says what the user gets and where in the product`)
  }
  // The `docs:` pointers (and any link into docs/) are the only bridge from a
  // promise to the explanation of how it is built. A renamed doc would leave the
  // spec pointing at nothing, in silence — the same rot the index rule prevents.
  const docTargets = new Set([...spec.text.matchAll(/(?:^|[\s(\]`])((?:\.\.\/)*docs\/[\w./-]+\.md)/gm)]
    .map(m => m[1].replace(/^(\.\.\/)+/, '')))
  for (const rel of docTargets) {
    if (!existsSync(join(root, rel))) err(where, `points at \`${rel}\`, which does not exist — update the link or drop it`)
  }
  // Specs cross-reference each other, and they are allowed to: a sibling spec is
  // documentation, not implementation, which is why the path rule above lets
  // `.md` through on purpose. But an unchecked pointer rots exactly like a stale
  // docs link and has nowhere else to go red — so resolve it the way a reader's
  // click resolves it, from the spec's own folder.
  // Backtick counts as a boundary: a path in a code span was the form that
  // escaped this check when it was written, so it is the one that most needs it.
  const siblingTargets = new Set([...spec.text.matchAll(/(?:^|[\s(\]`])((?:\.\.\/)*(?:[\w.-]+\/)*[\w.-]+\.md)/gm)]
    .map(m => m[1])
    .filter(rel => !rel.replace(/^(\.\.\/)+/, '').startsWith('docs/')))
  for (const rel of siblingTargets) {
    if (!existsSync(resolve(root, config.specDir, rel))) {
      err(where, `points at \`${rel}\`, which does not resolve from ${config.specDir}/ — a sibling spec is linked by its bare filename (\`other-feature.md\`), not by a path from the repo root`)
    }
  }
  // Tickets last, so the history of a promise is always at the same place.
  if (!spec.sections.includes('Tickets')) err(where, 'missing a final `## Tickets` section listing the Linear tickets that shaped this feature')
  else if (spec.sections.at(-1) !== 'Tickets') err(where, `\`## Tickets\` must be the last section (found \`## ${spec.sections.at(-1)}\` after it)`)
  else if (!/^\s*[-*]\s/m.test(spec.text.slice(spec.text.lastIndexOf('## Tickets')))) err(where, '`## Tickets` is empty — list the tickets that contributed to this feature')

  // `## Elsewhere` above `## Gaps`, because the two answer the same reader
  // question — "the page does X, why is X not promised here?" — and the answers
  // rank: what another spec promises is settled, what this one leaves open is not.
  // Checked rather than advised for the reason the gap labels are checked at all:
  // an unchecked rule about where something goes drifts one spec at a time, and the
  // order is the whole reason `Elsewhere` left `## Gaps`.
  if (spec.sections.includes('Elsewhere') && spec.sections.includes('Gaps')
    && spec.sections.indexOf('Elsewhere') > spec.sections.indexOf('Gaps')) {
    err(where, '`## Elsewhere` comes after `## Gaps` — the boundary of a spec is read before its holes, so the section goes above')
  }

  // Docs links, sibling links and the index are all existence-checked; ticket
  // references were the one pointer class in a spec that could rot in silence.
  // Whether a ticket is still open is not knowable here, but a line that names
  // no ticket at all, or a link whose text and href disagree, is — and those are
  // the ones that actually happen.
  if (ticketRe && spec.sections.includes('Tickets')) {
    const body = spec.text.slice(spec.text.lastIndexOf('## Tickets'))
    const lines = body.split(/\r?\n/)
    // Entries only — a bullet's own prose and its sub-points carry no ticket of
    // their own. What makes a bullet an entry is that it sits at the SAME
    // indentation as the section's first one, not that it starts in column 0:
    // CommonMark lets a top-level item carry up to three leading spaces, so a
    // section whose entries are all indented by two would have counted as
    // non-empty above and then had every one of its lines skipped here.
    const entry = /^([ \t]*)[-*]\s/
    const indent = lines.map(l => entry.exec(l)?.[1].length).find(n => n !== undefined)
    if (indent !== undefined) {
      for (const line of lines) {
        if (entry.exec(line)?.[1].length === indent && !ticketIn(line)) {
          err(where, `\`## Tickets\` has an entry naming no ticket — "${line.trim().slice(0, 60)}"`)
        }
      }
    }
    // `## Tickets` is history — what shaped this spec. A `verify: todo` names the
    // future. A ticket in both is the rot that started this rule: AC-11 pointed
    // at the very ticket that wrote it, so the promise would have been left
    // aiming at finished work the moment that ticket closed. Well-formed, and
    // therefore invisible to the shape check above.
    const history = ticketsIn(body)
    for (const ac of spec.acs) {
      const target = ticketIn(ac.ticket)
      if (target && history.has(target)) {
        err(`${where}:${ac.line}`, `${ac.id} waits for ${target}, but ${target} is already listed in \`## Tickets\` as a ticket that shaped this spec — an unverified promise has to name work still to come, not the ticket you are closing`)
      }
    }
  }
  checkTicketLinks(where, spec.text)

  // Criteria stand in numeric order, and a retired one keeps its place in that
  // order rather than being appended at the end. A reader scanning for AC-5 looks
  // between AC-4 and AC-6; finding its retirement note after AC-8 tells them
  // nothing about where the promise used to sit, which is the one thing the note
  // is there to say.
  //
  // A retirement note is an italic line opening on its id, and only that leading
  // id is read. The rest of the line is deliberately ignored: a note says where the
  // promise WENT — "…is now template-card.md AC-1 and AC-2" — and collecting those
  // would feed a sibling spec's numbering into this spec's sequence and report an
  // order violation that is not one. The note's own id is its position; that is all
  // an ordering check needs, and a note retiring two ids at once still anchors on
  // the first. The line start is the anchor because a note often runs over several
  // lines, and a pattern wanting the closing `*` on the same line would match none
  // of them and be silently green.
  const placed = spec.text.split(/\r?\n/).flatMap((line) => {
    const heading = AC_HEADING_RE.exec(line)
    if (heading) return [heading[1]]
    return [/^\*(AC-\d+)\b/.exec(line)?.[1]].filter(Boolean)
  })
  const outOfOrder = placed.findIndex((id, i) => i > 0 && Number(id.slice(3)) < Number(placed[i - 1].slice(3)))
  if (outOfOrder > 0) {
    err(where, `${placed[outOfOrder]} stands after ${placed[outOfOrder - 1]} — criteria keep numeric order, and a retired one keeps its place in it rather than moving to the end`)
  }

  const seen = new Set()
  for (const ac of spec.acs) {
    const at = `${where}:${ac.line}`
    if (seen.has(ac.id)) err(at, `duplicate ${ac.id} — AC ids are permanent, never reuse one`)
    seen.add(ac.id)
    if (!ac.levels.length) err(at, `${ac.id} is missing \`- verify: ${LEVELS_SHOWN}\``)
    for (const level of ac.levels) {
      // With no suites declared, every proving level is "unknown" — and saying that
      // 86 times over says nothing about the one thing that is actually wrong.
      if (!VERIFY_LEVELS.has(level)) {
        const empty = Object.keys(SUITES).length === 0
          ? ' — `suites` in spec.config.json is empty, so no layer can be named yet: declare the layers this repo has'
          : ''
        err(at, `${ac.id} has unknown verify level \`${level}\` (${LEVELS_SHOWN})${empty}`)
      }
    }
    if (new Set(ac.levels).size !== ac.levels.length) err(at, `${ac.id} names a verify level twice (\`${ac.shown}\`)`)
    // `manual` and `todo` are statements about the WHOLE promise — that nobody
    // automates it, or that nobody verifies it yet. Either alongside a second level
    // would be a spec saying both "this is proved" and "this is not".
    const solo = ac.levels.find(level => level === 'manual' || level === 'todo')
    const contradiction = solo && ac.levels.length > 1
    if (contradiction) {
      err(at, `${ac.id} is \`verify: ${ac.shown}\` — \`${solo}\` is a statement about the whole promise and cannot be combined with another level`)
    }
    // Only when the combination itself stands: the `- reason:` a rejected
    // `manual, todo` is also missing belongs to a spec line that has to be rewritten
    // anyway, so reporting it turns one mistake into four things to read.
    if (!contradiction) {
      if (ac.levels.includes('manual') && !ac.reason) err(at, `${ac.id} is \`verify: manual\` and must state \`- reason:\` why automating it is impractical`)
      if (ac.levels.includes('todo') && !ac.ticket) err(at, `${ac.id} is \`verify: todo\` and must name the \`- ticket:\` that closes the gap`)
      else if (ac.ticket && ticketRe && !ticketIn(ac.ticket)) err(at, `${ac.id} names \`- ticket: ${ac.ticket}\`, which is not a ticket id — an unverified promise has to point at something someone can pick up`)
    }
  }

  if (spec.feature && specs.has(spec.feature)) err(where, `feature id \`${spec.feature}\` is already used by ${specs.get(spec.feature).file}`)
  else if (spec.feature) specs.set(spec.feature, spec)
}

// A row in the index's register of unpromised surfaces names the ticket that will
// promise the surface — future work, exactly like a `verify: todo`. When that ticket
// lands, its spec lists it under `## Tickets` as part of its history, and the row it
// came from has to go: otherwise the map says "nobody has promised this" about a
// promise that now exists, and it says it in the entry point of all places. Nothing
// but somebody's memory closed that loop (PO-267), and it is the same rot the
// `verify: todo` rule above catches, so it is caught the same way.
//
// `indexRegister` names the section, because its heading is this project's copy —
// drop the key and the check goes quiet rather than guessing. The section itself
// was sliced out with the inventory above; both readings share that one cut.
if (readme !== null && config.indexRegister && ticketRe) {
  if (!register) {
    err(`${config.specDir}/README.md`, `has no \`## ${config.indexRegister}\` section, which \`indexRegister\` in the config says is where surfaces with no promise are recorded — rename the section back or drop the key`)
  }
  else {
    // Which spec's history each ticket appears in, built once. The rows name a
    // handful of tickets and the specs are read for every one of them, so asking
    // per ticket meant re-reading every `## Tickets` section per row — and it
    // reached them with `lastIndexOf('## Tickets')`, a second way of taking a
    // section's body in the one file that now has `splitSection` for exactly that.
    const historyOf = new Map()
    for (const spec of specs.values()) {
      if (!spec.sections.includes('Tickets')) continue
      for (const ticket of ticketsIn(splitSection(spec.text, 'Tickets')?.body)) {
        if (!historyOf.has(ticket)) historyOf.set(ticket, spec)
      }
    }
    for (const ticket of ticketsIn(register.body)) {
      const promised = historyOf.get(ticket)
      if (promised) {
        err(`${config.specDir}/README.md`, `records a surface as unpromised and names ${ticket}, but ${promised.file} already lists ${ticket} in its \`## Tickets\` — that work landed, so the promise exists and its row in \`## ${config.indexRegister}\` has to go`)
      }
    }
  }
}

// ---------------------------------------------------------------- suites ----

/**
 * Playwright: `suites[].specs[]`, recursive, `tags` per spec.
 *
 * A skipped test still appears in the listing, so it would satisfy a
 * `verify: e2e` promise while proving nothing — one `test.skip` and the gate
 * goes quiet. Its `tests[]` entries carry `expectedStatus: 'skipped'`; note that
 * the spec's own `ok` stays `true`, so that is not the discriminator. Being a
 * static listing, this sees `test.skip(…)` and `test.fixme`, not a runtime
 * `test.skip(condition)`.
 */
function collectPlaywright(stdout) {
  const claims = []
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      const runs = spec.tests ?? []
      const skipped = runs.length > 0 && runs.every(t => t.expectedStatus === 'skipped')
      claims.push({ title: spec.title, file: spec.file, tags: spec.tags ?? [], skipped })
    }
    for (const child of suite.suites ?? []) walk(child)
  }
  for (const suite of JSON.parse(stdout).suites ?? []) walk(suite)
  return claims
}

/**
 * Vitest exports no tags, so the claim has to live in the test title. It needs
 * no counterpart to the skip handling above: its listing omits skipped cases
 * altogether, so they already surface as "no test claims this".
 */
function collectVitest(stdout) {
  return JSON.parse(stdout).map(t => ({ title: t.name, file: t.file, tags: [], skipped: false }))
}

/**
 * The module path of the Go module a suite's listing runs in, so an import path can
 * be reported as the directory a reader can open. Absent or unreadable `go.mod` is
 * not an error: the import path is then printed whole, which is still a pointer.
 */
const goModuleCache = new Map()
function goModulePath(suite = {}) {
  const dir = join(root, suite.nativeCwd ?? '.')
  if (!goModuleCache.has(dir)) {
    const file = join(dir, 'go.mod')
    const module = existsSync(file) ? /^module\s+(\S+)/m.exec(readFileSync(file, 'utf8'))?.[1] : null
    goModuleCache.set(dir, module ?? null)
  }
  return goModuleCache.get(dir)
}

/**
 * Go: the `attr` events of `go test -json`.
 *
 * `t.Attr("spec", "<feature>:AC-n")` (Go 1.25+) is real tag support — the attribute
 * arrives as an event of its own, `{"Action":"attr","Test":…,"Key":"spec","Value":…}`
 * — so a Go test claims the way a Playwright test does rather than through its name.
 * Which is not a preference: `@` and `:` are not legal in a Go identifier, so a test
 * function CANNOT carry the tag in its name. A subtest can, and one that does is read
 * too, because the caller scans every title as well as every tag.
 *
 * The claim is the attribute VALUE, and it is the one place a `spec:` prefix is
 * optional: the key already said `spec`, so writing it twice is noise. `spec:` is
 * prepended before the value goes back to the caller, which is what makes it match
 * the same tag pattern as every other adapter.
 *
 * This adapter reads a RUN, not a listing, and three properties follow:
 *
 *   - `go test -list <re>` is not an option. It prints top-level test function names
 *     and nothing else: no subtests, no attributes. So enumeration costs a test run,
 *     the same trade the bundled node:test reporter makes.
 *   - **A failing claiming test takes the listing down with it** — `go test` exits
 *     non-zero, the gate reports the suite as unlistable, and coverage reads as
 *     UNKNOWN rather than absent. That is the honest reading: a promise whose own
 *     proof is red is not proven.
 *   - **The test cache is safe, and this was measured rather than assumed** (go1.27).
 *     A cached package replays its recorded events, attributes included, and editing
 *     a test invalidates its own package — so a claim can never be replayed out of a
 *     source that no longer carries it. `-count=1` on a suite's command is therefore
 *     about a live stack, never about this adapter.
 *
 * **A skip is visible here**, which no other adapter but `playwright` can say: the
 * terminal action for the test is `skip`, and it arrives after the attribute. So a
 * `verify:` line resting on a skipped Go test is caught by name instead of reading as
 * proven — worth knowing in a repository whose suites skip by design.
 *
 * `Package` stands in for the file, because test2json reports an import path and never
 * a path on disk. It is trimmed against the module path to the repo-relative directory.
 */
function collectGo(stdout, suite = {}) {
  const module = goModulePath(suite)
  const dirOf = (pkg) => {
    if (!pkg) return null
    if (!module) return pkg
    if (pkg === module) return '.'
    return pkg.startsWith(`${module}/`) ? pkg.slice(module.length + 1) : pkg
  }

  const tests = new Map()
  const entry = (ev) => {
    const key = `${ev.Package}\t${ev.Test}`
    if (!tests.has(key)) tests.set(key, { title: ev.Test, file: dirOf(ev.Package), tags: [], skipped: false })
    return tests.get(key)
  }

  for (const line of stdout.split('\n')) {
    if (!line.startsWith('{')) continue
    let ev
    // One unparsable line must not lose the whole listing: `go test -json` wraps a
    // package's own stdout in `output` events, but a plugin or a `-toolexec` writing
    // straight to the stream would otherwise take every claim with it.
    try { ev = JSON.parse(line) } catch { continue }
    // A package-level event carries no `Test` — "no test files", a build failure, the
    // package's own pass. Nothing there claims anything, and `entry()` would file it
    // all under one nameless test.
    if (!ev.Test) continue
    if (ev.Action === 'attr') {
      if (ev.Key !== 'spec' || !ev.Value) continue
      entry(ev).tags.push(ev.Value.includes('spec:') ? ev.Value : `spec:${ev.Value}`)
    }
    else if (ev.Action === 'skip') entry(ev).skipped = true
    // `run` is what registers a test that carries its claim in a subtest name rather
    // than an attribute, so the caller's title scan has something to read.
    else if (ev.Action === 'run') entry(ev)
  }

  return [...tests.values()]
}

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#039': "'" }
const unxml = s => s?.replace(/&(amp|lt|gt|quot|apos|#039);/g, (_, e) => XML_ENTITIES[e])
const xmlAttr = (attrs, name) => unxml(new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1]) ?? null

/**
 * PHPUnit exposes no per-test tag field, but `--list-tests-xml` writes a `<groups>`
 * block mapping every group name to the test ids in it — so a PHP test claims its
 * AC with `#[Group('spec:feature:AC-n')]`. Joined back onto the `<tests>` block
 * here, which is what carries the method name and the file.
 *
 * A skipped case cannot be seen: `--list-tests-xml` is a static listing and
 * PHPUnit's skips are runtime (`markTestSkipped`, an unmet `#[RequiresPhp]`), so
 * there is nothing in the document to read. That is a known blind spot of this
 * adapter rather than an omission — the `skipped: false` below is what the listing
 * actually supports, not an assumption that PHP suites never skip.
 */
function collectPhpunit(stdout, suite = {}) {
  // The path is absolute inside the container (`/app/…`) or on the host in
  // `--native` mode; repo-relative reads better in an error, and both forms point at
  // one file. Only the two prefixes actually in play are stripped — a general "cut
  // the first segment" would turn `/home/me/repo/tests/X.php` into `home/me/…`.
  const strip = (path) => {
    for (const prefix of [`${root}/`, suite.workdir ? `${suite.workdir}/` : null].filter(Boolean)) {
      if (path.startsWith(prefix)) return path.slice(prefix.length)
    }
    return path
  }
  const byId = new Map()
  for (const [, attrs, body] of stdout.matchAll(/<testClass\b([^>]*)>([\s\S]*?)<\/testClass>/g)) {
    const raw = xmlAttr(attrs, 'file')
    const file = raw ? strip(raw) : null
    for (const [, methodAttrs] of body.matchAll(/<testMethod\b([^>]*)\/>/g)) {
      const id = xmlAttr(methodAttrs, 'id')
      if (id) byId.set(id, { title: xmlAttr(methodAttrs, 'name') ?? id, file })
    }
  }

  const tagsById = new Map()
  const groups = /<groups>([\s\S]*?)<\/groups>/.exec(stdout)?.[1] ?? ''
  for (const [, attrs, body] of groups.matchAll(/<group\b([^>]*)>([\s\S]*?)<\/group>/g)) {
    const name = xmlAttr(attrs, 'name')
    for (const [, testAttrs] of body.matchAll(/<test\b([^>]*)\/>/g)) {
      const id = xmlAttr(testAttrs, 'id')
      if (!id || !name) continue
      if (!tagsById.has(id)) tagsById.set(id, [])
      tagsById.get(id).push(name)
    }
  }

  return [...byId].map(([id, test]) => ({ ...test, tags: tagsById.get(id) ?? [], skipped: false }))
}

const adapters = { playwright: collectPlaywright, vitest: collectVitest, phpunit: collectPhpunit, go: collectGo }

/** Trims anything the runner prints before the JSON payload. */
function jsonSlice(stdout) {
  const start = stdout.search(/[[{]/)
  if (start < 0) throw new Error('no JSON in output')
  return stdout.slice(start)
}

/**
 * `--list-tests-xml=php://stdout` prints a banner before the document and a
 * human-readable "Wrote list of tests …" line after it, so the payload has to be cut
 * out rather than parsed whole.
 *
 * What it is cut *at* is deliberately not the root element: PHPUnit has shipped both
 * `<tests>` and `<testSuite>` as the root across versions, and pinning either one
 * makes the adapter fail on the other with "no document in output" — a message that
 * sends the reader to their test suite for a version mismatch. The blocks this
 * adapter reads are `<testClass>` and `<groups>`, so those are what has to be
 * present; the surrounding prose is inert to the regexes that follow.
 */
function xmlSlice(stdout) {
  const start = stdout.search(/<(?:tests\b|testSuite\b|testClass\b)/)
  if (start < 0) throw new Error('no PHPUnit test listing in output — is `--list-tests-xml` supported by this version?')
  return stdout.slice(start)
}

/**
 * `go test -json` is a stream of one object per line, not a document — so there is
 * nothing to cut, only the check that the stream arrived at all. A `go test` whose
 * `-json` was dropped from the command is the case this catches: it exits 0 with
 * human-readable `ok` lines, which would otherwise read as a suite with no tests in
 * it and put "nothing claims this" under every promise.
 */
function jsonlSlice(stdout) {
  if (!/^\{/m.test(stdout)) throw new Error('no `go test -json` events in the output — is `-json` missing from the command?')
  return stdout
}

const slicers = { playwright: jsonSlice, vitest: jsonSlice, phpunit: xmlSlice, go: jsonlSlice }

/** `'` is the only character that cannot appear inside a single-quoted word. */
const shellQuote = s => `'${s.replaceAll("'", `'\\''`)}'`

/**
 * Where a listing runs. On the host by default; a suite that names a `container`
 * runs there instead, which is what a repository whose toolchain lives only in its
 * dev stack needs — no container mounts the docker socket, so nothing inside one
 * can reach a sibling. `--native` forces every suite onto the host, for CI that
 * installs the toolchains directly and has no stack to exec into.
 */
function listingCommand(suite) {
  if (native || !suite.container) return { command: suite.command, cwd: join(root, suite.nativeCwd ?? '.') }
  const workdir = suite.workdir ? `-w ${suite.workdir} ` : ''
  const file = config.compose ? `-f ${config.compose} ` : ''
  return {
    command: `docker compose ${file}exec -T ${workdir}${suite.container} sh -c ${shellQuote(suite.command)}`,
    cwd: root,
  }
}

/** `feature:AC-n` -> [{ suite, title, file }] */
const claimed = new Map()
const suiteFailures = []
/** Suites whose listing failed — their coverage is unknown, not absent. */
const unlistable = new Set()

for (const [suiteId, suite] of Object.entries(SUITES)) {
  if (!adapters[suite.adapter]) {
    suiteFailures.push(`${suiteId}: \`adapter: "${suite.adapter}"\` is not one of ${Object.keys(adapters).join(' / ')} — any runner that can print \`[{ name, file }]\` is declared as \`vitest\``)
    unlistable.add(suiteId)
    continue
  }
  const { command, cwd } = listingCommand(suite)
  let stdout
  try {
    // `execSync` picks the platform's shell (sh / cmd.exe); spelling `sh -c`
    // here would break the gate on a Windows checkout for no gain.
    stdout = execSync(command, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
  }
  catch (e) {
    // A suite that cannot even be listed (syntax error, missing dep, stack down) is
    // a hard stop: treating "no tests found" as "no coverage" would spray misleading
    // coverage errors over every AC.
    const detail = (e.stderr || e.message || '').toString().trim().split('\n').slice(-3).join(' ')
    const where = native || !suite.container ? '' : ` in \`${suite.container}\``
    const hint = native || !suite.container ? '' : ' — start the stack first, or pass `--native` if the toolchain is installed on this host'
    suiteFailures.push(`${suiteId}: \`${suite.command}\` failed${where} — ${detail}${hint}`)
    unlistable.add(suiteId)
    continue
  }

  let claims
  try {
    claims = adapters[suite.adapter](slicers[suite.adapter](stdout), suite)
  }
  catch (e) {
    suiteFailures.push(`${suiteId}: could not read the ${suite.adapter} listing — ${e.message}`)
    unlistable.add(suiteId)
    continue
  }

  for (const claim of claims) {
    // Playwright and Go tests claim via tag, vitest tests via the title. Scan both
    // for either, so a tag typed into a title still counts (and vice versa) — which
    // is also what lets a Go SUBTEST carry one in its name.
    for (const source of [claim.title, ...claim.tags]) {
      for (const [, feature, acId] of source.matchAll(TAG_RE)) {
        const key = `${feature}:${acId}`
        if (!claimed.has(key)) claimed.set(key, [])
        claimed.get(key).push({ suite: suiteId, title: claim.title, file: claim.file, skipped: claim.skipped })
      }
    }
  }
}

// ------------------------------------------------------------- compare ------

// Backward: a claim must resolve to an existing AC, in the matching suite.
for (const [key, claims] of claimed) {
  const [feature, acId] = key.split(':')
  const spec = specs.get(feature)
  for (const claim of claims) {
    const at = `${claim.file} › ${claim.title}`
    if (!spec) {
      err(at, `claims @spec:${key}, but there is no ${config.specDir}/${feature}.md — was the spec renamed or deleted?`)
      continue
    }
    const ac = spec.acs.find(a => a.id === acId)
    if (!ac) {
      err(at, `claims @spec:${key}, but ${spec.file} has no ${acId} — was the AC renumbered or removed?`)
      continue
    }
    // A claim from a *sibling tier* is not a mismatch. Two suites sharing a
    // `fileset` enumerate the same test files, so one UI test legitimately shows up
    // in both listings and forbidding the extra one would forbid the extra proof.
    // What still has to hold is that the tier the AC names carries a claim of its
    // own, which the forward pass below requires.
    const accepted = new Set(ac.levels.flatMap(l => [l, ...(TIERS.get(l) ?? [])]))
    if (!accepted.has(claim.suite)) {
      err(at, `claims @spec:${key} from the ${claim.suite} suite, but ${spec.file} declares \`verify: ${ac.shown}\``)
    }
  }
}

// Forward: an automated AC must be claimed by at least one test.
// Each figure counts the ACs that declare that level, which is what the header
// says — so the figures stop adding up to the AC total as soon as one AC declares
// two levels. That is arithmetic, not a defect: an AC proved twice is counted under
// both proofs on purpose. Do not "fix" the sum by picking one level per AC.
const stats = Object.fromEntries([...VERIFY_LEVELS].map(level => [level, 0]))
for (const spec of specs.values()) {
  for (const ac of spec.acs) {
    for (const level of ac.levels) if (level in stats) stats[level]++
    for (const level of ac.levels) {
      if (!(level in SUITES)) continue
      // The suite never reported its tests, so "nothing claims this" would be a
      // guess. The listing failure is already reported and fails the run.
      if (unlistable.has(level)) continue
      const hits = (claimed.get(`${spec.feature}:${ac.id}`) ?? []).filter(c => c.suite === level)
      // A skipped test is a claim without a proof. Reported apart from "nothing
      // claims this", because the fix is a different one: run it again, or be
      // honest and drop the AC to `todo`.
      const live = hits.filter(c => !c.skipped)
      if (!live.length && hits.length) {
        err(`${config.specDir}/${spec.file}:${ac.line}`, `${ac.id} (${ac.title}) declares \`verify: ${ac.shown}\`, but every ${level} test claiming @spec:${spec.feature}:${ac.id} is skipped — un-skip it, or say \`verify: todo\` with the ticket`)
      }
      else if (!hits.length) {
        // Where the claim did arrive, but from another suite, say so: the fix is a
        // one-word edit to `verify:` or a moved test, not a test written from
        // scratch. This is how a `@real-only` test filtered out of the mocked tier
        // surfaces against an AC that claims the gated one.
        const elsewhere = [...new Set((claimed.get(`${spec.feature}:${ac.id}`) ?? []).map(c => c.suite))]
        const hint = elsewhere.length
          ? ` — it is only claimed from the ${elsewhere.join('/')} suite, so either move the test or change the level`
          : ''
        err(`${config.specDir}/${spec.file}:${ac.line}`, `${ac.id} (${ac.title}) declares \`verify: ${ac.shown}\` but no ${level} test claims @spec:${spec.feature}:${ac.id}${hint}`)
      }
    }
  }
}

// ------------------------------------------------------------ form debt ----

/**
 * Two rules of the written form are checked here (PO-272), one outright and one
 * counted, and which is which follows from what the corpus already does. A third —
 * how long a `**Because**` may run — was tried as a count and dropped; see
 * `measureForm`.
 *
 * `verify:` closing its criterion is enforced, because every criterion in the
 * corpus already writes it there: the check pins a convention instead of asking for a reflow, so
 * there is nothing to migrate and no figure to keep. It was briefly the other way
 * round — `verify:` first, as the one machine-readable field — and moving every
 * criterion in the corpus to buy that bought nothing a reader wanted, so the rule
 * ended up naming where they already were.
 *
 * The gap labels arrived after the specs did, and enforcing them would fail every
 * spec at once and force a single commit rewriting every `## Gaps` section in the
 * corpus — unreviewable, and guaranteed to collide with whatever specs are in
 * flight. Leaving them unchecked was the other option, and the reason not to take
 * it is written in the ticket: an unchecked rule drifts exactly like the
 * frontmatter field the gate had to learn to validate.
 *
 * So that one is a ratchet. The count is pinned in the config and must match
 * exactly: adding a violation fails, and so does removing one without lowering
 * the number. The second half is the point — it keeps the figure equal to
 * reality instead of to whenever somebody last looked, and it makes the debt a
 * line in a file people read rather than a habit nobody measures.
 */
const GAP_LABELS = ['Undecided', 'Known', 'Unreachable']

function measureForm(spec) {
  const lines = spec.text.split(/\r?\n/)
  const out = { verifyNotLast: [], unlabelledGaps: [], badGapHeading: [], gapsIntro: [], elsewhereWithoutLink: [], pairRefs: [] }

  // Per criterion: `verify:` is the last bullet. How long a `**Because**` may run
  // is deliberately NOT measured here — it was, at three lines, and any figure was
  // the wrong shape of rule: a reason is as long as it needs to be and no longer,
  // which means a stated number invites padding to reach it exactly as much as it
  // invites cutting to fit it. A count can ask how many lines there are and never
  // whether a reader understands them, so the guidance lives in the skill's prose
  // where a person applies judgement.
  // Where the criteria section ends: the last criterion stops at the next `##`,
  // not at the end of the file — bounded by `lines.length` its block swallows
  // `## Gaps` and `## Tickets`, and a `**Because**`-shaped line written in a gap
  // entry would be counted against a criterion that does not contain it. No spec
  // does that today, so the totals were right by luck rather than by construction.
  //
  // One value for the whole spec, not one per criterion: criteria are `###`, which
  // `/^##\s/` does not match, so the first `##` after the first of them is the same
  // line whichever criterion asks. Only the last criterion reads it.
  const criteriaFrom = spec.acs[0]?.line ?? 0
  const criteriaEnd = lines.findIndex((l, i) => i >= criteriaFrom && /^##\s/.test(l))
  for (const [n, ac] of spec.acs.entries()) {
    const from = ac.line
    const to = spec.acs[n + 1]
      ? spec.acs[n + 1].line - 1
      : (criteriaEnd === -1 ? lines.length : criteriaEnd)
    const block = lines.slice(from, to)
    // `verify:` closes the block, and `- reason:` / `- ticket:` belong to it, so
    // they are the only bullets allowed to follow — and they follow it, rather than
    // sitting above it. Both halves are checked: enforcing only the first left
    // `- reason:` above its own `verify:` line invisible, which is half a sentence
    // enforced. Reported at the bullet that has to move, not at the `verify:` line.
    //
    // Only bullets at `verify:`'s own indentation are its siblings. A nested one
    // beneath it — a `- reason:` that carries its own sub-list — is part of that
    // bullet, and reading it as a sibling reported a criterion that was written
    // correctly and named moving `verify:` as the fix.
    const bullets = block.map((l, i) => [i, l]).filter(([, l]) => /^\s*[-*]\s/.test(l))
    const indent = ([, l]) => /^(\s*)/.exec(l)[1].length
    const own = ([, l]) => /^\s*[-*]\s*(reason|ticket):/.test(l)
    const verifies = bullets.filter(([, l]) => /^\s*[-*]\s*verify:/.test(l))
    // Derived from `verifies` rather than run as a second search: the two answer
    // the same question, and a change to one predicate would otherwise have to be
    // remembered in the other.
    const at = verifies.length ? bullets.indexOf(verifies[0]) : -1
    // Two `verify:` lines in one criterion: one of them is silently ignored when
    // the levels are read, and reporting it as placement would name moving a line
    // when the fix is to delete one.
    if (verifies.length > 1) {
      out.verifyNotLast.push({ id: ac.id, line: from + verifies[1][0] + 1,
        message: `carries ${verifies.length} \`verify:\` lines — one criterion states its level once, on one line (\`verify: unit, e2e\` for a promise proved twice)` })
    }
    else if (at !== -1) {
      const level = indent(bullets[at])
      const after = bullets.slice(at + 1).find(b => indent(b) <= level && !own(b))
      if (after) {
        out.verifyNotLast.push({ id: ac.id, line: from + after[0] + 1,
          message: `writes \`verify:\` above "${after[1].trim().slice(0, 40)}" — it goes last, under the promise it answers for` })
      }
      for (const [i, l] of bullets.slice(0, at).filter(b => indent(b) === level && own(b))) {
        const key = /reason:/.test(l) ? 'reason' : 'ticket'
        out.verifyNotLast.push({ id: ac.id, line: from + i + 1,
          message: `writes \`${key}:\` above its own \`verify:\` line — it says something about that line and belongs under it` })
      }
    }

    // The `**Pair**` bullet, with its continuation lines, so the criteria it names
    // can be resolved. Collected here because the block is already in hand: a third
    // computation of where a criterion starts and ends is the duplication this file
    // has already paid for twice.
    const pi = block.findIndex(l => /^\s*[-*]\s*\*\*Pair\*\*/.test(l))
    if (pi !== -1) {
      // The bullet ends where the next block does: a blank line, another bullet, or
      // a heading. Requiring the continuation to be indented was the earlier reading
      // and it missed a lazy one — CommonMark lets a wrapped list item continue at
      // column 0, and every id after that first line went unresolved. Every spec in
      // the corpus indents, so this was latent; a check nothing in the corpus can
      // trip is a check that will be wrong the first time someone writes the other
      // form. `span` rather than `n`, which is the enclosing criterion's index.
      let span = 1
      while (pi + span < block.length && block[pi + span].trim()
        && !/^\s*[-*]\s/.test(block[pi + span]) && !/^\s*#{1,6}\s/.test(block[pi + span])) span++
      out.pairRefs.push({ id: ac.id, line: from + pi + 1, text: block.slice(pi, pi + span).join(' ') })
    }
  }

  // Every top-level `## Gaps` entry sits under one of a closed set of labels,
  // because three kinds of entry ask for three different actions and reading one
  // was the only way to tell which.
  //
  // The label is a line of its own, `**Undecided**`, grouping the entries beneath
  // it. Two shapes were tried and dropped first, and both failures are the same
  // one: an inline `- **Undecided** — …` took the position the entry's own bold
  // summary held and pushed the substance into the middle of the sentence, and a
  // `### Undecided` sub-heading drew a harder line between the three kinds than
  // they deserve — they are three notes in one section, not three sections. A bold
  // line groups them and leaves every entry its own bold point.
  //
  // `Elsewhere` was a fourth label here and is now a section of its own above
  // `## Gaps`. It never fitted: an entry naming the spec that DOES promise
  // something is a promise kept, and nesting it under a heading meaning "missing"
  // said the opposite at every read — which a definition in the skill cannot undo,
  // because the reader of a spec never opens the skill. Dropping it from this set
  // is what makes the old shape fail instead of quietly returning.
  // `## Gaps` opens on its first label or its first entry, never on a paragraph.
  // Every such paragraph in the corpus said one of two things — what the section
  // is, or that an entry needs somebody to confirm the intent — and both of those
  // are now carried by the heading and by the `**Undecided**` label. Before the
  // labels existed the prose had to do that work, which is why 22 of 38 specs grew
  // one, in fourteen different phrasings of the same sentence.
  //
  // "Only when it says something the labels cannot" was the other candidate rule and
  // is the reason to reject it: the judgement is what produced the 22. Content that
  // reads as an intro — that an existing AC covers part of the gap, that everything
  // below waits on one ticket — goes in the entry it is about, where it travels with
  // that entry instead of standing above a section that will grow others.
  // An `## Elsewhere` entry names a promise another spec keeps, and the link to that
  // spec is the whole payload: the section's value is that a reader may stop looking
  // there, so an entry pointing at nothing spends exactly that and leaves a gap
  // reading as covered. Checked here rather than left to judgement because the
  // section attracts this failure — 21 of the corpus's 26 entries were written as
  // "belongs to X, and is unpromised there too", which is a gap wearing a heading
  // that means the opposite. The position rule alone could not catch one.
  const elsewhere = splitSection(spec.text, 'Elsewhere')
  if (elsewhere) {
    for (const [i, line] of elsewhere.body.split(/\r?\n/).entries()) {
      if (!/^[-*]\s/.test(line)) continue
      // The entry runs to the next top-level bullet; a link may sit on any of its lines.
      const rest = elsewhere.body.split(/\r?\n/).slice(i)
      const end = rest.findIndex((l, n) => n > 0 && /^[-*]\s/.test(l))
      const entry = (end < 0 ? rest : rest.slice(0, end)).join(' ')
      if (!/\[[^\]]*\]\((?:\.\/)?[\w-]+\.md[^)]*\)/.test(entry)) {
        out.elsewhereWithoutLink.push({ line: elsewhere.bodyLine + i, text: line.slice(2, 60).trim() })
      }
    }
  }

  const gaps = splitSection(spec.text, 'Gaps')
  if (gaps) {
    let under = null
    let seenAny = false
    for (const [i, line] of gaps.body.split(/\r?\n/).entries()) {
      if (!seenAny) {
        if (/^\*\*(.+?)\*\*\s*$/.test(line) || /^[-*]\s/.test(line)) seenAny = true
        // The paragraph's first line only: a three-line intro is one mistake, and
        // reporting each of its lines would name one fix three times.
        else if (line.trim() && !out.gapsIntro.length) out.gapsIntro.push({ line: gaps.bodyLine + i, text: line.trim().slice(0, 60) })
      }
      // A line that is nothing but one bold run is a label and never prose: an
      // entry starts with `- `, and a paragraph that happens to open in bold runs
      // on past the closing `**`.
      const label = line.match(/^\*\*(.+?)\*\*\s*$/)
      if (label) {
        under = GAP_LABELS.includes(label[1]) ? label[1] : null
        // A misspelt label would otherwise be silent: its entries would join the
        // debt count, and the sample beside that count names other files, sending
        // the author to prose they did not write.
        if (!under) out.badGapHeading.push({ heading: label[1], line: gaps.bodyLine + i })
        continue
      }
      if (!/^[-*]\s/.test(line)) continue
      if (!under) out.unlabelledGaps.push(line.slice(2, 60).trim())
    }
  }
  return out
}


const forms = new Map([...specs.values()].map(spec => [spec, measureForm(spec)]))

// ── The shapes a criterion reference takes, and where a retired one went ──────
//
// Declared above both checks that read them, because both do: the `**Pair**`
// resolver below reports through `reportRef`, which reads the retirement lines.
// A `const` left down beside its own loop put every one of these in that
// resolver's temporal dead zone, and the gate crashed rather than reporting —
// on the one input nothing in the corpus writes.

/**
 * Every criterion reference a spec writes, not only the ones in `**Pair**` bullets.
 *
 * A spec that tells its reader "the promise is `other.md` AC-1" while that criterion
 * was retired sends them to a line that no longer exists, and the gate owned the
 * machinery to catch it long before it looked here: two such references sat green in
 * the corpus for a month (PO-282).
 *
 * **The form is strict, and that is the point.** A cross-spec reference is
 * `[other.md](other.md) AC-n` — the ids that follow such a link, including a run of
 * them joined by "and", a comma, or a range ("AC-15 to AC-18", where the endpoints are
 * what gets resolved), belong to that spec; every other id on the line is
 * this spec's own. The looser reading — a link retargets everything after it until the
 * end of the line — is what the `**Pair**` resolver does inside a single bullet, where
 * a note is one sentence about one pair. Applied to prose it misreads a paragraph that
 * links a sibling, closes the sentence and then talks about its own criterion, which
 * is exactly how one of this corpus's paragraphs reads. Requiring the shape is the
 * same move the resolver below already made once when it chose the href over the link
 * text: make it exact rather than nearly right.
 *
 * Two kinds of line are statements *about* a retirement rather than references to it,
 * and both are exempt: the retirement line itself, and everything under `## Tickets`,
 * where the history of a promise is kept on purpose.
 */
const CROSS_REF = /\[[^\]]*\]\((?:\.\/)?([\w-]+)\.md[^)]*\)\s+((?:AC-\d+)(?:(?:\s*(?:,|and|to|through))+\s*AC-\d+)*)/g
const OWN_REF = /\bAC-\d+\b/g
const RETIRED_LINE = /^\*AC-(\d+) retired\b/

/**
 * The two ways of writing a cross-spec reference backwards: `AC-1 of [x.md](x.md)`
 * and `[x.md](x.md)'s AC-1`.
 *
 * They are reported rather than resolved, and that is the whole hole this closes. In
 * either order the id sits outside the strict form above, so it is read as this spec's
 * own — and where this spec *happens* to have a criterion by that number, which for a
 * low id is most of the time since every spec starts at AC-1, a retired sibling's id
 * resolves happily against ours and nothing is said. That is the PO-282 case exactly,
 * one order further round.
 *
 * Nothing in the corpus writes either form today. By the standard `referenceBlocks`
 * sets below, that is the argument for handling them rather than against it: a check
 * nothing can trip is a check that will be wrong the first time somebody writes the
 * other form. The rule stays as strict as it was — these do not become a second
 * accepted syntax, they become an error that names the accepted one.
 */
const REVERSE_REFS = [
  /((?:AC-\d+)(?:(?:\s*(?:,|and))+\s*AC-\d+)*)\s+of\s+\[[^\]]*\]\((?:\.\/)?([\w-]+)\.md[^)]*\)/g,
  /\[[^\]]*\]\((?:\.\/)?([\w-]+)\.md[^)]*\)['\u2019]s\s+((?:AC-\d+)(?:(?:\s*(?:,|and))+\s*AC-\d+)*)/g,
]

/** Where a spec says a criterion went: its retirement line, id → { line, text }. */
function retirements(spec) {
  const lines = spec.text.split(/\r?\n/)
  const out = new Map()
  for (const [i, line] of lines.entries()) {
    const m = line.match(RETIRED_LINE)
    if (!m) continue
    // A retirement note may wrap: it is one italic run, so it ends on the line whose
    // trimmed text closes it. Read whole, because the forwarding address is often on
    // the second line and quoting half of it would name no destination at all.
    let text = line.trim()
    let j = i
    while (!/\*$/.test(text) && j + 1 < lines.length && lines[j + 1].trim()) text += ' ' + lines[++j].trim()
    out.set(`AC-${m[1]}`, { line: i + 1, text: text.replace(/^\*|\*$/g, '').trim() })
  }
  return out
}

/**
 * The retirement lines of every spec, read once and on demand.
 *
 * Lazy because `reportRef` is now called from the `**Pair**` resolver as well, and that
 * loop runs *above* this line. Read once because it re-reads every spec's text; twelve
 * calls into a cold cache would re-split forty files.
 *
 * It is worth knowing what this cost: a module-level initialisation here crashed the
 * gate with a `ReferenceError` the first time a pair note pointed at a missing id —
 * which nothing in the corpus does, so the corpus stayed green and the probe that
 * deliberately wrote such a note is what found it.
 */
function retiredOf(target) {
  // Cached on the function itself rather than in a binding declared here: this is
  // called from the `**Pair**` resolver *above*, where anything declared at this point
  // in the module is still in its temporal dead zone — a `const` and a `let` both
  // crashed the gate with a `ReferenceError`. A function declaration is hoisted whole.
  retiredOf.cache ??= new Map([...specs.values()].map(spec => [spec, retirements(spec)]))
  return retiredOf.cache.get(target)
}

/**
 * A `**Pair**` names the criterion that proves the other half. Nothing checked that
 * the criterion exists, so retiring or renumbering one left every note pointing at it
 * lying silently — and a note whose whole job is "these two hold each other up" is
 * worse than absent when it points at nothing.
 *
 * Naming no criterion at all is fine: a pair note may say that a criterion's own two
 * halves control each other, which names nothing to resolve.
 *
 * An id belongs to the spec named nearest before it, which is how a person reads the
 * bullet: a link switches what the ids after it refer to, and ids before any link are
 * this spec's. Resolving against "either file" instead was tried and is too loose to
 * be worth having — every spec starts at AC-1, so a cross-spec note pointing at a
 * sibling's retired `AC-4` resolved happily against this spec's own `AC-4` and the one
 * rot the check exists for went unreported.
 *
 * The href names the spec, not the link text. Keying on the text meant only one shape
 * of link retargeted anything — `[node-inspector.md](node-inspector.md)`, which the
 * corpus happens to write — while `[the node inspector](node-inspector.md)`, the way
 * one would normally write it, left the scope silently on this spec and resolved a
 * sibling's ids against our own. That is the same silent failure the paragraph above
 * rejects "either file" for, reintroduced by the shape of the syntax rather than by
 * the rule. A link to anything that is not a bare sibling filename — `../docs/x.md` —
 * is deliberately no spec and leaves the scope alone; the sibling-link check holds
 * spec links to that bare form.
 */
const PAIR_REF = /\[[^\]]*\]\((?:\.\/)?([\w-]+)\.md[^)]*\)|\bAC-\d+\b/g
for (const [spec, m] of forms) {
  for (const ref of m.pairRefs) {
    let scope = spec
    for (const token of ref.text.matchAll(PAIR_REF)) {
      // A link retargets the ids that follow it. An unknown target is left to the
      // sibling-link check, which reports it by name rather than as a missing id.
      if (token[1]) { scope = specs.get(token[1]) ?? scope; continue }
      // Through `reportRef` rather than its own message: a pair note is a reference
      // like any other, and a retired criterion has to read the same way wherever it
      // is named — with the retirement line quoted and the forwarding address handed
      // over. Only the preamble differs, which is what the pair adds.
      reportRef(spec, ref.line, scope, token[0], `${ref.id} pairs with `)
    }
  }
}


/**
 * The text in the units a reference can wrap inside: one bullet, one paragraph, one
 * heading, one retirement note.
 *
 * Resolving per physical line was the first shape and it was wrong in both directions,
 * because these specs wrap at about 85 columns: a reference whose link sat on one line
 * and whose id on the next was split in half, so the id read as this spec's own — which
 * is the exact silent miss this check exists to stop, and the index contained one. The
 * other direction is worse to read: the failure then names *this* spec for a reference
 * that is about a sibling. `measureForm` already joins a bullet's wrapped lines the same
 * way; this is that, over the whole file.
 *
 * Each block keeps the lines it was built from, so a finding is still reported at the
 * line it stands on rather than at the block's first.
 */
function referenceBlocks(text, until) {
  const lines = text.split(/\r?\n/)
  const blocks = []
  let current = null
  for (let i = 0; i < Math.min(until, lines.length); i++) {
    const line = lines[i]
    if (!line.trim()) { current = null; continue }
    const opens = /^\s*[-*+]\s/.test(line) || /^#{1,6}\s/.test(line) || RETIRED_LINE.test(line.trim())
    if (!current || opens) {
      current = { text: line, segments: [{ at: 0, line: i + 1 }] }
      blocks.push(current)
      continue
    }
    current.segments.push({ at: current.text.length + 1, line: i + 1 })
    current.text += ' ' + line
  }
  return blocks
}

/** Which line of a joined block an offset into it came from. */
function lineOf(block, at) {
  let line = block.segments[0].line
  for (const seg of block.segments) {
    if (seg.at > at) break
    line = seg.line
  }
  return line
}

for (const spec of specs.values()) {
  const lines = spec.text.split(/\r?\n/)
  const ticketsAt = lines.findIndex(l => /^##\s+Tickets\s*$/.test(l))
  for (const block of referenceBlocks(spec.text, ticketsAt === -1 ? lines.length : ticketsAt)) {
    // A `**Pair**` bullet is already resolved by the check above — under its own,
    // looser rule, which reads a link as retargeting every id after it. Running both
    // over one bullet reported a bad id twice and rejected a pair note the rule beside
    // it accepts.
    if (/^\s*[-*]\s*\*\*Pair\*\*/.test(block.text)) continue
    // A retirement note names a criterion that is *meant* to be gone, so its own
    // leading id is exempt — and nothing else about it is. The address it forwards to
    // is the one string the failure below hands a reader, so a note pointing at a
    // criterion that does not exist is the gate quoting a destination it never checked.
    const retiredHere = RETIRED_LINE.exec(block.text.trim())
    /** Ids already claimed by a link, so they are not read a second time as our own. */
    const claimed = []
    for (const pattern of REVERSE_REFS) {
      for (const hit of block.text.matchAll(pattern)) {
        // The two shapes put the ids and the filename in opposite groups.
        const [ids, file] = /^AC-/.test(hit[1]) ? [hit[1], hit[2]] : [hit[2], hit[1]]
        claimed.push([hit.index + hit[0].indexOf(ids), ids.length])
        const first = ids.match(OWN_REF)[0]
        err(`${config.specDir}/${spec.file}:${lineOf(block, hit.index)}`,
          `writes a reference to ${file}.md the wrong way round — \`${hit[0].trim()}\`. `
          + `Write it \`[${file}.md](${file}.md) ${first}\`: in any other order the id is read as `
          + `this spec's own, so a retired criterion over there resolves against ours and goes unreported`)
      }
    }
    for (const hit of block.text.matchAll(CROSS_REF)) {
      const target = specs.get(hit[1])
      claimed.push([hit.index + hit[0].indexOf(hit[2]), hit[2].length])
      // An unknown target is the sibling-link check's to report, by name.
      if (!target) continue
      for (const id of hit[2].match(OWN_REF) ?? []) reportRef(spec, lineOf(block, hit.index), target, id)
    }
    for (const own of block.text.matchAll(OWN_REF)) {
      if (claimed.some(([at, len]) => own.index >= at && own.index < at + len)) continue
      if (retiredHere && own[0] === `AC-${retiredHere[1]}`) continue
      reportRef(spec, lineOf(block, own.index), spec, own[0])
    }
  }
}

/**
 * The index carries criterion references too, and one of the two defects this check
 * was written for was in it. It is not a spec, so it has no criteria of its own: a
 * bare id there belongs to whatever the sentence is about and is left alone, while a
 * reference written in the cross-spec form is resolved like any other.
 */
if (readme) {
  for (const block of referenceBlocks(readme, Number.POSITIVE_INFINITY)) {
    for (const hit of block.text.matchAll(CROSS_REF)) {
      const target = specs.get(hit[1])
      if (!target) continue
      for (const id of hit[2].match(OWN_REF) ?? []) {
        reportRef({ file: 'README.md' }, lineOf(block, hit.index), target, id)
      }
    }
  }
}

/**
 * Reports one reference that resolves to nothing — and says which of the two it is.
 *
 * A retired criterion and one that never existed ask for different fixes: a pointer
 * that has to move, against a typo or a renumbering left behind. The retirement line
 * already names where the promise went, so the failure can hand that over instead of
 * sending the reader to look for it.
 */
function reportRef(spec, line, target, id, preamble = 'references ') {
  // `spec` may be the index rather than a spec: it only ever supplies the file name
  // and the "is this its own criterion" comparison, which the index never satisfies.
  if (target.acs.some(a => a.id === id)) return
  const gone = retiredOf(target)?.get(id)
  const where = `${config.specDir}/${spec.file}:${line}`
  // One word order for both endings, so two reports of one kind read as one kind.
  const which = target === spec ? `${id} of this spec` : `${id} of ${target.file}`
  if (gone) {
    err(where, `${preamble}${which}, which ${target.file}:${gone.line} retired — it says: "${gone.text}". Point this at the criterion that carries the promise now`)
    return
  }
  // The advice about the form belongs only where the form is a candidate for the
  // mistake. A reference that named its target correctly and simply missed is
  // answered by explaining the syntax it already used.
  const form = target === spec
    ? ` A reference to another spec is written \`[other.md](other.md) ${id}\`; an id written any other way is read as this spec's own`
    : ''
  err(where, `${preamble}${which}, which has no such criterion and never retired one — a typo, or a renumbering that left this behind.${form}`)
}

// Enforced, not counted: there is no debt to record, so a violation is an
// ordinary error at the line that has to move.
for (const [spec, m] of forms) {
  for (const v of m.verifyNotLast) {
    err(`${config.specDir}/${spec.file}:${v.line}`, `${v.id} ${v.message}`)
  }
}

// Neither of these depends on the label scheme, so neither sits behind its key.
// They were both put inside the guard below and that was wrong twice: an
// `## Elsewhere` entry is not a gap label at all, and the opening rule accepts a
// first *entry* just as readily as a first label — so a repository that declines
// labels still opens the section on an entry and still passes. The config and the
// skill both call the opening rule an outright gate; the code now agrees with them.
for (const [spec, m] of forms) {
  for (const e of m.elsewhereWithoutLink) {
    err(`${config.specDir}/${spec.file}:${e.line}`, `\`## Elsewhere\` entry "${e.text}…" links no sibling spec — the section says another spec promises this, and the link is what lets a reader stop looking. If nothing promises it, it is a gap: move it to \`## Gaps\` under a label, pointer and all`)
  }
  for (const p of m.gapsIntro) {
    err(`${config.specDir}/${spec.file}:${p.line}`, `\`## Gaps\` opens on a paragraph ("${p.text}…") — the section opens on its first label or entry. Say it in the entry it is about, or drop it: what the section is and that an entry awaits a decision are carried by the heading and by \`**Undecided**\``)
  }
}

// Both halves of the label rule live or die with `formDebt`. A misspelt label was
// reported above this guard, so a repository that dropped the key — declining the
// label scheme, as the config's comment offers — still had a bold line of its own in
// a `## Gaps` section rejected, by a name it had never heard of. That is the one
// thing this gate is built not to do: fail a correct document. The reserved syntax
// comes with the scheme or not at all.
if (config.formDebt) {
  for (const [spec, m] of forms) {
    for (const h of m.badGapHeading) {
      err(`${config.specDir}/${spec.file}:${h.line}`, `\`## Gaps\` has a label line "${h.heading}", which is not one of ${GAP_LABELS.join(' / ')} — the set is closed, so its entries would go uncounted under a name nobody reads`)
    }
  }
  const found = { unlabelledGaps: 0 }
  const worst = { unlabelledGaps: [] }
  for (const [spec, m] of forms) {
    for (const key of Object.keys(found)) {
      found[key] += m[key].length
      if (m[key].length) worst[key].push(`${spec.file}: ${m[key].slice(0, 3).join(', ')}${m[key].length > 3 ? ', …' : ''}`)
    }
  }
  const RULE = {
    unlabelledGaps: `a \`## Gaps\` entry sits under one of the labels ${GAP_LABELS.join(' / ')}`,
  }
  for (const [key, baseline] of Object.entries(config.formDebt)) {
    if (key.startsWith('$')) continue
    const n = found[key]
    if (n === undefined) { err('spec.config.json', `formDebt names \`${key}\`, which this gate does not measure`); continue }
    if (n > baseline) {
      // Deliberately not "the new one is in …": the count is a total, so which
      // violation was just added is not knowable from here, and a message that
      // pointed confidently at the first file alphabetically would send the
      // author to code they did not touch. The sample is a sample, and says so.
      err('spec.config.json', `${n} criteria or entries break the rule that ${RULE[key]}, and the recorded debt is ${baseline}`
        + ` — ${n - baseline === 1 ? 'one more' : `${n - baseline} more`} than the figure records.`
        + ` New writing follows the form; the corpus migrates when a spec is touched.`
        + ` Currently among them, as a sample rather than the culprit: ${worst[key].slice(0, 3).join(' | ')}`)
    }
    else if (n < baseline) {
      err('spec.config.json', `the recorded debt for "${RULE[key]}" is ${baseline} but only ${n} remain`
        + ` — lower \`formDebt.${key}\` to ${n} in the same change, so the figure keeps meaning what it says.`)
    }
  }
}

// ---------------------------------------------------------------- report ----

const total = [...specs.values()].reduce((n, s) => n + s.acs.length, 0)
console.log(`spec-check · ${specs.size} feature spec${specs.size === 1 ? '' : 's'}, ${total} AC${total === 1 ? '' : 's'} `
  + `(${Object.entries(stats).map(([level, n]) => `${n} ${level}`).join(', ')})`)

if (stats.manual || stats.todo) {
  for (const spec of specs.values()) {
    for (const ac of spec.acs) {
      if (ac.levels.includes('manual')) console.log(`  ~ ${spec.feature}:${ac.id} manual — ${ac.reason}`)
      if (ac.levels.includes('todo')) console.log(`  ! ${spec.feature}:${ac.id} unverified — ${ac.ticket}`)
    }
  }
}

if (suiteFailures.length) {
  console.error('\nCould not list a test suite — fix that first, coverage is unknown until then:')
  for (const failure of suiteFailures) console.error(`  × ${failure}`)
}

if (errors.length) {
  console.error(`\n${errors.length} problem${errors.length === 1 ? '' : 's'}:`)
  for (const e of errors) console.error(`  × ${e.where}\n    ${e.message}`)
  console.error('\nSpec and tests have drifted. Update the spec AND the tests in the same change — see the `feature-spec` skill.')
}

process.exit(errors.length || suiteFailures.length ? 1 : 0)
