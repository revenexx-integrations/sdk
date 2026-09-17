---
'@revenexx/integrations-node-sdk': minor
---

PO-497: two helpers stop handing back something the caller has to correct.

**`timeoutConfigField`, `retryConfigFields` and `maxBytesConfigField` return a
finished declaration.** `label` was a plain English string and there was no
`description` at all, in a stack whose node packages require every field an
author reads to carry a sentence and to be written in both languages — so a node
that spread a helper unchanged broke that rule at the moment it used the thing
built to help it. Around thirty call sites across four packages did. All four
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
`credentialShape()` is not. All eight `ApiKeyCredential` subclasses in the stack
override both — `core` (`token`), `deepl` (`authKey`), `pipedrive` (`apiToken`),
and `notifications` (`botToken` ×2, `webhookUrl` ×2, plus Telegram) — so nothing
in-tree moves. The two places that read `apiKey` out of a resolved blob belong to
`revenexx:api`, whose credential extends `SimpleValueCredential` and genuinely
has a field of that name; they are untouched. Released as a minor rather than a
major on that evidence — a subclass outside this stack that renames its form
field and relies on the `{ apiKey }` default would change, and that combination
is the defect itself.

The doc comment on `apiKeyField()` now says what it does *not* do, and each
config-field factory says what a node still has to supply: reading the configured
value back out in `execute` and passing it to `safeFetch`.
