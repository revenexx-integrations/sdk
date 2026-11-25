import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CREDENTIAL_USE_REPORTER_SYMBOL, type CredentialUse } from './credentialUse.js';
import { safeFetch } from './fetch.js';

// The host's side of the contract, as a test plays it: a function under the symbol.
// Defined configurable here so the next test can take it away again; a host defines
// it once and for good.
function withReporter(reporter: (use: CredentialUse) => void, fn: () => Promise<void>): Promise<void> {
  Object.defineProperty(globalThis, CREDENTIAL_USE_REPORTER_SYMBOL, { value: reporter, configurable: true });
  return fn().finally(() => {
    delete (globalThis as Record<symbol, unknown>)[CREDENTIAL_USE_REPORTER_SYMBOL];
  });
}

function withFetch(mock: typeof globalThis.fetch, fn: () => Promise<void>): Promise<void> {
  // biome-ignore lint/nursery/noJsRestrictedProperties: saving the global to restore it after the test — the seam that installs the mock, not a request
  const orig = globalThis.fetch;
  globalThis.fetch = mock;
  return fn().finally(() => {
    globalThis.fetch = orig;
  });
}

test('an answered request is reported with its address, the headers it carried and its status [@spec:credential-use:AC-1]', async () => {
  const uses: CredentialUse[] = [];
  await withReporter(
    (use) => uses.push(use),
    () =>
      withFetch(
        async () => new Response('{"error":"unauthorized access"}', { status: 401 }),
        async () => {
          const res = await safeFetch('https://93.184.216.34/v1/users/me?api_token=abc', {
            headers: { 'x-api-token': 'secret-token-value' },
          });
          assert.equal(res.status, 401);
          // The body is the caller's: still there, unread.
          assert.equal(await res.text(), '{"error":"unauthorized access"}');
        },
      ),
  );
  assert.equal(uses.length, 1);
  assert.deepEqual(uses[0], {
    url: 'https://93.184.216.34/v1/users/me?api_token=abc',
    headers: [['x-api-token', 'secret-token-value']],
    status: 401,
  });
});

test('after a redirect to another origin the report names the last hop and only the headers it sent [@spec:credential-use:AC-2]', async () => {
  const uses: CredentialUse[] = [];
  await withReporter(
    (use) => uses.push(use),
    () =>
      withFetch(
        async (url) =>
          String(url).startsWith('https://93.184.216.34')
            ? new Response(null, { status: 302, headers: { location: 'https://93.184.216.35/elsewhere' } })
            : new Response('ok', { status: 200 }),
        async () => {
          await safeFetch('https://93.184.216.34/start', {
            headers: { authorization: 'Bearer secret-token-value', accept: 'application/json' },
          });
        },
      ),
  );
  assert.equal(uses.length, 1, 'the redirect itself is not an answer the caller receives');
  assert.equal(uses[0]?.url, 'https://93.184.216.35/elsewhere');
  assert.equal(uses[0]?.status, 200);
  assert.deepEqual(uses[0]?.headers, [['accept', 'application/json']]);
});

test('a request that got no answer is not reported [@spec:credential-use:AC-3]', async () => {
  const uses: CredentialUse[] = [];
  await withReporter(
    (use) => uses.push(use),
    () =>
      withFetch(
        async () => {
          throw new TypeError('fetch failed');
        },
        async () => {
          await assert.rejects(() => safeFetch('https://93.184.216.34/', { headers: { authorization: 'Bearer x' } }));
        },
      ),
  );
  assert.deepEqual(uses, []);
});

test('a reporter that throws does not change what the request returns [@spec:credential-use:AC-4]', () =>
  withReporter(
    () => {
      throw new Error('the host is broken');
    },
    () =>
      withFetch(
        async () => new Response('ok', { status: 200 }),
        async () => {
          const res = await safeFetch('https://93.184.216.34/');
          assert.equal(res.status, 200);
          assert.equal(await res.text(), 'ok');
        },
      ),
  ));

test('without a reporter a request is made exactly as before [@spec:credential-use:AC-4]', () =>
  withFetch(
    async () => new Response('ok', { status: 200 }),
    async () => {
      assert.equal((globalThis as Record<symbol, unknown>)[CREDENTIAL_USE_REPORTER_SYMBOL], undefined);
      const res = await safeFetch('https://93.184.216.34/');
      assert.equal(res.status, 200);
    },
  ));
