---
"@revenexx/integrations-node-sdk": minor
---

`safeFetch` refuses a redirect that would resend a request body to another origin: a 307 or 308, and a 301 or 302 on PUT, PATCH or DELETE, which keep their method and body as well (a POST still becomes a bodiless GET on 301/302/303). The call fails with `BLOCKED_ADDRESS` before the other host is looked up or sent anything, and is not retried. The same redirect on the same origin is still followed with its body, and one whose body is empty, or that has none, is followed to any origin. Before, the body, an OAuth client secret or customer data included, went to whatever host the redirect named. A node whose target moves a POST to another host now fails with a message naming that host.
