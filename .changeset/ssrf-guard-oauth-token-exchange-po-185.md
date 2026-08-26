---
'@revenexx/integrations-node-sdk': patch
---

`BaseCredential.postForm` now goes through `safeFetch` instead of a raw `fetch`
(PO-185), so the `assertPublicUrl` SSRF guard covers every OAuth token exchange
the SDK offers — client-credentials, auth-code and refresh all funnel through it.
The token endpoint is not a constant: it comes from `tokenUrl(config)`, i.e. from
a value typed into a credential form, so without the guard a credential could
post its client secret at an internal address.

Three behaviour changes come with it.

**A token endpoint that resolves to a private or reserved address now fails**
with `NodeError('BLOCKED_ADDRESS')` where it previously completed. That is the
point of the change, but it is a break for anyone pointing an OAuth credential at
an internal STS — and there is no production opt-out: `safeFetch` exposes no
`lookup` option, and `RVNXX_SSRF_ALLOW_PRIVATE` is local-development only. Both
credentials that ship today are unaffected, because both take their host from a
hardcoded public constant rather than from config
(`login.microsoftonline.com` in `business-central`, `oauth.pipedrive.com` in
`pipedrive`); only the tenant path segment is config-derived. A credential that
does derive its *host* from config should expect the guard to apply.

A token exchange is now bounded by `DEFAULT_TIMEOUT_MS` in addition to
`ctx.signal`.

Redirects are followed manually with each hop re-checked and `Authorization`
dropped across an origin boundary — which means a 301/302 answer to the POST is
downgraded to a bodiless GET, per the usual redirect rules. Real token endpoints
do not redirect.
