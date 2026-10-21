import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer, type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import {
  ALLOWED_TARGETS_SYMBOL,
  allowedTargets,
  installAllowedTargets,
  installAllowedTargetsOn,
  isAllowedTarget,
  isAllowedTargetOn,
  readAllowedTargets,
} from './allowedTargets.js';
import { NodeError } from './errors.js';
import { safeFetch } from './fetch.js';
import { assertPublicUrl, type LookupAddress, type LookupFn, ssrfResolver } from './ssrf.js';

// The allow-list is a one-shot, non-configurable property of `globalThis`, so this
// file installs it once, at the top, for every test in it — node:test runs each
// test file in a process of its own, so no other file sees it. Shapes the global
// cannot be given twice (absent, malformed) are read off fresh objects through the
// same reader the exported functions use.
//
// Two loopback servers stand in for a VPN route and for a private service the run
// was not granted: the same address, one port on the list and one not. Both are
// started before the list is installed, because the list names their ports.

interface Server {
  port: number;
  hits: () => number;
  close: () => Promise<void>;
}

async function loopbackServer(handler?: RequestListener): Promise<Server> {
  let hits = 0;
  const server = createServer((req, res) => {
    hits++;
    if (handler) return handler(req, res);
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

let redirectTo = '';
const granted = await loopbackServer((req, res) => {
  if (req.url === '/redirect') {
    res.writeHead(302, { location: redirectTo });
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end(req.url === '/final' ? 'final' : 'reached');
});
const notGranted = await loopbackServer();
after(async () => {
  await granted.close();
  await notGranted.close();
});

const LIST = ['10.31.0.7:8080', '10.31.0.7:20001', `127.0.0.1:${granted.port}`, '[fd00::7]:443'];
installAllowedTargets(LIST);

function lookup(...addresses: string[]): LookupFn {
  return async (): Promise<LookupAddress[]> =>
    addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
}

async function assertBlocked(fn: () => Promise<unknown>): Promise<void> {
  await assert.rejects(fn, (err: unknown) => {
    assert.ok(err instanceof NodeError, `expected NodeError, got ${String(err)}`);
    assert.equal(err.code, 'BLOCKED_ADDRESS');
    return true;
  });
}

async function withResolver(lookupFn: LookupFn, fn: () => Promise<void>): Promise<void> {
  const prev = ssrfResolver.lookup;
  ssrfResolver.lookup = lookupFn;
  try {
    await fn();
  } finally {
    ssrfResolver.lookup = prev;
  }
}

/** Script what the connection resolves `host` to — see the same helper in the guard's own tests. */
function withConnectAddress(host: string, address: string, fn: () => Promise<void>): Promise<void> {
  const dns = createRequire(import.meta.url)('node:dns') as { lookup: (...args: any[]) => void };
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

// AC-26 — A run reaches its own VPN targets although they are private
test('the installed list is what allowedTargets reads back [@spec:ssrf-guard:AC-26]', () => {
  assert.deepEqual([...allowedTargets()], LIST);
  assert.equal(isAllowedTarget('10.31.0.7', 8080), true);
  assert.equal(isAllowedTarget('10.31.0.7', 20001), true);
});

test('assertPublicUrl passes a private target whose address and port are on the list [@spec:ssrf-guard:AC-26]', async () => {
  await assertPublicUrl('http://10.31.0.7:8080/sap-odata/');
  await assertPublicUrl(`http://127.0.0.1:${granted.port}/`);
  // A name that resolves to the listed address passes on the listed port too.
  await assertPublicUrl('http://relay.internal:8080/', { lookup: lookup('10.31.0.7') });
  // The scheme's default port counts as the port: [fd00::7]:443 is listed.
  await assertPublicUrl('https://[fd00::7]/');
});

test('isAllowedTarget reads an address in whichever form a socket reports it [@spec:ssrf-guard:AC-26]', () => {
  assert.equal(isAllowedTarget('fd00:0:0:0:0:0:0:7', 443), true);
  assert.equal(isAllowedTarget('[FD00::7]', 443), true);
  // A dual-stack socket reports a v4 peer as IPv4-mapped IPv6.
  assert.equal(isAllowedTarget('::ffff:10.31.0.7', 8080), true);
});

test('safeFetch reaches a listed target, by address and through a name that connects there [@spec:ssrf-guard:AC-26]', async () => {
  const before = granted.hits();
  const res = await safeFetch(`http://127.0.0.1:${granted.port}/`, { timeoutMs: 2_000 });
  assert.equal(await res.text(), 'reached');
  // The connect-time half judges the socket's peer and port the same way.
  await withResolver(lookup('93.184.216.34'), () =>
    withConnectAddress('route.test', '127.0.0.1', async () => {
      const viaName = await safeFetch(`http://route.test:${granted.port}/`, { timeoutMs: 2_000 });
      assert.equal(await viaName.text(), 'reached');
    }),
  );
  assert.equal(granted.hits() - before, 2);
});

// AC-27 — The port is part of the target
test('assertPublicUrl refuses a listed address on a port that is not listed [@spec:ssrf-guard:AC-27]', async () => {
  assert.equal(isAllowedTarget('10.31.0.7', 22), false);
  await assertBlocked(() => assertPublicUrl('http://10.31.0.7:22/'));
  await assertBlocked(() => assertPublicUrl('http://10.31.0.7/')); // default port 80
  await assertBlocked(() => assertPublicUrl('https://10.31.0.7/')); // default port 443
  await assertBlocked(() => assertPublicUrl('http://relay.internal:22/', { lookup: lookup('10.31.0.7') }));
});

test('safeFetch refuses the same address on another port, before sending and at connect time [@spec:ssrf-guard:AC-27]', async () => {
  await assertBlocked(() => safeFetch(`http://127.0.0.1:${notGranted.port}/`, { timeoutMs: 2_000 }));
  // The check sees a public address; the connection lands on the unlisted port.
  await withResolver(lookup('93.184.216.34'), () =>
    withConnectAddress('route.test', '127.0.0.1', () =>
      assertBlocked(() => safeFetch(`http://route.test:${notGranted.port}/`, { timeoutMs: 2_000 })),
    ),
  );
  assert.equal(notGranted.hits(), 0, 'no request may reach a port the run was not granted');
});

// AC-28 — Every other private address is refused as before
test('assertPublicUrl refuses a private address that is not on the list [@spec:ssrf-guard:AC-28]', async () => {
  assert.equal(isAllowedTarget('10.31.0.8', 8080), false);
  await assertBlocked(() => assertPublicUrl('http://10.31.0.8:8080/'));
  await assertBlocked(() => assertPublicUrl('http://169.254.169.254:8080/'));
  await assertBlocked(() => assertPublicUrl('http://10.0.0.5:20001/'));
});

test('one listed answer does not carry a private one beside it [@spec:ssrf-guard:AC-28]', async () => {
  await assertBlocked(() => assertPublicUrl('http://relay.internal:8080/', { lookup: lookup('10.31.0.7', '10.0.0.5') }));
});

// AC-29 — A redirect from a listed target is judged again
test('safeFetch refuses a redirect from a listed target to the same address on another port [@spec:ssrf-guard:AC-29]', async () => {
  redirectTo = `http://127.0.0.1:${notGranted.port}/`;
  await assertBlocked(() => safeFetch(`http://127.0.0.1:${granted.port}/redirect`, { timeoutMs: 2_000 }));
  assert.equal(notGranted.hits(), 0);
});

test('safeFetch refuses a redirect from a listed target to another private address [@spec:ssrf-guard:AC-29]', async () => {
  redirectTo = 'http://10.0.0.5:8080/';
  await assertBlocked(() => safeFetch(`http://127.0.0.1:${granted.port}/redirect`, { timeoutMs: 2_000 }));
});

test('safeFetch follows a redirect that stays on the listed target [@spec:ssrf-guard:AC-29]', async () => {
  redirectTo = `http://127.0.0.1:${granted.port}/final`;
  const res = await safeFetch(`http://127.0.0.1:${granted.port}/redirect`, { timeoutMs: 2_000 });
  assert.equal(await res.text(), 'final');
});

// AC-30 — The list cannot be widened once it is installed
test('the installed list cannot be replaced, redefined, installed again or grown [@spec:ssrf-guard:AC-30]', () => {
  const holder = globalThis as unknown as Record<symbol, unknown>;
  assert.throws(() => {
    holder[ALLOWED_TARGETS_SYMBOL] = Object.freeze(['10.0.0.5:22']);
  }, TypeError);
  assert.throws(
    () => Object.defineProperty(globalThis, ALLOWED_TARGETS_SYMBOL, { value: Object.freeze(['10.0.0.5:22']) }),
    TypeError,
  );
  assert.throws(() => installAllowedTargets(['10.0.0.5:22']), /already installed/);
  assert.throws(() => (allowedTargets() as string[]).push('10.0.0.5:22'), TypeError);
  assert.equal(Reflect.deleteProperty(globalThis, ALLOWED_TARGETS_SYMBOL), false);
  assert.deepEqual([...allowedTargets()], LIST);
  assert.equal(isAllowedTarget('10.0.0.5', 22), false);
});

// AC-31 — A list that is absent or malformed allows nothing
test('no list installed reads as empty and allows nothing [@spec:ssrf-guard:AC-31]', () => {
  const holder = {};
  assert.deepEqual(readAllowedTargets(holder), []);
  assert.equal(isAllowedTargetOn(holder, '10.31.0.7', 8080), false);
});

function holderWith(descriptor: PropertyDescriptor): object {
  const holder = {};
  Object.defineProperty(holder, ALLOWED_TARGETS_SYMBOL, descriptor);
  return holder;
}

const sealed = (value: unknown): PropertyDescriptor => ({ value, writable: false, configurable: false });

const MALFORMED: Array<[string, object]> = [
  ['a string instead of a list', holderWith(sealed('10.31.0.7:8080'))],
  ['a list that is not frozen', holderWith(sealed(['10.31.0.7:8080']))],
  ['a writable property', holderWith({ value: Object.freeze(['10.31.0.7:8080']), writable: true, configurable: false })],
  ['a configurable property', holderWith({ value: Object.freeze(['10.31.0.7:8080']), writable: false, configurable: true })],
  ['an accessor', holderWith({ get: () => Object.freeze(['10.31.0.7:8080']), configurable: false })],
  ['an entry without a port', holderWith(sealed(Object.freeze(['10.31.0.7:8080', '10.31.0.7'])))],
  ['port 0', holderWith(sealed(Object.freeze(['10.31.0.7:0'])))],
  ['a port out of range', holderWith(sealed(Object.freeze(['10.31.0.7:70000'])))],
  ['a host name', holderWith(sealed(Object.freeze(['relay.internal:8080'])))],
  ['a leading zero', holderWith(sealed(Object.freeze(['010.31.0.7:8080'])))],
  ['an unbracketed IPv6 address', holderWith(sealed(Object.freeze(['fd00::7:443'])))],
  ['a number', holderWith(sealed(Object.freeze([8080])))],
];

for (const [what, holder] of MALFORMED) {
  test(`a list with ${what} reads as empty and allows nothing [@spec:ssrf-guard:AC-31]`, () => {
    assert.deepEqual(readAllowedTargets(holder), []);
    assert.equal(isAllowedTargetOn(holder, '10.31.0.7', 8080), false);
  });
}

test('installAllowedTargets refuses a malformed entry rather than installing it [@spec:ssrf-guard:AC-31]', () => {
  const holder = {};
  assert.throws(() => installAllowedTargetsOn(holder, ['10.31.0.7:8080', 'relay.internal:8080']), TypeError);
  assert.equal(Object.getOwnPropertyDescriptor(holder, ALLOWED_TARGETS_SYMBOL), undefined);
  installAllowedTargetsOn(holder, ['10.31.0.7:8080']);
  assert.equal(isAllowedTargetOn(holder, '10.31.0.7', 8080), true);
});
