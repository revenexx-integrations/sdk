---
'@revenexx/integrations-node-sdk': minor
---

A setting nested inside another one is typed as a full setting (PO-436).

`IConfigField.properties` and `IConfigField.items` were typed as
`IConfigFieldBase`, which carries no `properties` and no `items` of its own — so a
nested setting could not itself group or repeat. That is the ordinary case, not an
exotic one: `items.type: 'object'` plus `items.properties` is the repeating row
every mapping-style setting is built from, and it needed a cast (`as IConfigField`)
to type-check. The base's own members (`options`, `default`, `required`,
`description`, `showIf`) were always available on a nested setting; only the
nesting stopped at one level. The manifest schema permits it and the platform's
config walker reads nested fields as first-class, so the type was the only place
saying otherwise.

Both are now `IConfigField`. Additive: a node that declared the narrower shape
still type-checks, and the casts written to get around it can go.
