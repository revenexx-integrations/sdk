---
---

No release: this change ships no runtime code. It adds the `Security Scan`
workflow (gitleaks over the git history, osv-scanner over the lockfile), pins
every remaining action to a commit and both scanner images to a digest, adds a
biome linter config plus a `Lint` step in CI, and documents the whole thing in
`docs/security-scanning.md` — the published bundle is byte-identical.
