# Which promises changed between two refs

`spec:check --since` reads the corpus at two points in history and says which promises were
**added**, **changed**, **retired** or **moved** — the question a release note asks, and the one
a diff of `specs/` cannot answer, because a diff names files and a rewritten promise looks
exactly like a reworded introduction.

```bash
npm run spec:check -- --since origin/main   # …against the working tree
npm run spec:check -- --since <a>..<b>      # …between two refs
npm run spec:check -- --since 2026-08-01    # …either side may be a date
```

The `--` is not decoration: without it the package manager keeps the flag for itself
and the gate runs as a plain gate, answering a question nobody asked. Where the repo
wires no script, it is `node scripts/spec-check.mjs --since …`.

A date resolves to the last commit before it on `HEAD`, and the header names both what was
typed and the commit it resolved to. Only `YYYY-MM-DD`, `yesterday`, `last week/month/year`
and `N days/weeks/months/years ago` count as dates; everything else is a ref, and an unknown
ref is an error rather than a guess — a mistyped ref answered with `HEAD` compared to itself
would report that nothing changed.

Symbols: `+` added · `~` stated differently · `!` **no longer proven** (`verify:` fell to
`todo` or `manual`) · `−` gone · `→` the same promise, now in another spec.

**What counts as a change is the promise, not the prose**: the criterion's title, its
`**Given**` / `**When**` / `**Then**` / `**And**`, and the levels its `verify:` claims. A
reworded `**Because**` or a retargeted `**Pair**` is not a changed promise — those slots explain
a promise rather than being one, and a report that counted them would say "everything changed"
after any pass over the corpus and stop being read. Where nothing moved it says so, and says
how many spec files changed anyway.

**A move is recognised only while the promise is untouched**, matched on its text and its
levels. Carry a criterion to another spec *and* edit it, and the report says retired and added,
because nothing can tell which of two edited promises the old one became.

**It is a report, not a gate.** It always exits 0 and belongs in no CI job that can fail: two
refs differ for good reasons, and which ones are legitimate is a reader's call. Reach for it
when writing a release note, when a review claims a change touched no promise, and when a
change that rewrites the corpus wholesale has to prove it kept every promise intact — the case
it was written for.
