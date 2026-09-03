import type { Operator } from './operators.js';

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
  | 'credentials-ref'
  // Names one of the workflow's declared state namespaces (PO-374). The value
  // is the namespace NAME, which the node passes to `ctx.state.*`.
  | 'state-ref'
  // A marker field: the flat set of fields that replaces it is resolved at
  // author time by the node's `resolveConfigSchema` callback (PO-143).
  | 'dynamic-schema';

/**
 * Semantic category of an image, driving how the registry/CDN organises and
 * displays it.
 */
export type ImageCategory = 'screenshot' | 'logo' | 'banner' | 'icon' | 'other';

/**
 * A single image a node, credential type, or template ships alongside its
 * description (e.g. a screenshot, logo, or banner). The file is bundled into
 * the package tarball and uploaded to the Revenexx CDN when the package is
 * published.
 */
export interface IImage {
  /** Path to the image file, relative to the package root (e.g. `images/screenshot.png`). */
  src: string;
  alt: LocalizedString;
  title?: LocalizedString;
  category: ImageCategory;
}

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
  /**
   * Marks a generic port set resolved at author time by the node's
   * `resolveOutputs` callback (PO-143), rather than a static `name` or a
   * config-driven `sourceFromConfig`. Set at most one of `name`,
   * `sourceFromConfig`, `resolveOutputs` — this is a server-validated
   * constraint on publish, not enforced by this (intentionally flat) type.
   */
  resolveOutputs?: boolean;
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

/**
 * A condition on another setting's value, deciding whether this one applies.
 *
 * One condition, one key, one operator — `showIf: { key: 'source', op:
 * 'equals', value: 'field' }` reads as the sentence a node would otherwise
 * write under the field. The driving key MUST be a literal (it may not set
 * `expressionAllowed`), because applicability has to be decidable while the
 * author is typing; the same limit `dependsOn` carries, for the same reason.
 */
export interface IShowIfCondition {
  /** The `key` of another config field on the same node. */
  key: string;
  /** How to compare it — the shared comparison vocabulary, see `OPERATORS`. */
  op: Operator;
  /**
   * What to compare it to. Left out by the four operators that read presence
   * rather than content (`exists`, `notExists`, `isEmpty`, `isNotEmpty`).
   */
  value?: string | number | boolean;
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
   * When true, a *known* field's `options` are resolved at author time via the
   * node's `loadOptions` (a live/dependent dropdown) instead of a static
   * `options[]`. Applies to `select` / `multiselect`; left unset for ordinary
   * static fields.
   *
   * Independent of `type: 'dynamic-schema'`: that field type triggers
   * `resolveConfigSchema` on its own and does NOT require `dynamic: true`.
   */
  dynamic?: boolean;
  /**
   * Config keys whose values drive this field's dynamic resolution. The editor
   * re-resolves when one of them changes. A key listed here is
   * *dependency-driving* and MUST be a literal (it may not set
   * `expressionAllowed`), so its value is known at author time.
   */
  dependsOn?: string[];
  /**
   * When this field applies at all. The editor draws it only while the
   * condition holds, so a node says once in its manifest what it would
   * otherwise have to explain in prose under every affected field.
   *
   * Not to be confused with `dependsOn`, which sits beside it and does a
   * different thing: `dependsOn` re-*resolves* a dynamic field's options when
   * another field changes, and never decides whether the field is drawn.
   *
   * Left unset, the field always applies — so this is additive: a node that
   * says nothing behaves as it always did, and so does an editor that does not
   * know the key.
   */
  showIf?: IShowIfCondition;
  /**
   * Only meaningful when `type === 'credentials-ref'`: the namespaced slug(s) of
   * the credential type(s) this field accepts (e.g. `revenexx:smtp`). The editor
   * lists tenant credential instances of these type(s); the blob stores the
   * chosen instance UUID. Pass a single string when only one type is accepted,
   * or an array to let the field accept instances of any of several types (e.g.
   * a node that works with both an OAuth and an API-token credential).
   */
  credentialType?: string | string[];
  /**
   * Only meaningful when `type === 'state-ref'`: which kind of state namespace
   * this field accepts (PO-374). The editor lists the workflow's declared
   * namespaces of that role — and lets the author declare a new one without
   * leaving the node — and the blob stores the chosen NAME.
   *
   * Declare the field rather than hardcoding a namespace name in `execute`: a
   * literal is a contract nothing checks, and the mismatch surfaces as a 403 in
   * the first production run rather than as an empty picker while authoring. It
   * also narrows what the node may reach — a namespace is reachable only from
   * the node whose config names it.
   */
  stateRole?: 'mapping' | 'cursor' | 'dedupe' | 'digest';
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
  /**
   * Curated node-picker group path, outermost first (max 4 levels), e.g.
   * `[{ en: 'Business Central' }, { en: 'Sales Orders' }]`. Optional —
   * pickers without it fall back to package/category grouping.
   */
  groups?: LocalizedString[];
  /** Associated images (screenshots, logos, banners) shipped with the package. */
  images?: IImage[];
  inputs: Record<string, IInputPort>;
  /**
   * Output ports the workflow editor wires to downstream nodes. An empty array
   * marks a **terminal node**: the path ends here and no edge may leave it —
   * the mirror image of `inputs: {}` on a trigger. `StopAndErrorNode` is the
   * canonical case; it always throws, so there is no success path to wire, and
   * a port that can never fire would leave a dead handle on the canvas. The
   * key stays required so terminality is declared, not forgotten.
   */
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
  /**
   * The tenant state store: what this workflow already knows from earlier runs
   * (PO-374). Every call names a namespace the workflow declared in its
   * `state[]` block; anything else is refused by the engine, so a node cannot
   * reach state its workflow did not ask for.
   */
  state: INodeState;
}

