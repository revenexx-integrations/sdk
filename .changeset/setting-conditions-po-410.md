---
"@revenexx/integrations-node-sdk": minor
---

Add `showIf` — a setting that says when it applies (PO-410).

`IConfigField` gains an optional `showIf`: another setting's `key`, an `op` from
the shared comparison vocabulary, and the `value` to compare against. A node
that has a **Source** select and a field only read under one of its choices now
says so once in its manifest, instead of explaining it in prose under the field
— which the author reads last, having already filled it in.

```ts
{ key: 'path', label: 'Path to the date', type: 'string',
  showIf: { key: 'source', op: 'equals', value: 'field' } }
```

New exports beside it:

- `OPERATORS` / `Operator` / `isOperator` / `takesValue` — the fourteen
  comparison words, which are the same ones a condition node offers an author.
  They were written for those nodes and lived in `integrations-nodes-core`; a
  settings condition needs the same list, so it moved here and the node package
  re-exports it. One vocabulary, three readers.
- `evaluate(left, op, right)` — what each word means. The answer table in
  `src/operators.test.ts` is the canonical statement of it, and is what the two
  implementations outside this package (the editor drawing the field, the
  platform validator deciding whether to demand it) are checked against.
- `settingApplies(field, config)` — whether a setting applies given what is
  filled in so far. A field with no condition always applies.

Additive: a node that says nothing behaves exactly as before, and so does a
reader of the manifest that does not know the key. **Minor**, not major —
`showIf` is optional and nothing existing changes shape.

Two limits worth knowing before reaching for it. The driving key must be a
literal, the same rule `dependsOn` already carries, and the platform's manifest
constraints refuse a condition against an `expressionAllowed` field. And the
editor honours this only from the studio version that ships PO-410's second
half; until then a conditioned field is simply drawn as it is today.
