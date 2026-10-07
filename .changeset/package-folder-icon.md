---
"@revenexx/integrations-node-sdk": minor
---

A package can declare the icon that marks its folder in the studio's palette, as `revenexx.icon` in its `package.json` beside `displayName` — a `lucide:<kebab-name>` such as `lucide:bell` (PO-640). It is meant for a package holding several services, such as Notifications, which has no one vendor logo for its folder; a package that is one vendor leaves it out and keeps its logo.

`parsePackageMeta` returns it as `icon`, and `rvnxx-nodes manifest` stops the build when it is not a Lucide name, because the registry refuses such a package on upload. `packageIconProblem(icon)` gives that same verdict for other tooling.
