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
 * the CLI. `name`/`version` identify the package; `displayName` is the
 * human-readable bundle label shown in the editor's node palette (e.g.
 * „Business Central"); `icon` marks its folder there. All four are read straight
 * from `package.json` by the integrations server on upload — the CLI reads them
 * only to warn about a missing label, to annotate the manifest log line, and to
 * stop on an icon the server would refuse.
 *
 * The label lives under a namespaced `revenexx` group in `package.json`
 * (`{ "revenexx": { "displayName": "…" } }`), not a bespoke top-level key, so
 * it can't collide with unrelated tooling that squats on `displayName`.
 */
export interface NodePackageMeta {
  name: string;
  version: string;
  /** Human-readable bundle label (e.g. „Business Central"); optional. */
  displayName?: string;
  /**
   * The glyph that marks the package's folder in the studio's palette, as
   * `lucide:<kebab-name>` (e.g. `lucide:bell`); optional. Declared by a package
   * holding several services, which has no one vendor logo to mark its folder
   * with — a package that is one vendor leaves it out. Trimmed, and a value that
   * is not a string counts as none, as the server reads it; whether it is well
   * formed is {@link packageIconProblem}'s question.
   */
  icon?: string;
}

/** `lucide:` and a kebab-case Lucide name — the same rule the registry enforces on upload. */
const PACKAGE_ICON = /^lucide:[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Why a declared `revenexx.icon` would be refused by the registry, or
 * `undefined` when it is fine (or absent). Lets the build stop where the author
 * can still fix it, rather than at upload.
 */
export function packageIconProblem(icon: string | undefined): string | undefined {
  if (icon === undefined || PACKAGE_ICON.test(icon)) return undefined;
  return `package.json "revenexx.icon" must be a Lucide icon name such as "lucide:bell", got "${icon}".`;
}

/**
 * Extracts {@link NodePackageMeta} from parsed `package.json` contents, keeping
 * only the registry-relevant fields and coercing anything malformed to a safe
 * shape. All four fields are trimmed; a blank or whitespace-only value becomes
 * `''` (`name`/`version`) or `undefined` (`displayName`, `icon`, matching how the
 * server treats them), so whitespace can't masquerade as a present value in
 * tooling. The bundle label and the folder icon are read from the `revenexx`
 * group (`revenexx.displayName`, `revenexx.icon`).
 * Does not validate that `name`/`version` are present — the integrations server
 * enforces that on upload; this is a typed, lenient read for tooling.
 */
export function parsePackageMeta(raw: unknown): NodePackageMeta {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const revenexx = (
    obj.revenexx && typeof obj.revenexx === 'object' ? obj.revenexx : {}
  ) as Record<string, unknown>;
  const displayName = str(revenexx.displayName);
  const icon = str(revenexx.icon);
  return {
    name: str(obj.name),
    version: str(obj.version),
    displayName: displayName !== '' ? displayName : undefined,
    icon: icon !== '' ? icon : undefined,
  };
}

/**
 * Builds the manifest envelope from a package's `NODES` (and optional
 * `CREDENTIALS` / `TEMPLATES`) exports. The result is what gets written to
 * `dist/manifest.json` and uploaded to the registry inside the tarball. The
 * bundle label is NOT carried here — the integrations server reads it straight
 * from `package.json` (`revenexx.displayName`).
 */
export function buildManifest(
  nodes: INode[],
  credentials: ICredential[] = [],
  templates: ITemplateDescription[] = [],
): NodeManifest {
  const manifest: NodeManifest = {
    manifestVersion: MANIFEST_VERSION,
    nodes: extractManifests(nodes),
  };
  if (credentials.length > 0) {
    manifest.credentials = extractCredentialManifests(credentials);
  }
  if (templates.length > 0) {
    manifest.templates = templates;
  }
  return manifest;
}
