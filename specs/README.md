# Feature specs

What this package promises the code that depends on it, one spec per surface. Every
promise here is bound to a test that proves it; `npm run spec:check` holds the two
together in both directions.

**A surface here is one export, or one closely-bound family of exports, that a node
author reaches for by name.** This package has no screen: its consumers are the four
node packages and the worker, and they reach a promise by importing a name and calling
it. So the exported name is the address, which is why a criterion may write
`safeFetch` where a spec for a product with a UI would write the label on a button.
What stays out is the machinery behind the name — that is `docs/`, and
[`spec.config.json`](../spec.config.json) carries the boundary as `audience`.

## Specs

### Reaching a host

- [`ssrf-guard.md`](ssrf-guard.md) — what a request is allowed to reach: which targets
  are refused before a request is made, how each redirect hop is judged again, and what
  a refusal is allowed to tell the caller
- [`request-budget.md`](request-budget.md) — what one request may cost: how long an
  attempt may take, how often it is retried, how cancellation ends it, and how both
  budgets reach a workflow author as bounded settings
- [`response-reading.md`](response-reading.md) — reading what came back: the byte cap
  and where it is enforced, what is parsed as JSON and what is not, and the ceiling
  neither a node nor a workflow author can raise
- [`redirect-following.md`](redirect-following.md) — what a redirect does to the
  request: how many hops are allowed, what an unreadable target costs, and how the
  method and body change on the way

### Doing work that may fail

- [`retrying-an-operation.md`](retrying-an-operation.md) — asking again when it might
  work: which failures are asked twice, how the wait between attempts grows, and how a
  cancellation lands during one

### Acting as somebody's account

- [`credentials.md`](credentials.md) — standing in for the person who owns the account:
  what each credential kind hands a node, where a token endpoint may be reached, what a
  rotated refresh token obliges, and what a refusal may repeat

### What a node reaches while it runs

- [`workflow-state.md`](workflow-state.md) — what a workflow remembers between runs: the
  four roles a namespace can have, what each answer obliges a node to handle, and how much
  of the store this package does *not* hold

### What a built package hands over

- [`package-manifest.md`](package-manifest.md) — what a package tells the registry: the
  envelope, what appears only when a package has it, and what is taken from a package's
  own metadata
- [`node-images.md`](node-images.md) — the pictures a package ships: what is collected,
  what reaches the build, and which paths are refused

### What a node declares

- [`author-time-resolution.md`](author-time-resolution.md) — settings a node works out
  while somebody is editing: which markers reach the manifest, and how much of this
  mechanism this package does *not* hold
- [`setting-conditions.md`](setting-conditions.md) — a setting that says when it
  applies: the condition, the comparison vocabulary it is written in, and the two
  codebases that honour it rather than this one
- [`localized-text.md`](localized-text.md) — reducing a label to the one word that gets
  drawn, and what happens when the language asked for was never written
- [`credential-type.md`](credential-type.md) — which credentials a node will accept, and
  why every reader sees the same list however the node wrote it

## What is not promised yet

Three surfaces, and they have one thing in common: not one of them has a test to point
at, which is why none of them could be backfilled.

- **The node and credential contract** — what `INode`, `INodeDescription`,
  `INodeContext` and `ICredential` guarantee whoever implements them, the iteration
  capability, and the *Key design constraints* in [`../CLAUDE.md`](../CLAUDE.md) that
  read as promises today while living in a file nothing enforces. The largest promise
  surface in the vertical. One member of the run context is carved out of this row and
  promised in [workflow-state.md](workflow-state.md), because it is the only one with
  tests to point at; the signal, the secrets and the credentials a run is handed are
  still here.
- **The error contract** — when a node throws and when it routes to an error port, and
  what `NodeError` obliges either way. Stated in `../CLAUDE.md`, held by nothing.
- **The `rvnxx-nodes` CLI** — which every node package's build runs, and which has no
  test file at all.

The guardrail this corpus is written under seeds a criterion only from behaviour
somebody can point at, so a spec for any of these is test work before it is spec work.
That is the shape the next ticket should take.

