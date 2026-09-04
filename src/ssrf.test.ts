import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { NodeError } from './errors.js';
import { safeFetch } from './fetch.js';
import {
  assertPublicUrl,
  guardConnectionsTo,
  isBlockedAddress,
  type LookupAddress,
  type LookupFn,
  ssrfResolver,
} from './ssrf.js';

// ------------------------------------------------------------ isBlockedAddress

const BLOCKED_V4 = [
  '0.0.0.0',
  '0.1.2.3', // 0.0.0.0/8
  '127.0.0.1',
  '127.255.255.255', // loopback
  '10.0.0.1',
  '10.255.255.255', // 10/8
  '172.16.0.1',
  '172.31.255.255', // 172.16/12
  '192.168.0.1',
  '192.168.255.255', // 192.168/16
  '169.254.0.1',
  '169.254.169.254', // link-local incl. cloud metadata
  '100.64.0.1',
  '100.127.255.255', // 100.64/10 carrier-grade NAT
  '224.0.0.1',
  '239.255.255.255', // 224/4 multicast
  '255.255.255.255', // broadcast
];

const PUBLIC_V4 = [
  '8.8.8.8',
  '1.1.1.1',
  '93.184.216.34',
  '172.15.255.255', // just below 172.16/12
  '172.32.0.1', // just above 172.16/12
  '192.167.255.255', // just below 192.168/16
  '169.253.255.255', // just below link-local
  '11.0.0.1',
  '100.63.255.255', // just below 100.64/10
  '100.128.0.1', // just above 100.64/10
  '223.255.255.255', // just below 224/4 multicast
];

for (const ip of BLOCKED_V4) {
  // AC-11 — The refused set covers every shape a non-public address comes in
  test(`isBlockedAddress blocks IPv4 ${ip} [@spec:ssrf-guard:AC-11]`, () => assert.equal(isBlockedAddress(ip), true));
}
for (const ip of PUBLIC_V4) {
  // AC-2 — A public target is allowed through, by each of the three ways in
  test(`isBlockedAddress allows IPv4 ${ip} [@spec:ssrf-guard:AC-2] [@spec:ssrf-guard:AC-11]`, () => assert.equal(isBlockedAddress(ip), false));
}

const BLOCKED_V6 = [
  '::1', // loopback
  '::', // unspecified
  'fc00::1', // ULA
  'fdff:ffff::1', // ULA upper
  'fe80::1', // link-local
  'febf:ffff::1', // link-local upper
  '::ffff:127.0.0.1', // IPv4-mapped loopback
  '::ffff:169.254.169.254', // IPv4-mapped metadata
  '0:0:0:0:0:ffff:7f00:1', // IPv4-mapped loopback, non-dotted form
  '::127.0.0.1', // deprecated IPv4-compatible loopback (dotted tail after ::)
  '::10.0.0.1', // deprecated IPv4-compatible private
  'fec0::1', // deprecated site-local
  'ff02::1', // multicast
  '2002:7f00:0001::', // 6to4 carrying a loopback address
  '2002:0808:0808::', // 6to4 at all — the whole transitional range is refused
  '2001:0:0:0:0:0:7f00:1', // Teredo carrying a loopback address
  '64:ff9b::7f00:1', // NAT64 well-known prefix carrying a loopback address
  '::ffff:0:8.8.8.8', // IPv4-translated, not IPv4-mapped
  '2001:db8::93.184.216.34', // documentation prefix, public-looking embedded IPv4
];

const PUBLIC_V6 = [
  '2001:4860:4860::8888', // Google DNS
  '2606:4700:4700::1111', // Cloudflare DNS
  '::ffff:93.184.216.34', // IPv4-mapped public
  '::93.184.216.34', // deprecated IPv4-compatible public (dotted tail after ::)
  '2606:4700::93.184.216.34', // embedded IPv4 with a non-empty prefix
  'fe00::1', // just below fc00::/7
];

for (const ip of BLOCKED_V6) {
  // AC-11 — The refused set covers every shape a non-public address comes in
  test(`isBlockedAddress blocks IPv6 ${ip} [@spec:ssrf-guard:AC-11]`, () => assert.equal(isBlockedAddress(ip), true));
}
for (const ip of PUBLIC_V6) {
  // AC-2 — A public target is allowed through, by each of the three ways in
  test(`isBlockedAddress allows IPv6 ${ip} [@spec:ssrf-guard:AC-2] [@spec:ssrf-guard:AC-11]`, () => assert.equal(isBlockedAddress(ip), false));
}

