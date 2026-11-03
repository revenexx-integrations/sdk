---
"@revenexx/integrations-node-sdk": major
---

The SDK now requires Node 22.19 or newer and sends through undici 8 (IN-62). `engines.node` rises from `>=20.3.0` to `>=22.19.0`, because undici 8 does not run on older Node; Node 20 has been end of life since April 2026. Nothing else in the API changes. A `FormData` body built with the runtime's `FormData` is copied into undici's own before it is sent, so forms and file uploads go out as `multipart/form-data` as before. A package that moves to this release should raise its own `engines` to `>=22.19.0`.
