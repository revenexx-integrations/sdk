import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import {
  ApiKeyCredential,
  BasicAuthCredential,
  OAuth2AuthCodeCredential,
  OAuth2ClientCredentialsCredential,
  SimpleValueCredential,
} from './credentials.js';
import { NodeError } from './errors.js';
import { ssrfResolver } from './ssrf.js';
import type { ICredentialContext, ICredentialDescription, ICredentialField } from './types.js';

type Config = Record<string, unknown>;

function ctx(persist?: (creds: Record<string, unknown>) => Promise<void>): ICredentialContext {
  return {
    signal: new AbortController().signal,
    logger: { info() {}, warn() {}, error() {} },
    persistDurableCreds: persist,
  };
}

function describe(slug: string, authKind: ICredentialDescription['authKind'], fields: ICredentialField[] = []): ICredentialDescription {
  return { slug, version: '1.0.0', name: slug, authKind, fields };
}

/**
 * Stub a JSON token response and restore `fetch` after the test.
 *
 * `postForm` goes through `safeFetch` (PO-185), so the SSRF guard runs ahead of
 * the request and would try to resolve the `*.example` token hosts below. That
 * TLD is reserved and never resolves, so the guard — not the assertion under
 * test — would decide every one of these tests. `ssrfResolver.lookup` is
 * injectable for exactly this: point it at a public address so the guard passes
 * on its own terms rather than being bypassed. The guard itself always runs.
 */
function stubFetch(t: TestContext, body: Record<string, unknown>, status = 200): void {
  const originalFetch = globalThis.fetch;
  const originalLookup = ssrfResolver.lookup;
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status });
  ssrfResolver.lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  t.after(() => {
    globalThis.fetch = originalFetch;
    ssrfResolver.lookup = originalLookup;
  });
}

// ----------------------------------------------------------- SimpleValue

class SmtpCredential extends SimpleValueCredential {
  readonly description = describe('revenexx:smtp', 'static', [
    { key: 'host', label: 'Host', type: 'string', required: true },
    { key: 'port', label: 'Port', type: 'number', required: true },
  ]);
}

// AC-1 — A credential that only carries settings hands them on unchanged
test('SimpleValueCredential.resolve passes config through unchanged [@spec:credentials:AC-1]', async () => {
  const result = await new SmtpCredential().resolve(ctx(), { host: 'h', port: 25 }, null);

  assert.deepEqual(result.credentials, { host: 'h', port: 25 });
  assert.equal(result.expiresAt, undefined);
});

// AC-2 — A credential missing a required setting fails its test
test('BaseCredential.test fails when a required field is missing [@spec:credentials:AC-2]', async () => {
  const result = await new SmtpCredential().test(ctx(), { host: 'h' });

  assert.equal(result.ok, false);
});

// ----------------------------------------------------------- ApiKey / Basic

class DeeplCredential extends ApiKeyCredential {
  readonly description = describe('revenexx:deepl', 'api-key', [
    { key: 'apiKey', label: 'Key', type: 'secret', required: true },
  ]);
}

// AC-3 — A key credential hands the key on under one agreed name, or refuses
test('ApiKeyCredential.resolve returns the apiKey shape [@spec:credentials:AC-3]', async () => {
  const result = await new DeeplCredential().resolve(ctx(), { apiKey: 'abc' }, null);

  assert.deepEqual(result.credentials, { apiKey: 'abc' });
});

// AC-3 — A key credential hands the key on under one agreed name, or refuses
test('ApiKeyCredential.resolve throws when the key is missing [@spec:credentials:AC-3]', async () => {
  await assert.rejects(() => new DeeplCredential().resolve(ctx(), {}, null));
});

class BasicCredential extends BasicAuthCredential {
  readonly description = describe('revenexx:basic', 'basic');
}

// AC-4 — A username-and-password credential hands both on
test('BasicAuthCredential.resolve returns username/password [@spec:credentials:AC-4]', async () => {
  const result = await new BasicCredential().resolve(ctx(), { username: 'u', password: 'p' }, null);

  assert.deepEqual(result.credentials, { username: 'u', password: 'p' });
});

