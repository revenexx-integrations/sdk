---
"@revenexx/integrations-node-sdk": minor
---

Judge the address a connection lands on, not only the one that was checked (PO-184).

`assertPublicUrl` resolves a target's hostname and approves its addresses; the
connection that follows resolves the name **again**, on its own. A DNS answer
that differs the second time — public while the guard looks, private when the
socket opens — walked past the guard. That is DNS rebinding, and in this product
the workflow author supplies the URL *and* the DNS behind it, so the usual
precondition for it is met by default rather than by exception.

`safeFetch` now judges that second answer too. While a hop is in flight it
watches undici's `undici:client:connected` diagnostics channel for the host it is
reaching, runs the same address ruling over the connected socket's peer address,
and destroys the socket when it is private or reserved. The channel is published
synchronously, before the request is written, so a refused target receives no
request bytes — the refusal still surfaces as
`NodeError('BLOCKED_ADDRESS', …, { status: 0 })`, and still is not retried.

What this does not do: the TCP handshake — and for `https:` the TLS handshake —
with the refused address has already completed when the connection is judged.
Nothing of the request follows it, but a bare connection is observable to
whoever aimed the call there. `specs/ssrf-guard.md` records that, and the
worker's network egress policy remains the layer that does not depend on this
code being right.

Three things a consumer can observe, which is why this is not a patch:

- A call that only got through by rebinding now throws. No consumer could have
  depended on that without depending on a bypass of a documented refusal.
- The first `safeFetch` call installs a `diagnostics_channel` subscriber in the
  host process. It judges only hosts a `safeFetch` call is currently reaching, so
  the worker's own connections to internal services are untouched — that promise
  has a test of its own.
- `RVNXX_SSRF_ALLOW_PRIVATE` now relaxes both halves. Without that the local
  stack would pass the check and then lose its sockets.

Not a major, although the SemVer table would read "changed semantics" that way:
the behaviour that disappears is behaviour `specs/ssrf-guard.md` always refused,
and a security fix that every consumer has to opt into by hand is a security fix
that does not arrive.
