#!/usr/bin/env node
/* NOTICE: vendored by the revenexx skills catalog from
 * revenexx/studio-integrations@1cb899e, scripts/spec-check.mjs.
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
 *   7. One reading of "nested", and it is the criterion body's own left edge rather
 *      than column 0 (`bodyEdge`, PO-322). Upstream at this pin has three readings
 *      and they disagree: `strayBody` calls every line of a body written at an indent
 *      nested and reports nothing at all, while `parseSpecText` drops a labelled
 *      sub-bullet's text from the fingerprint but appends a plain one's. Also here:
 *      `RETIRED_LINE` is one constant instead of two that differed on an indent, a
 *      `~~~` fence is a fence, and a bold run that is a phrase and a numbered item
 *      each report as themselves instead of as an unlabelled bullet and a paragraph.
 *      The three meta bullets split here rather than sharing one gate: `verify:` is
 *      read at the body's edge alone, because one nested under a promise states no
 *      level, while `reason:` and `ticket:` are read wherever they stand, because
 *      they are about the `verify:` line and the format tells their author they
 *      belong under it. Upstream reads all three at any indent.
 *      `RETIRED_LINE` covers the two readings that ask what a notice IS — where a
 *      criterion body ends, and what `retirements()` collects. The numeric-order
 *      check reads a leading id at column 0 and nothing else, on purpose, and is
 *      neither of them; the note at that site says so.
 *   8. A blank line does not end a promise slot; what follows it does, at the
 *      criterion's edge or below it. Upstream ends the slot at the gap, so a bullet's
 *      own indented second paragraph — which the vocabulary rule allows and the gate
 *      accepts — is in the promise's bullet and outside its fingerprint. Here it is
 *      inside the fingerprint and outside the sentence the word count measures, on
 *      the same reading that keeps a nested bullet out of it: the promise ended at
 *      the blank line, and what follows is that bullet's detail.
 *   9. One reading of a fenced block and of an HTML comment, `readBody`, which every
 *      rule inside a criterion body now goes through. Upstream — and this file until
 *      the second review round — gave fence state to the vocabulary rule alone, so a
 *      fenced `- verify:` was counted as a second level the criterion declared and a
 *      fenced `- **Then**` put a code sample into the promise's fingerprint; and no
 *      rule anywhere exempted a comment, which the words sweep exempts by name. Also
 *      here: a numbered item ends the bullet above it rather than wrapping it, a
 *      nested bullet's WRAP lines are outside the promise sentence as the bullet
 *      itself already was, and a criterion whose promise bullets do not stand at its
 *      body's edge is reported rather than read as a criterion with no promise.
 *  10. The capability register, which has no upstream (RAD-329): with `register` in
 *      the config, the frontmatter fields `since`, `visibility`, `summary` and
 *      `formerly` are checked, `--emit` writes the corpus to `features.json`, and
 *      `--base <ref>` compares that file against the base — a changed register needs
 *      a raised version, a new spec dates itself to it, and a vanished one is named
 *      by `formerly:` or the index's `## Retired features`. Without the key the gate
 *      reaches the same verdicts as before, with two exceptions: `where:` became one
 *      `listField` reader shared with `docs:` and `formerly:`, and a bracketed flow
 *      list now splits on its commas, so an empty one (`where: [ , ]`) now fails; and
 *      an empty `feature:` or `updated:` no longer reads the next line's bare token
 *      (`where:`) as its value, so it reports as missing.
 *  11. Fixes to the register from the customers pilot review (RAD-359). A
 *      `## Retired features` entry counts only as a row — a list item opening on the
 *      id in code, then a dash and a reason — and a row with no reason, a row for a
 *      spec that still exists, and a second row for one id fail on every run. A
 *      `features.json` that differs only in `version` says so in its stale error.
 *      `docs:` no longer reaches `features.json`. A base without `features.json`
 *      still asks for a raised version, because the platform never reads an approved
 *      version again. `--backfill-since` writes `since:` and `register.floor` from git
 *      history and lists what history does not settle.
 *  12. Fixes from the review of customers#67 (RAD-362). `--backfill-since` refuses a
 *      shallow clone, lists a spec whose parent commit it cannot read rather than
 *      taking it as raised, counts a version only where a commit raised it over every
 *      parent (a merge carries the version its other side released), reads only the
 *      commits that change the manifest, holds `register.floor` back while a spec is
 *      open unless it goes down, and writes it inside `register` only. A later release
 *      commit with an unreadable parent lists the spec rather than being skipped. A
 *      `## Retired features` row is a list item outside a fenced block and not nested
 *      in another row; a fence closes on its bare marker, and one never closed fails.
 *      A `#` line inside a fenced block neither opens nor ends a `##` section, and a
 *      tab-indented `#` line is code, not a heading. Only a spec history cannot date
 *      holds the floor back, and the floor written is `register`'s own top-level key.
 *      Its dating rule — a version counted where a commit raised it over every parent,
 *      later release commits read off the add commit's descendants — is replaced by 13.
 *  13. Fixes from the register rollout reviews (RAD-366). `--backfill-since` dates a
 *      spec along the deployed line, `origin/main`'s first parents (HEAD's without
 *      one): the first release on it that contains the spec. This replaces item 12's
 *      reading by the add commit and the commits raised over every parent, which dated
 *      a spec by a version only its branch had. `register.pinned` holds a `since:` set
 *      by hand: the backfill writes it, and the gate fails a spec that differs. A
 *      `since:` is compared past a trailing comment. A block-list entry keeps a
 *      trailing `]`. A line that opens on `<!--`, or starts inside a comment that
 *      opened a line, is an HTML block and never a bullet; a comment opened mid-line
 *      leaves the words after its `-->` in the promise. An internal spec's `summary:`
 *      fails. `--base` and `--since` take a following flag as a missing value, and a
 *      base that is HEAD itself prints that the bump rule compared only uncommitted
 *      changes. Only the line's commits that change the manifest are read as release
 *      candidates. A spec's renames are followed by name, in topological order, so
 *      neither a copy git 2.56 walks into nor its source's add counts as the spec's
 *      birth. A spec HEAD holds whose history shows no add (brought in by a merge), and
 *      any git failure while dating, lists the spec as undated rather than as not
 *      shipped; a pin with no x.y.z `since` lists its spec, and a `register.pinned`
 *      that is no object stops the run. The JSON readers share one scan, and a key
 *      written twice is read at its last occurrence. Released as 1.6.0: a repo green on
 *      1.5.0 can fail on an internal spec's `summary:`, on a pin, on a fence never
 *      closed, or lose a criterion line that opens on `<!--`.
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
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
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
/**
 * A flag's value, as `--flag=<v>` or as the argument after it, and the indexes it takes.
 * An argument after it that is itself a flag is a missing value, never the value: read
 * as one, `--base --emit` switched emit off in silence and failed on "no such commit".
 * `undefined` is missing, `null` is a flag not given.
 */
const flagValue = name => {
  const at = argv.findIndex(a => a === name || a.startsWith(`${name}=`))
  if (at < 0) return { at, value: null, takes: [] }
  if (argv[at].startsWith(`${name}=`)) return { at, value: argv[at].slice(name.length + 1), takes: [at] }
  const next = argv[at + 1]
  return next === undefined || next.startsWith('-') ? { at, value: undefined, takes: [at] } : { at, value: next, takes: [at, at + 1] }
}
const { at: sinceAt, value: sinceValue, takes: sinceTakes } = flagValue('--since')
// Whatever the flag did not consume is an argument this script does not know, and a
// script that ignores one answers a question it was not asked.
const consumed = new Set(sinceTakes)
/**
 * `--native` runs every suite's listing on this host instead of in the container it
 * declares. It exists for CI, which installs the toolchains directly and has no
 * stack to exec into; a suite that declares no `container` is unaffected either way.
 */
const nativeAt = argv.findIndex(a => a === '--native')
if (nativeAt >= 0) consumed.add(nativeAt)
const native = nativeAt >= 0
/**
 * `--emit` writes the register file (`register.file` in the config) from the corpus
 * and stops short of the suites: what the register says is the specs' business, and a
 * file that could only be written while every test runs would be written less often
 * than the specs change. The format checks still run, and a corpus that fails them
 * writes nothing — the register never carries what the gate would refuse.
 */
const emitAt = argv.findIndex(a => a === '--emit')
if (emitAt >= 0) consumed.add(emitAt)
const emitting = emitAt >= 0
/**
 * `--backfill-since` writes `since:` into every spec and `register.floor` into the
 * config, from git history (RAD-359). It is for the change that switches the register
 * on in a repository whose specs already shipped, so that nobody types thirty dates
 * from memory. It reads history and writes; it checks nothing else.
 */
const backfillAt = argv.findIndex(a => a === '--backfill-since')
if (backfillAt >= 0) consumed.add(backfillAt)
const backfilling = backfillAt >= 0
/**
 * `--base <ref>` names what the register is compared against: the pull request's base
 * in CI, the commit before a push. Without it the gate asks for `origin/main`, and
 * without that it says the comparison did not run rather than calling it passed. A
 * base that is given and cannot be found fails the run.
 */
const { at: baseAt, value: baseArg, takes: baseTakes } = flagValue('--base')
for (const i of baseTakes) consumed.add(i)
const unknown = argv.filter((_, i) => !consumed.has(i))
if (unknown.length) {
  console.error(`spec-check: unknown argument${unknown.length === 1 ? '' : 's'} — ${unknown.join(', ')}`)
  console.error('spec-check: the flags are `--since <ref>` / `--since=<ref>` / `--since <a>..<b>`, `--native`, `--emit`, `--backfill-since` and `--base <ref>`')
  process.exit(2)
}
// An empty `--base` is what CI hands over when the event has no base at all — a
// manual run, a branch's first push — so it reads as "none given" rather than as a
// typo. The all-zero sha is git's own way of saying the same thing on a new branch.
if (baseAt >= 0 && baseArg === undefined) {
  console.error('spec-check: --base needs a ref — `--base origin/main` or a commit sha')
  process.exit(2)
}
const givenBase = baseArg && !/^0+$/.test(baseArg) ? baseArg : null
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
 * Every label a criterion body may carry — the promise slots above plus the two
 * that explain it (`## Where each kind of sentence goes` in the `feature-spec`
 * skill). Listed here rather than only in the skill because the gate is what
 * holds it: before PO-322 the parser read the four promise slots, silently
 * ignored everything else, and nothing anywhere refused a criterion written some
 * other way — so a promise the report could not read fully simply failed to
 * appear in it, and the report's completeness was a property of the corpus as it
 * happened to stand rather than a guarantee.
 *
 * Narrower than the skill's table would be a real disagreement, not a stricter
 * gate: the skill teaches the form, and a label it offers that this refuses fails
 * a correct document. Add to both or neither.
 */
const BODY_SLOTS = new Set([...PROMISE_SLOTS, 'Because', 'Pair'])
/**
 * The meta bullets that close a criterion — `- verify:`, and the two that say
 * something about it. Their placement is `measureForm`'s `verifyNotLast`; that
 * they are the only non-labelled bullets allowed at all is the rule below.
 */
const META_BULLET_RE = /^\s*[-*]\s*(?:verify|reason|ticket):/
/**
 * `verify:` alone, which is the one bullet in a criterion that cannot wrap: its
 * value is a list of levels and `parseSpecText` reads it off a single line.
 * `reason:` and `ticket:` are prose and do wrap — `accessibility.md` AC-3 and
 * `credential-oauth.md` AC-4 and AC-5 each run a `reason:` over three lines — so
 * they continue like any other bullet.
 */
const VERIFY_BULLET_RE = /^\s*[-*]\s*verify:/
/**
 * A retirement notice — `*AC-5 retired before it ever held — …*`, often running to
 * several lines. It sits between two criteria and therefore inside the block of
 * the one above, which is an artefact of where a block ends rather than something
 * anybody wrote into that criterion.
 *
 * So it is also where a criterion body ENDS, which is the thing PO-322 had to state
 * before any rule could refuse content inside one. Ending there rather than
 * skipping the line is what makes it right for a notice of any length: the first
 * reading matched only the opening line and reported the three corpus notices that
 * wrap — a rule failing correct documents on its first run.
 *
 * One constant, hoisted here from `retirements()` below, because two readings of
 * "a retirement notice" is two answers to one question: the second one accepted an
 * indent and a double space and the first did not, so an indented notice ended a
 * criterion body while being a retirement nowhere else. The callers that already
 * trimmed the line before testing it were the ones saying which reading was meant.
 */
