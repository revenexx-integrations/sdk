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
   * The publishing package's registry-relevant metadata (name, version, and the
   * human-readable bundle label). Optional and additive: older manifests built
   * before this field omit it, and the integrations server falls back to reading
   * these from the tarball's `package.json` for such packages.
   */
  package?: NodePackageMeta;
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
 * The registry-relevant fields of a node package's `package.json`. The
 * integrations server reads these directly from the tarball's `package.json`
 * (not from the built manifest) when registering a package — `name`/`version`
 * identify the package, `displayName` is the human-readable bundle label shown
 * in the editor's node palette (e.g. „Business Central"). This interface gives
 * that otherwise-untyped convention a home in the SDK contract.
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
 * shape. Does not validate that `name`/`version` are present — the integrations
 * server enforces that on upload; this is a typed, lenient read for tooling.
 */
export function parsePackageMeta(raw: unknown): NodePackageMeta {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    name: typeof obj.name === 'string' ? obj.name : '',
    version: typeof obj.version === 'string' ? obj.version : '',
    displayName: typeof obj.displayName === 'string' ? obj.displayName : undefined,
  };
}

/**
 * Builds the manifest envelope from a package's `NODES` (and optional
 * `CREDENTIALS` / `TEMPLATES`) exports. The result is what gets written to
 * `dist/manifest.json` and uploaded to the registry inside the tarball.
 */
export function buildManifest(
  nodes: INode[],
  credentials: ICredential[] = [],
  templates: ITemplateDescription[] = [],
  packageMeta?: NodePackageMeta,
): NodeManifest {
  const manifest: NodeManifest = {
    manifestVersion: MANIFEST_VERSION,
    nodes: extractManifests(nodes),
  };
  if (packageMeta) {
    manifest.package = packageMeta;
  }
  if (credentials.length > 0) {
    manifest.credentials = extractCredentialManifests(credentials);
  }
  if (templates.length > 0) {
    manifest.templates = templates;
  }
  return manifest;
}
