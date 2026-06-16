import { createHash, randomBytes } from 'node:crypto';
import type {
  ICredential,
  ICredentialContext,
  ICredentialDescription,
  ICredentialOAuthAuthorize,
  ICredentialResolveResult,
  ICredentialTestResult,
} from './types.js';

/**
 * Reusable credential base classes. Concrete credential types (in node
 * packages) extend one of these and only supply field mappings / endpoints —
 * the auth strategy itself lives here so it is implemented once.
 *
 * All of this runs in the credentials broker (a Node side-container), never in
 * workflow code, so wall-clock time and network I/O are fine.
 */

type Config = Record<string, unknown>;
type DurableCreds = Record<string, unknown> | null;

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

function requireString(source: Record<string, unknown>, key: string, what: string): string {
  const value = readString(source, key);
  if (value === undefined || value === '') {
    throw new Error(`${what}: missing required value "${key}"`);
  }
  return value;
}

/** Compute the ISO expiry from an OAuth `expires_in` (seconds), if present. */
function expiryFromExpiresIn(expiresIn: unknown): string | undefined {
  const seconds = typeof expiresIn === 'number' ? expiresIn : Number(expiresIn);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }
  return new Date(Date.now() + seconds * 1000).toISOString();
}

interface OAuthTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  [key: string]: unknown;
}

/**
 * The base for every credential type. Stores the published description and
 * provides a small HTTP helper. `resolve` is abstract; `test` defaults to a
 * presence check and should be overridden where a real connection test exists.
 */
export abstract class BaseCredential implements ICredential {
  abstract readonly description: ICredentialDescription;

  abstract resolve(
    ctx: ICredentialContext,
    config: Config,
    durableCreds: DurableCreds,
  ): Promise<ICredentialResolveResult>;

  async test(_ctx: ICredentialContext, config: Config): Promise<ICredentialTestResult> {
    for (const field of this.description.fields) {
      if (field.required && (config[field.key] === undefined || config[field.key] === '')) {
        return { ok: false, message: `Missing required field "${field.key}"` };
      }
    }
    return { ok: true };
  }

  /** POST `application/x-www-form-urlencoded` and parse a JSON token response. */
  protected async postForm(
    ctx: ICredentialContext,
    url: string,
    form: Record<string, string | undefined>,
    headers: Record<string, string> = {},
  ): Promise<OAuthTokenResponse> {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(form)) {
      if (value !== undefined) {
        body.set(key, value);
      }
    }

    const res = await fetch(url, {
      method: 'POST',
      signal: ctx.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', ...headers },
      body,
    });

    const text = await res.text();
    if (!res.ok) {
      // Surface only the standard OAuth error fields (RFC 6749 §5.2), never the
      // raw body — token endpoints can echo request params or diagnostics that
      // may contain secrets/PII, which would then leak via logs/error reporting.
      throw new Error(`token endpoint ${url} -> ${res.status}${formatOAuthError(text)}`);
    }
    try {
      return JSON.parse(text) as OAuthTokenResponse;
    } catch {
      throw new Error(`token endpoint ${url} returned non-JSON body`);
    }
  }
}

/**
 * Extract `{ error, error_description }` (RFC 6749 §5.2) from a token-endpoint
 * error body for a safe, useful message. Returns an empty string when the body
 * is not a recognisable OAuth error object — the raw body is never included.
 */
function formatOAuthError(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: unknown; error_description?: unknown };
    const error = typeof parsed.error === 'string' ? parsed.error : undefined;
    if (!error) {
      return '';
    }
    const description = typeof parsed.error_description === 'string' ? parsed.error_description : undefined;
    return `: ${error}${description ? ` (${description})` : ''}`;
  } catch {
    return '';
  }
}

/**
 * "Simple value retrieval": the validated config fields ARE the access data
 * handed to the node (e.g. SMTP host/port/user/password, SFTP host/key). No
 * token, no expiry. Override `test` to add a real connection check.
 */
export abstract class SimpleValueCredential extends BaseCredential {
  async resolve(
    _ctx: ICredentialContext,
    config: Config,
    _durableCreds: DurableCreds,
  ): Promise<ICredentialResolveResult> {
    return { credentials: { ...config } };
  }
}

/**
 * API-key credential. By default exposes the configured key under
 * `{ apiKey }`; override {@link apiKeyField}/{@link credentialShape} to map.
 */
export abstract class ApiKeyCredential extends BaseCredential {
  protected apiKeyField(): string {
    return 'apiKey';
  }

  protected credentialShape(apiKey: string): Record<string, unknown> {
    return { apiKey };
  }

  async resolve(
    _ctx: ICredentialContext,
    config: Config,
    _durableCreds: DurableCreds,
  ): Promise<ICredentialResolveResult> {
    const apiKey = requireString(config, this.apiKeyField(), this.description.slug);
    return { credentials: this.credentialShape(apiKey) };
  }
}

/**
 * HTTP Basic auth credential. Exposes `{ username, password }` by default.
 */
export abstract class BasicAuthCredential extends BaseCredential {
  protected usernameField(): string {
    return 'username';
  }

  protected passwordField(): string {
    return 'password';
  }

  async resolve(
    _ctx: ICredentialContext,
    config: Config,
    _durableCreds: DurableCreds,
  ): Promise<ICredentialResolveResult> {
    const username = requireString(config, this.usernameField(), this.description.slug);
    const password = requireString(config, this.passwordField(), this.description.slug);
    return { credentials: { username, password } };
  }
}

