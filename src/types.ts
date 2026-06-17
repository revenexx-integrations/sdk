export type LocalizedString = string | Record<string, string>;

export type DataType = 'any' | 'object' | 'array' | 'string' | 'number' | 'boolean';
export type OutputKind = 'default' | 'branch' | 'error';
export type NodeCategory = 'trigger' | 'action' | 'transform' | 'control' | 'io';
export type ConfigType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'object'
  | 'array'
  | 'expression'
  | 'secret-ref'
  | 'credentials-ref';

export interface IInputPort {
  dataType: DataType;
  required?: boolean;
  description?: LocalizedString;
}

export interface IOutputField {
  dataType: DataType;
  description?: LocalizedString;
}

export interface IOutputPort {
  kind: OutputKind;
  dataType: DataType;
  name?: string;
  label?: LocalizedString;
  description?: LocalizedString;
  fields?: Record<string, IOutputField>;
  sourceFromConfig?: string;
  fallback?: {
    name: string;
    label?: LocalizedString;
    description?: LocalizedString;
  };
}

export interface IConfigOption {
  value: string | number | boolean;
  label: LocalizedString;
}

export interface IConfigValidation {
  pattern?: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
}

export interface IConfigFieldBase {
  key: string;
  label: LocalizedString;
  type: ConfigType;
  description?: LocalizedString;
  required?: boolean;
  default?: unknown;
  placeholder?: LocalizedString;
  expressionAllowed?: boolean;
  multiline?: boolean;
  validation?: IConfigValidation;
  options?: IConfigOption[];
  /**
   * Only meaningful when `type === 'credentials-ref'`: the namespaced slug of
   * the credential type this field requires (e.g. `revenexx:smtp`). The editor
   * lists only tenant credential instances of this type; the blob stores the
   * chosen instance UUID.
   */
  credentialType?: string;
}

export interface IConfigField extends IConfigFieldBase {
  properties?: IConfigFieldBase[];
  items?: IConfigFieldBase;
}

export interface INodeDescription {
  slug: string;
  version: string;
  category: NodeCategory;
  name: LocalizedString;
  description?: LocalizedString;
  icon?: string;
  inputs: Record<string, IInputPort>;
  outputs: IOutputPort[];
  config?: IConfigField[];
}

export interface INodeContext {
  signal: AbortSignal;
  logger: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
  secrets: {
    get(key: string): Promise<string>;
  };
  /**
   * Resolve the access data of a credential instance the node references via a
   * `credentials-ref` config field. The runtime fulfils this from the
   * credentials broker at execution time (inside the Temporal activity), so the
   * returned value — e.g. a short-lived access token — is always current and
   * never persisted into workflow history.
   */
  credentials: {
    get(credentialsId: string): Promise<Record<string, unknown>>;
  };
}

export interface INodeResult {
  outputs: Record<string, unknown>;
  branch?: string;
}

export interface INode {
  description: INodeDescription;
  execute(ctx: INodeContext, inputs: Record<string, unknown>): Promise<INodeResult>;
}

/**
 * Optional capability interface for nodes that iterate over a collection.
 * Implement this alongside {@link INode} to signal to the worker that this
 * node drives iteration — the worker will call {@link extractItems} instead
 * of relying on slug-based detection.
 *
 * This interface is the designated dispatch point for future child-workflow
 * execution: once per-iteration isolation is needed, the worker can swap the
 * inline loop for `executeChild` calls without any changes to the node or SDK.
 */
export interface INodeWithIteration {
  /**
   * Extracts the array of items to iterate over from the resolved inputs and
   * config. Must be pure and synchronous — it runs inside a Temporal Activity.
   */
  extractItems(inputs: Record<string, unknown>, config: Record<string, unknown>): unknown[];
}

/**
 * Type guard that checks whether a node implements {@link INodeWithIteration}.
 */
export function isNodeWithIteration(node: INode): node is INode & INodeWithIteration {
  return typeof (node as INode & Partial<INodeWithIteration>).extractItems === 'function';
}

// ---------------------------------------------------------------- Credentials

/**
 * The authentication strategy a credential type uses. Determines which SDK
 * base class a concrete credential extends and how the broker resolves it.
 */
