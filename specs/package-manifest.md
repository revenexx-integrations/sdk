---
feature: package-manifest
title: What a package tells the registry
where:
  - buildManifest — the envelope a package's build writes
  - parsePackageMeta — what is taken from a package's own metadata
docs:
  - docs/overview.md
updated: 2026-09-01
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

## Elsewhere

- **The image files themselves** — which are collected and how they reach the build —
  are [`node-images.md`](node-images.md). This spec promises only that the declarations
  travel.

## Gaps

**Known**

- **Nothing here validates what a node declares.** A description with a malformed slug,
  a port with no name or a config field of an unknown type is carried into the manifest
  as written; whether anything downstream refuses it is not promised in this package.

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
