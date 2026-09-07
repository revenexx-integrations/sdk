---
---

Test-only: restore the two `biome-ignore lint/nursery/noJsRestrictedProperties`
lines the PO-184/PO-185 merge lost.

`noJsRestrictedProperties` (the member-form guard on `globalThis.fetch`) arrived
on the PO-184 branch, which annotated every mock seam that existed *there*.
PO-185 landed on `main` first with two new seams of its own. Both branches were
green, git merged them without a textual conflict, and `main` came out red — a
new rule meeting new violations. No behaviour changed, so no release.
