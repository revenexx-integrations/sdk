---
"@revenexx/integrations-node-sdk": minor
---

Add optional `groups` to `INodeDescription`: a curated node-picker group path
(localized labels, outermost first, max 4 levels), e.g.
`[{ en: "Business Central" }, { en: "Sales Orders" }]`. The manifest CLI
carries it verbatim; pickers without it keep deriving groups from the package
and category.