/**
 * The four things a workflow can remember between runs, and the reason each is
 * its own operation rather than a generic get/set: the role decides *when* a
 * write becomes visible, and that decision is the engine's to make, not the
 * node author's.
 *
 * The four roles are named **mapping**, **cursor**, **dedupe** and **digest** —
 * those are the values a `state-ref` field's `stateRole` takes. `claim` below is
 * the *operation* on a dedupe namespace, not a role of its own.
 *
 * - **mapping** and **dedupe** take effect immediately. A correlation discarded
 *   because the run failed afterwards is how the next run creates a duplicate
 *   in the target system; a claim invisible to other runs protects against
 *   nothing.
 * - **cursor** and **digest** are staged and adopted only when the run
 *   completes. A watermark that advances on a failed run leaves exactly the gap
 *   it exists to prevent, and a digest may only count once the write it
 *   describes actually went through.
 *
 * At author time — the editor's "test this node" button — the store is
 * **read-only**: a rehearsal must not leave correlations behind that a later
 * production run would treat as truth. The write calls reject there.
 */
export interface INodeState {
  /** Correlate an id on each side of an integration (PIM article ↔ ERP number). */
  mapping: {
    /**
     * The partner id of a correlation, or `null` when it is unknown — which is
     * the usual way to decide between creating and updating in the target
     * system.
     *
     * `side` says which side of the pair `key` is on, not which side to return:
     * the default `'left'` matches `key` against the left id and answers with
     * the right one, and `'right'` does the reverse. It never searches both, so
     * a lookup on the wrong side answers `null` rather than falling back — and
     * `null` on the create path is what makes the target record a second time.
     */
    get(namespace: string, key: string, side?: 'left' | 'right'): Promise<string | null>;
    /**
     * Record a correlation. Takes effect immediately, and re-pointing one side
     * of an existing pair is refused: an id correlated two ways is always a bug,
     * and no later sync can untangle it.
     */
    put(
      namespace: string,
      left: string,
      right: string,
      metadata?: Record<string, unknown>,
    ): Promise<void>;
  };
  /** How far an incremental sync has read. */
  cursor: {
    /**
     * The committed watermark — an arbitrary JSON value such as
     * `{ updatedAfter }` or a provider page token — or `undefined` when the
     * sync has never run. A value staged by *this* run is not visible yet.
     */
    get(namespace: string, partitionKey?: string): Promise<unknown>;
    /**
     * Stage a watermark. Adopted only if the run completes, so a failed run
     * leaves the previous value in place and the next run picks the gap up.
     * `partitionKey` separates e.g. one shop or company code from another.
     */
    set(namespace: string, value: unknown, partitionKey?: string): Promise<void>;
  };
  /**
   * Claim a key for the duration of its TTL. `true` means this caller got it;
   * `false` means the key is held and this delivery is a duplicate — the normal
   * answer under at-least-once delivery, and a value to branch on rather than an
   * error.
   *
   * **A claim outlives the attempt that made it.** The holder is not identified:
   * a claim is taken over only once it has expired, so a retry of the very
   * attempt that claimed the key — after a transient failure that happened
   * *after* the claim — is also told `false`. Treating that as a duplicate drops
   * the delivery for the rest of the TTL, which makes `ttlSeconds` the retry
   * window as much as the duplicate-suppression window. Choose it against both,
   * and do not claim earlier in the node than necessary.
   *
   * `ttlSeconds` defaults to 604800 (seven days) and is accepted between 1 and
   * 31536000.
   */
  claim(namespace: string, key: string, opts?: { ttlSeconds?: number }): Promise<boolean>;
  /** Skip expensive writes for entities that have not changed. */
  digest: {
    /** Whether the entity still carries this hash — i.e. the write can be skipped. */
    unchanged(namespace: string, entityKey: string, digest: string): Promise<boolean>;
    /** Stage a hash; adopted only if the run completes. Call it *after* the write. */
    set(namespace: string, entityKey: string, digest: string): Promise<void>;
  };
}