**None of these has a row yet, and that is the honest state rather than an omission.**
A row here names the ticket that will promise its surface, and no such ticket has been
filed — carving the rest of this package into surfaces is a decision somebody has to
make, not a line to invent here. The ticket that installed this gate is history in
`ssrf-guard.md` and cannot stand in for them.

## How a spec is cut here

The rule is the `feature-spec` skill's `## One spec per surface`. What the rule leaves
to judgement was decided once, at the backfill this corpus arrived in, and is recorded
here so the next author inherits the call instead of re-arguing it. Every entry below is
a cut this package could defensibly have made the other way.

- **`safeFetch` is three specs, and the export is not the unit — the goal is.** Where a
  request may go ([ssrf-guard.md](ssrf-guard.md)), what a hop does to it
  ([redirect-following.md](redirect-following.md)) and what it may cost
  ([request-budget.md](request-budget.md)) are three things a reader comes looking for
  separately, and each would be buried inside a spec that answered all three. The cut
  follows item 3 without the split it describes: there was never a single file to grow
  past a dozen promises, because the three goals were already visible when the corpus
  was backfilled. What this costs is stated in the register below — no one of the three
  may be read as the whole of what that name promises.
- **Asking again is its own surface, not part of what one request costs.** The budget
  spec promises how many attempts there may be;
  [retrying-an-operation.md](retrying-an-operation.md) promises which failures are asked
  twice at all, how the wait between attempts grows, and where a cancellation lands.
  The deciding evidence is that `withRetry` has **no caller inside this package**: it is
  an export a node author reaches directly, around an operation that need not be a
  request, so its promises cannot live in a spec about one request without becoming
  invisible to the people they are for.
- **Reading the answer is a second goal, and the file boundary follows the word.** A
  budget is what a caller may spend and a cap is what an answer may weigh — the
  distinction *Words these specs use* draws below — so
  [response-reading.md](response-reading.md) is where the cap and its ceiling live, and
  [request-budget.md](request-budget.md) is where the budgets do. Both specs have a
  criterion about a caller asking past a ceiling, and they are about different ceilings;
  one file would have made that read as one promise.
- **The five credential base classes are one spec; the declaration that names them is
  another.** [credentials.md](credentials.md) is what each kind hands a node —
  item 1, one surface for a closely-bound family. [credential-type.md](credential-type.md)
  is a different goal with a different reader: what a node *will accept*, read by the
  editor when somebody picks a connection and by the engine when it decides whether a
  saved workflow still holds together. Not a size split — that spec has two criteria.
- **The manifest and the pictures it points at are two specs, because they fail
  differently.** [package-manifest.md](package-manifest.md) is the envelope a package
  hands the registry; [node-images.md](node-images.md) is what a declared path is
  allowed to reach at build time and what a bad one costs. The declaration travels in
  the manifest and the file is copied beside it, so one spec was defensible — but the
  whole of the second is about a risk the first does not have.
- **[author-time-resolution.md](author-time-resolution.md) was written although two
  criteria is all this package can be held to.** The alternative was leaving the surface
  out and letting the register of what is not promised yet carry it. It was written
  because the omission would have hidden the more useful fact: the rule the whole
  mechanism depends on lives in the node-runtime host, and a spec that says so out loud
  is worth more than a row saying nothing is promised. A spec that is mostly gaps is the
  honest result here rather than an unfinished one.
- **What a run remembers is a spec although the context it arrives on is not.**
  `INodeContext` sits in the register above as unpromised, and its state member is a spec
  of its own — item 5, named after the surface. What decided it is the guardrail rather
  than the granularity: state is the only member of that context with tests to point at,
  so it is the only one that could be backfilled without inventing promises. The cost is
  that a reader of the register has to be told which part was carved out, which is why
  that entry now says so.