// AC-19 — Only public unicast is allowed, so a range no promise names is still refused
for (const ip of ['192.0.2.1', '198.51.100.1', '203.0.113.1', '240.0.0.1', '198.18.0.1', '2001:20::1']) {
  test(`isBlockedAddress blocks the unnamed reserved range holding ${ip} [@spec:ssrf-guard:AC-19]`, () =>
    assert.equal(isBlockedAddress(ip), true));
}
// AC-2 — A public target is allowed through, by each of the three ways in
test('isBlockedAddress allows an ordinary public address under the same rule [@spec:ssrf-guard:AC-2] [@spec:ssrf-guard:AC-19]', () => {
  assert.equal(isBlockedAddress('93.184.216.34'), false);
  assert.equal(isBlockedAddress('2606:4700:4700::1111'), false);
});

// AC-9 — An address the guard cannot parse counts as blocked
test('isBlockedAddress fails closed on an unparseable address [@spec:ssrf-guard:AC-9]', () => {
  assert.equal(isBlockedAddress('not-an-ip'), true);
  assert.equal(isBlockedAddress('999.999.999.999'), true);
});

// -------------------------------------------------------------- assertPublicUrl

function lookup(...addresses: string[]): (host: string) => Promise<LookupAddress[]> {
  return async () => addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
}

async function assertBlocked(fn: () => Promise<void>): Promise<void> {
  await assert.rejects(fn, (err: unknown) => {
    assert.ok(err instanceof NodeError, `expected NodeError, got ${String(err)}`);
    assert.equal(err.code, 'BLOCKED_ADDRESS');
    return true;
  });
}

// AC-4 — Only http and https targets are accepted
test('assertPublicUrl rejects non-HTTP(S) protocols [@spec:ssrf-guard:AC-4]', async () => {
  await assertBlocked(() => assertPublicUrl('ftp://example.com/x', { lookup: lookup('93.184.216.34') }));
  await assertBlocked(() => assertPublicUrl('file:///etc/passwd', { lookup: lookup('93.184.216.34') }));
});

// AC-12 — A host that can be judged without asking DNS is judged without asking
test('assertPublicUrl rejects localhost by name without resolving [@spec:ssrf-guard:AC-12]', async () => {
  let resolved = false;
  const spyLookup = async (): Promise<LookupAddress[]> => {
    resolved = true;
    return [{ address: '93.184.216.34', family: 4 }];
  };
  await assertBlocked(() => assertPublicUrl('http://localhost:8080/', { lookup: spyLookup }));
  await assertBlocked(() => assertPublicUrl('http://app.localhost/', { lookup: spyLookup }));
  assert.equal(resolved, false, 'localhost must be rejected before DNS');
});

// AC-12 — A host that can be judged without asking DNS is judged without asking
test('assertPublicUrl checks a literal-IP host directly (no DNS) [@spec:ssrf-guard:AC-12]', async () => {
  let resolved = false;
  const spyLookup = async (): Promise<LookupAddress[]> => {
    resolved = true;
    return [{ address: '93.184.216.34', family: 4 }];
  };
  await assertBlocked(() => assertPublicUrl('http://127.0.0.1/', { lookup: spyLookup }));
  await assertBlocked(() => assertPublicUrl('http://[::1]/', { lookup: spyLookup }));
  await assertBlocked(() => assertPublicUrl('http://169.254.169.254/', { lookup: spyLookup }));
  assert.equal(resolved, false, 'a literal IP must not trigger DNS');
  // A public literal IP passes, still without DNS.
  await assertPublicUrl('http://93.184.216.34/', { lookup: spyLookup });
  assert.equal(resolved, false);
});

// AC-3 — One private address among the answers is enough to refuse the host
test('assertPublicUrl rejects when any resolved address is private [@spec:ssrf-guard:AC-3]', async () => {
  // A hostname that resolves to both a public and a private address must be
  // rejected — DNS-rebinding-style split answers must not pass.
  await assertBlocked(() => assertPublicUrl('https://mixed.example/', { lookup: lookup('93.184.216.34', '10.0.0.5') }));
});

// AC-8 — A refusal never discloses the address a hostname resolved to
test('assertPublicUrl does not leak the resolved private IP in the error surfaced to the caller [@spec:ssrf-guard:AC-8]', async () => {
  await assert.rejects(
    () => assertPublicUrl('https://internal.example/', { lookup: lookup('10.0.0.5') }),
    (err: unknown) => {
      assert.ok(err instanceof NodeError && err.code === 'BLOCKED_ADDRESS');
      assert.ok(!err.message.includes('10.0.0.5'), 'the resolved private IP must not appear in the surfaced error');
      assert.ok(err.message.includes('internal.example'), 'the host (already known to the caller) may appear');
      return true;
    },
  );
});

// AC-8 — A refusal never discloses the address a hostname resolved to
test('assertPublicUrl still reports a blocked literal-IP host in the error (no leak) [@spec:ssrf-guard:AC-8]', async () => {
  await assert.rejects(
    () => assertPublicUrl('http://10.0.0.5/'),
    (err: unknown) => {
      assert.ok(err instanceof NodeError && err.code === 'BLOCKED_ADDRESS');
      assert.ok(err.message.includes('10.0.0.5'), 'a caller-supplied literal IP is not secret and may be echoed');
      return true;
    },
  );
});

