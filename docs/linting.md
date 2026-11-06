# Linting: why `biome.json` looks the way it does

`biome.json` (schema **2.5.x** — the 1.9 shape is a different config format) enables
the **linter only**. The rules an agent has to obey are in [`../CLAUDE.md`](../CLAUDE.md);
this page keeps the reasons, so the guide every session loads does not have to.

## The `fetch` rules

**The rule the file exists for is `style/noRestrictedGlobals` on `fetch`.** This is the
package that defines `safeFetch` and `assertPublicUrl`, and PO-185 was a raw `fetch` in
`src/credentials.ts` posting OAuth client credentials at a URL taken from credential
config — no SSRF guard.

**`src/fetch.ts` is the one sanctioned exception** (`timedFetch`, called by
`guardedFetch` *after* the guard has run) and is excepted via `overrides`. Adding a
second exception means adding a second way to bypass the guard.

**That rule matches the bare `fetch` identifier only**, so `globalThis.fetch(…)` walks
past it — found in the PO-184 review. The member form is covered by
`nursery/noJsRestrictedProperties` (`globalThis.fetch` / `global.fetch`, which also
catches `globalThis["fetch"]` and destructuring, but not an alias through a variable).
It is a *nursery* rule: a biome bump may promote it and change the category, which
breaks the `biome-ignore lint/nursery/…` lines in the test files loudly rather than
silently.

Those ignores are per-line on purpose, so the exception is visible where it is taken
instead of widening a file:

- five at the mock seams that save the global to restore it;
- two on the AC-18 tests that need a connection `safeFetch` did not ask for;
- two in `src/fetch.ts` itself, where `transport` reads the global only to recognise a
  test's stub of it (IN-40).

## Why `safeFetch` sends through undici's own `fetch`

**`safeFetch` sends through undici's own `fetch`, not the runtime's** (IN-40). The
guarded dispatcher is an `Agent` from the SDK's own undici, and the runtime's `fetch` is
built on whichever undici that Node bundles — Node 26 refused the pairing and every
request failed. The same split runs the other way for a body: the runtime's `FormData`
is not undici 8's, so `safeFetch` copies it before sending (IN-62).

A `fetch` placed in the global *after* the SDK loaded is a test's stub and is called
instead, which is the seam every node package's suite intercepts through.

## Why the formatter is off

Biome disagrees with this repo's hand-wrapped source in 13 to 17 of 22 files depending
on `lineWidth` (13 at its narrowest useful setting, 17 at the siblings' 200) — unlike its
sibling node packages, the SDK was never biome-formatted. Turning it on is a repo-wide
reformat: fine as its own commit, never as a passenger on another change. The sibling
packages' `indentStyle`/`lineWidth` values stay in the file for whoever does it.

## Why there are no comments in `biome.json`

**`biome.json` does not accept `//` comments, and fails silently.** Biome falls back to
its built-in defaults with no error, which looks like a working config while the `fetch`
rule is off and the formatter is reformatting to tabs. Comments would need the file
renamed to `biome.jsonc`, which the three sibling repos do not do.
