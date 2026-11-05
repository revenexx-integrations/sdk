---
"@revenexx/integrations-node-sdk": major
---

A redirect refused for anything but where it points has a code of its own, `BLOCKED_REDIRECT`, instead of `BLOCKED_ADDRESS`: one that would resend a request body to another origin, one that downgrades `https` to `http`, and one whose `Location` cannot be read. `BLOCKED_ADDRESS` stays the code of a refused target — a private or reserved address, a host that does not resolve, a port not on the run's list. Neither is retried. A node that ends its run on `BLOCKED_ADDRESS` and routes every other code now routes these three refusals.

`Content-Type`, `Content-Encoding` and `Content-Language` no longer survive a redirect to another origin, and `headerCrossesOrigin` answers `false` for all three: they describe a body, and no body crosses an origin.
