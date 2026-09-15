---
---

Catalog-only: the Backstage entity moves to `lifecycle: production` and declares
`consumesApis: [integrations-api]`.

`catalog-info.yaml` is Backstage metadata and is not part of the published
package, so no release.

Note that `integrations-api` and the `integrations` service that provides it are
both still `lifecycle: experimental`, as are the four sibling node packages — the
graph will show a production library consuming an experimental API until those
entities are promoted in their own repos.