export interface INodeResult {
  outputs: Record<string, unknown>;
  branch?: string;
}

/**
 * Context handed to a node's *author-time* resolvers (`loadOptions`,
 * `resolveConfigSchema`, `resolveOutputs`). These run in the node-runtime host
 * (a Node side-container) while a user is editing the workflow — never in
 * `execute`. The result is snapshotted into the workflow blob at save, so the
 * runtime never calls these (PO-143).
 */
export interface INodeAuthorContext {
  signal: AbortSignal;
  logger: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
  /** The user's current partial config values. */
  config: Record<string, unknown>;
  /**
   * Lazily resolve a `secret-ref` config field's value (a key in the tenant
   * secret store → a single string). Mirrors {@link INodeContext.secrets} so a
   * resolver that authenticates via a secret-ref uses the same call it would in
   * `execute`. Resolves against the internal secret endpoint; only the keys the
   * resolver actually asks for are fetched.
   */
  secrets: {
    get(key: string): Promise<string>;
  };
  /**
   * Lazily resolve a `credentials-ref` instance's access data via the
   * credentials broker (id → structured material, e.g. `{ accessToken }`).
   * Mirrors {@link INodeContext.credentials}.
   */
  credentials: {
    get(credentialsId: string): Promise<Record<string, unknown>>;
  };
  /** Preferred locale for resolved labels, when the caller supplies one. */
  locale?: string;
  /**
   * The operator's type-to-search term for the option list being resolved.
   * Only set for `loadOptions` calls. Providers may pass it to a server-side
   * search endpoint or use it to filter the options they return.
   */
  search?: string;
}