const RETIRED_LINE = /^\s*\*AC-(\d+)\s+retired\b/
/** A list bullet, at whatever indentation. */
const BULLET_RE = /^\s*[-*]\s/
/**
 * A fenced block's delimiter. Both markers, because CommonMark has both and reading
 * only backticks left a `~~~` block's contents to be read as bullets and prose — one
 * fenced sample reported as three faults.
 */
const FENCE_RE = /^\s*(?:```|~~~)/
/**
 * A bullet whose bold run is a phrase — `- **Given a cost centre** with a budget`.
 * Not a slot: `SLOT_RE` reads `[A-Za-z]+`, so a label is one word. Recognised only
 * to be reported, and reported as itself, because "carries an unlabelled bullet"
 * told the author to add the thing they were looking at.
 */
const BOLD_OPENING_RE = /^\s*[-*]\s+\*\*([^*]+)\*\*/
/** An ordered-list item — refused like any other unlabelled line, but named. */
const ORDERED_RE = /^\s*\d+[.)]\s/
/** How far a line is indented. */
const column = l => /^(\s*)/.exec(l)[1].length
/**
 * The left edge of a criterion body: the shallowest bullet it carries. Everything
 * deeper is inside the bullet above it, and that is the ONLY reading of "nested"
 * this file has — one helper, because it had three and they disagreed. Read at the
 * edge rather than at column 0 because a body written wholly at an indent is a
 * correct document: CommonMark takes a list indented by up to three spaces under a
 * `###` heading as a list, and against column 0 every line of such a body read as
 * nested, which silently switched the vocabulary rule off.
 *
 * Fences and the retirement notice are handled here for the same reason they are
 * handled by the caller: a `- foo` line inside a fenced block is not a bullet, and
 * one below the notice is not this criterion's, so counting either would pull the
 * edge back to a margin the body does not use. A body with no bullet at all has no
 * edge to read and falls back to the margin.
 *
 * `block` excludes the `### AC-n` heading itself.
 */
function bodyEdge(block) {
  let fence = false
  let commented = false
  let edge = Infinity
  for (const l of block) {
    if (RETIRED_LINE.test(l)) break
    if (!commented && FENCE_RE.test(l)) { fence = !fence; continue }
    if (fence) continue
    // A comment never sets the edge every real bullet is measured from. CommonMark reads
    // a line that opens on `<!--`, or that starts inside an open comment, as an HTML
    // block and not as a list item, whatever follows the comment on that line — so a
    // bullet commented out at column 0, or `<!-- was: --> - old`, is no bullet here.
    const inside = commented
    let text = l.replace(/<!--[\s\S]*?-->/g, ' ')
    if (commented) {
      const closes = text.indexOf('-->')
      if (closes < 0) continue
      text = text.slice(closes + 3)
      commented = false
    }
    if (text.includes('<!--')) commented = true
    if (inside || /^[ \t]*<!--/.test(l) || !BULLET_RE.test(l)) continue
    edge = Math.min(edge, column(l))
  }
  return edge === Infinity ? 0 : edge
}
/**
 * One criterion body, read once, so that every rule below reads the same body.
 *
 * `bodyEdge` above settled where the body's left edge is. This settles the other two
 * questions each rule was answering for itself and answering differently: whether a
 * line is inside a fenced block, and whether it is inside an HTML comment.
 * `parseSpecText` carried no fence state at all, so a fenced `- **Then**` opened a
 * slot and its text entered the fingerprint — editing a code sample then reported as
 * a changed promise — while a fenced `- verify:` was counted as a second level the
 * criterion declared and named deleting the real one as the fix. That is the same
 * fault as the three readings of "nested" PO-322 folded into one, one question along.
 * A comment was read as loose prose by the vocabulary rule alone, while the words
 * sweep exempts one by name and the annotated spec is largely built out of them.
 *
 * Every line is returned, in order, because a caller that must not read a line as
 * structure still has to fold it into the fingerprint — a fenced block under a
 * promise bullet is that bullet's content, and changing it changes the promise:
 *
 *   `fence` / `fenced`  a delimiter, and the content between two of them
 *   `comment`           a line that carries nothing but an HTML comment
 *   `blank`
 *   `line`              everything else — structure, and `own` says whether it sits
 *                       at the body's edge or inside the bullet above it
 *
 * `text` is the line with its indentation and any comment taken off, which is what a
 * caller matches on; `raw` is what was written, for a message that quotes it and for
 * the column `own` is read from.
 *
 * The body ENDS at a retirement notice, so the lines from there on are absent rather
 * than returned: the notice sits in the gap between two criteria and belongs to the
 * format rather than to the criterion whose block happens to reach it.
 */
function readBody(block) {
  const edge = bodyEdge(block)
  const lines = []
  let fence = false
  let commented = false
  // Whether the open comment began a line (an HTML block, which owns its closing line)
  // or began mid-line (inline HTML, after whose `-->` the paragraph goes on).
  let commentBlock = false
  // Where the block was opened, carried to its closing delimiter and to every line
  // between: a fenced block belongs to the bullet above it or to the criterion, and
  // that is decided by the fence's own column and not by the columns inside it —
  // where a sample is free to write anything, margin included.
  let fenceOwn = false
  for (const [i, raw] of block.entries()) {
    if (RETIRED_LINE.test(raw)) break
    if (!commented && FENCE_RE.test(raw)) {
      if (!fence) fenceOwn = column(raw) <= edge
      fence = !fence
      lines.push({ i, raw, text: raw.trim(), kind: 'fence', own: fenceOwn })
      continue
    }
    if (fence) { lines.push({ i, raw, text: raw.trim(), kind: 'fenced', own: fenceOwn }); continue }
    // The reading the words sweep already gives a comment, for its reason: a comment
    // is not the document's own text. A closed pair comes off wherever it sits, so a
    // bullet carrying a note at its end stays the bullet it is, and an unclosed `<!--`
    // takes the lines after it until one closes.
    // A line that opens on `<!--`, or starts inside a comment that opened a line, is an
    // HTML block in CommonMark: the whole line is the comment's, whatever follows its
    // `-->`. A comment opened mid-line is inline HTML: the text after its `-->` is still
    // the paragraph's, and stays in the promise.
    const htmlBlock = (commented && commentBlock) || /^[ \t]*<!--/.test(raw)
    let text = raw.replace(/<!--[\s\S]*?-->/g, ' ')
    if (commented) {
      const closes = text.indexOf('-->')
      if (closes < 0) { lines.push({ i, raw, text: '', kind: 'comment' }); continue }
      text = text.slice(closes + 3)
      commented = false
    }
    const opens = text.indexOf('<!--')
    if (opens >= 0) { text = text.slice(0, opens); commented = true; commentBlock = htmlBlock }
    if (htmlBlock) { lines.push({ i, raw, text: '', kind: 'comment' }); continue }
    if (!text.trim()) { lines.push({ i, raw, text: '', kind: raw.trim() ? 'comment' : 'blank' }); continue }
    lines.push({ i, raw, text: text.trim(), kind: 'line', own: column(raw) <= edge })
  }
  return { edge, lines }
}
/**
 * A list item of any kind. CommonMark starts a NEW list at `1.`, so a numbered line
 * under a bullet is not that bullet's wrap — reading it as one folded it into the
 * promise sentence, where it was counted against the word ratchet at a criterion the
 * vocabulary rule had said nothing about.
 */
const item = l => BULLET_RE.test(l) || ORDERED_RE.test(l)
/**
 * The promise slots that state an *outcome*, as opposed to the ones that set the
 * scene. Only these are asked whether they carry more than one promise: a
 * `**Given**` legitimately sets two things up at once — one request approved and
 * another declined — while a `**Then**` stating two outcomes has a second promise
 * inside it, and this format already owns the slot that holds one.
 */
const OUTCOME_SLOTS = new Set(['Then', 'And'])
/**
 * Where a promise sentence stops being one sentence. 25 words is ASD-STE100's cap
 * for a descriptive sentence (its procedural cap is 20, and a promise is neither an
 * instruction nor prose). The figure is not adjustable, on purpose: a repository
 * that may set its own cap has a cap nobody has to meet, and this one is counted
 * rather than enforced anyway.
 */
const PROMISE_WORDS = 25
/**
 * Whether a promise joins two clauses into one. Deliberately narrow — a semicolon,
 * or a comma before "and", both of which join sentences rather than list nouns. A
 * parser would catch more; it would also have to be right about "the budget and the
 * buyer's limit", which is one noun phrase and one promise. What this misses stays
 * missed, and nothing correct is ever reported.
 *
 * Inline code is blanked first, because a semicolon inside `a; b` is a payload's
 * punctuation and not the sentence's — the same exemption, for the same reason, that
 * the words sweep gives a code span.
 *
 * What it still reports and should not is an Oxford list of nouns — "the amount, the
 * date, and the state" is one promise however many things it names. That was measured
 * rather than argued, against a 9-spec corpus: the only discriminator available at
 * this altitude is whether a comma stands earlier in the sentence, and applying it
 * dropped 20 of 59 findings, of which roughly four were noun lists and the rest were
 * genuine — "the request is declined, keeps the reason it was declined with, and no
 * order is placed" carries an earlier comma and is three clauses. Telling those two
 * apart needs a finite verb, which needs a parser, which is the line this rule does
 * not cross.
 *
 * So it stays as it is, and the asymmetry of the costs is the argument: this is a
 * ratchet, where a false positive costs one promise split into the `**And**` the
 * format wanted anyway, and a false negative costs the rule. A noun list reported is
 * a nuisance; a compound missed is the thing the rule exists for.
 */
const isCompound = (text) => /;|,\s+and\s+/.test(text.replace(/`[^`]*`/g, ' '))
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
 * The capability register (`register` in the config), or `null` where nothing reads
 * this corpus as one. Opt-in by whether a register consumes the repository, not by
 * what kind of repository it is: an app's specs feed the register, a library's do not
 * yet, and asking the second for a `since:` would be a rule with no reader.
 *
 * With it on, every spec states `since:` and `visibility:`, a public one a `summary:`,
 * and the corpus is written to `file` as the register reads it. `manifest` is where the
 * version and the name are read from, `floor` the first version that had specs at all.
 */
const REGISTER = config.register ? {
  manifest: 'manifest.json',
  file: 'features.json',
  retiredSection: 'Retired features',
  ...config.register,
} : null
/**
 * `register.pinned`: a `since:` set by hand where history gives the wrong answer — a
 * version on the main line that never went live, a spec file older than its promise.
 * `{ "<feature>": { "since": "x.y.z", "reason": "…" } }`. The backfill writes the pin
 * instead of history, and the gate holds the spec to it, so a later run cannot quietly
 * put the script's value back.
 */
const PINNED = REGISTER?.pinned && typeof REGISTER.pinned === 'object' && !Array.isArray(REGISTER.pinned) ? REGISTER.pinned : {}
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
/** Semver order for the plain `x.y.z` the register takes: negative, zero or positive. */
const semverCmp = (a, b) => {
  const [x, y] = [SEMVER_RE.exec(a).slice(1).map(Number), SEMVER_RE.exec(b).slice(1).map(Number)]
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
}
/** A git answer, or `null` when git has none — an unknown ref, a file the ref lacks. */
const gitRead = args => {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch { return null }
}
if (emitting && !REGISTER) {
  console.error('spec-check: --emit writes the register file, and `register` in spec.config.json is not set — nothing reads this corpus as a register')
  process.exit(2)
}
/** The register's own word for the two audiences, and nothing in between. */
const VISIBILITIES = ['public', 'internal']
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
 * The lines of `lines` inside a fenced code block, and the line of a fence that never
 * closes (or `null`). A backtick fence's info string holds no backtick, so ```x``` is
 * inline code; a fence closes only on its own marker, at least as long, with nothing
 * after it, as in CommonMark.
 */
const FENCE_MARK_RE = /^[ \t]*(?:(`{3,})(?!.*`)|(~{3,}))/
function fencedLines(lines) {
  const fenced = new Set()
  let fence = null
  let unclosed = null
  for (let i = 0; i < lines.length; i++) {
    const found = FENCE_MARK_RE.exec(lines[i])
    const mark = found && (found[1] ?? found[2])
    if (fence) {
      fenced.add(i)
      if (mark && mark[0] === fence[0] && mark.length >= fence.length && !lines[i].trim().slice(mark.length).trim()) fence = null
    }
    else if (mark) { fenced.add(i); fence = mark; unclosed = i }
    if (!fence) unclosed = null
  }
  return { fenced, unclosed }
}

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
 * `body` starts on the heading's own line break, so `bodyLine` is the heading's line
 * and line `n` of `body` is line `bodyLine + n` of the file, however many blank lines
 * the author left below the heading.
 */
const splitSection = (text, heading) => {
  // Headings are looked for outside fenced blocks only, at both ends: a `##` line in a
  // markdown sample or a `#` shell comment is neither the section's heading nor its end.
  // A fence that never closes fences nothing here, so the section still ends at the
  // next heading; `retiredRowsOf` reports that fence on its own section.
  const lines = text.split('\n')
  const { fenced, unclosed } = fencedLines(lines)
  const isFenced = i => fenced.has(i) && (unclosed === null || i < unclosed)
  const opener = new RegExp(`^ {0,3}(#{1,6})[ \\t]+${escapeRe(heading)}[ \\t]*\\r?$`)
  let head = -1
  let level = 0
  for (let i = 0; i < lines.length; i++) {
    const found = !isFenced(i) && opener.exec(lines[i])
    if (found) { head = i; level = found[1].length; break }
  }
  if (head < 0) return null
  // The same heading rule as the retired rows: up to three spaces of indent (a tab makes
  // it indented code, as in CommonMark), and an empty `##` is a heading too.
  const closer = new RegExp(`^ {0,3}#{1,${level}}(?:[ \\t]|\\r?$)`)
  let end = lines.length
  for (let i = head + 1; i < lines.length; i++) {
    if (!isFenced(i) && closer.test(lines[i])) { end = i; break }
  }
  const before = lines.slice(0, head).join('\n')
  const after = lines.slice(end).join('\n')
  return {
    // Starts on the heading's line break, so `bodyLine` is the heading's line.
    body: '\n' + lines.slice(head + 1, end).join('\n') + (end < lines.length ? '\n' : ''),
    without: (head ? before + '\n' : '') + after,
    bodyLine: head + 1,
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
 * A YAML list in the frontmatter, as its entries — `where:`, `docs:`, `formerly:`.
 *
 * The indentation is optional because YAML's is: a sequence may sit at the key's own
 * column, and rejecting that form would be the gate wrong about a correct file — the
 * failure mode this whole parser was fixed for. The block form is what every spec uses
 * and what the skill shows; the inline form is valid YAML too, and reporting it as
 * missing would be the gate being wrong about a file that is right. Reached only when
 * the block form did not match — which is why the caller strips comments first: a
 * `where:` whose entries were deleted but whose comment stayed would otherwise be
 * "named" by the comment text, and that is the new-spec case the `where:` check exists
 * for. One reader for every list field, because `formerly:` arrived as the third and a
 * third copy of these two patterns is how two of them come to disagree.
 */
function listField(fm, key) {
  const block = new RegExp(`^${key}:\\s*\\r?\\n((?:[ \\t]*[-*].*\\r?\\n?)+)`, 'm').exec(fm)?.[1] ?? ''
  const inline = new RegExp(`^${key}:[ \\t]*(\\S.*?)\\s*$`, 'm').exec(fm)?.[1] ?? ''
  // A bracketed flow sequence is split on its commas; a bare inline value is one entry,
  // because a place in the product is a phrase and may carry a comma of its own.
  const flow = /^\[.*\]$/.test(inline)
  return (block ? block.split(/\r?\n/) : flow ? inline.slice(1, -1).split(',') : [inline])
    .map(l => l.replace(/^[ \t]*[-*]\s*/, '').trim().replace(/^(['"])(.*)\1$/, '$2'))
    .filter(Boolean)
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
  // `[ \t]` rather than `\s` around the value: `\s` crosses the newline, so an empty
  // `since:` above a bare `where:` read `where:` as its value and was reported as
  // wrong rather than missing.
  const feature = /^feature:[ \t]*(\S+)[ \t]*$/m.exec(fm)?.[1] ?? null
  const updated = /^updated:[ \t]*(\S+)[ \t]*$/m.exec(fm)?.[1] ?? null
  // Read as the whole rest of the line rather than a token: a title is a sentence,
  // and quotes around it are YAML's rather than part of the name.
  const title = /^title:[ \t]*(\S.*?)\s*$/m.exec(fm)?.[1].replace(/^(['"])(.*)\1$/, '$2') ?? null
  // `where:` is a YAML list; what matters is that it names at least one place.
  const where = listField(fm, 'where')
  // The register's fields (`register` in the config). Read whether or not the key is
  // set, because reading is not judging: the checks that need them sit behind the key,
  // and a corpus read out of history must parse the same with it on or off.
  const since = /^since:[ \t]*(\S+)[ \t]*$/m.exec(fm)?.[1].replace(/^(['"])(.*)\1$/, '$2') ?? null
  const visibility = /^visibility:[ \t]*(\S+)[ \t]*$/m.exec(fm)?.[1].replace(/^(['"])(.*)\1$/, '$2') ?? null
  const summary = /^summary:[ \t]*(\S.*?)\s*$/m.exec(fm)?.[1].replace(/^(['"])(.*)\1$/, '$2') ?? null
  const formerly = listField(fm, 'formerly')
  const docs = listField(fm, 'docs')
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
  // Whether the line before this one was blank. A blank line does not end a bullet —
  // what follows it does — which is the same three-state reading `measureForm`'s
  // vocabulary rule uses, and it has to be, because that rule allows a bullet to
  // carry an indented second paragraph after a gap. Read as an ending, the parser
  // dropped exactly that paragraph from the promise while the gate accepted it.
  let prevBlank = false

  // Start after the frontmatter's closing `---`. A full-line YAML comment matches
  // `^#\s` just as a heading does, so scanning from line 0 let the frontmatter's
  // own comments open the intro and appended the remaining metadata lines to it —
  // in a parser that strips those comments a few lines above precisely so the gate
  // never rejects a correct document. It could not produce a wrong verdict while
  // nothing read `intro` closely; the opening-subject rule does.
  const fmEnd = lines[0] === '---' ? lines.indexOf('---', 1) : -1

  for (const [i, raw] of lines.entries()) {
    if (i <= fmEnd) continue
    if (/^#\s/.test(raw)) { afterTitle = true; heading1 = raw.replace(/^#\s+/, '').trim(); continue }
    if (/^##\s/.test(raw)) { afterTitle = false; sections.push(raw.replace(/^##\s+/, '').trim()) }
    else if (afterTitle && raw.trim() && !raw.startsWith('---')) intro += `${raw.trim()} `

    const heading = AC_HEADING_RE.exec(raw)
    if (heading) {
      // The body's left edge, read once for the whole criterion, because every
      // question below is "is this line the criterion's own, or part of the bullet
      // above it" and column 0 is the wrong answer to it for a body written at an
      // indent. Bounded by the criterion's own end — the next heading of any level,
      // which is the same line that sets `current` back to null further down.
      const end = lines.findIndex((l, j) => j > i && /^#{1,3}\s/.test(l))
      // Read as the block it is, once, and then consulted line by line below — the
      // same reading `measureForm`'s rules get. Keyed by the line's place in the
      // FILE, because the loop this sits in walks the file rather than the block.
      const body = readBody(lines.slice(i + 1, end === -1 ? lines.length : end))
      current = { id: heading[1], title: heading[2], verify: null, levels: [], shown: '', reason: null, ticket: null, slots: [], line: i + 1,
        edge: body.edge, body: new Map(body.lines.map(e => [i + 1 + e.i, e])) }
      acs.push(current)
      open = null
      prevBlank = false
      continue
    }
    // A non-AC `##`/`###` heading ends the current AC block (e.g. `## Gaps`).
    if (/^#{1,3}\s/.test(raw)) { current = null; open = null; continue }
    if (!current) continue
    // Past the criterion's own end: a retirement notice, and whatever follows it,
    // sits in the gap between two criteria and is nobody's promise.
    const on = current.body.get(i)
    if (!on) { open = null; prevBlank = false; continue }
    if (on.kind === 'blank') { prevBlank = true; continue }
    // A comment is not the body's text, here for the reason the words sweep exempts
    // one: it says something to whoever edits the file and nothing to whoever reads
    // the promise, so folding it into the fingerprint made editing a note a promise
    // change. Invisible rather than skipped-with-a-reset — what is above and below it
    // are as adjacent as they would be if nobody had written it.
    if (on.kind === 'comment') continue
    const afterGap = prevBlank
    prevBlank = false
    // Read off the body rather than off the raw line: an inline comment is already
    // gone, so a `- verify: unit <!-- until the runner lands -->` states one level
    // and not two.
    const line = on.text
    // A fenced block is content: nothing inside one opens a slot or states a level,
    // whichever column it is written at. Where it belongs is the other question, and
    // the fence's own column answers it — indented under a bullet the block is that
    // bullet's, and changing it changes what was promised; at the criterion's edge it
    // is the criterion's own and ends the bullet above, exactly as a paragraph there
    // does. Read at the edge and folded in regardless, a sample containing
    // `- **Then** …` put its own lines in the promise, so editing a code block was
    // reported as a changed promise.
    if (on.kind !== 'line') {
      if (on.own) open = null
      else if (open) { open.text += ` ${on.text}`; open.wrapping = false }
      continue
    }
    // Is this line the criterion's own, or part of the bullet above it? Everything
    // below hangs on that, and it is `bodyEdge`'s answer rather than column 0's —
    // the same reading `measureForm`'s vocabulary rule uses, so the two agree on
    // what nesting means. They did not: `SLOT_RE` is anchored `^\s*` and matched an
    // indented bullet, so a nested one opening on a bold word closed the slot above
    // it and its text never reached the fingerprint, while a nested PLAIN bullet was
    // appended to that slot by the branch below. Two readings of "nested" in one
    // parser, and the shape the reference doc calls legal was the one that lost text:
    // changing such a sub-bullet was a promise change the `--since` report called
    // untouched, which is the failure the whole rule exists to close.
    const mine = on.own
    // A labelled bullet opens a slot and closes the one before it; a bullet with no
    // label — or one this format does not know — closes without opening, so its text
    // cannot be appended to the promise above it.
    const slot = mine ? SLOT_RE.exec(line) : null
    if (slot) {
      // `wrapping` is true while the lines that follow are still the promise SENTENCE
      // — a hard wrap — and false from the first blank line on, after which whatever
      // the bullet still carries is its detail. The branch below is where it turns.
      open = PROMISE_SLOTS.has(slot[1]) ? { label: slot[1], text: slot[2].trim(), prose: slot[2].trim(), wrapping: true } : null
      if (open) current.slots.push(open)
      continue
    }
    // Only the criterion's own `verify:` is the criterion's. One nested under a
    // bullet says something about that bullet, and reading it here gave the criterion
    // a level nothing in the body declared — the same mistake as the slot above, one
    // field along. No criterion in any corpus measured writes one.
    //
    // `reason:` and `ticket:` are the other way round, and gating all three alike was
    // wrong for two of them. They say something about the `verify:` LINE — the format
    // tells their author they "belong under" it — so an author who indents them is
    // agreeing with the format rather than escaping it, and two live criteria in
    // `console` are written that way. Unread, the checks below then said `verify:
    // todo` "must name the `- ticket:` that closes the gap" to somebody looking at
    // one, which is the bold-phrase lesson one field along again.
    const written = /^\s*[-*]\s*(verify|reason|ticket):\s*(.+?)\s*$/.exec(line)
    const meta = written && (mine || written[1] !== 'verify') ? written : null
    if (meta) current[meta[1]] = meta[2].replace(/^`|`$/g, '').trim()
    // Only the criterion's OWN bullet closes the promise above it. A nested one is a
    // bullet inside that promise like any other, so it falls through to the branch
    // below and stays in the fingerprint — taking it out would be this rule's own
    // fault, one field along for the third time.
    if (meta && mine) { open = null }
    // A slot is continued by anything that is not a bullet of the criterion's own and
    // is not a paragraph at its edge after a gap. Every clause of that was once wrong
    // in a way the report could not admit to: `/^\s*[-*]\s/` also matched a bullet
    // nested under the slot, so a sub-bullet under a `**Then**` closed it and its text
    // never reached the fingerprint; with no gap branch at all, a paragraph written
    // between the promise and its `**Because**` was glued onto the promise, so prose
    // moving read as the promise moving; and with the gap alone deciding, a bullet's
    // own indented second paragraph — a shape the vocabulary rule allows and the gate
    // accepts — was dropped from the promise instead. A confident wrong answer every
    // way round, which is the one thing this report may never give.
    //
    // `text` and `prose` part company here, and the split is the whole point. The
    // fingerprint wants the fold — a nested bullet is part of the bullet above it, so
    // changing one changes the promise and `--since` has to see it. A word count wants
    // the sentence — the promise is the `**Then**` line, and the list beneath it is the
    // detail of one outcome, not more of the sentence. Measuring the fold counted each
    // sub-bullet's `-` as a word and reported a nine-word promise as thirty-three: a
    // criterion written in the shape `references/spec-anatomy.md` blesses, failed by the
    // gate, which is the one outcome that file rules out by name.
    //
    // A wrapped continuation joins both, because a promise hard-wrapped over three lines
    // is one sentence and is measured as one. A bullet's own INDENTED second paragraph
    // joins `text` alone, and `wrapping` is what says so: the sentence ended at the blank
    // line above it, so every line from there on is that bullet's detail, exactly as a
    // nested bullet is. One flag rather than a per-line test, because after the gap the
    // paragraph's second line is no more of the sentence than its first, and asking the
    // question line by line answered it two ways inside one paragraph.
    else if (open && !(mine && item(line)) && !(afterGap && mine)) {
      open.text += ` ${line.trim()}`
      // Where the SENTENCE stops, which is not where the bullet stops: at the gap
      // above this line, at a nested bullet, at a numbered list — and at a fenced
      // block, in the branch above. Everything from there on is that bullet's detail
      // and none of it is more of the promise. Turned off once rather than tested per
      // line, because the nested bullet itself was kept out of the count and its WRAP
      // was not: a six-word promise carrying a detail bullet that ran over three
      // lines was reported as thirty-two words — the ratchet failing a document this
      // format's own reference doc calls correct, in a second shape of the case the
      // line below was written for.
      if (afterGap || item(line)) open.wrapping = false
      if (open.wrapping) open.prose += ` ${line.trim()}`
      continue
    }
    else if (mine && item(line)) open = null
    // A paragraph at the criterion's own edge after a gap is inside nothing, and that
    // is what this branch was written for: glued onto the promise, a sentence moving
    // between the promise and its `**Because**` read as the promise moving. An
    // INDENTED paragraph after a gap is the bullet's own second paragraph, which the
    // vocabulary rule allows and the branch above therefore reads.
    else if (open && afterGap && mine) open = null
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
  return { file, feature, title, updated, where, since, visibility, summary, formerly, docs, acs, sections, heading: heading1, intro: intro.trim(), text }
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

// ------------------------------------------------------------- backfill ------

/**
 * One scan of JSON text for both readers below: from `from`, inside `depth` levels of
 * `{`/`[`, it yields every string as `{ start, end, depth }` and, when a close takes the
 * depth to 0, `{ close }` and stops. Strings are skipped whole, so a bracket inside one
 * counts for nothing.
 */
function* jsonScan(text, from, depth) {
  for (let i = from; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      const start = i
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++
      yield { start, end: i + 1, depth }
      continue
    }
    if (c === '{' || c === '[') depth++
    else if ((c === '}' || c === ']') && --depth === 0) { yield { close: i }; return }
  }
}

/**
 * The text of a JSON object from just after its `{` to just before its `}`, or `null`
 * when it does not close.
 */
function objectBody(text, from) {
  for (const token of jsonScan(text, from, 1)) if (token.close !== undefined) return text.slice(from, token.close)
  return null
}

/**
 * Where `pattern` matches at `"key"` among the top-level keys of an object body (as
 * `objectBody` returns it), not inside a nested object, an array or a string value —
 * an `exec`-like result with `index` relative to `body`, or `null`. A key written
 * twice is read where `JSON.parse` reads it: at its last occurrence.
 */
function topLevelKey(body, key, pattern) {
  let last = null
  for (const { start, end, depth } of jsonScan(body, 0, 1)) {
    if (depth !== 1 || body.slice(start, end) !== `"${key}"` || !/^\s*:/.test(body.slice(end))) continue
    const found = pattern.exec(body.slice(start))
    last = found ? Object.assign(found, { index: start }) : null
  }
  return last
}

/**
 * `--backfill-since`: the version each spec first shipped in, read off git history.
 *
 * Releases are read off the deployed line: `origin/main`'s first parents, the
 * sequence of states that were each deployed, or HEAD's where there is no
 * `origin/main`. A spec shipped with the first commit on that line that contains it
 * and raised the manifest's version over its first parent — the commit where the spec
 * landed, or the next release after it. A version a branch carried and the line never
 * had does not count: dated by its add commit, a spec once claimed a release that
 * never existed (orders#64, `since: 2.3.0` on an app that went 2.2.0 → 3.0.0). Read
 * off HEAD on a feature branch that merged `main` in, a spec from `main` would be
 * dated by that merge. A merge raises only what its first parent did not already
 * carry. A spec in `register.pinned` is not read from history at all: it takes the
 * pin.
 *
 * The add commit is found with `--follow`, so a renamed spec keeps the date of its
 * first file; a copy is not followed, because a spec that starts as a copy of another
 * promises something new. The floor is the lowest `since:` found: the first version
 * that shipped specs at all.
 *
 * What history cannot settle is listed and left alone rather than guessed. A spec
 * history cannot date — added twice, brought in by a merge, behind a first parent on
 * the line without a readable version, carrying a pin with no x.y.z `since`, or met
 * by a git failure — may be older than every settled one, so while one is listed the
 * floor is only ever lowered, never raised. A spec not committed, or not shipped yet
 * (it carries the version the change ships, which only the author knows), ships above
 * HEAD's version and does not hold the floor back. Whether a version was ever
 * deployed is not in git at all; that is for the reader of the list to judge, and a
 * pin to record. Exits 1 while anything is listed, so a script cannot take a partial
 * backfill for a complete one.
 *
 * A shallow clone is refused: its oldest commit looks like every spec's root.
 */
if (backfilling) {
  if (!REGISTER) {
    console.error('spec-check: --backfill-since writes `since:` and `register.floor`, and `register` in spec.config.json is not set')
    process.exit(2)
  }
  // A shallow clone ends its history at the oldest commit it fetched, which then looks
  // like every spec's add commit and like a root that raised the version: plausible,
  // wrong dates and an exit 0. History has to be whole before it is read as fact.
  if (gitRead(['rev-parse', '--is-shallow-repository'])?.trim() === 'true') {
    console.error('spec-check: --backfill-since reads the whole history, and this clone is shallow — run `git fetch --unshallow` (CI: `fetch-depth: 0` / `GIT_DEPTH: 0`) and try again')
    process.exit(2)
  }
  const versions = new Map()
  /** The manifest's x.y.z version at a commit, or `null`. */
  const versionAt = commit => {
    if (!versions.has(commit)) {
      let version = null
      try { version = JSON.parse(gitRead(['show', `${commit}:./${REGISTER.manifest}`]) ?? 'null')?.version ?? null }
      catch { /* not JSON at that commit: no version */ }
      versions.set(commit, SEMVER_RE.test(version ?? '') ? version : null)
    }
    return versions.get(commit)
  }
  const parents = new Map()
  /** A commit's parents (none for a root), or `null` when git cannot say. */
  const parentsOf = commit => {
    if (!parents.has(commit)) parents.set(commit, gitRead(['rev-list', '--parents', '-n', '1', commit])?.trim().split(' ').slice(1).filter(Boolean) ?? null)
    return parents.get(commit)
  }
  // The deployed line is `origin/main`'s first parents, not HEAD's: run on a feature
  // branch that merged `main` in, HEAD's first parents are the branch and its update
  // merges, and a spec from `main` would be dated by the merge, not by its release.
  // Without `origin/main` the run reads HEAD's line, which is right on `main`'s tip.
  const lineRef = gitRead(['rev-parse', '--verify', '--quiet', 'origin/main^{commit}']) ? 'origin/main' : 'HEAD'
  // A git failure here is no fact about history: read as one, an empty line would list
  // every spec as not shipped, and none of them would hold the floor back.
  const lineLog = gitRead(['rev-list', '--first-parent', '--reverse', lineRef])
  // Only a commit that changes the manifest against its first parent can raise the
  // version, so those are read once and the rest of the line is never `git show`n.
  const releaseLog = gitRead(['log', '--first-parent', '--diff-merges=first-parent', '--format=%H', lineRef, '--', REGISTER.manifest])
  if (lineLog === null || releaseLog === null) {
    console.error(`spec-check: --backfill-since could not read ${lineRef}'s first-parent history — nothing written`)
    process.exit(2)
  }
  /** The deployed line, oldest first: the commits that were each a deployed state. */
  const mainLine = lineLog.split('\n').filter(Boolean)
  const onLine = new Map(mainLine.map((c, i) => [c, i]))
  /** The line's indexes of the commits that change the manifest, ascending. */
  const releaseAt = releaseLog.split('\n').filter(Boolean).map(c => onLine.get(c)).filter(i => i !== undefined).sort((a, b) => a - b)
  /** `git merge-base --is-ancestor`: true, false, or `null` when git failed rather than answered. */
  const isAncestor = (a, b) => {
    try { execFileSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: root, stdio: 'ignore' }); return true }
    catch (e) { return e.status === 1 ? false : null }
  }
  /**
   * The index of the first main-line commit that contains `commit`, -1 when none does,
   * or `null` when git failed. Containment is monotone along the line, so a binary
   * search finds it.
   */
  const landing = commit => {
    if (onLine.has(commit)) return onLine.get(commit)
    let lo = 0, hi = mainLine.length - 1, hit = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const reached = isAncestor(commit, mainLine[mid])
      if (reached === null) return null
      if (reached) { hit = mid; hi = mid - 1 }
      else lo = mid + 1
    }
    return hit
  }
  const found = []
  const open = []
  const notes = []
  if (lineRef === 'HEAD') notes.push('no origin/main — dated along HEAD\'s first-parent line, which is the deployed line only on main\'s tip')
  // A spec history cannot date may be older than every settled one. One that is new in
  // this change, or added but not shipped yet, ships above HEAD's version, so it never
  // is: it is listed, but does not hold the floor back.
  let undatedAny = false
  const undated = line => { open.push(line); undatedAny = true }
  // A malformed pin must stop the run, not fall back to history: the date it was written
  // to protect would be overwritten by the value it exists to keep out.
  if (REGISTER.pinned !== undefined && PINNED !== REGISTER.pinned) {
    console.error('spec-check: `register.pinned` is not an object — `{ "<feature>": { "since": "x.y.z", "reason": "…" } }`; nothing written')
    process.exit(2)
  }
  for (const file of specFiles) {
    const path = `${config.specDir}/${file}`
    const pin = PINNED[file.replace(/\.md$/, '')]
    if (pin && !SEMVER_RE.test(pin.since ?? '')) { undated(`${path} — its pin in register.pinned has no x.y.z \`since\`, so history is not written over it`); continue }
    if (pin) {
      found.push({ file, path, since: pin.since })
      notes.push(`${path} — pinned at ${pin.since} in register.pinned, not read from history${pin.reason ? ` (${pin.reason})` : ''}`)
      continue
    }
    // `--follow` finds copies as well as renames, and a new spec is often half a copy
    // of an old one by shape alone — so only a rename is followed, and a copy is the
    // commit the file came into being, like an add. git 2.56 walks on past the copy
    // into its source's history, so the walk is topological: the copy, a child, always
    // comes before the source's add, even when both carry the same commit time.
    const log = gitRead(['log', '--follow', '--topo-order', '--format=%x00%H', '--name-status', '--', path])
    if (log === null) { undated(`${path} — git could not read its history, so where it first shipped is not known`); continue }
    const history = log
      .split('\0').map(entry => entry.trim().split(/\n+/)).filter(([sha]) => sha)
      .map(([sha, status = '']) => { const [kind, ...paths] = status.split('\t'); return { sha, kind: kind[0], path: paths.at(-1), from: paths[0] } })
    // Only renames are followed, by name: an entry counts only for the name the spec had
    // at that point, and a rename hands the walk its old name. git 2.56 also walks into a
    // copy's source — even when the copying commit is a merge it prints nothing for — and
    // an add of that other file is not this spec's birth.
    let name = path
    let born = -1
    for (const [k, h] of history.entries()) {
      if (h.path !== name) continue
      if (h.kind === 'R') { name = h.from; continue }
      if (h.kind === 'A' || h.kind === 'C') { born = k; break }
    }
    // Only a spec HEAD does not hold yet is new in this change. One HEAD holds whose
    // history shows no add — a file that came into the tree in a merge, which `log`
    // prints no status for, or none at all — shipped somewhere history does not say. It
    // may be older than every settled one, so it holds the floor back like any undated spec.
    if (born < 0) {
      const held = gitRead(['ls-tree', '--name-only', 'HEAD', '--', path])
      if (held === null) undated(`${path} — git could not say whether HEAD holds it, so where it first shipped is not known`)
      else if (!held.trim()) open.push(`${path} — not in git history; a spec new in this change carries the version the change ships`)
      else undated(`${path} — its history shows no commit that added it (a merge brought it in?), so where it first shipped is not in history`)
      continue
    }
    const readds = history[born].kind === 'A' ? history.slice(born + 1).filter(h => h.kind === 'A' && h.path === history[born].path) : []
    if (readds.length) { undated(`${path} — added ${readds.length + 1} times (${[history[born], ...readds].map(h => h.sha.slice(0, 7)).join(', ')}), so which one shipped first is a reading of history, not a fact in it`); continue }
    const { sha, path: firstPath } = history[born]
    const short = sha.slice(0, 7)
    if (firstPath && firstPath !== path) notes.push(`${path} — followed from ${firstPath}, added at ${short}`)
    // The release that shipped a spec is read off the line HEAD was built along — the
    // first-parent history, which is what deployed. The add commit itself may sit on a
    // branch whose version never reached that line: dated by it, a spec claims a release
    // that never existed (orders#64: `since: 2.3.0` on an app that went 2.2.0 → 3.0.0).
    // So the spec is dated from the commit where it landed on that line, onward.
    const landed = landing(sha)
    if (landed === null) { undated(`${path} — added at ${short}, and git could not say where it reached ${lineRef}'s first-parent line`); continue }
    if (landed < 0) { open.push(`${path} — added at ${short}, which ${lineRef}'s first-parent line does not reach yet: it has not shipped in a release`); continue }
    let since = null
    let blocked = null
    for (const i of releaseAt) {
      if (i < landed) continue
      const commit = mainLine[i]
      const v = versionAt(commit)
      // A commit with no readable version raises nothing; the next one is read against it.
      if (!v) continue
      const before = parentsOf(commit)
      if (!before) { blocked = `git could not name the parents of ${commit.slice(0, 7)}`; break }
      if (!before.length) { since = v; break }
      if (!versionAt(before[0])) {
        blocked = commit === sha
          ? `whose parent ${before[0].slice(0, 7)} has no readable x.y.z version in ${REGISTER.manifest}`
          : `${commit.slice(0, 7)} (${v}) has a parent without a readable x.y.z version in ${REGISTER.manifest}, so whether it raised the version is not in history`
        break
      }
      if (semverCmp(v, versionAt(before[0])) > 0) { since = v; break }
    }
    const under = versionAt(sha) ? ` under ${versionAt(sha)}` : ''
    if (blocked) { undated(`${path} — added at ${short}${blocked.startsWith('whose') ? ', ' : `${under}; `}${blocked}`); continue }
    if (!since) { open.push(`${path} — added at ${short}${under}, and no later commit raised the version: it has not shipped in a release yet`); continue }
    found.push({ file, path, since })
  }

  const changed = []
  for (const { file, path, since } of found) {
    const at = join(root, config.specDir, file)
    const text = readFileSync(at, 'utf8')
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
    if (!fm) { open.push(`${path} — has no frontmatter to write \`since: ${since}\` into`); continue }
    const had = /^since:[ \t]*(.*?)[ \t]*$/m.exec(fm[1])?.[1].replace(/\s+#.*$/, '').replace(/^(['"])(.*)\1$/, '$2') ?? null
    if (had === since) continue
    const body = had !== null
      ? fm[1].replace(/^since:.*$/m, `since: ${since}`)
      : /^(visibility|summary|updated):/m.test(fm[1])
        ? fm[1].replace(/^(visibility|summary|updated):/m, `since: ${since}\n$1:`)
        : `${fm[1]}\nsince: ${since}`
    writeFileSync(at, text.slice(0, fm.index) + text.slice(fm.index).replace(fm[1], () => body))
    changed.push(`${path} — since: ${had ?? '(none)'} → ${since}`)
  }

  const floor = found.map(f => f.since).sort(semverCmp)[0] ?? null
  // A spec history cannot date can be older than every settled one, so a floor that
  // would rise waits for all of them: a floor written too high fails every older
  // `since:` until someone reverts it. Lowering it is safe, and the `since:` just
  // written below it needs it.
  const lowers = floor && SEMVER_RE.test(REGISTER.floor ?? '') && semverCmp(floor, REGISTER.floor) < 0
  const heldBack = Boolean(floor && floor !== REGISTER.floor && undatedAny && !lowers)
  if (heldBack) notes.push(`spec.config.json — register.floor not written while specs are open; the settled ones say ${floor}`)
  else if (floor && floor !== REGISTER.floor) {
    const configPath = join(root, 'spec.config.json')
    const text = readFileSync(configPath, 'utf8')
    const opens = /"register"\s*:\s*\{/.exec(text)
    const body = opens && objectBody(text, opens.index + opens[0].length)
    const floorAt = body === null ? null : topLevelKey(body, 'floor', /^("floor"\s*:\s*)(?:"[^"]*"|null)/)
    if (!floorAt) open.push(`spec.config.json — \`register\` has no \`floor\` to write ${floor} into; add \`"floor": "${floor}"\``)
    else {
      const at = opens.index + opens[0].length + floorAt.index
      writeFileSync(configPath, `${text.slice(0, at)}${floorAt[1]}"${floor}"${text.slice(at + floorAt[0].length)}`)
      changed.push(`spec.config.json — register.floor: ${REGISTER.floor ?? '(none)'} → ${floor}`)
    }
  }

  console.log(`spec-check --backfill-since · ${found.length} of ${specFiles.length} spec${specFiles.length === 1 ? '' : 's'} dated from history, floor ${floor ?? 'unknown'}`)
  for (const line of changed) console.log(`  wrote ${line}`)
  if (!changed.length) console.log(open.length
    ? '  nothing written — what history settles is already there; the rest is listed below'
    : '  nothing to write — every since: and the floor already say what history says')
  for (const line of notes) console.log(`  · ${line}`)
  if (open.length) {
    console.error(`\n${open.length} spec${open.length === 1 ? '' : 's'} left for a person — history does not settle ${open.length === 1 ? 'it' : 'them'}:`)
    for (const line of open) console.error(`  ? ${line}`)
  }
  process.exit(open.length ? 1 : 0)
}

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
// The register's section of retired feature ids is an aside like the others: its rows
// name specs that are gone and the specs that took their promises over, and neither is
// an inventory entry.
const inventory = [...(config.indexAsides ?? []), ...(REGISTER ? [REGISTER.retiredSection] : [])].reduce(
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

/**
 * The manifest the register reads its version and name from, or `null` when the
 * register is off or the file cannot be read — the second reported once, here, so
 * every rule below that needs a version can stay silent instead of each saying so.
 */
const manifest = (() => {
  if (!REGISTER) return null
  const at = REGISTER.manifest
  let read
  try { read = JSON.parse(readFileSync(join(root, at), 'utf8')) }
  catch (e) { err('spec.config.json', `\`register.manifest\` names \`${at}\`, which could not be read — ${e.message}`); return null }
  if (!SEMVER_RE.test(read.version ?? '')) { err(at, `\`version: ${read.version}\` is not a plain x.y.z version, so no \`since:\` can be measured against it`); return null }
  if (!read.vendor || !read.name) { err(at, 'names no `vendor` and `name`, and the register files every feature under `<vendor>/<name>`'); return null }
  return read
})()
if (REGISTER && !SEMVER_RE.test(REGISTER.floor ?? '')) {
  err('spec.config.json', `\`register.floor\` is \`${REGISTER.floor}\` — set it to the first version that had specs, as x.y.z`)
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

  // What the register shows, held where it is written. Only with the register on: a
  // repository nothing reads as one is asked for none of it, and passes as it did.
  if (REGISTER) {
    if (!spec.since) err(where, 'frontmatter is missing `since:` — the first version that shipped these promises, as x.y.z')
    else if (!SEMVER_RE.test(spec.since)) err(where, `frontmatter \`since: ${spec.since}\` is not a version — write it as x.y.z`)
    else if (SEMVER_RE.test(REGISTER.floor ?? '') && semverCmp(spec.since, REGISTER.floor) < 0) {
      err(where, `\`since: ${spec.since}\` is older than the first version that had specs (${REGISTER.floor}) — nothing before it was recorded, so nothing can claim it`)
    }
    else if (manifest && semverCmp(spec.since, manifest.version) > 0) {
      err(where, `\`since: ${spec.since}\` is newer than the version this change ships (${manifest.version}) — a promise cannot have shipped in a version that does not exist yet`)
    }
    else if (PINNED[spec.feature] && SEMVER_RE.test(PINNED[spec.feature].since ?? '') && spec.since !== PINNED[spec.feature].since) {
      err(where, `\`since: ${spec.since}\` differs from its pin in register.pinned (${PINNED[spec.feature].since}) — a backfill run wrote history over it; restore the pin's value, or change the pin with a reason`)
    }
    // Required with no default, because either default is a decision taken silently:
    // `public` publishes what was written as internal, `internal` drops a feature from
    // the help without anybody choosing to.
    if (!spec.visibility) err(where, `frontmatter is missing \`visibility:\` — ${VISIBILITIES.join(' or ')}; there is no default, because either one would decide for you who reads this`)
    else if (!VISIBILITIES.includes(spec.visibility)) err(where, `frontmatter \`visibility: ${spec.visibility}\` is not one of ${VISIBILITIES.join(' / ')}`)
    // The summary is the only sentence the public register shows, so it is held to
    // the promise sentence's cap and to being one sentence — a second one is where a
    // summary turns back into the intro it was written to replace.
    if (spec.visibility === 'public' && !spec.summary) {
      err(where, 'is `visibility: public` and has no `summary:` — the one sentence the public register shows, for a reader outside the company')
    }
    // An internal spec's summary reaches no reader the register serves, yet it was emitted
    // all the same: what is left behind when a spec turns internal, still promising in
    // public words (sample-data-simulator carried eleven, one of them wrong).
    if (spec.visibility === 'internal' && spec.summary) {
      err(where, 'is `visibility: internal` and carries a `summary:` — only the public register shows one, so drop it')
    }
    if (spec.summary) {
      const words = spec.summary.split(/\s+/).filter(Boolean).length
      if (words > PROMISE_WORDS) err(where, `\`summary:\` runs to ${words} words — it is one sentence of at most ${PROMISE_WORDS}`)
      // An abbreviation's full stop is not a sentence's: `e.g. ` mid-summary is one sentence.
      if (/[.!?]\s+\S/.test(spec.summary.replace(/\b(?:e\.g|i\.e|vs|cf)\./gi, ''))) err(where, '`summary:` is more than one sentence — the intro carries the rest')
    }
    for (const old of spec.formerly) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(old)) err(where, `\`formerly:\` names \`${old}\`, which is not a feature id`)
      else if (specFiles.includes(`${old}.md`)) err(where, `\`formerly:\` names \`${old}\`, which is a spec today — an alias may only name an id nobody holds`)
    }
  }
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
  //
  // Not `RETIRED_LINE`, and not by oversight: this asks a narrower question than "is
  // this line a retirement notice". It reads the leading id of an italic line at
  // column 0 and ignores whatever the notice goes on to say, while `RETIRED_LINE`
  // accepts an indent because a notice inside an indented body still has to end that
  // body. An indented notice is therefore outside this sequence, which is the right
  // answer for a check about where a reader looks: a line the document indents is
  // not one they scan the margin for.
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

// ─────────────────────────────── words this corpus settled ───────────────────
//
// One word, one meaning — ASD-STE100's first rule, and the only one of its lexical
// rules that can be checked without ASD's dictionary, because the register says
// which word this corpus picked instead of a standard saying which word is
// approved.
//
// The skill has said since the words section existed that settling a word obliges
// a sweep of the corpus in the same change, and that "nothing checks this and
// nothing can: a drifted term breaks no promise". The second half held only while
// the register recorded the word that *won*. Recording the words that lost beside
// it closes the hole: a word somebody retired is a hard error wherever it still
// stands, in a spec or in the index.
//
// Hard rather than a ratchet, unlike the two promise-sentence counts above, and
// the asymmetry is the register's doing: a row is written by the same change that
// sweeps the corpus, so the count it could ratchet is zero on the day it arrives.
// A repository adopting the convention over an existing corpus adds rows one at a
// time and pays for each one where it is written.
//
// A missing section is silence, not an error — the other difference from
// `indexRegister`, whose section is structural. The words section waits for a
// disagreement, and a repo that has had none has nothing to declare.
const wordRegister = readme !== null && config.wordRegister
  ? splitSection(readme, config.wordRegister)
  : null

/**
 * A filename, a path, a URL or a link target — the spellings of a word that are not
 * the word. `\b` treats a hyphen as a boundary, so a spec called
 * `reviewer-assignment.md` writes a retired *reviewer* in its own `feature:` line,
 * in every sibling's link to it and in the index's inventory row, none of which
 * anybody wrote as vocabulary. Reported, the one repair is a file rename that
 * cascades through every `@spec:<feature>:AC-n` tag in the tests — so a register row
 * could force a repo-wide rename nobody saw coming when they wrote it.
 *
 * Exempt for the reason a code span already is: an identifier is not this corpus's
 * vocabulary. The `feature:` value is named too, because the gate elsewhere requires
 * it to equal the filename, which makes it a filename and not a sentence.
 */
const NOT_PROSE = [
  /\]\([^)]*\)/g,
  /<[^>\s]+>/g,
  /\S*\/\S*/g,
  /[\w.-]+\.(?:md|markdown|json|ya?ml|mjs|cjs|jsx?|tsx?|vue|py|go|php|rb|rs|java|css|scss|html?|txt|csv|xml|sql|sh)\b/gi,
]

/**
 * The lines of a markdown file a settled word can be read in: prose, with fenced
 * blocks dropped, inline code, HTML comments, paths and link targets blanked. Line
 * numbers are kept, because the sweep's whole product is sending somebody to the
 * word.
 *
 * Code is exempt because an identifier is not the corpus's vocabulary — a spec
 * quoting `costCenterId` from a payload is naming a field, not writing a word.
 * A comment is exempt because the index's own comments explain the conventions
 * and would report the template that teaches them.
 *
 * Read in both directions — the register is parsed through this too, not only swept
 * with it. An exemption applied on one side only is the bug it was written to
 * prevent, wearing the other face: the installer seeds the register with a comment
 * whose job is to teach the convention by example, and a parse that could not see
 * comments read that example as a live row and retired *cost center* across a
 * repository on the day it was installed.
 */
const sweepable = (text) => {
  const out = []
  let fenced = false
  let commented = false
  let frontmatter = text.startsWith('---')
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    if (frontmatter && i > 0 && /^---\s*$/.test(raw)) { frontmatter = false; out.push([i + 1, '']); continue }
    if (/^\s*(```|~~~)/.test(raw)) { fenced = !fenced; continue }
    if (fenced) continue
    let line = raw.replace(/<!--.*?-->/g, ' ').replace(/`[^`]*`/g, ' ')
    if (commented) {
      const closes = line.indexOf('-->')
      if (closes < 0) continue
      line = line.slice(closes + 3)
      commented = false
    }
    const opens = line.indexOf('<!--')
    if (opens >= 0) { line = line.slice(0, opens); commented = true }
    if (frontmatter && /^feature:/.test(line)) line = 'feature:'
    for (const re of NOT_PROSE) line = line.replace(re, ' ')
    out.push([i + 1, line])
  }
  return out
}

/**
 * The words the register retired, each with the word that replaced it.
 *
 * The entry shape is the convention the index template prints: the word that won
 * opens the entry in bold, and the words it replaced follow the literal marker
 * `Not:` to the end of the entry's first sentence — `- **cost centre** — … .
 * Not: *cost center*, *costcentre*.`
 *
 * An entry that settles a word without retiring a synonym — a spelling, a plural,
 * a word this corpus simply uses — carries no `Not:` and is skipped rather than
 * reported. The check acts only on what the register explicitly says is gone,
 * which is what keeps it from ever failing a correct document.
 */
const retiredWords = []
if (wordRegister) {
  // Read through `sweepable`, so the exemptions hold in the direction that CREATES a
  // row as well as the one that enforces it. A comment and a fenced block are where
  // the convention is taught by example — the installer's own template retires
  // *cost center* in a comment — and an example that becomes a rule is a gate failing
  // a document nobody wrote.
  const regLines = sweepable(wordRegister.body)
  for (const [n, [i, line]] of regLines.entries()) {
    if (!/^[-*|]\s/.test(line)) continue
    // The entry opens on a TOP-LEVEL bullet and runs to the next one or to the next
    // blank line — the reading `## Elsewhere` takes at `elsewhereWithoutLink`, and
    // for the same reason: a wrapped entry is one entry. Both halves have to say
    // top-level. Allowing an indent opened an entry on the indented example inside a
    // comment; allowing a bullet character with no space after it ENDED the entry on
    // its own indented continuation `*costcentre*.`, so the first retired word was
    // read and the second silently was not. Half a row parsed is worse than either
    // whole outcome, because nothing in the output says which half arrived.
    const rest = regLines.slice(n)
    const end = rest.findIndex(([, l], k) => k > 0 && (/^[-*|]\s/.test(l) || !l.trim()))
    const entry = (end < 0 ? rest : rest.slice(0, end)).map(([, l]) => l).join(' ')
    const kept = /\*\*([^*]+)\*\*/.exec(entry)?.[1]?.trim()
    const not = /\bNot:\s*([^.]+)/.exec(entry)?.[1]
    if (!kept || !not) continue
    for (const word of not.split(',').map(w => w.trim().replace(/^[*_`]+|[*_`]+$/g, '')).filter(Boolean)) {
      retiredWords.push({ word, kept, line: wordRegister.bodyLine + i - 1 })
    }
  }
}

if (retiredWords.length) {
  /**
   * A retired word, wherever it stands as a word. The suffix tolerance is the one
   * a settled term actually drifts by — a plural, a past tense, a gerund — and it
   * is skipped for a multi-word term, where the shape is the term itself.
   */
  const wordRe = ({ word }) => new RegExp(
    `\\b${escapeRe(word)}${/\s/.test(word) ? '' : '(?:s|es|ed|d|ing)?'}\\b`, 'i')
  const patterns = retiredWords.map(r => [r, wordRe(r)])

  const sweep = (where, text, skip = () => false) => {
    for (const [n, line] of sweepable(text)) {
      if (skip(n)) continue
      for (const [r, re] of patterns) {
        const hit = re.exec(line)
        if (!hit) continue
        err(`${where}:${n}`, `writes "${hit[0]}", which \`## ${config.wordRegister}\` retired in favour of "${r.kept}"`
          + ` — settling a word obliges a sweep of the corpus in the same change, and this is what the sweep missed.`
          + ` Either replace it, or take the row out of the register (README.md:${r.line}) because the decision changed`)
      }
    }
  }

  for (const spec of specs.values()) sweep(`${config.specDir}/${spec.file}`, spec.text)
  // The index is swept too — the rule says specs and index alike — except the
  // register itself, which is the one place a retired word is written down on
  // purpose. Skipped by line range rather than by cutting the section out, so the
  // lines the sweep does report still carry the numbers the file has.
  if (readme !== null) {
    // The heading line through the section's last line that carries anything.
    // `bodyLine` is the heading's own number and `body` opens on the remainder of
    // that line, so element `i` is line `bodyLine + i` — but a section ended by the
    // next heading carries two trailing empties, the blank line before that heading
    // and the heading's own start. Counting them exempted two lines of the FOLLOWING
    // section from the sweep, one of them its heading. Trailing blanks need no
    // exemption anyway: there is nothing on them to find.
    const regLines = wordRegister.body.split(/\r?\n/)
    while (regLines.length && !regLines.at(-1).trim()) regLines.pop()
    const from = wordRegister.bodyLine
    const to = from + regLines.length - 1
    sweep(`${config.specDir}/README.md`, readme, n => n >= from && n <= to)
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

// `--emit` lists no suite: the register file is the specs' business, and writing it
// must not wait on — or fail with — a test run. The forward pass below reads every
// suite as unlisted in that mode, so silence about coverage is not read as absence.
for (const [suiteId, suite] of emitting ? [] : Object.entries(SUITES)) {
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
      if (unlistable.has(level) || emitting) continue
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
  const out = { verifyNotLast: [], strayBody: [], unlabelledGaps: [], badGapHeading: [], gapsIntro: [], elsewhereWithoutLink: [], pairRefs: [], longPromises: [], compoundPromises: [] }

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

    // Two rules of the promise sentence, counted rather than enforced: at most
    // one promise per sentence, and at most `PROMISE_WORDS` words in it. Counted
    // for the same reason the gap labels are — the rules arrived after the corpus,
    // and enforcing them outright fails every spec at once and forces one
    // unreviewable commit that rewrites every criterion in flight.
    //
    // Read off `slot.prose`, not `slot.text`: the parser joins a wrapped promise
    // back into one line in both, so a sentence written over three lines is measured
    // as the sentence it is — but only `text` also folds in the nested bullets under
    // the promise, which belong to the fingerprint and not to the sentence. Measured
    // with the fold, a nine-word `**Then**` carrying a three-item list read as
    // thirty-three words, each sub-bullet's `-` among them, and both ratchets failed
    // a criterion written exactly as the format asks.
    for (const slot of ac.slots) {
      const words = slot.prose.split(/\s+/).filter(Boolean).length
      if (words > PROMISE_WORDS) out.longPromises.push(`${ac.id} **${slot.label}** (${words} words)`)
      if (OUTCOME_SLOTS.has(slot.label) && isCompound(slot.prose)) {
        out.compoundPromises.push(`${ac.id} **${slot.label}**`)
      }
    }

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
    // One reading of the body for every rule below, `readBody`'s. A fenced sample's
    // `- verify: e2e` line was a bullet to the filter that used to stand here, so the
    // count below called it a second level and named deleting the criterion's real
    // one as the fix.
    const { edge, lines: body } = readBody(block)
    const bullets = body.filter(e => e.kind === 'line' && BULLET_RE.test(e.text)).map(e => [e.i, e.raw])
    const indent = ([, l]) => column(l)
    const own = ([, l]) => /^\s*[-*]\s*(reason|ticket):/.test(l)
    // What "nested" means here is `bodyEdge`'s, which is also what `parseSpecText`
    // reads the promise by — so a bullet these rules call part of the one above it is
    // one the report reads that way too. They disagreed until PO-322, in three
    // places: the parser dropped a labelled sub-bullet's text while appending a plain
    // one's, the vocabulary rule below called every line of a body written at an
    // indent nested, and the count here read a `verify:` nested under a promise as a
    // second one the criterion had declared — three answers to one question.
    // At the criterion's own edge: a `- verify:` nested under a promise says something
    // about that bullet, and `parseSpecText` does not read it as the criterion's level.
    // Counting it here reported two `verify:` lines at a criterion that declares one.
    const verifies = bullets.filter(b => indent(b) === edge && VERIFY_BULLET_RE.test(b[1]))
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

    // A criterion body carries the labelled bullets, its meta bullets, and nothing
    // else (PO-322). Until this rule the parser read the four promise slots and
    // silently ignored every other line, so a criterion written some other way
    // produced a fingerprint missing whatever it could not see — and the `--since`
    // report then said a changed promise was untouched. The corpus passed by luck:
    // measured over 45 specs and 330 criteria, the only body content that was not a
    // known bullet was the retirement notices and one paragraph in `templates.md`.
    //
    // It also closes the hole in `verifyNotLast` above, which filters to bullets
    // before it compares anything and therefore cannot see prose written below
    // `verify:` — that paragraph sat under one and the gate was green on it.
    //
    // What ends a body is stated rather than assumed, because the block reaches to
    // the next criterion and a retirement notice sits in the gap between two. It is
    // the format's own line, not the criterion's, so it is allowed rather than
    // reported at the author who did nothing.

    // Whether a line is inside a bullet, and what separates a bullet's own second
    // paragraph from prose that has escaped it. Three states, because two are not
    // enough: a blank line does NOT end a bullet — a bullet may carry an indented
    // block after a gap, a shape several `## Gaps` entries already use and that no
    // criterion has needed yet. Refusing it would be a rule failing a correct
    // document the first time somebody writes one, which is the one thing this gate
    // is built not to do.
    let inBullet = false
    let prevBlank = false
    // Consecutive stray lines are one paragraph and get one finding. Reported per
    // line, the corpus's single violation arrived as four errors naming four line
    // numbers for one thing to move, which reads as four problems.
    let straying = false
    // The criterion's promise bullets, for the rule after the loop.
    const promises = []
    for (const e of body) {
      const i = e.i
      const l = e.text
      // A fenced block is content, not structure: a `- foo` line inside one is not a
      // bullet, and reporting the fence as a paragraph would advise moving a code
      // sample into `## Elsewhere`.
      if (e.kind === 'fence') { if (e.own) inBullet = false; prevBlank = false; straying = false; continue }
      if (e.kind === 'fenced') continue
      // A comment says something to whoever edits the file and nothing to whoever
      // reads the promise, and every other sweep in this gate exempts one by name —
      // the annotated spec in `references/spec-anatomy.md` is largely built out of
      // them, so an author has every reason to think they are free. Skipped without
      // touching a flag: what stands above and below it is as adjacent as it would be
      // if nobody had written the note.
      if (e.kind === 'comment') continue
      if (e.kind === 'blank') { prevBlank = true; straying = false; continue }

      // Indentation is what says "part of the bullet above", for a bullet and for a
      // paragraph alike. Applied to BOTH report branches: a nested sub-bullet opening
      // on a bold word — `  - **Reading** found it broken` — matches the slot pattern
      // and was refused for carrying a label this format does not know. Only a
      // single-word one, since `SLOT_RE` reads `[A-Za-z]+`, which is why the corpus
      // never tripped it and why a reader could not have found this by running it.
      //
      // Read against the body's own left edge, not against column 0. A body written
      // wholly at an indent — legal CommonMark under a `###` heading, which the
      // author has no reason to think otherwise — made every line "nested": both
      // branches then reported nothing and `verify:` closed nothing, so the rule
      // silently switched itself off on the one document shape it could not see. A
      // gate that goes quiet is this rule's own subject. `verifyNotLast` above never
      // had the fault, because it reads its level off the `verify:` bullet it found
      // rather than off the margin.
      const indented = !e.own
      const bullet = BULLET_RE.test(l)
      if (bullet) {
        straying = false
        prevBlank = false
        const slot = SLOT_RE.exec(l)
        if (slot && PROMISE_SLOTS.has(slot[1])) promises.push(e)
        if (slot && !BODY_SLOTS.has(slot[1]) && !indented) {
          out.strayBody.push({ id: ac.id, line: from + i + 1,
            message: `carries a \`**${slot[1]}**\` bullet, which this format does not know — a criterion body is written as ${[...BODY_SLOTS].map(x => `\`**${x}**\``).join(', ')} and its \`verify:\` line. The report reads the promise off those labels, so a bullet under any other name is not read at all` })
        }
        // A bold run that is a phrase gets its own message. It has a label as far as
        // its author is concerned, and being told to add one while looking at one
        // says the gate cannot read rather than that the line is wrong. The style is
        // all over `## Gaps` and `## Elsewhere`, which is why no criterion has
        // tripped it yet and why the first one to will be somebody writing normally.
        else if (!slot && !META_BULLET_RE.test(l) && !indented && BOLD_OPENING_RE.test(l)) {
          out.strayBody.push({ id: ac.id, line: from + i + 1,
            message: `opens on \`**${BOLD_OPENING_RE.exec(l)[1].trim().slice(0, 40)}**\`, which is a phrase where a label goes — a label is one word and the sentence follows it (\`- **Given** a cost centre with a budget\`). The report reads the promise off the label, so a bold run it cannot read as one is not read at all` })
        }
        else if (!slot && !META_BULLET_RE.test(l) && !indented) {
          out.strayBody.push({ id: ac.id, line: from + i + 1,
            message: `carries an unlabelled bullet ("${l.trim().slice(0, 40)}") — every bullet in a criterion says which part of the promise it is. Give it a label, or move it out of the criterion` })
        }
        // `verify:` closes the body: it cannot wrap, so prose under it continues
        // nothing, blank line or no blank line — which is this corpus's own violation
        // minus its blank line, and the first reading of this rule let it through.
        // `reason:` and `ticket:` are prose and wrap like any other bullet; assuming
        // otherwise here rejected three criteria that were written correctly.
        //
        // Only the criterion's OWN `verify:` closes it. An indented one is part of the
        // bullet above it like any other nested line, and treating it as the closer
        // ended the body early and reported that bullet's own wrap as loose prose —
        // the same nesting mistake this rule already had to be taught twice.
        inBullet = !(VERIFY_BULLET_RE.test(l) && !indented)
        continue
      }

      // Not a bullet. A wrap of the line above is legitimate and is the norm here; so
      // is an indented block after a gap. A paragraph at column 0 after a gap is
      // inside nothing, whatever came before it.
      //
      // A numbered item at the criterion's own edge continues nothing, gap or no gap:
      // CommonMark starts a new list at `1.`, so the gate and the rendered document
      // would otherwise disagree about where the bullet ends. Read as a wrap, it was
      // reported by nothing and folded into the promise sentence, where the word
      // ratchet failed the criterion for a length its `**Then**` does not have — the
      // message below exists for this shape and was unreachable in it.
      const numbered = !indented && ORDERED_RE.test(l)
      const continues = inBullet && (!prevBlank || indented) && !numbered
      prevBlank = false
      if (continues || straying) continue
      straying = true
      // A numbered item is refused like any other line the format has no place for,
      // but it is not a paragraph and calling it one names the wrong fix.
      out.strayBody.push({ id: ac.id, line: from + i + 1,
        message: ORDERED_RE.test(l)
          ? `carries a numbered item ("${l.trim().slice(0, 40)}") where the format has only labelled bullets — a criterion's parts are named rather than counted, so give it a label or move it out of the criterion`
          : `carries a paragraph ("${l.trim().slice(0, 40)}…") where the format has only bullets — a sentence about a neighbouring spec belongs in \`## Elsewhere\`, and one about the promise belongs in its \`**Because**\`. Loose prose here is read by nobody: the promise report sees only the labelled bullets` })
    }

    // The rules above ask what each line IS. This one asks whether the criterion says
    // anything at all that the report can carry, and it is the backstop under every
    // one of them: `parseSpecText` fills `slots` from the bullets at the body's edge,
    // and NOTHING read whether that list came out empty — a criterion whose promise
    // bullets are all read as detail of something else passed the gate in silence and
    // then failed to appear in the `--since` report when its `**Then**` was rewritten,
    // which is the failure PO-322 exists to refuse at the moment of writing.
    //
    // The shape that gets there is one bullet indented and another not: a body whose
    // `- verify:` sits at the margin while its promise bullets sit at column 2 has its
    // edge at the margin, so every promise bullet is nested and none is the
    // criterion's own. Reported as the mismatch it is rather than as an absence, at
    // the first promise bullet, because "carries no promise" said while the author is
    // looking at three of them is the gate saying it cannot read rather than that the
    // criterion is wrong — the same lesson as the bold-phrase message above.
    if (!promises.some(e => e.own)) {
      out.strayBody.push({ id: ac.id, line: promises.length ? from + promises[0].i + 1 : ac.line,
        message: promises.length
          ? `indents its promise bullets deeper than the rest of its body ("${promises[0].text.slice(0, 40)}") — a criterion's own bullets all stand at one indentation, and everything deeper than the shallowest of them is read as detail of the bullet above it. Written this way the promise is read by nobody: line them up with the \`verify:\` line`
          : `states no promise — a criterion is written as ${[...PROMISE_SLOTS].map(x => `\`**${x}**\``).join(' / ')}, and the report reads the promise off those bullets, so a criterion carrying none promises nothing that can be reported when it changes` })
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
  // Same shape and the same absence of a ratchet: the corpus was measured before
  // the rule was written, and the one violation it had was fixed in that commit.
  for (const v of m.strayBody) {
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
  const found = { unlabelledGaps: 0, longPromises: 0, compoundPromises: 0 }
  const worst = { unlabelledGaps: [], longPromises: [], compoundPromises: [] }
  for (const [spec, m] of forms) {
    for (const key of Object.keys(found)) {
      found[key] += m[key].length
      if (m[key].length) worst[key].push(`${spec.file}: ${m[key].slice(0, 3).join(', ')}${m[key].length > 3 ? ', …' : ''}`)
    }
  }
  const RULE = {
    unlabelledGaps: `a \`## Gaps\` entry sits under one of the labels ${GAP_LABELS.join(' / ')}`,
    longPromises: `a promise sentence runs to at most ${PROMISE_WORDS} words`,
    compoundPromises: `a \`**Then**\` or \`**And**\` states one outcome — a second one is its own \`**And**\``,
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

// -------------------------------------------------------------- register ----

/**
 * What the report says about the register beyond its errors — that a comparison did
 * not run, or what `--emit` wrote. Lines, not errors: neither is something to fix.
 */
const registerNotes = []

/**
 * The ids a reference names, with a range spelled out: `AC-3 to AC-5` is three
 * criteria, and a successor list that kept only its two ends would send a reader to
 * the edges of the promise and not to its middle.
 */
function criterionIds(list) {
  const ids = []
  for (const m of list.matchAll(/(to|through)?\s*AC-(\d+)/g)) {
    const n = Number(m[2])
    const last = ids.length ? Number(ids.at(-1).slice(3)) : null
    if (m[1] && last !== null) for (let k = last + 1; k < n; k++) ids.push(`AC-${k}`)
    ids.push(`AC-${n}`)
  }
  return ids
}

/**
 * Where a retired criterion's promise went, read off its retirement line with the
 * readings the reference check above already uses — `CROSS_REF` for a sibling's ids,
 * `OWN_REF` for this spec's — so the register cannot name a successor the gate would
 * not have resolved. The leading id is the one retired, and never its own successor.
 */
function successorsOf(spec, id, note) {
  const out = []
  const claimed = []
  for (const hit of note.matchAll(CROSS_REF)) {
    claimed.push([hit.index, hit[0].length])
    for (const ac of criterionIds(hit[2])) out.push({ feature: hit[1], criterion: ac })
  }
  for (const own of note.matchAll(OWN_REF)) {
    if (own[0] === id || claimed.some(([at, len]) => own.index >= at && own.index < at + len)) continue
    out.push({ feature: spec.feature, criterion: own[0] })
  }
  return out
}

/**
 * The corpus as the register reads it (`features.schema.json` on schemas.revenexx.com).
 *
 * It carries exactly what the register shows and nothing else, and that is what makes
 * it the bump rule's measure: the date a spec was touched, its intro, its gaps and the
 * `**Because**` under a promise never reach it, so editing them changes nothing here
 * and asks for no release. What does reach it is what a reader of the register would
 * see change. No timestamp, for the same reason — the file is a function of the
 * corpus, and `--emit` on an unchanged corpus has to write the same bytes. No `docs:`
 * either (RAD-359): they are paths in this repository, so renaming a doc page would
 * read as a register change and ask for a release, and the register would publish
 * paths nobody outside the repository can open. They stay in the spec, where the
 * docs link check reads them.
 */
function registerOf() {
  const norm = s => s.replace(/\s+/g, ' ').trim()
  const features = [...specs.values()].sort((a, b) => a.feature.localeCompare(b.feature)).map(spec => {
    const live = spec.acs.map(ac => ({
      n: Number(ac.id.slice(3)),
      entry: {
        id: ac.id,
        promise: norm(ac.title),
        steps: ac.slots.map(s => ({ keyword: s.label.toLowerCase(), text: norm(s.text) })),
        layers: ac.levels,
      },
    }))
    const retired = [...retirements(spec)].map(([id, gone]) => {
      const successors = successorsOf(spec, id, gone.text)
      return { n: Number(id.slice(3)), entry: { id, retired: true, note: norm(gone.text), ...(successors.length && { successors }) } }
    })
    return {
      feature: spec.feature,
      title: spec.title,
      ...(spec.summary && { summary: spec.summary }),
      where: spec.where,
      since: spec.since,
      visibility: spec.visibility,
      ...(spec.formerly.length && { formerly: spec.formerly }),
      criteria: [...live, ...retired].sort((a, b) => a.n - b.n).map(c => c.entry),
    }
  })
  return {
    $schema: 'https://schemas.revenexx.com/features.schema.json',
    format: '1',
    app: `${manifest.vendor}/${manifest.name}`,
    version: manifest.version,
    features,
  }
}

/**
 * The rows under the index's `## Retired features`, as `id → { line, reason }`, or
 * `null` where there is no index or no section. A row is a list item that opens on
 * the id in code, then a dash and the reason; its indented continuation lines belong
 * to it, so a row may wrap. An id anywhere else in the section — in a sentence, in a
 * row about another id — is not a row (RAD-359): the first reading accepted any
 * mention, so a removed spec passed on a sentence that happened to name it.
 *
 * A list item that opens on an id in code is a row its author meant to write, so one
 * with no reason is reported as such rather than skipped, which would leave its author
 * reading "is gone" about a feature they did record. Links and a bracketed ticket are
 * where its promises went and who decided; they are not the reason — a ticket id is
 * stripped bracketed or bare, by the config's `ticketPattern`.
 */
const ticketIdsRe = new RegExp(`(?<![\\w-])(?:${config.ticketPattern ?? '[A-Z][A-Z0-9]*-\\d+'})(?![\\w-])`, 'g')
function retiredRowsOf() {
  const section = readme === null ? null : splitSection(readme, REGISTER.retiredSection)
  if (!section) return null
  const rows = new Map()
  const lines = section.body.split(/\r?\n/)
  const where = n => `${config.specDir}/README.md:${section.bodyLine + n}`
  // A fenced block is an example, not a row, and an item nested in a row belongs to
  // that row. An item nested under a plain bullet (a year, a group) is still a row.
  // A fence closes only on its own marker with nothing after it, as in CommonMark.
  const LIST_RE = /^([ \t]*)[-*+][ \t]/
  const { fenced, unclosed } = fencedLines(lines)
  if (unclosed !== null) err(where(unclosed), `a fenced block under \`## ${REGISTER.retiredSection}\` is never closed — every line after it is read as part of the example, so no row below it counts`)
  let rowColumn = null
  for (let i = 0, blank = false; i < lines.length; i++) {
    // A lazy continuation line of a row is less indented than its items and does not
    // end the row. A paragraph or heading after a blank line does, as in CommonMark.
    if (!lines[i].trim()) { blank = true; continue }
    const afterBlank = blank
    blank = false
    if (fenced.has(i)) continue
    if (!LIST_RE.test(lines[i])) {
      if (rowColumn !== null && (/^ {0,3}#{1,6}(?:[ \t]|$)/.test(lines[i]) || (afterBlank && lines[i].search(/\S/) < rowColumn))) rowColumn = null
      continue
    }
    const nested = rowColumn !== null && lines[i].search(/\S/) >= rowColumn
    if (!nested) rowColumn = null
    const item = /^([ \t]*)[-*+][ \t]+`([^`]+)`(.*)$/.exec(lines[i])
    if (!item || nested) continue
    rowColumn = lines[i].indexOf('`')
    let text = item[3]
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j]
      if (!next.trim() || fenced.has(j) || LIST_RE.test(next) || next.search(/\S/) <= item[1].length) break
      text += ` ${next.trim()}`
    }
    const id = item[2].trim()
    const reason = /^\s*[—–-]\s*(.*)$/.exec(text)?.[1]
      .replace(/\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/<?https?:\/\/\S+/g, '')
      .replace(ticketIdsRe, '')
      .replace(/[\s,;.:()—–-]+/g, ' ')
      .trim()
    if (!reason || !/\p{L}/u.test(reason)) {
      err(where(i), `\`${id}\` under \`## ${REGISTER.retiredSection}\` gives no reason — after the id comes a dash and why it was retired, then the spec that carries its promises now, if any`)
    }
    if (rows.has(id)) {
      err(where(i), `\`${id}\` has a second row under \`## ${REGISTER.retiredSection}\` (the first is line ${section.bodyLine + rows.get(id).line}) — one row per id, so a reader finds one answer`)
      continue
    }
    if (specs.has(id)) {
      err(where(i), `\`${id}\` is retired under \`## ${REGISTER.retiredSection}\`, but ${config.specDir}/${specs.get(id).file} still exists — drop the row, or the spec`)
    }
    rows.set(id, { line: i, reason })
  }
  return rows
}
const retiredRows = REGISTER ? retiredRowsOf() : null

if (REGISTER && manifest) {
  // An alias names one feature, or a link to the old id lands on whichever spec the
  // register happened to read first.
  const aliasOf = new Map()
  for (const spec of specs.values()) {
    for (const old of spec.formerly) {
      if (aliasOf.has(old)) err(`${config.specDir}/${spec.file}`, `\`formerly: ${old}\` is also claimed by ${aliasOf.get(old).file} — an old id can lead to one feature only`)
      else aliasOf.set(old, spec)
    }
  }

  if (REGISTER.pinned !== undefined && PINNED !== REGISTER.pinned) err('spec.config.json', '`register.pinned` is not an object — `{ "<feature>": { "since": "x.y.z", "reason": "…" } }`')
  for (const [id, pin] of Object.entries(PINNED)) {
    if (!specFiles.includes(`${id}.md`)) err('spec.config.json', `\`register.pinned\` names \`${id}\`, which is no spec — drop the pin, or rename it with the spec`)
    if (!SEMVER_RE.test(pin?.since ?? '')) err('spec.config.json', `\`register.pinned.${id}.since\` is not a version — write it as x.y.z`)
    if (typeof pin?.reason !== 'string' || !pin.reason.trim()) err('spec.config.json', `\`register.pinned.${id}\` has no \`reason\` — a pin overrides history, so it says why`)
  }

  const emitted = registerOf()
  const written = `${JSON.stringify(emitted, null, 2)}\n`
  const target = join(root, REGISTER.file)

  if (emitting) {
    // Written only from a corpus the gate accepts: the register must never carry what
    // the format refuses, and the errors are reported below as in any run.
    if (!errors.length) {
      writeFileSync(target, written)
      registerNotes.push(`wrote ${REGISTER.file} — ${emitted.features.length} features at ${emitted.version}`)
    }
    else registerNotes.push(`${REGISTER.file} not written — the corpus has problems the register must not carry`)
  }
  else {
    const committed = existsSync(target) ? readFileSync(target, 'utf8') : null
    if (committed !== written) {
      // A raised version with no spec change is the common case, and Console refuses a
      // file whose version is not the manifest's, so the version stays in the compare
      // (RAD-359). Said as itself, because "not what the specs say" sends the author
      // looking through specs nobody touched.
      let onlyVersion = null
      try {
        const was = JSON.parse(committed ?? 'null')
        if (was?.version !== emitted.version && `${JSON.stringify({ ...was, version: emitted.version }, null, 2)}\n` === written) onlyVersion = was.version
      }
      catch { /* not JSON: stale like any other difference */ }
      if (onlyVersion !== null) {
        err(REGISTER.file, `is stale, but only in \`version\`: it says ${onlyVersion}, the manifest ${emitted.version}. Every version bump re-emits it — run \`spec-check --emit\` (\`npm run features\`) and commit the result with the bump`)
      }
      else err(REGISTER.file, `${committed === null ? 'is missing' : 'is stale — it is not what the specs say'}; run \`spec-check --emit\` (\`npm run features\`) and commit the result with the spec change`)
    }

    /**
     * The bump rule. A change to what the register shows has to ship as a version,
     * because the register is the versions that are live and a change that rode along
     * with no version of its own would never reach it — on every deploy it would be
     * the old text the register kept.
     *
     * Measured against the base's committed file rather than by re-reading the base's
     * specs: the base file is what the register was last given, which is the only
     * thing a change can be a change to. The version itself is left out of the
     * comparison, because raising it is the remedy and not the change.
     */
    const base = givenBase ?? (gitRead(['rev-parse', '--verify', '--quiet', 'origin/main^{commit}']) ? 'origin/main' : null)
    const sha = base && gitRead(['rev-parse', '--verify', '--quiet', `${base}^{commit}`])?.trim()
    // A base CI named and git cannot find fails, because in CI a skipped rule is a
    // green check proving nothing; only the local `origin/main` fallback may be absent.
    if (!sha && givenBase) {
      err('--base', `no such commit — ${givenBase}; the version-bump rule cannot run. Fetch the full history (\`fetch-depth: 0\` / \`GIT_DEPTH: 0\`), or drop \`--base\` to compare against \`origin/main\``)
    }
    else if (!sha) {
      registerNotes.push('no base to compare against (pass `--base <ref>`, or fetch `origin/main`) — the version-bump rule did not run')
    }
    else {
      const before = gitRead(['show', `${sha}:./${REGISTER.file}`])
      const shown = base === sha ? sha.slice(0, 7) : `${base} (${sha.slice(0, 7)})`
      // A base that IS the checked-out commit compares the working tree with itself: what
      // CI meets after a force-push, where `before` names nothing and the fallback lands
      // on HEAD. Locally it still sees uncommitted edits; in CI it can see nothing, and a
      // rule that checked nothing must not read as one that passed.
      if (sha === gitRead(['rev-parse', 'HEAD'])?.trim()) {
        registerNotes.push(`the base ${shown} is HEAD itself — the version-bump rule compares only uncommitted changes, and on a clean checkout it did not run`)
      }
      // Said aloud like a missing base: a rule skipped in silence reads as a pass.
      let baseVersion = null
      try { baseVersion = JSON.parse(gitRead(['show', `${sha}:./${REGISTER.manifest}`]) ?? '{}').version ?? null }
      catch { /* reported below, with the missing version */ }
      const noBaseVersion = `${shown}'s ${REGISTER.manifest} has no x.y.z \`version\` — the version-bump rule did not run`
      if (before === null) {
        // The first file is a register change like any other, and the one most easily
        // shipped without a release: nothing to compare reads as nothing changed. But a
        // version Console has approved is never given another round — a re-push reuses
        // the approved one and drops the file — so a first file under an old version
        // never reaches the register (RAD-359; customers#63 merged so at 4.11.1).
        if (!SEMVER_RE.test(baseVersion ?? '')) registerNotes.push(noBaseVersion)
        else if (semverCmp(manifest.version, baseVersion) <= 0) {
          err(REGISTER.manifest, `\`version: ${manifest.version}\` is not above ${shown}'s ${baseVersion}, and ${shown} has no ${REGISTER.file} — the first one starts the register, and it ships as a release like any register change: a version the platform already approved is never read again. Raise the version in this change`)
        }
        else registerNotes.push(`${shown} has no ${REGISTER.file} — the first one starts the register at ${manifest.version}`)
      }
      else {
        let was = null
        try { was = JSON.parse(before) }
        catch { registerNotes.push(`${shown} carries a ${REGISTER.file} that is not JSON — the version-bump rule did not run`) }
        if (was) {
          const key = f => JSON.stringify(f)
          const then = new Map((was.features ?? []).map(f => [f.feature, f]))
          const now = new Map(emitted.features.map(f => [f.feature, f]))
          const changed = [...now.keys()].filter(id => !then.has(id) || key(then.get(id)) !== key(now.get(id)))
          const gone = [...then.keys()].filter(id => !now.has(id))
          if (!SEMVER_RE.test(baseVersion ?? '')) registerNotes.push(noBaseVersion)
          else if ((changed.length || gone.length) && semverCmp(manifest.version, baseVersion) <= 0) {
            const what = [...changed, ...gone.map(id => `${id} (removed)`)]
            err(REGISTER.manifest, `\`version: ${manifest.version}\` is not above ${shown}'s ${baseVersion}, but what the register shows changed — ${what.slice(0, 5).join(', ')}${what.length > 5 ? ', …' : ''}. Raise the version in this change; a register change ships as a release or it never reaches the register`)
          }

          // A feature new since the base was promised by this change, so it ships with
          // the version this change carries — any other `since:` dates a promise to a
          // release that did not hold it. A renamed one is not new: its old id is in
          // the base, and its `since:` travels with it.
          for (const id of changed) {
            if (then.has(id)) continue
            const spec = specs.get(id)
            if (spec.formerly.some(old => then.has(old))) continue
            if (spec.since !== manifest.version) {
              err(`${config.specDir}/${spec.file}`, `is new since ${shown} and says \`since: ${spec.since}\` — a promise added in this change ships with ${manifest.version}`)
            }
          }

          // A feature that is gone left the register, and whatever pointed at it — a
          // help page, a learned mapping — needs to be told where it went. A rename
          // says so with `formerly:`; anything else is recorded in the index.
          for (const id of gone) {
            if (aliasOf.has(id)) continue
            if (!retiredRows?.has(id)) {
              err(`${config.specDir}/README.md`, `\`${id}\` was a feature at ${shown} and is gone — list it under \`## ${REGISTER.retiredSection}\` with the reason and where its promises went, or name it in the new spec's \`formerly:\` if it was renamed`)
            }
          }
        }
      }
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

for (const note of registerNotes) console.log(`  · register: ${note}`)

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
