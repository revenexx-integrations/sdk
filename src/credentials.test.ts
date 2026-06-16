import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import {
  ApiKeyCredential,
  BasicAuthCredential,
  OAuth2AuthCodeCredential,
  OAuth2ClientCredentialsCredential,
  SimpleValueCredential,
} from './credentials.js';
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

/** Stub a JSON token response and restore `fetch` after the test. */
function stubFetch(t: TestContext, body: Record<string, unknown>, status = 200): void {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status });
  t.after(() => {
    globalThis.fetch = original;
  });
}

// ----------------------------------------------------------- SimpleValue

class SmtpCredential extends SimpleValueCredential {
  readonly description = describe('rvnxx:smtp', 'static', [
    { key: 'host', label: 'Host', type: 'string', required: true },
    { key: 'port', label: 'Port', type: 'number', required: true },
  ]);
}

test('SimpleValueCredential.resolve passes config through unchanged', async () => {
  const result = await new SmtpCredential().resolve(ctx(), { host: 'h', port: 25 }, null);

  assert.deepEqual(result.credentials, { host: 'h', port: 25 });
  assert.equal(result.expiresAt, undefined);
});

test('BaseCredential.test fails when a required field is missing', async () => {
  const result = await new SmtpCredential().test(ctx(), { host: 'h' });

  assert.equal(result.ok, false);
});

// ----------------------------------------------------------- ApiKey / Basic

class DeeplCredential extends ApiKeyCredential {
  readonly description = describe('rvnxx:deepl', 'api-key', [
    { key: 'apiKey', label: 'Key', type: 'secret', required: true },
  ]);
}

test('ApiKeyCredential.resolve returns the apiKey shape', async () => {
  const result = await new DeeplCredential().resolve(ctx(), { apiKey: 'abc' }, null);

  assert.deepEqual(result.credentials, { apiKey: 'abc' });
});

test('ApiKeyCredential.resolve throws when the key is missing', async () => {
  await assert.rejects(() => new DeeplCredential().resolve(ctx(), {}, null));
});

class BasicCredential extends BasicAuthCredential {
  readonly description = describe('rvnxx:basic', 'basic');
}

test('BasicAuthCredential.resolve returns username/password', async () => {
  const result = await new BasicCredential().resolve(ctx(), { username: 'u', password: 'p' }, null);

  assert.deepEqual(result.credentials, { username: 'u', password: 'p' });
});

// ----------------------------------------------- OAuth2 client-credentials

class BusinessCentralCredential extends OAuth2ClientCredentialsCredential {
  readonly description = describe('rvnxx:bc', 'oauth2-client-credentials');

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

test('OAuth2ClientCredentialsCredential mints an access token with expiry', async (t) => {
  stubFetch(t, { access_token: 'tok', token_type: 'Bearer', expires_in: 3600 });

  const result = await new BusinessCentralCredential().resolve(
    ctx(),
    { clientId: 'id', clientSecret: 'sec' },
    null,
  );

  assert.equal(result.credentials['accessToken'], 'tok');
  assert.ok(result.expiresAt, 'expiresAt should be derived from expires_in');
});

test('OAuth2ClientCredentialsCredential.test returns ok on a successful mint', async (t) => {
  stubFetch(t, { access_token: 'tok', expires_in: 3600 });

  const result = await new BusinessCentralCredential().test(ctx(), { clientId: 'id', clientSecret: 'sec' });

  assert.equal(result.ok, true);
});

// ----------------------------------------------------- OAuth2 auth-code

class AuthCodeCredential extends OAuth2AuthCodeCredential {
  readonly description = describe('rvnxx:authy', 'oauth2-authcode');

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

test('OAuth2AuthCodeCredential.buildAuthorizeUrl includes PKCE + state', async () => {
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

test('OAuth2AuthCodeCredential.exchangeCode returns a refresh token', async (t) => {
  stubFetch(t, { access_token: 'a', refresh_token: 'r', expires_in: 3600 });

  const { durableCreds } = await new AuthCodeCredential().exchangeCode(
    ctx(),
    {},
    { code: 'c', redirectUri: 'https://cb' },
  );

  assert.equal(durableCreds['refreshToken'], 'r');
});

test('OAuth2AuthCodeCredential.resolve refreshes and persists a rotated token', async (t) => {
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

test('OAuth2AuthCodeCredential.resolve throws when there is no refresh token', async () => {
  await assert.rejects(() => new AuthCodeCredential().resolve(ctx(), {}, null));
});

// auth-code test() validates the full code-exchange config (incl. clientSecret)
class StrictAuthCodeCredential extends OAuth2AuthCodeCredential {
  readonly description = describe('rvnxx:strict-authy', 'oauth2-authcode');

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

test('OAuth2AuthCodeCredential.test fails when clientSecret is missing', async () => {
  const result = await new StrictAuthCodeCredential().test(ctx(), { clientId: 'id' });
  assert.equal(result.ok, false);
  assert.match(String(result.message), /clientSecret/);
});

test('OAuth2AuthCodeCredential.test passes with a complete config', async () => {
  const result = await new StrictAuthCodeCredential().test(ctx(), { clientId: 'id', clientSecret: 'sec' });
  assert.equal(result.ok, true);
});

test('token-endpoint errors surface OAuth fields but never the raw body', async (t) => {
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
