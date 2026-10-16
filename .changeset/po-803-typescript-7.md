---
"@revenexx/integrations-node-sdk": patch
---

Built with TypeScript 7 (PO-803). The declarations now come as one `.d.ts` per module instead of a single bundled file, written by TypeScript 7's own compiler, because tsup's declaration build still needs the compiler API TypeScript 7 no longer ships. The API is unchanged: read with TypeScript 5.9, the old and the new declarations export the same 100 names with the same types, and the JavaScript is byte for byte the same. `dist/index.d.cts`, which no export pointed at, is gone.
