---
'@revenexx/integrations-node-sdk': patch
---

PO-408: a declared output value says what is inside it by naming its path.

**`IOutputField` stays flat**, and that is now the decision rather than an
accident. A value inside a record is declared beside the record under a dotted
name: `counts` as `object` and `counts.added` as `number`. The studio offers
that name as a path into the value and the worker resolves it as one, so the
record a node emits must really be nested; a literal `"counts.added"` key is not
reached.

A nested member on `IOutputField` was weighed and set aside: the registry's
manifest schema refuses any key beside `dataType` and `description`, and the
studio reads nothing else, so it would have been three codebases changed for what
a dotted name already buys.

No type change, and nothing changes for an existing package. The manifest
carrying a dotted name through as one name is now promised
(`output-fields` AC-1). Declaring `counts.*` on compare-datasets, and recording
why json-transform and set-fields cannot declare their author-configured paths,
follows in *core*.
