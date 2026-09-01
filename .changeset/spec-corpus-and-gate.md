---
'@revenexx/integrations-node-sdk': patch
---

The behaviour this package has always had is now written down and held to it. Ten
feature specs state 82 promises across the egress guard, the request budget, response
reading, the retry primitive, the credential base classes, the manifest envelope, the
shipped image files, and the three helpers that settle what a node declares. Every
promise names a test that proves it, and `npm run spec:check` refuses a change that
moves one without the other.

**No shipped code changed in this release.** `dist/` is byte-for-byte what the previous
version published; the diff is specs, the gate that enforces them, and the tests that
carry the new tags. The version exists to mark the point from which a change to what
this package promises its consumers cannot land silently — from here, a promise that
moves brings its spec and its test with it, or the gate is red.

Three tests were found to be passing for the wrong reason while binding them, and are
fixed:

- **The redirect-bypass test never exercised the address guard.** It redirected
  `https` → `http` at a private target, which trips the downgrade check first — and both
  paths throw `BLOCKED_ADDRESS`, which was all the test asserted. It stayed green with
  the address guard switched off entirely. The hop now stays on `https`, so only the
  guard can refuse it.
- **`OAuth2AuthCodeCredential.resolve` with no refresh token** asserted only *that* it
  rejected. Without the guard clause the resolve goes on to post a refresh carrying no
  token, which fails against the network anyway. It now asserts the reason.
- **The manifest's "credentials are omitted when empty" promise** was bound to a test
  proving the opposite half. Emitting an empty block left it green.

None of the three changes behaviour — they close holes in the proofs of behaviour that
was already correct.
