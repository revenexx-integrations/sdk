---
'@revenexx/integrations-node-sdk': patch
---

PO-497: `maxBytesConfigField` says what the size cap is counted over.

The description 1.4.0 shipped — *"The limit this package enforces applies above
whatever is set here"* — read worse in English than its German did, and neither
half said the thing a workflow author needs before changing the number: the cap
bounds one answer, not a run. It now says so, in both languages, and says plainly
that a value above this package's own ceiling buys nothing.

Wording only. The key, the default and the bounds are untouched, and no other
setting changed.