export type CredentialAuthKind =
  | 'static'
  | 'api-key'
  | 'basic'
  | 'oauth2-client-credentials'
  | 'oauth2-authcode';

/**
 * Field types for the connection parameters a credential type declares. A
 * superset-subset of {@link ConfigType}: scalars plus `secret` for values that
 * must be masked in the UI and never returned in plaintext by the public API.
 */
export type CredentialFieldType = 'string' | 'number' | 'boolean' | 'select' | 'secret';

export interface ICredentialField {
  key: string;
  label: LocalizedString;
  type: CredentialFieldType;
  description?: LocalizedString;
  required?: boolean;
  default?: unknown;
  placeholder?: LocalizedString;
  validation?: IConfigValidation;
  options?: IConfigOption[];
}

/**
 * The published contract of a credential type: how the editor renders its
 * config form and which auth strategy the broker applies. The imperative
 * `test`/`resolve` logic lives in the bundled {@link ICredential} code, not in
 * this description.
 */
export interface ICredentialDescription {
  /** Stable namespaced identifier `<namespace>:<slug>` (e.g. `revenexx:smtp`). */
  slug: string;
  version: string;
  name: LocalizedString;
  description?: LocalizedString;
  icon?: string;
  authKind: CredentialAuthKind;
  fields: ICredentialField[];
}

/**
 * Runtime context handed to a credential's `test`/`resolve`. Runs in the
 * credentials broker (a Node side-container), never in workflow code.
 */
export interface ICredentialContext {
  signal: AbortSignal;
  logger: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
  /**
   * Persist updated durable credentials (e.g. a rotated `refresh_token`) back
   * to storage. The broker wires this to `PATCH /v1/internal/credentials/{id}/durable-creds`.
   * Absent during pre-save tests where no instance exists yet.
   */
  persistDurableCreds?(durableCreds: Record<string, unknown>): Promise<void>;
}

export interface ICredentialTestResult {
  ok: boolean;
  message?: string;
}

export interface ICredentialResolveResult {
  /** The access data handed to the node (e.g. `{ host, port, user, password }` or `{ accessToken }`). */
  credentials: Record<string, unknown>;
  /** ISO-8601 expiry of the resolved access data; absent for non-expiring (static) credentials. */
  expiresAt?: string;
}

/**
 * A credential type implementation. `config` is the validated, user-entered
 * field map; `durableCreds` holds system-managed long-lived secrets (e.g. a
 * `refresh_token` obtained via 3-legged OAuth) and is `null` until they exist.
 */
export interface ICredential {
  description: ICredentialDescription;
  test(ctx: ICredentialContext, config: Record<string, unknown>): Promise<ICredentialTestResult>;
  resolve(
    ctx: ICredentialContext,
    config: Record<string, unknown>,
    durableCreds: Record<string, unknown> | null,
  ): Promise<ICredentialResolveResult>;
}

/**
 * Optional capability for `oauth2-authcode` credentials that need the
 * interactive (3-legged) consent dance. The broker exposes these via
 * `/oauth/authorize-url` and `/oauth/exchange-code`; Laravel proxies them.
 */
export interface ICredentialOAuthAuthorize {
  buildAuthorizeUrl(
    ctx: ICredentialContext,
    config: Record<string, unknown>,
    params: { redirectUri: string; state: string },
  ): Promise<{ authorizeUrl: string; codeVerifier?: string }>;
  exchangeCode(
    ctx: ICredentialContext,
    config: Record<string, unknown>,
    params: { code: string; redirectUri: string; codeVerifier?: string },
  ): Promise<{ durableCreds: Record<string, unknown> }>;
}

/**
 * Type guard for credentials that implement the 3-legged OAuth consent flow.
 */
export function isOAuthAuthorizeCredential(
  credential: ICredential,
): credential is ICredential & ICredentialOAuthAuthorize {
  const candidate = credential as ICredential & Partial<ICredentialOAuthAuthorize>;
  return (
    typeof candidate.buildAuthorizeUrl === 'function' &&
    typeof candidate.exchangeCode === 'function'
  );
}
