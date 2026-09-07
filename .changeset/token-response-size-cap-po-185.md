---
'@revenexx/integrations-node-sdk': patch
---

`BaseCredential.postForm` now reads the token endpoint's answer through
`readText` under a 1 MiB cap instead of a bare `res.text()` (PO-185), so an
OAuth token exchange can no longer read an answer of any size into the worker.

This is the half of PO-185 that the previous change did not close. `safeFetch`
hands back a `Response`; reading it is the caller's job, so routing `postForm`
through the guard bounded where the request could go and how long it could take,
but not how much came back. It is the one answer in the package that no node's
settings stand in front of — nobody chooses a cap for a credential resolve — and
it is read on every first use and every refresh, in a worker every workflow
shares.

**An answer past the cap now fails** with `NodeError('RESPONSE_TOO_LARGE')`
where it previously succeeded, and the same holds for a refusal: both branches
read one string, and an error body from a token endpoint is the less predictable
of the two. The figure is deliberately far below `DEFAULT_MAX_RESPONSE_BYTES` —
an OAuth token response is a small JSON object, and even an `id_token` with a
fat claim set is tens of kilobytes — and it is not a setting, because there is no
node author and no workflow author in front of this call to offer it to. Nothing
that ships today comes near it.

The RFC 6749 §5.2 error extraction is unchanged: a failure still carries only
`error` and `error_description`, never the raw body.

Alongside it, `readArrayBuffer`'s `Content-Length` fast-reject now discards the
body before it throws, so a refused answer releases its connection instead of
leaving it held. That exit was the only one out of a read that did not — the
streaming overrun cancels, and `safeFetch` already cancels a redirect body ahead
of every throw path — and it was unreachable until now, because `res.text()`
always consumed the body on its way to the same failure. Routing `postForm`
through a capped read is what reaches it, on the call this changeset is about.
