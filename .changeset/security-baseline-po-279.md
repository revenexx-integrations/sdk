---
---

**No release.** Nothing here changes behaviour, so there is no version to bump.

The claim this changeset made before — that the published bundle is
byte-identical — was wrong, and Copilot was right to catch it. Three runtime
source files do change, because enabling the linter meant fixing what it found,
and the built bundle differs in exactly three places:

```diff
# dist/index.js
- const raw = policy.baseDelayMs * Math.pow(policy.factor, exponent);
+ const raw = policy.baseDelayMs * policy.factor ** exponent;

# dist/cli.js
- return normalized !== ".." && !normalized.startsWith(".." + sep);
+ return normalized !== ".." && !normalized.startsWith(`..${sep}`);
+       break;   // after a process.exit(1), i.e. unreachable
```

`**` is defined with `Math.pow`'s semantics, the template literal produces the
same string, and the `break` follows a `process.exit(1)`. So the bundle is not
byte-identical but is behaviourally identical, which is why this stays a
no-release changeset rather than becoming a patch.

Everything else is CI and documentation: the `Security Scan` workflow (gitleaks
over the git history, osv-scanner over the lockfile), every remaining action
pinned to a commit and both scanner images to a digest, a biome linter config
with a `Lint` step in CI, and `docs/security-scanning.md`.
