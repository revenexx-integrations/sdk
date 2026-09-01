---
feature: node-images
title: The pictures a package ships
where:
  - collectImageSources — what a package declares it will ship
  - copyImages — how those files reach the build
docs:
  - docs/overview.md
updated: 2026-09-01
---

# The pictures a package ships

**The pictures a package ships** are the logos, screenshots and banners a node,
credential or template declares so the editor and the catalogue have something to draw.
They are declared in one place and they live in another: the declaration travels in the
manifest, the file has to be copied into the build beside it, and the two are paired
downstream by the path written in the declaration.

The path is the whole risk. It is written by whoever authored the package and it is
used, at build time, to read a file and write it somewhere else — so a path that
reaches outside the package would copy something nobody meant to publish into an
artefact that gets uploaded. And because this runs during a build rather than during a
run, the second question is what a bad declaration should cost: failing the build over
a missing screenshot punishes everyone for a typo, while copying whatever a path
happens to reach is the failure that matters.

**No file outside the package is ever copied into the build, and no picture is worth
failing a build over.**

## Acceptance criteria

### AC-1 — Every declared picture is collected once, wherever it was declared

- **Given** nodes, credentials and templates that declare pictures, some the same file
- **When** the declarations are collected
- **Then** each distinct file appears once
- **Because** the same logo is normally declared by a credential and by every node that
  uses it, and copying it once per declaration is work the build does not need
- verify: unit

### AC-2 — A package declaring nothing collects nothing

- **Given** nodes, credentials and templates that declare no pictures
- **When** the declarations are collected
- **Then** the result is empty
- **Because** declaring pictures is optional, and a package with none must not produce
  a build step that has something to do
- **Pair** AC-1
- verify: unit

### AC-3 — A declared file is copied into the build under the path it was declared as

- **Given** a declared picture that exists in the package
- **When** the build copies it
- **Then** it appears in the build output under the same relative path, with the same
  contents
- **Because** the manifest already went out naming that path; a file that lands anywhere
  else is a picture the registry will look for and not find
- verify: unit

### AC-4 — A declared file that is not there is reported, and the build goes on

- **Given** a declaration naming a file the package does not contain
- **When** the build copies
- **Then** nothing is written for it, a warning names the path, and the build does not
  fail
- **Because** the cost of the mistake is one missing picture; failing the build makes a
  typo in a screenshot path as expensive as a broken node
- **Pair** AC-3, the same copy where the file exists
- verify: unit

### AC-5 — A path that would reach outside the package is refused

- **Given** a declaration whose path is absolute, or climbs out of the package
- **When** the build copies
- **Then** nothing is written, and a warning names the path as unsafe
- **Because** this reads a file and writes it into an artefact that gets published — a
  path that escapes turns a picture declaration into a way to ship whatever the build
  machine can read
- **Pair** AC-3, the same copy with a path that stays inside
- verify: unit

### AC-6 — A declaration pointing at something that is not a file is refused

- **Given** a declaration whose path is a directory
- **When** the build copies
- **Then** nothing is written and a warning says so
- **Because** the copy would otherwise fail in the middle of the build with an error
  about the file system rather than about the declaration that caused it
- **Pair** AC-3
- verify: unit

## Elsewhere

- **The declarations themselves**, and how they reach the registry, are
  [`package-manifest.md`](package-manifest.md) AC-4. This spec is about the files.

## Gaps

**Known**

- **Nothing checks that a declared file is a picture.** The path is checked for where it
  points, not for what it contains, so a package can ship anything under a picture
  declaration as long as the path stays inside it.
- **A warning is the only signal.** Nothing collects the warnings or fails a release on
  them, so a package can be published with every picture missing and nothing downstream
  knows until somebody looks at the palette.

**Undecided**

- **Whether a symbolic link inside the package that points outside it is refused** is
  not stated, and no test covers it.

## Tickets

- [PO-141](https://linear.app/revenexx/issue/PO-141) — picture declarations for nodes,
  credentials and templates, and the build step that ships them: AC-1 through AC-6
- [PO-368](https://linear.app/revenexx/issue/PO-368) — backfilled this spec against the
  tests that already proved it
