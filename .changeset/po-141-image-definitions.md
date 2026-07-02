---
"@revenexx/integrations-node-sdk": minor
---

Add image definitions to nodes, credentials, and templates. A new `IImage` type
lets a package declare associated images (screenshots, logos, banners) via the
optional `images?: IImage[]` field on `INodeDescription`, `ICredentialDescription`,
and `ITemplateDescription`. The `rvnxx-nodes manifest` CLI now copies every
declared image file into `dist/` (preserving its sub-path) so `npm pack` ships
it automatically, warning — rather than failing — for declarations whose file is
missing on disk.
