---
'@revenexx/integrations-node-sdk': minor
---

A setting nested inside another one is typed as a full setting (PO-436).

`IConfigField.properties` and `IConfigField.items` were typed as
`IConfigFieldBase`, which carries no `properties` and no `items` of its own — so a
node declaring a list whose rows hold a choice, a switch or anything else that
needs more than the base members had to cast its items block (`as IConfigField`).
The manifest schema permits every one of those members on a nested setting and the
platform's config walker reads nested fields as first-class, so the type was the
only place saying otherwise.

Both are now `IConfigField`. Additive: a node that declared the narrower shape
still type-checks, and the casts written to get around it can go.