// ----------------------------------------------- OAuth2 client-credentials

class BusinessCentralCredential extends OAuth2ClientCredentialsCredential {
  readonly description = describe('revenexx:bc', 'oauth2-client-credentials');

  protected tokenUrl(_config: Config): string {
    return 'https://token.example/token';
  }

  protected clientId(config: Config): string {
    return String(config['clientId']);
  }

  protected clientSecret(config: Config): string {
    return String(config['clientSecret']);
  }

  protected scope(_config: Config): string {
    return 'api';
  }
}

// AC-5 — A client-credentials account is exchanged for a token that says when it expires
test('OAuth2ClientCredentialsCredential mints an access token with expiry [@spec:credentials:AC-5]', async (t) => {
  stubFetch(t, { access_token: 'tok', token_type: 'Bearer', expires_in: 3600 });

  const result = await new BusinessCentralCredential().resolve(
    ctx(),
    { clientId: 'id', clientSecret: 'sec' },
    null,
  );

  assert.equal(result.credentials['accessToken'], 'tok');
  assert.ok(result.expiresAt, 'expiresAt should be derived from expires_in');
});

// AC-5 — A client-credentials account is exchanged for a token that says when it expires
test('OAuth2ClientCredentialsCredential.test returns ok on a successful mint [@spec:credentials:AC-5]', async (t) => {
  stubFetch(t, { access_token: 'tok', expires_in: 3600 });

  const result = await new BusinessCentralCredential().test(ctx(), { clientId: 'id', clientSecret: 'sec' });

  assert.equal(result.ok, true);
});

// PO-185: `postForm` used a raw `fetch`, so the SSRF guard never saw the token
// endpoint — and that endpoint comes from credential config, not from a
// constant. This asserts the guard now runs *before* the request: no fetch may
// be attempted at all when the host resolves somewhere private. The assertion is
// the call count, not just the rejection — a guard that blocks after the secret
// is already on the wire is no guard.
// AC-6 — A token endpoint taken from configuration is judged before the secret is sent
test('postForm refuses a token endpoint that resolves to a private address [@spec:credentials:AC-6]', async (t) => {
  let calls = 0;
  const originalFetch = globalThis.fetch;
  const originalLookup = ssrfResolver.lookup;
  globalThis.fetch = async () => {
    calls++;
    return new Response('{}', { status: 200 });
  };
  ssrfResolver.lookup = async () => [{ address: '169.254.169.254', family: 4 }];
  t.after(() => {
    globalThis.fetch = originalFetch;
    ssrfResolver.lookup = originalLookup;
  });

  await assert.rejects(
    () => new BusinessCentralCredential().resolve(ctx(), { clientId: 'id', clientSecret: 'sec' }, null),
    (err: unknown) => {
      assert.ok(err instanceof NodeError, 'expected a NodeError');
      assert.equal(err.code, 'BLOCKED_ADDRESS');
      return true;
    },
  );
  assert.equal(calls, 0, 'the client secret must never reach the wire');
});

// PO-185: the size cap was the one protection `safeFetch` does not apply on the
// caller's behalf — it hands back a `Response` and the reading is the caller's.
// `postForm` read it with a bare `res.text()`, so the one answer this package
// takes without a node's settings in front of it was the one with no limit on
// it. The body here is well past the cap and never parsed: the read fails on
// the bytes, before the shape is considered.
// AC-13 — The answer from a token endpoint is read under a cap
test('postForm refuses a token-endpoint answer past the cap [@spec:credentials:AC-13]', async (t) => {
  stubFetch(t, { access_token: 'a'.repeat(2 * 1024 * 1024) });

  await assert.rejects(
    () => new BusinessCentralCredential().resolve(ctx(), { clientId: 'id', clientSecret: 'sec' }, null),
    (err: unknown) => {
      assert.ok(err instanceof NodeError, 'expected a NodeError');
      assert.equal(err.code, 'RESPONSE_TOO_LARGE');
      return true;
    },
  );
});

