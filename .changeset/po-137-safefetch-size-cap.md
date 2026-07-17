---
"@revenexx/integrations-node-sdk": minor
---

Add response body size-cap + parsing helpers to the fetch module (PO-137): `readArrayBuffer`, `readText` and `readJsonOrText` enforce a hard byte cap (fast-reject on `Content-Length`, plus streaming enforcement since the header can be absent or lie), throwing `NodeError('RESPONSE_TOO_LARGE', …, { status })` on overrun. Adds `DEFAULT_MAX_RESPONSE_BYTES` (25 MiB) and a `maxBytesConfigField()` node config helper. These centralise the content-type sniffing previously duplicated across the HTTP/Upload/DeepL node sinks and guard the shared worker against a single oversized response exhausting its memory.