export interface INode {
  description: INodeDescription;
  execute(ctx: INodeContext, inputs: Record<string, unknown>): Promise<INodeResult>;
  /**
   * Author-time: resolve the options of a `dynamic` field (a live/dependent
   * dropdown). `fieldKey` is the config key being resolved. Optional — declare
   * it only for nodes with `dynamic` `select`/`multiselect` fields.
   */
  loadOptions?(ctx: INodeAuthorContext, fieldKey: string): Promise<IConfigOption[]>;
  /**
   * Author-time: resolve the flat set of typed config fields that replaces a
   * `type: 'dynamic-schema'` marker (e.g. an API's parameters once app + API
   * are chosen). Returns fields in the same config-field grammar; the node is
   * responsible for flattening any nested API shape into flat keys.
   */
  resolveConfigSchema?(ctx: INodeAuthorContext): Promise<IConfigField[]>;
  /**
   * Author-time: resolve a generic output-port set for an output marked
   * `resolveOutputs` (e.g. ports derived from a connected resource's schema).
   */
  resolveOutputs?(ctx: INodeAuthorContext): Promise<IOutputPort[]>;
}

/**
 * Optional capability interface for nodes that iterate over a collection.
 * Implement this alongside {@link INode} to signal to the runtime that this
 * node drives iteration — the runtime will call {@link extractItems} instead
 * of relying on slug-based detection.
 *
 * This interface is the designated dispatch point for future child-workflow
 * execution: once per-iteration isolation is needed, the runtime can swap the
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
  /** Associated images (screenshots, logos, banners) shipped with the package. */
  images?: IImage[];
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

// ------------------------------------------------------------------ Templates

/** Difficulty level surfaced in the template gallery. */
export type TemplateLevel = 'beginner' | 'intermediate' | 'advanced';

/** Trigger kind a template can ship; mirrors the server's `TriggerType`. */
export type TemplateTriggerType = 'manual' | 'schedule' | 'webhook' | 'event';

/**
 * A trigger a template instantiates alongside its workflow. The `handle` is a
 * stable UUID the workflow blob's edges reference via `from.nodeId`. Per-type
 * `config` shapes: `schedule` → `{ cron, timezone? }`, `webhook` →
 * `{ method, secretRef?, public? }`, `event` → `{ subject }`, `manual` → none.
 * The integrations server deep-validates `config` per `type` on publish.
 */
export interface ITemplateTrigger {
  /** Stable UUID the blob's edges reference via `from.nodeId`. */
  handle: string;
  type: TemplateTriggerType;
  name?: string;
  config?: Record<string, unknown>;
  active?: boolean;
}

/**
 * A workflow template a node package publishes: a ready-made workflow blueprint
 * the editor offers as a starting point. Unlike {@link INode}/{@link ICredential}
 * a template carries no executable code — it is plain data, so a package exports
 * its `ITemplateDescription`s directly (no class wrapper).
 *
 * The `definition` is a workflow blob authored against the workflow-blob grammar
 * named by `blobVersion`; the integrations server validates it on publish.
 */
export interface ITemplateDescription {
  /** Stable namespaced identifier `<namespace>:<slug>` (e.g. `revenexx:slack-to-crm`). */
  slug: string;
  version: string;
  /** Free-form grouping label shown in the gallery (e.g. `sales`). */
  category: string;
  level: TemplateLevel;
  name: LocalizedString;
  /** One-line summary shown on the template card. */
  shortDescription?: LocalizedString;
  /** Long-form description in Markdown. */
  description?: LocalizedString;
  icon?: string;
  /** Free-form industry tags (e.g. `any`, `medical`). */
  industries?: string[];
  /** Free-form vendor tags (e.g. `pipedrive`, `slack`). */
  vendors?: string[];
  /** Associated images (screenshots, logos, banners) shipped with the package. */
  images?: IImage[];
  /** Workflow-blob schema version `definition` targets (e.g. `v0-draft`). */
  blobVersion: string;
  /** The workflow blob instantiated when a user picks this template. */
  definition: Record<string, unknown>;
  /**
   * Triggers instantiated alongside the workflow (their `handle`s are
   * referenced by `definition`'s edges). Omit for a manual-only template.
   */
  triggers?: ITemplateTrigger[];
}