// PO-185: `postForm` passes `ctx.signal` and no budget of its own, so the
// deadline is `safeFetch`'s default. The signal already ends a cancelled run;
// what this guards is the run nobody cancels — a token endpoint that simply
// never answers used to hold a resolve for as long as the workflow lived. No
// spec claim: the budget itself is `request-budget.md`, and this asserts only
// that the token exchange is inside it. Time is not waited for — `setTimeout`
// fires immediately, the device that spec's AC-3 uses.
test('postForm fails on the request budget when the token endpoint never answers', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalLookup = ssrfResolver.lookup;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.fetch = (_url, opts) =>
    new Promise((_resolve, reject) => {
      opts?.signal?.addEventListener('abort', () =>
        reject(new DOMException('The operation was aborted.', 'AbortError')),
      );
    });
  ssrfResolver.lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  // @ts-expect-error partial overload patch
  globalThis.setTimeout = (fn: () => void, _delay: number) => originalSetTimeout(fn, 0);
  t.after(() => {
    globalThis.fetch = originalFetch;
    ssrfResolver.lookup = originalLookup;
    globalThis.setTimeout = originalSetTimeout;
  });

  await assert.rejects(
    () => new BusinessCentralCredential().resolve(ctx(), { clientId: 'id', clientSecret: 'sec' }, null),
    (err: unknown) => {
      assert.ok(err instanceof NodeError, 'expected a NodeError');
      assert.equal(err.code, 'TIMEOUT');
      return true;
    },
  );
});

// PO-185: a token endpoint answering 3xx used to be followed wherever it
// pointed, because a raw `fetch` follows redirects itself and nothing looked at
// the hop. Through `safeFetch` every hop is judged again, so a public host can
// no longer hand the exchange on to an internal address. The call count is the
// assertion: the second request must never be made. No spec claim — how a hop
// is judged is `ssrf-guard.md` and `redirect-following.md`; this asserts only
// that the token exchange is inside them.
test('postForm does not follow a token-endpoint redirect to a private address', async (t) => {
  let calls = 0;
  const originalFetch = globalThis.fetch;
  const originalLookup = ssrfResolver.lookup;
  globalThis.fetch = async () => {
    calls++;
    return new Response(null, {
      status: 302,
      headers: { location: 'https://internal.example/token' },
    });
  };
  ssrfResolver.lookup = async (hostname: string) =>
    hostname === 'token.example'
      ? [{ address: '93.184.216.34', family: 4 }]
      : [{ address: '169.254.169.254', family: 4 }];
  t.after(() => {
    globalThis.fetch = originalFetch;
    ssrfResolver.lookup = originalLookup;
  });

  await assert.rejects(
    () => new BusinessCentralCredential().resolve(ctx(), { clientId: 'id', clientSecret: 'sec' }, null),
    (err: unknown) => {
      assert.ok(err instanceof NodeError, 'expected a NodeError');
      assert.equal(err.code, 'BLOCKED_ADDRESS');
      return true;
    },
  );
  assert.equal(calls, 1, 'the hop must not be followed');
});

// ----------------------------------------------------- OAuth2 auth-code

class AuthCodeCredential extends OAuth2AuthCodeCredential {
  readonly description = describe('revenexx:authy', 'oauth2-authcode');

  protected authorizeUrl(_config: Config): string {
    return 'https://auth.example/authorize';
  }

  protected tokenUrl(_config: Config): string {
    return 'https://auth.example/token';
  }

  protected clientId(_config: Config): string {
    return 'cid';
  }

  protected clientSecret(_config: Config): string {
    return 'csec';
  }

  protected scope(_config: Config): string {
    return 'offline_access';
  }
}

// AC-7 — An authorisation link carries the proof the callback will be checked against
test('OAuth2AuthCodeCredential.buildAuthorizeUrl includes PKCE + state [@spec:credentials:AC-7]', async () => {
  const { authorizeUrl, codeVerifier } = await new AuthCodeCredential().buildAuthorizeUrl(
    ctx(),
    {},
    { redirectUri: 'https://cb', state: 'st' },
  );

  const url = new URL(authorizeUrl);
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), 'cid');
  assert.equal(url.searchParams.get('state'), 'st');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(url.searchParams.get('code_challenge'));
  assert.ok(codeVerifier);
});

