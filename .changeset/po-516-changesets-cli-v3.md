---
'@revenexx/integrations-node-sdk': patch
---

PO-516: the release toolchain moves to Changesets CLI v3, and the action that drives it to v2.

Nothing this package exports changes. The release is deliberate rather than a
side effect: `publish.yml` runs only on `push: main`, so the one thing no pull
request can check is whether the new action opens the "Version Packages" pull
request as the GitHub App and pushes the protected release tag. An empty
changeset would have taken that path away — the action returns on
`All changesets are empty. Not creating PR` — and left PO-516 to roll out to
eleven further repositories on the strength of a green PR that never exercised
the release at all.
