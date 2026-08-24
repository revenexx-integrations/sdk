import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NodeError } from './errors.js';
import { assertPublicUrl, isBlockedAddress, type LookupAddress } from './ssrf.js';

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
];

for (const ip of BLOCKED_V4) {
  test(`isBlockedAddress blocks IPv4 ${ip}`, () => assert.equal(isBlockedAddress(ip), true));
}
for (const ip of PUBLIC_V4) {
  test(`isBlockedAddress allows IPv4 ${ip}`, () => assert.equal(isBlockedAddress(ip), false));
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
];

const PUBLIC_V6 = [
  '2001:4860:4860::8888', // Google DNS
  '2606:4700:4700::1111', // Cloudflare DNS
  '::ffff:93.184.216.34', // IPv4-mapped public
  '::93.184.216.34', // deprecated IPv4-compatible public (dotted tail after ::)
  '2001:db8::93.184.216.34', // embedded IPv4 with a non-empty prefix
  'fe00::1', // just below fc00::/7
];

for (const ip of BLOCKED_V6) {
  test(`isBlockedAddress blocks IPv6 ${ip}`, () => assert.equal(isBlockedAddress(ip), true));
}
for (const ip of PUBLIC_V6) {
  test(`isBlockedAddress allows IPv6 ${ip}`, () => assert.equal(isBlockedAddress(ip), false));
}

test('isBlockedAddress fails closed on an unparseable address', () => {
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

test('assertPublicUrl rejects non-HTTP(S) protocols', async () => {
  await assertBlocked(() => assertPublicUrl('ftp://example.com/x', { lookup: lookup('93.184.216.34') }));
  await assertBlocked(() => assertPublicUrl('file:///etc/passwd', { lookup: lookup('93.184.216.34') }));
});

test('assertPublicUrl rejects localhost by name without resolving', async () => {
  let resolved = false;
  const spyLookup = async (): Promise<LookupAddress[]> => {
    resolved = true;
    return [{ address: '93.184.216.34', family: 4 }];
  };
  await assertBlocked(() => assertPublicUrl('http://localhost:8080/', { lookup: spyLookup }));
  await assertBlocked(() => assertPublicUrl('http://app.localhost/', { lookup: spyLookup }));
  assert.equal(resolved, false, 'localhost must be rejected before DNS');
});

test('assertPublicUrl checks a literal-IP host directly (no DNS)', async () => {
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

test('assertPublicUrl rejects when any resolved address is private', async () => {
  // A hostname that resolves to both a public and a private address must be
  // rejected — DNS-rebinding-style split answers must not pass.
  await assertBlocked(() => assertPublicUrl('https://mixed.example/', { lookup: lookup('93.184.216.34', '10.0.0.5') }));
});

test('assertPublicUrl does not leak the resolved private IP in the error surfaced to the caller', async () => {
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

test('assertPublicUrl still reports a blocked literal-IP host in the error (no leak)', async () => {
  await assert.rejects(
    () => assertPublicUrl('http://10.0.0.5/'),
    (err: unknown) => {
      assert.ok(err instanceof NodeError && err.code === 'BLOCKED_ADDRESS');
      assert.ok(err.message.includes('10.0.0.5'), 'a caller-supplied literal IP is not secret and may be echoed');
      return true;
    },
  );
});

test('assertPublicUrl allows a host that resolves only to public addresses', async () => {
  await assertPublicUrl('https://api.example/', { lookup: lookup('93.184.216.34', '2001:4860:4860::8888') });
});

test('assertPublicUrl rejects an unresolvable host', async () => {
  await assertBlocked(() => assertPublicUrl('https://nx.example/', { lookup: async () => [] }));
});

test('assertPublicUrl catches a decimal-encoded literal via the resolver (getaddrinfo normalisation)', async () => {
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

test('RVNXX_SSRF_ALLOW_PRIVATE=1 relaxes the guard for local development', () =>
  withEnv('1', async () => {
    // Private literal IP, localhost by name, and a private-resolving host all pass.
    await assertPublicUrl('http://127.0.0.1:3000/');
    await assertPublicUrl('http://localhost:8080/');
    await assertPublicUrl('https://intranet.example/', { lookup: lookup('10.0.0.5') });
  }));

test('RVNXX_SSRF_ALLOW_PRIVATE still enforces the http(s)-only protocol allowlist', () =>
  withEnv('1', async () => {
    // The dev opt-out relaxes only the private-range checks; a non-http(s)
    // protocol is a correctness invariant that stays rejected even when set.
    await assertBlocked(() => assertPublicUrl('file:///etc/passwd'));
    await assertBlocked(() => assertPublicUrl('ftp://127.0.0.1/x'));
  }));

test('assertPublicUrl aborts the DNS resolve when its signal fires', async () => {
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

test('assertPublicUrl rejects immediately when its signal is already aborted', async () => {
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

test('the guard is restored once RVNXX_SSRF_ALLOW_PRIVATE is unset', () =>
  withEnv(undefined, async () => {
    await assertBlocked(() => assertPublicUrl('http://127.0.0.1:3000/'));
  }));

test('RVNXX_SSRF_ALLOW_PRIVATE with a falsy value keeps the guard active', () =>
  withEnv('0', async () => {
    await assertBlocked(() => assertPublicUrl('http://127.0.0.1:3000/'));
  }));
