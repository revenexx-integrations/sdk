# Project-local Claude Code skills

These skills are vendored copies of upstream skills from the
[`jeffallan/claude-skills`](https://github.com/Jeffallan/claude-skills)
marketplace (MIT-licensed). They are checked in so anyone working in
this repo gets the same guidance without needing to install the
marketplace plugin locally.

| Skill | Upstream | Used for |
|---|---|---|
| [`typescript-pro`](./typescript-pro/SKILL.md) | [link](https://github.com/Jeffallan/claude-skills/tree/main/skills/typescript-pro) | Type-system design, narrowing, generics, branded types |
| [`test-master`](./test-master/SKILL.md) | [link](https://github.com/Jeffallan/claude-skills/tree/main/skills/test-master) | Unit/integration/E2E test design, coverage, mocking |

## Usage

**Claude Code** auto-discovers these via the project-local `.claude/skills/`
convention. Invoke with `/skill <name>` or let Claude pick them up via
the trigger keywords in each SKILL.md frontmatter.

**GitHub Copilot** users: the same content is mirrored to
`.github/instructions/*.instructions.md` with `applyTo` globs so Copilot
picks it up automatically for matching files.

## Updating

These are vendored snapshots — they will not auto-update. To pull a
newer upstream version:

```bash
# Re-copy the skill from your local plugin cache (path may differ)
cp -r ~/.claude/plugins/cache/fullstack-dev-skills/.../skills/<skill>/* \
      .claude/skills/<skill>/
```

…and don't forget to update the matching `.github/instructions/*.instructions.md`
mirror.

## License

Upstream skills are MIT-licensed; see `LICENSE` inside each skill
directory. Original author: <https://github.com/Jeffallan>.
