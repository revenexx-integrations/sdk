---
"@revenexx/integrations-node-sdk": minor
---

`safeFetch` judges the address a connection is about to use before the socket is opened, so a refused address gets no TCP or TLS handshake, and an open port and a closed one end in the same `BLOCKED_ADDRESS` (IN-28). Until now the connection was refused only once it stood, which let whoever controls a name's DNS tell open internal ports from closed ones. Requests go through a dispatcher of the SDK's own, which adds `undici` as a dependency, and a dispatcher installed as Node's global one — a proxy, or a custom CA or TLS settings — no longer carries `safeFetch`'s requests.