- **The setting that names a namespace stayed in that spec instead of joining *What a node
  declares*.** A `state-ref` field and the calls it feeds are one subject — a node names a
  namespace only in order to reach it — and splitting them would have put the marker in one
  spec and every promise about the answers in another. Item 1, and *when in doubt, one
  spec*. What it costs is visible in the surface register below: the marker has no row,
  because nothing here promises it means anything, and only [package-manifest.md](package-manifest.md)
  AC-1 carries it as far as the registry.
- **The inventory is grouped by goal, and no group mirrors a source file.** *Reaching a
  host*, *Doing work that may fail*, *Acting as somebody's account*, *What a built
  package hands over*, *What a node declares* — a reader arrives with a task rather than
  with a module, and a group named after a file would be the one thing in this index that
  goes stale on a rename. The groups are the index's own; a filename still names its
  feature and never its group.

## Words these specs use

Conventions this corpus was already following before anybody wrote them down, recorded
so the next author follows them too.

**This is neither of the registers, and the line between them is the source.** A word
here is one *we* had to settle, because nothing else does: this package has no screen,
so no label decides whether the thing that spends a budget is a call or an attempt. A
name in the section below is one the package already settled by exporting it, and is
only looked up — so a word here can be argued about and changed by agreement, while a
name there changes when the export does and never otherwise. And neither is *What is
not promised yet* above: that one records surfaces carrying no promise, not what things
are called.

- **A call contains attempts; an attempt contains hops.** A *call* is one invocation of
  an export. An *attempt* is one try inside it — what the retry budget counts. A *hop*
  is one request inside an attempt — what the redirect limit counts. The hierarchy is
  already load-bearing: `request-budget.md` promises a budget "per attempt and per
  redirect hop, not a cap on the whole call", and a criterion that writes *request*
  where one of the three is meant reads as a promise about the whole call and is not.
- **A budget is what a caller may spend; a cap is what an answer may weigh; a ceiling
  is what neither may raise.** The three are distinct on purpose — `request-budget.md`
  AC-3 and `response-reading.md` AC-5 both exist because a caller asked past a ceiling.
  The one exception is deliberate: the *ceiling* in `retrying-an-operation.md` AC-4 is
  where a growing wait stops growing, which is what a backoff ceiling is called
  everywhere, and nobody was refused anything. (`spec.config.json` has a third
  `ceiling` again — the gate's word for what no test here can prove. That one is the
  gate's vocabulary, not this corpus's.)
- **A reader is a person in `localized-text.md` and a codebase everywhere else.** There
  it is somebody looking at a drawn label; elsewhere it is the editor, the engine or
  the registry reading a manifest. Both stay: the first is the only spec about what
  somebody sees, and renaming the second would make `credential-type.md`'s "every
  reader sees the same list" false in the case it is about. Where either could be
  meant, name the one you mean.
- **A node author, a workflow author and an operator are three people, not three words
  for one.** The *node author* writes a node package and reaches these exports by name
  — the audience `spec.config.json` declares. The *workflow author* builds a workflow
  in the editor and meets this package only through a setting a node chose to offer.
  The *operator* watches a run and reads the failure. The split is what
  `request-budget.md` AC-9 is about: bounds exist because the person declaring them and
  the person typing into them are different people.
- **A caller is code, not a person.** Whatever invoked the export — usually a node, and
  not always: `credentials.md` AC-6 has the OAuth token exchange calling `safeFetch`.
  Write *a node* where the promise is a node's, *a caller* where it is not.
- **The parts downstream have one name each.** *The worker* is the process a run
  executes in, shared by every workflow — it is what every ceiling protects. *The
  engine* runs a workflow: it passes the signal, routes on ports, and decides whether a
  saved workflow still holds together. *The editor* is where a workflow is authored and
  what draws the palette. *The node-runtime host* is where a resolver actually runs
  while somebody is editing — not the editor, which asks: this is what imports the
  package and answers. *The registry* is what a package is registered with, and the
  only reader of the manifest. *The platform* is all of them taken together, and is
  right only where no single one is meant.
