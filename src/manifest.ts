import { extractCredentialManifests, extractManifests } from './extract.js';
import type {
  ICredential,
  ICredentialDescription,
  INode,
  INodeDescription,
  ITemplateDescription,
} from './types.js';

/**
 * Envelope version expected by the integrations server-side
 * `TarballInspector`. Earlier (pre-registry) builds emitted a bare array
 * without any `manifestVersion` field; `v0-draft` is currently the only
 * accepted value (see `SchemaServiceProvider::DOMAIN_NODE` in the
 * integrations service). Keeping it versioned lets the registry evolve the
 * shape without breaking older publishers.
 */
export const MANIFEST_VERSION = 'v0-draft';

export interface NodeManifest {
  manifestVersion: typeof MANIFEST_VERSION;
  /**
   * Package-level metadata the server cannot get from the tarball's
   * `package.json` on its own. Currently only the human-readable bundle
   * `displayName`; `name`/`version` are deliberately NOT duplicated here — the
   * server reads those straight from `package.json`. Optional and additive:
   * manifests built before this field (or packages without a `displayName`) omit
   * it, and the server falls back to the `package.json` `displayName`.
   */
  package?: { displayName: string };
  nodes: INodeDescription[];
  /**
   * Credential types this package publishes. Optional and additive: packages
   * that ship no credentials omit it (older publishers never set it).
   */
  credentials?: ICredentialDescription[];
  /**
   * Workflow templates this package publishes. Optional and additive: packages
   * that ship no templates omit it. Templates are plain data (no executable
   * code), so they are carried verbatim from the package's `TEMPLATES` export.
   */
  templates?: ITemplateDescription[];
}

/**
 * The registry-relevant fields of a node package's `package.json`, as read by
 * the CLI. `name`/`version` identify the package (the server reads them from
 * `package.json` directly); `displayName` is the human-readable bundle label
 * shown in the editor's node palette (e.g. „Business Central") — the CLI copies
 * only this into the manifest's {@link NodeManifest.package} block, so the label
 * has a typed SDK contract instead of a bespoke, untyped `package.json` key.
 */
export interface NodePackageMeta {
  name: string;
  version: string;
  /** Human-readable bundle label (e.g. „Business Central"); optional. */
  displayName?: string;
}

/**
 * Extracts {@link NodePackageMeta} from parsed `package.json` contents, keeping
 * only the registry-relevant fields and coercing anything malformed to a safe
 * shape. A blank or whitespace-only `displayName` is normalised to `undefined`
 * (matching how the server treats it), so tooling never emits an empty label.
 * Does not validate that `name`/`version` are present — the integrations server
 * enforces that on upload; this is a typed, lenient read for tooling.
 */
export function parsePackageMeta(raw: unknown): NodePackageMeta {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const displayName = typeof obj.displayName === 'string' ? obj.displayName.trim() : '';
  return {
    name: typeof obj.name === 'string' ? obj.name : '',
    version: typeof obj.version === 'string' ? obj.version : '',
    displayName: displayName !== '' ? displayName : undefined,
  };
}

/**
 * Builds the manifest envelope from a package's `NODES` (and optional
 * `CREDENTIALS` / `TEMPLATES`) exports. The result is what gets written to
 * `dist/manifest.json` and uploaded to the registry inside the tarball. Pass the
 * package's `displayName` to carry the bundle label in the `package` block; omit
 * it (or pass an empty value) to leave the block out.
 */
export function buildManifest(
  nodes: INode[],
  credentials: ICredential[] = [],
  templates: ITemplateDescription[] = [],
  displayName?: string,
): NodeManifest {
  const manifest: NodeManifest = {
    manifestVersion: MANIFEST_VERSION,
    nodes: extractManifests(nodes),
  };
  if (displayName) {
    manifest.package = { displayName };
  }
  if (credentials.length > 0) {
    manifest.credentials = extractCredentialManifests(credentials);
  }
  if (templates.length > 0) {
    manifest.templates = templates;
  }
  return manifest;
}
