---
"@revenexx/integrations-node-sdk": patch
---

`safeFetch` refuses a header value with a character the runtime will not send inside it (any control character but the tab, or one beyond Latin-1) as `INVALID_HEADER`, naming the header and not the value, before any request or DNS lookup and without retrying. The runtime's own refusal quoted the whole value — usually a key — and a node's error output carried it into the run history. A value with a line break only at either end is still sent, as before (PO-752).
