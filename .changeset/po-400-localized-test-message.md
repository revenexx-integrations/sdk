---
'@revenexx/integrations-node-sdk': minor
---

A connection test can answer in the studio's language: `ICredentialTestResult.message` is a `LocalizedString` now, like every other text a package shows (PO-400). A credential type returns `{ de, en }` for its own sentence; a plain string keeps working, for a pass-through such as a thrown error's text. The base class's missing-field message and the OAuth "configuration valid" message carry both languages. Code that reads `result.message` as a `string` has to accept the map — the platform resolves it per language rather than flattening it.
