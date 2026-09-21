---
'@revenexx/integrations-node-sdk': minor
---

PO-497: two helpers stop handing back something the caller has to correct.

**`timeoutConfigField`, `retryConfigFields` and `maxBytesConfigField` return a
finished declaration.** `label` was a plain English string and there was no
`description` at all, in a stack whose node packages require every field an
author reads to carry a sentence and to be written in both languages — so a node
that spread a helper unchanged broke that rule at the moment it used the thing
built to help it. Every node package in the stack that reaches a host did — 74
files across six of them as of this release. All four
settings the three factories produce now carry `label` and `description` as
`{ en, de }`. Nothing else about them changed: the keys, the defaults and the
bounds are what they were, so upgrading is enough and no call site has to move.

`maxBytesConfigField` was not named in the ticket and is included anyway — it
sits three lines above the other two with the identical defect, and leaving it
would have left the next caller one trap to walk into.

**`ApiKeyCredential.credentialShape()` now defaults to the name
`apiKeyField()` returns**, instead of always `{ apiKey }`. Overriding
`apiKeyField()` alone used to change only which form field was *read*; `resolve()`
went on emitting `apiKey`, so a credential whose form says `botToken` handed the
node a blob it could not read the key out of, and a perfectly good token was
refused as a bad credential. No node test can see this — the devkit seeds the
*resolved* blob and never calls `resolve()` — which is why it is fixed rather
than documented.

**This is a behaviour change, and the one case it alters is the broken one.** It
changes what a subclass emits only where `apiKeyField()` is overridden and
`credentialShape()` is not. All nine `ApiKeyCredential` subclasses in the stack
override both — `core` (`token`), `deepl` (`authKey`), `pipedrive` (`apiToken`),
`shipcloud` (`apiKey`) and `notifications` (`botToken` ×3, `webhookUrl` ×2) — so
nothing in-tree moves. Two places read `apiKey` out of a resolved blob and
neither is touched: `revenexx:api`, whose credential extends
`SimpleValueCredential` and genuinely has a field of that name, and `shipcloud`,
whose credential is an `ApiKeyCredential` that overrides both hooks and calls its
field `apiKey` anyway. Released as a minor rather than a major on that evidence — a subclass outside this stack that renames its form
field and relies on the `{ apiKey }` default would change, and that combination
is the defect itself.

The doc comment on `apiKeyField()` now says what it does *not* do, and each
config-field factory says what a node still has to supply: reading the configured
value back out in `execute` and passing it to `safeFetch`.