- **A credential is a *kind* in prose and a `credentialType` in the identifier.** The
  identifier cannot change and the prose should not fight it, but "type" reads as a
  TypeScript type in a package that is mostly types — so the specs say kind, and the
  one export that reads the declaration keeps its name.
- **State is two different things, and both keep the word.** In
  [credentials.md](credentials.md) it is the OAuth `state` parameter, which the protocol
  names and nobody here may rename; in [workflow-state.md](workflow-state.md) it is what a
  workflow remembers between runs, which is the word the package exports. Where either
  could be meant, write *the OAuth state* or *the state store*. Within the second: a
  *namespace* is where one kind of state lives, the *store* is all of a tenant's
  namespaces, and the four roles are `mapping`, `cursor`, `dedupe` and `digest` — that last
  set is looked up rather than settled here, because the values are the package's own, and
  `claim` is the dedupe role's operation rather than a fifth role.
- **A node is the thing on the canvas; a step is that node while the engine runs it.**
  Borrowed whole from the studio's specs, where the product draws the line. This corpus
  almost never needs the second word, because it speaks about what a node declares and
  what a caller spends rather than about a run in progress — so *node* is nearly always
  the right one.

**Unsettled, and recorded rather than decided: what a node offers its author.** These
specs say *setting*, the interface is `IConfigField`, and the studio draws "Options of
this node". Three words for one thing, and the third is the one somebody reads on a
screen — which makes it the studio's to settle and not ours. Written down so the next
author knows the disagreement is real and does not quietly add a fourth.

## The surfaces, and what the product calls them

A surface is named **once, by the package**, and every text about it uses that name:
these specs, a ticket, a pull request, a commit body. Words the package leaves open —
a call against an attempt, the roles — are settled a section above instead.

**The entry is the exported name, and there is no column for a label.** This package
has no screen: a consumer reaches every promise by importing a name and calling it, so
the name *is* the address. A written-out description beside it would be a second copy
of the spec's own opening sentence, and the first of the two to rot.

**One row per name, not per surface.** A surface may own several names — three ways to
read an answer, five credential base classes — and whoever looks one up has only the
name they are holding.

| Name | Promised in |
| --- | --- |
| the `dynamic`, `dependsOn`, `dynamic-schema` and `resolveOutputs` markers | [author-time-resolution.md](author-time-resolution.md) |
| the `showIf` condition on a setting | [setting-conditions.md](setting-conditions.md) |
| `ApiKeyCredential` | [credentials.md](credentials.md) |
| `assertPublicUrl` | [ssrf-guard.md](ssrf-guard.md) |
| `backoffDelay` | [retrying-an-operation.md](retrying-an-operation.md) |
| `BasicAuthCredential` | [credentials.md](credentials.md) |
| `buildManifest` | [package-manifest.md](package-manifest.md) |
| `collectImageSources` | [node-images.md](node-images.md) |
| `copyImages` | [node-images.md](node-images.md) |
| `DEFAULT_RETRY_POLICY` | [retrying-an-operation.md](retrying-an-operation.md) |
| `evaluate` | [setting-conditions.md](setting-conditions.md) |
| `INode.loadOptions` | [author-time-resolution.md](author-time-resolution.md) |
| `INode.resolveConfigSchema` | [author-time-resolution.md](author-time-resolution.md) |
| `INode.resolveOutputs` | [author-time-resolution.md](author-time-resolution.md) |
| `INodeContext.state` | [workflow-state.md](workflow-state.md) |
| `INodeState` | [workflow-state.md](workflow-state.md) |
| `isBlockedAddress` | [ssrf-guard.md](ssrf-guard.md) |
| `maxBytesConfigField` | [response-reading.md](response-reading.md) |
| `normalizeCredentialType` | [credential-type.md](credential-type.md) |
| `normalizeLocalized` | [localized-text.md](localized-text.md) |
| `OAuth2AuthCodeCredential` | [credentials.md](credentials.md) |
| `OAuth2ClientCredentialsCredential` | [credentials.md](credentials.md) |
| `OPERATORS` | [setting-conditions.md](setting-conditions.md) |
| `parsePackageMeta` | [package-manifest.md](package-manifest.md) |
| `readArrayBuffer` | [response-reading.md](response-reading.md) |
| `readJsonOrText` | [response-reading.md](response-reading.md) |
| `readText` | [response-reading.md](response-reading.md) |
| `RetryableError` | [retrying-an-operation.md](retrying-an-operation.md) |
| `retryConfigFields` | [request-budget.md](request-budget.md) |
| `safeFetch` | [ssrf-guard.md](ssrf-guard.md), [redirect-following.md](redirect-following.md), [request-budget.md](request-budget.md) |
| `settingApplies` | [setting-conditions.md](setting-conditions.md) |
| `SimpleValueCredential` | [credentials.md](credentials.md) |
| `sleepWithSignal` | [retrying-an-operation.md](retrying-an-operation.md) |
| `timeoutConfigField` | [request-budget.md](request-budget.md) |
| `withRetry` | [retrying-an-operation.md](retrying-an-operation.md) |

