# Project-local Claude Code skills

Skills checked in so anyone working in this repo gets the same guidance without
installing anything. They come from two places, and the difference decides how each
one is updated and who owns it.

## Ours — Revenue Cloud skills, written in-house

Project-independent by design: they describe how we work across the whole Revenue
Cloud, not anything about this package.

| Skill | Source | Used for |
|---|---|---|
| [`feature-spec`](./feature-spec/SKILL.md) | `revenexx/skills-catalog` — `feature-spec`, via the Skill Registry | Keeping `specs/*.md` the single point of truth for promised behaviour, and binding every promise to a test |

**The gate itself is not installed here yet** — there is no `spec.config.json`, no
`specs/` and no `spec:check`, which is what still separates this repository from its
four siblings. That is [PO-368](https://linear.app/revenexx/issue/PO-368); the skill
ships the installer for it under `scripts/install.mjs`. Until then the format rules in
`SKILL.md` hold, simply unenforced.

### Updating

```bash
revenexx skills add revenexx/skills-catalog feature-spec
```

The registry knows which version is installed, so nothing has to be written down here
to keep it honest:

```bash
revenexx skills show revenexx/skills-catalog feature-spec   # Latest / Installed
```

If the gate is installed later, re-syncing the skill means copying
`assets/spec-check.mjs` over `scripts/spec-check.mjs` in the same pass — the registry
does not do that, and the two copies parting is the failure to watch for:

```bash
diff scripts/spec-check.mjs .claude/skills/feature-spec/assets/spec-check.mjs
```

There is no `ticket` and no `pull-request` skill here. Their rules reach this
repository through the global `CLAUDE.md` instead, in the short form that file carries
for repos without the skill.

## Theirs — MIT-licensed marketplace skills

Vendored copies of upstream skills from the
[`jeffallan/claude-skills`](https://github.com/Jeffallan/claude-skills) marketplace.

| Skill | Upstream | Used for |
|---|---|---|
| [`typescript-pro`](./typescript-pro/SKILL.md) | [link](https://github.com/Jeffallan/claude-skills/tree/main/skills/typescript-pro) | Type-system design, narrowing, generics, branded types |
| [`test-master`](./test-master/SKILL.md) | [link](https://github.com/Jeffallan/claude-skills/tree/main/skills/test-master) | Unit/integration/E2E test design, coverage, mocking |

These two carry a `LICENSE` inside their own directory, and only these two — the
in-house skill above is internal and has none.

### Updating

These are vendored snapshots — they will not auto-update. To pull a newer upstream
version:

```bash
# Re-copy the skill from your local plugin cache (path may differ)
cp -r ~/.claude/plugins/cache/fullstack-dev-skills/.../skills/<skill>/* \
      .claude/skills/<skill>/
```

## Usage

**Claude Code** auto-discovers all three via the project-local `.claude/skills/`
convention. Invoke one with `/<name>`, or let Claude pick it up from the trigger
keywords in its `SKILL.md` frontmatter. `feature-spec` also answers to a ticket id, a
spec path or a feature area — `/feature-spec PO-368` — and resolves one of four modes
from it.

**GitHub Copilot** sees none of them. The siblings mirror the two marketplace skills
to `.github/instructions/*.instructions.md` with `applyTo` globs; this repository has
no such directory, and the sentence claiming it did was wrong before this line
replaced it.

## License

`typescript-pro` and `test-master` are MIT-licensed; see the `LICENSE` inside each of
those two directories. Original author: <https://github.com/Jeffallan>.
`feature-spec` is Revenexx-internal.
