---
feature: credential-use
title: Telling the host what a service answered
where:
  - safeFetch — the request helper a node reaches a host through
  - CREDENTIAL_USE_REPORTER_SYMBOL — the global the host that runs the node installs its reporter under
docs:
  - docs/overview.md
updated: 2026-11-25
---

# Telling the host what a service answered

**Telling the host what a service answered** is how a credential's state comes to say
whether the credential works now, and not only whether a test passed once. A token the
service has revoked looked fine until somebody pressed Test, because nothing a run did
ever reached the credential.

This package cannot say which credential a request carried: the values come from
`ctx.credentials.get`, which the host answers. So it reports every answered request —
where it went, what it carried, what status came back — to a function the host
installed under `CREDENTIAL_USE_REPORTER_SYMBOL`, and the host decides whether the
request carried one of its credentials. Without a reporter nothing happens.

**A report never changes the request it describes.**

## Acceptance criteria

### AC-1 — An answered request is reported with its address, its headers and its status

- **Given** a host has installed a reporter under `CREDENTIAL_USE_REPORTER_SYMBOL`
- **When** a node's `safeFetch` call is answered
- **Then** the reporter is called once with the address, the request headers and the status
- **And** the body of the answer is left for the caller to read
- **Because** the host can only match a credential it handed out against what the request
  actually carried, and the body belongs to the node
- verify: unit

### AC-2 — After a redirect, the report describes the hop that was answered

- **Given** a request is redirected to another origin
- **When** that origin answers
- **Then** the report names that origin's address and only the headers sent to it
- **Because** a header a redirect dropped never reached the service that answered, so its
  status says nothing about that header
- **Pair** AC-1, the same report without a redirect
- verify: unit

### AC-3 — A request that got no answer is not reported

- **Given** a host has installed a reporter
- **When** a `safeFetch` call fails without an answer
- **Then** the reporter is not called
- **Because** a request that never reached the service says nothing about its credential
- verify: unit

### AC-4 — A request behaves the same with or without a reporter

- **Given** no reporter is installed, or the installed one throws
- **When** a node calls `safeFetch`
- **Then** the call returns what it would have returned without one
- **Because** a fault on the host's side must not become a fault in the node's request
- verify: unit

## Elsewhere

- **Where a request may go at all** is [`ssrf-guard.md`](ssrf-guard.md), and **what
  following a redirect does to it** is [`redirect-following.md`](redirect-following.md).

## Gaps

**Known**

- **Which credential a report belongs to, and what a 401 or a 2xx does to it, is not
  promised here.** It is the host's: the worker and the node runtime in *integrations*
  match the report against the values they resolved and write the credential's state.
- **A request made without `safeFetch` is not reported.** A client with its own socket —
  SMTP, SFTP, FTP — answers in its own protocol, and a credential used only that way keeps
  the state its last test gave it.
- **A request bundled against an older version of this package reports nothing.** The
  reporter is read by the copy of this package inside each node bundle, so a package
  reports once it is built against a version that has this.

## Tickets

- [IN-146](https://linear.app/revenexx/issue/IN-146) — a credential's badge says whether it
  works now, not whether a test once passed: AC-1 through AC-4