**One name carries three specs.** `safeFetch` is where a request is allowed to go, what
a hop does to it, and what it may cost — three promises about one export, which is why
its row is the only one with three links and why none of the three may be read as the
whole of what that name promises.

**A name with no row has no promise here — and whether that absence is recorded is a
second question.** Some of it is: the `INode` and `ICredential` contract, `NodeError`
and the error contract, and the `rvnxx-nodes` CLI that every node package's build runs
are the three entries in *What is not promised yet* above. The rest is not accounted
for anywhere — `BaseCredential`, the `extract*` helpers, `clampResponseBytes`,
`MANIFEST_VERSION`, the `DEFAULT_*` and `MAX_*` constants, and the `state-ref` setting with
its `stateRole` are exported, unpromised, and unrecorded. (The last of those is unpromised
on purpose and says so: [workflow-state.md](workflow-state.md) records in its gaps that
nothing here holds what the marker means.) (The `MAX_*` figures are the ceilings `response-reading.md` AC-5 and
`request-budget.md` AC-3 do promise — but promised as limits that hold, not as names a
consumer reads.) That is the honest state rather than a tidy one: this table answers
whether a name can be cited, not whether anybody has decided it should be.

**These rows are a second copy of each spec's `where:`, and nothing compares them.**
The gate checks that a spec names at least one place, never that this table agrees, so
a renamed export shows up here only when somebody looks. Kept anyway, because the
lookup it answers — from the name in your hand to the spec that promises it — is the
one a consumer actually has. If it starts to rot, delete it rather than half-maintain
it.

## How this stays true

Every AC declares how it is verified, and every automated one is claimed by a test
tagged `@spec:<feature>:AC-n`. `npm run spec:check` fails the build when

- an AC promises behaviour that no test claims, **or**
- a test claims an AC that no longer exists, **or**
- a spec has stopped matching the index: one is missing its own entry there, or an entry
  links a file that is gone, **or**
- a ticket reference goes nowhere, including a row in
  [What is not promised yet](#what-is-not-promised-yet) naming a ticket a spec already
  lists as done — that work landed, so the row outlived itself.

The second direction is what keeps this alive: rewrite or delete a promise and its tests
go red in the same change, so they have to be brought along.

**This package has one layer, and that is not a deficiency.** No application stands up
around these exports — a consumer imports a name and calls it — so `unit` is the weakest
layer at which every promise here is observable, and it is the only one declared. What
it cannot reach is the `ceiling` in [`../spec.config.json`](../spec.config.json): no test
here resolves a real hostname or opens a real socket, so a promise about what happens at
connect time is `manual` with a reason or `todo` with a ticket, never `unit`.

Two things the gate cannot see, and both fall to whoever writes: the vocabulary sections
above are not compared against anything, and a word settled there has to be swept through
every spec in the same change. Working on a ticket that changes behaviour:
`/feature-spec <ticket>`. Writing or editing a spec: the `feature-spec` skill carries the
format rules.
