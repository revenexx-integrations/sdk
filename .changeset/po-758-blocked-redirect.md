---
"@revenexx/integrations-node-sdk": major
---

A redirect that would resend a request body to another origin is refused with a code of its own, `BLOCKED_REDIRECT`, instead of `BLOCKED_ADDRESS`, which now only means a private or otherwise refused target. It is still not retried. A node that tells the two apart by code sees the new one; one that matched `BLOCKED_ADDRESS` for every refusal has to add it.

`Content-Encoding` and `Content-Language` no longer survive a redirect to another origin, and `headerCrossesOrigin` answers `false` for both: they describe a body, and no body crosses an origin.
