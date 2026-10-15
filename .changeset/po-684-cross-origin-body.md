---
"@revenexx/integrations-node-sdk": minor
---

`safeFetch` refuses a 307 or 308 redirect that would resend a request body to another origin. The call fails with `BLOCKED_ADDRESS` before anything is sent there, and is not retried. The same redirect on the same origin is still followed with its body, and a 307 or 308 without a body is followed to any origin. Before, the body, an OAuth client secret or customer data included, went to whatever host the redirect named. A node whose target moves a POST to another host now fails with a message naming that host.