// AC-8 — Exchanging the code yields something the next run can use
test('OAuth2AuthCodeCredential.exchangeCode returns a refresh token [@spec:credentials:AC-8]', async (t) => {
  stubFetch(t, { access_token: 'a', refresh_token: 'r', expires_in: 3600 });

  const { durableCreds } = await new AuthCodeCredential().exchangeCode(
    ctx(),
    {},
    { code: 'c', redirectUri: 'https://cb' },
  );

  assert.equal(durableCreds['refreshToken'], 'r');
});

// AC-9 — A refresh token replaced during a refresh is written down, not just used
test('OAuth2AuthCodeCredential.resolve refreshes and persists a rotated token [@spec:credentials:AC-9]', async (t) => {
  stubFetch(t, { access_token: 'a2', refresh_token: 'r2', expires_in: 3600 });

  let persisted: Record<string, unknown> | undefined;
  const result = await new AuthCodeCredential().resolve(
    ctx(async (creds) => {
      persisted = creds;
    }),
    {},
    { refreshToken: 'r1' },
  );

  assert.equal(result.credentials['accessToken'], 'a2');
  assert.deepEqual(persisted, { refreshToken: 'r2' });
});

// AC-10 — Resolving with no refresh token fails rather than returning nothing
test('OAuth2AuthCodeCredential.resolve throws when there is no refresh token [@spec:credentials:AC-10]', async () => {
  // Assert the REASON, not just that it rejects: without the guard clause the
  // resolve goes on to post a refresh with no token, which fails against the
  // network anyway — so a bare `rejects` passes with the clause deleted.
  await assert.rejects(
    () => new AuthCodeCredential().resolve(ctx(), {}, null),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /no refresh_token/);
      return true;
    },
  );
});

// auth-code test() validates the full code-exchange config (incl. clientSecret)
class StrictAuthCodeCredential extends OAuth2AuthCodeCredential {
  readonly description = describe('revenexx:strict-authy', 'oauth2-authcode');

  protected authorizeUrl(_config: Config): string {
    return 'https://auth.example/authorize';
  }

  protected tokenUrl(_config: Config): string {
    return 'https://auth.example/token';
  }

  protected clientId(config: Config): string {
    const v = config['clientId'];
    if (typeof v !== 'string' || v === '') {
      throw new Error('clientId required');
    }
    return v;
  }

  protected clientSecret(config: Config): string {
    const v = config['clientSecret'];
    if (typeof v !== 'string' || v === '') {
      throw new Error('clientSecret required');
    }
    return v;
  }
}

// AC-11 — A credential test says which setting is at fault, and passes when complete
test('OAuth2AuthCodeCredential.test fails when clientSecret is missing [@spec:credentials:AC-11]', async () => {
  const result = await new StrictAuthCodeCredential().test(ctx(), { clientId: 'id' });
  assert.equal(result.ok, false);
  assert.match(String(result.message), /clientSecret/);
});

// AC-11 — A credential test says which setting is at fault, and passes when complete
test('OAuth2AuthCodeCredential.test passes with a complete config [@spec:credentials:AC-11]', async () => {
  const result = await new StrictAuthCodeCredential().test(ctx(), { clientId: 'id', clientSecret: 'sec' });
  assert.equal(result.ok, true);
});

// AC-12 — A refusal from the token endpoint names the OAuth fields and nothing else
test('token-endpoint errors surface OAuth fields but never the raw body [@spec:credentials:AC-12]', async (t) => {
  // Body includes a field that must NOT leak into the error message.
  stubFetch(t, { error: 'invalid_client', error_description: 'bad creds', leaked_secret: 'DO_NOT_LEAK' }, 400);

  await assert.rejects(
    () => new BusinessCentralCredential().resolve(ctx(), { clientId: 'id', clientSecret: 'sec' }, null),
    (err: Error) =>
      err.message.includes('invalid_client') &&
      err.message.includes('bad creds') &&
      !err.message.includes('DO_NOT_LEAK'),
  );
});