/**
 * OAuth2 client-credentials grant (service-to-service, no user, no
 * refresh_token). Concrete types supply the token endpoint + client creds via
 * the config field map. Robust to downtime: a fresh access token is minted on
 * every resolve when the broker cache misses.
 */
export abstract class OAuth2ClientCredentialsCredential extends BaseCredential {
  protected abstract tokenUrl(config: Config): string;
  protected abstract clientId(config: Config): string;
  protected abstract clientSecret(config: Config): string;

  protected scope(_config: Config): string | undefined {
    return undefined;
  }

  /** Map the raw token response to the node-facing credentials. */
  protected credentialShape(token: OAuthTokenResponse): Record<string, unknown> {
    return { accessToken: token.access_token, tokenType: token.token_type ?? 'Bearer' };
  }

  async resolve(
    ctx: ICredentialContext,
    config: Config,
    _durableCreds: DurableCreds,
  ): Promise<ICredentialResolveResult> {
    const token = await this.postForm(ctx, this.tokenUrl(config), {
      grant_type: 'client_credentials',
      client_id: this.clientId(config),
      client_secret: this.clientSecret(config),
      scope: this.scope(config),
    });
    if (!token.access_token) {
      throw new Error(`${this.description.slug}: token endpoint returned no access_token`);
    }
    return { credentials: this.credentialShape(token), expiresAt: expiryFromExpiresIn(token.expires_in) };
  }

  async test(ctx: ICredentialContext, config: Config): Promise<ICredentialTestResult> {
    try {
      await this.resolve(ctx, config, null);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }
}

/**
 * OAuth2 authorization-code grant (3-legged, interactive consent). Implements
 * the consent dance (with PKCE by default), code exchange, and refresh-token
 * based resolution. The long-lived `refresh_token` is stored in durableCreds;
 * if the provider rotates it, the new one is persisted via the context.
 */
export abstract class OAuth2AuthCodeCredential
  extends BaseCredential
  implements ICredentialOAuthAuthorize
{
  protected abstract authorizeUrl(config: Config): string;
  protected abstract tokenUrl(config: Config): string;
  protected abstract clientId(config: Config): string;
  protected abstract clientSecret(config: Config): string;

  protected scope(_config: Config): string | undefined {
    return undefined;
  }

  protected usePkce(): boolean {
    return true;
  }

  protected credentialShape(token: OAuthTokenResponse): Record<string, unknown> {
    return { accessToken: token.access_token, tokenType: token.token_type ?? 'Bearer' };
  }

  async buildAuthorizeUrl(
    _ctx: ICredentialContext,
    config: Config,
    params: { redirectUri: string; state: string },
  ): Promise<{ authorizeUrl: string; codeVerifier?: string }> {
    const url = new URL(this.authorizeUrl(config));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.clientId(config));
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('state', params.state);
    const scope = this.scope(config);
    if (scope) {
      url.searchParams.set('scope', scope);
    }

    let codeVerifier: string | undefined;
    if (this.usePkce()) {
      codeVerifier = base64Url(randomBytes(32));
      const challenge = base64Url(createHash('sha256').update(codeVerifier).digest());
      url.searchParams.set('code_challenge', challenge);
      url.searchParams.set('code_challenge_method', 'S256');
    }

    return { authorizeUrl: url.toString(), codeVerifier };
  }

  async exchangeCode(
    ctx: ICredentialContext,
    config: Config,
    params: { code: string; redirectUri: string; codeVerifier?: string },
  ): Promise<{ durableCreds: Record<string, unknown> }> {
    const token = await this.postForm(ctx, this.tokenUrl(config), {
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirectUri,
      client_id: this.clientId(config),
      client_secret: this.clientSecret(config),
      code_verifier: params.codeVerifier,
    });
    if (!token.refresh_token) {
      throw new Error(`${this.description.slug}: authorization_code exchange returned no refresh_token`);
    }
    return { durableCreds: { refreshToken: token.refresh_token } };
  }

  async resolve(
    ctx: ICredentialContext,
    config: Config,
    durableCreds: DurableCreds,
  ): Promise<ICredentialResolveResult> {
    const refreshToken = durableCreds ? readString(durableCreds, 'refreshToken') : undefined;
    if (!refreshToken) {
      throw new Error(`${this.description.slug}: not authorized — no refresh_token (needs_reauth)`);
    }

    const token = await this.postForm(ctx, this.tokenUrl(config), {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId(config),
      client_secret: this.clientSecret(config),
      scope: this.scope(config),
    });
    if (!token.access_token) {
      throw new Error(`${this.description.slug}: refresh returned no access_token`);
    }

    // Persist a rotated refresh_token (single-writer responsibility lies with
    // the broker/Laravel; here we just hand the new value back).
    if (token.refresh_token && token.refresh_token !== refreshToken && ctx.persistDurableCreds) {
      await ctx.persistDurableCreds({ refreshToken: token.refresh_token });
    }

    return { credentials: this.credentialShape(token), expiresAt: expiryFromExpiresIn(token.expires_in) };
  }

  async test(_ctx: ICredentialContext, config: Config): Promise<ICredentialTestResult> {
    // Pre-consent there is no refresh_token to exercise, so validate that the
    // full set of values the code-exchange/refresh will need is present and
    // well-formed: both endpoints are valid URLs and the client id/secret
    // resolve. (Subclasses read these from config; a missing required field
    // throws via requireString, which we surface as ok:false.)
    try {
      new URL(this.authorizeUrl(config));
      new URL(this.tokenUrl(config));
      this.clientId(config);
      this.clientSecret(config);
      return { ok: true, message: 'Configuration valid — complete the OAuth consent to finish setup.' };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }
}

function base64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