// AC-2 — A public target is allowed through, by each of the three ways in
test('assertPublicUrl allows a host that resolves only to public addresses [@spec:ssrf-guard:AC-2]', async () => {
  await assertPublicUrl('https://api.example/', { lookup: lookup('93.184.216.34', '2001:4860:4860::8888') });
});

// AC-13 — A host that resolves to nothing is refused
test('assertPublicUrl rejects an unresolvable host [@spec:ssrf-guard:AC-13]', async () => {
  await assertBlocked(() => assertPublicUrl('https://nx.example/', { lookup: async () => [] }));
});

// AC-14 — An address written in a form the guard does not recognise is still caught
test('assertPublicUrl catches a decimal-encoded literal via the resolver (getaddrinfo normalisation) [@spec:ssrf-guard:AC-14]', async () => {
  // http://2130706433/ is 127.0.0.1 written as a 32-bit integer. It is not a
  // recognised IP literal, so it goes through DNS — where getaddrinfo (modelled
  // here) normalises it to loopback, which the guard then blocks.
  await assertBlocked(() => assertPublicUrl('http://2130706433/', { lookup: lookup('127.0.0.1') }));
});

// ----------------------------------------- local-dev opt-out (env-gated)

async function withEnv(value: string | undefined, fn: () => Promise<void>): Promise<void> {
  const key = 'RVNXX_SSRF_ALLOW_PRIVATE';
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    await fn();
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

// AC-15 — The local-development relaxation is off unless it is deliberately on
test('RVNXX_SSRF_ALLOW_PRIVATE=1 relaxes the guard for local development [@spec:ssrf-guard:AC-15]', () =>
  withEnv('1', async () => {
    // Private literal IP, localhost by name, and a private-resolving host all pass.
    await assertPublicUrl('http://127.0.0.1:3000/');
    await assertPublicUrl('http://localhost:8080/');
    await assertPublicUrl('https://intranet.example/', { lookup: lookup('10.0.0.5') });
  }));

// AC-10 — The local-development opt-out never relaxes the protocol allowlist
test('RVNXX_SSRF_ALLOW_PRIVATE still enforces the http(s)-only protocol allowlist [@spec:ssrf-guard:AC-10]', () =>
  withEnv('1', async () => {
    // The dev opt-out relaxes only the private-range checks; a non-http(s)
    // protocol is a correctness invariant that stays rejected even when set.
    await assertBlocked(() => assertPublicUrl('file:///etc/passwd'));
    await assertBlocked(() => assertPublicUrl('ftp://127.0.0.1/x'));
  }));

// AC-16 — The guard gives up when the call it belongs to is cancelled
test('assertPublicUrl aborts the DNS resolve when its signal fires [@spec:ssrf-guard:AC-16]', async () => {
  const ac = new AbortController();
  // A resolver that never settles — only the signal can end the wait.
  const hangingLookup: (host: string) => Promise<LookupAddress[]> = () => new Promise(() => {});
  setTimeout(() => ac.abort(new Error('resolve budget exceeded')), 10);
  await assert.rejects(
    () => assertPublicUrl('https://slow.example/', { lookup: hangingLookup, signal: ac.signal }),
    (err: unknown) => {
      assert.equal((err as Error).message, 'resolve budget exceeded');
      return true;
    },
  );
});

// AC-16 — The guard gives up when the call it belongs to is cancelled
test('assertPublicUrl rejects immediately when its signal is already aborted [@spec:ssrf-guard:AC-16]', async () => {
  const ac = new AbortController();
  ac.abort(new Error('already gone'));
  let resolved = false;
  const spyLookup: (host: string) => Promise<LookupAddress[]> = async () => {
    resolved = true;
    return [{ address: '93.184.216.34', family: 4 }];
  };
  await assert.rejects(
    () => assertPublicUrl('https://slow.example/', { lookup: spyLookup, signal: ac.signal }),
    (err: unknown) => {
      assert.equal((err as Error).message, 'already gone');
      return true;
    },
  );
  assert.equal(resolved, false, 'an already-aborted signal must short-circuit before DNS');
});

// AC-15 — The local-development relaxation is off unless it is deliberately on
test('the guard is restored once RVNXX_SSRF_ALLOW_PRIVATE is unset [@spec:ssrf-guard:AC-15]', () =>
  withEnv(undefined, async () => {
    await assertBlocked(() => assertPublicUrl('http://127.0.0.1:3000/'));
  }));

// AC-15 — The local-development relaxation is off unless it is deliberately on
test('RVNXX_SSRF_ALLOW_PRIVATE with a falsy value keeps the guard active [@spec:ssrf-guard:AC-15]', () =>
  withEnv('0', async () => {
    await assertBlocked(() => assertPublicUrl('http://127.0.0.1:3000/'));
  }));

// --------------------------------------------------------- connect-time guard
//
// The tests below are the only ones in this suite that open a real socket. The
// race they reproduce lives entirely between the guard's check and the connect,
// so a stubbed transport cannot show it: it needs one name with two different
// answers, and the second answer has to be the one a connection really uses.
// No real name is resolved — both answers are scripted — and the only host
// reached is a loopback server this file starts and stops.

/** A loopback HTTP server that counts the requests that actually reach it. */
async function loopbackServer(): Promise<{ port: number; hits: () => number; close: () => Promise<void> }> {
  let hits = 0;
  const server = createServer((_req, res) => {
    hits++;
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('reached');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  return {
    port: (server.address() as AddressInfo).port,
    hits: () => hits,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Swap the guard's own resolver for the duration of `fn` (see {@link ssrfResolver}). */
async function withResolver(lookupFn: LookupFn, fn: () => Promise<void>): Promise<void> {
  const prev = ssrfResolver.lookup;
  ssrfResolver.lookup = lookupFn;
  try {
    await fn();
  } finally {
    ssrfResolver.lookup = prev;
  }
}

/**
 * Script what the *connection* resolves `host` to, which is a different question
 * from what the guard's resolver answers: `net.connect` (and therefore the fetch
 * undici opens) calls `dns.lookup` off the `node:dns` module object, so
 * replacing it there is how a test gets a second, conflicting answer for one
 * name — exactly the DNS-rebinding race, with both answers fixed in advance.
 */
function withConnectAddress(host: string, address: string, fn: () => Promise<void>): Promise<void> {
  const dns = createRequire(import.meta.url)('node:dns') as {
    lookup: (...args: any[]) => void;
  };
  const original = dns.lookup;
  dns.lookup = (hostname: string, options: any, callback: any): void => {
    if (hostname !== host) {
      original(hostname, options, callback);
      return;
    }
    const cb = typeof options === 'function' ? options : callback;
    const all = typeof options === 'object' && options !== null && options.all === true;
    process.nextTick(() => (all ? cb(null, [{ address, family: 4 }]) : cb(null, address, 4)));
  };
  return fn().finally(() => {
    dns.lookup = original;
  });
}

const REBINDING_HOST = 'rebind.test';

// AC-17 — A call the guard approved does not reach an address the guard did not
test('safeFetch refuses a target that resolved publicly at check time and connects privately [@spec:ssrf-guard:AC-17]', async () => {
  const server = await loopbackServer();
  try {
    // The guard's check sees a public address; the connection lands on loopback.
    await withResolver(lookup('93.184.216.34'), () =>
      withConnectAddress(REBINDING_HOST, '127.0.0.1', async () => {
        await assertBlocked(async () => {
          await safeFetch(`http://${REBINDING_HOST}:${server.port}/`, { timeoutMs: 2_000 });
        });
      }),
    );
    assert.equal(server.hits(), 0, 'the request must never reach the host the connection landed on');
  } finally {
    await server.close();
  }
});

// AC-18 — The connect-time guard judges only the connections this package asked for
test('a connection this package did not ask for keeps its socket [@spec:ssrf-guard:AC-18]', async () => {
  const server = await loopbackServer();
  // The guard is engaged — for a different host. The worker this SDK runs in
  // reaches internal services of its own on private addresses, and a guard that
  // dropped those would sever them the moment any node made a request.
  const release = guardConnectionsTo(new URL('http://guarded.test/'));
  try {
    await withConnectAddress('unrelated.test', '127.0.0.1', async () => {
      const res = await globalThis.fetch(`http://unrelated.test:${server.port}/`);
      assert.equal(res.status, 200);
      assert.equal(await res.text(), 'reached');
    });
    assert.equal(server.hits(), 1, 'the unrelated connection must carry its request as usual');
  } finally {
    release();
    await server.close();
  }
});

// AC-15 — The local-development relaxation is off unless it is deliberately on
test('RVNXX_SSRF_ALLOW_PRIVATE relaxes the connect-time guard too [@spec:ssrf-guard:AC-15]', async () => {
  const server = await loopbackServer();
  try {
    await withEnv('1', () =>
      withResolver(lookup('93.184.216.34'), () =>
        withConnectAddress(REBINDING_HOST, '127.0.0.1', async () => {
          const res = await safeFetch(`http://${REBINDING_HOST}:${server.port}/`, { timeoutMs: 2_000 });
          assert.equal(res.status, 200);
          assert.equal(await res.text(), 'reached');
        }),
      ),
    );
    assert.equal(server.hits(), 1, 'the dev stack must still reach its own services');
  } finally {
    await server.close();
  }
});
