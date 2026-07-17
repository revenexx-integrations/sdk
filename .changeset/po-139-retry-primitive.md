---
"@revenexx/integrations-node-sdk": minor
---

Add a transport-agnostic retry/backoff primitive (PO-139): `withRetry`, `RetryableError`, `sleepWithSignal`, `backoffDelay`, `RetryPolicy` and `DEFAULT_RETRY_POLICY`, re-exported from the barrel. Connectors throw `RetryableError` (optionally carrying a server-dictated `retryAfterMs`) to opt an attempt into a retry; everything else is rethrown and terminal API errors modelled as values flow through unchanged. Backoff is exponential with full jitter, capped at `maxDelayMs`, and `Retry-After` takes precedence. The wait is abort-aware — cancelling the workflow (`ctx.signal`) stops the sleep and prevents any further attempt. No consumer changes; this is the shared mechanism connectors (BC/core/pipedrive) will adopt in follow-ups.
