---
feature: package-manifest
title: What a package tells the registry
where:
  - buildManifest — the envelope a package's build writes
  - parsePackageMeta — what is taken from a package's own metadata
  - packageIconProblem — whether a declared folder icon would be refused
  - nodeManifestProblems — whether a node's names would be refused
  - SLUG_PATTERN, NAMESPACED_SLUG_PATTERN, SEMVER_PATTERN, CONFIG_KEY_PATTERN — the rules it judges them by
docs:
  - docs/overview.md
updated: 2026-10-27
---

# What a package tells the registry

**What a package tells the registry** is the only thing the platform knows about it
before anything runs. A node package is registered, not imported: the workflow editor
draws a palette, the engine validates a saved workflow and an operator reads a version
number, all from one file written at build time. None of them loads the package's code
to find out what is in it.

That makes this envelope the boundary between a package and everything downstream, and
the reason it is written rather than derived on demand: the reader has no way to ask a
follow-up question. Whatever is missing here is missing everywhere, and whatever is
wrong here is wrong in the editor, in validation and on the screen at once — with
nothing to compare against, because there is no second source.

**Everything a package declares reaches the registry, and nothing else does.**

## Acceptance criteria

### AC-1 — A package hands over its nodes, stamped with the version of the format

- **Given** a package with nodes
- **When** its manifest is built
- **Then** it carries every node's description and the version of the envelope format
- **Because** the reader is a different codebase released on its own schedule; without
  the format version it has to guess which shape it is holding
- verify: unit

### AC-2 — Credentials and templates appear only when the package has them

- **Given** a package that ships no credentials, or no templates
- **When** its manifest is built
- **Then** those parts are absent rather than present and empty
- **Because** absent and empty read differently to whoever consumes this — one says
  "this package has none", the other invites the question of whether the build failed
  halfway
- **Pair** AC-3, the same build for a package that does ship them
- verify: unit

### AC-3 — A shipped template is carried whole

- **Given** a package shipping a workflow template
- **When** its manifest is built
- **Then** the template arrives with its blueprint and its triggers intact, exactly as
  declared
- **Because** a template is a workflow somebody will instantiate; anything reshaped on
  the way through is a difference between what the author wrote and what a user gets
- verify: unit

### AC-4 — Declared images are carried through untouched

- **Given** nodes, credentials or templates declaring images
- **When** the manifest is built
- **Then** each declaration arrives as it was written
- **Because** the file itself travels separately, and the registry pairs the two by what
  is written here
- verify: unit

### AC-5 — The manifest never carries a block about the package itself

- **Given** any package, with or without credentials and templates
- **When** its manifest is built
- **Then** it carries no section describing the package
- **Because** the package's own identity is read from its metadata at registration time
  rather than from a file the package writes about itself — one of the two would go
  stale, and the one that can lie is this one
- **Pair** AC-1
- verify: unit

### AC-6 — Only the registry-relevant fields are taken from a package's metadata

- **Given** a package's metadata, which carries far more than the registry needs
- **When** it is read
- **Then** the name, the version and the display label are taken and nothing else
- **Because** everything else is either irrelevant to a reader that never installs the
  package, or is somebody's private configuration that has no business travelling
- verify: unit

### AC-7 — The display label is read from the package's own namespaced group

- **Given** metadata carrying a label under this platform's group
- **When** it is read
- **Then** that label is used
- **And** a label written at the top level instead is ignored, as is one that is not text
- **Because** the top level belongs to the wider package ecosystem and anyone may put a
  field there; reading it would let an unrelated convention rename a package in our
  palette
- **Pair** AC-6
- verify: unit

### AC-8 — A label that is blank counts as no label, and a padded one is trimmed

- **Given** a label that is empty, only spaces, or padded with them
- **When** it is read
- **Then** an empty or space-only label is treated as absent, and a padded one arrives
  trimmed
- **Because** the label is drawn in a palette: a space-only one renders as a nameless
  entry nobody can search for, which is worse than falling back to the package name
- **Pair** AC-7
- verify: unit

### AC-9 — Name and version are trimmed, and blank ones stay blank

- **Given** a name or version padded with spaces, or consisting only of spaces
- **When** they are read
- **Then** they arrive trimmed, and a space-only one becomes empty rather than a string
  of spaces
- verify: unit

### AC-10 — Metadata that is not readable yields a safe shape, not a failure

- **Given** metadata that is missing, or is not a set of fields at all
- **When** it is read
- **Then** an empty name and version come back and nothing is thrown
- **Because** this runs inside a build: a package with a broken manifest should fail on
  something that names the problem, not on an exception thrown while reading the file
  that would have named it
- **Pair** AC-6
- verify: unit

### AC-11 — A package's nodes arrive in the order it lists them

