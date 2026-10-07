---
"@revenexx/integrations-node-sdk": minor
---

`IConfigField.accepts` says what a value mapped into a setting has to be, such as `'array'` for a setting that wants an earlier step's list. The editor uses it to point the author at the outputs that fit (PO-594).

`IOutputField.label` names an output value for the author picking it in the editor, such as "Rechnungen" where the key is `invoices`.