- **Given** a package whose `NODES` lists its nodes in an order other than their slugs'
- **When** its manifest is built
- **Then** the nodes arrive in the order the package lists them
- **Because** that order is the package's statement of which node comes first in the
  palette; a manifest that re-sorted it would leave the registry nothing to keep
- verify: unit

### AC-12 — A declared palette position is carried as written

- **Given** a node that declares where it stands in its palette folder
- **When** the manifest is built
- **Then** the position arrives as it was declared, and a node that declares none carries none
- **Because** the position is how a package orders a folder independently of the order of
  `NODES`; a default filled in here would be indistinguishable from one the author chose
- **Pair** AC-11
- verify: unit

### AC-13 — A package's folder icon is read from the same group, and one the registry would refuse stops the build

- **Given** metadata declaring an icon for the package's folder under this platform's
  group — well formed, blank, not text, or not a Lucide name
- **When** it is read, and when the manifest is built
- **Then** a well-formed icon arrives trimmed, a blank one counts as none, one that is
  not text counts as none with a warning — as the registry reads both — and one that is
  not `lucide:` and a kebab-case name stops the build before the package's code runs,
  naming the field and the value
- **Because** the registry refuses such a package on upload; stopping here tells the
  author while they can still fix it, rather than when a release fails
- **Pair** AC-7
- verify: unit

### AC-14 — What a VPN route replaces, and a setting that picks one, are carried as declared

- **Given** a credential kind that declares which of its fields a VPN route replaces
  (`network`), and a node with a `vpn-route` setting that names the kind of route it
  wants (`routeKind`)
- **When** the manifest is built
- **Then** both arrive exactly as declared, and a credential kind or a setting that
  declares none carries none
- **Because** the studio offers a VPN route only where the kind says what the route
  replaces, and the platform substitutes exactly those fields; a declaration lost or
  defaulted on the way is a choice the author did not make
- **Pair** AC-2, the same build for a credential kind without the declaration
- verify: unit

### AC-15 — A name the registry would refuse stops the build, naming the node, the field and the rule

- **Given** a node whose slug, version, port name, `sourceFromConfig`, fallback name,
  setting key, `dependsOn` key, `showIf` key or named credential type does not match the
  pattern the registry's schema holds it to — a port called `notFound`, say, where a
  setting may be called `postalCode`
- **When** the manifest is built by `rvnxx-nodes manifest`
- **Then** the build stops before anything is written, and names every such value with
  its node, the path of the field and the pattern; a node whose names all match builds
  as before
- **Because** the registry refuses such a package on upload with a `422`, after the
  build, the tests and the preview have all passed, and renaming a port once workflows
  are wired to it breaks every one of them
- **Pair** AC-13, the same stop for the package's folder icon
- verify: unit

## Elsewhere

- **The image files themselves** — which are collected and how they reach the build —
  are [`node-images.md`](node-images.md). This spec promises only that the declarations
  travel.

## Gaps

**Known**

- **Only a node's names are validated (AC-15).** A config field of an unknown type,
  settings nested deeper than the schema allows, and a missing slug or version are
  carried into the manifest as written, and so is everything in the credential and
  template manifests; whether anything downstream refuses them is not promised in this
  package. A port with no name is `branch-selection.md`'s warning, not a refusal here.
- **The name patterns are a copy of the registry's schema, not a shared source.** Kept
  equal by hand; nothing in this repository can see the other side.

**Undecided**

- **What happens when two packages declare the same slug** is not settled here. The
  manifest carries what it is given, and which of them a registry keeps is its decision.
- **Whether the format version obliges a reader to anything** — refuse an unknown
  version, or read what it recognises — is not stated, so the stamp promised by AC-1 is
  currently information rather than a contract.

## Tickets

- [PO-126](https://linear.app/revenexx/issue/PO-126) — credentials joined the envelope,
  which is where AC-2 comes from
- [PO-161](https://linear.app/revenexx/issue/PO-161) — the display label read from the
  package's own group: AC-6 through AC-10
- [PO-368](https://linear.app/revenexx/issue/PO-368) — backfilled this spec against the
  tests that already proved it
- [PO-537](https://linear.app/revenexx/issue/PO-537) — a package orders the nodes inside a
  palette folder: AC-11 and AC-12
- [PO-829](https://linear.app/revenexx/issue/PO-829) and
  [PO-831](https://linear.app/revenexx/issue/PO-831) — a credential kind declares what a
  VPN route replaces, and a setting can pick a route: AC-14
  - The registry's own schema refuses a key it does not list, so a package declaring
    either is refused on upload until the registry learns both
    ([integrations#406](https://github.com/revenexx/integrations/pull/406)).
    This spec promises only that they travel.
- [PO-744](https://linear.app/revenexx/issue/PO-744) — a name the registry would refuse
  stops the build: AC-15
