import { extractCredentialManifests, extractManifests } from './extract.js';
import type {
  IConfigField,
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

/**
 * `lucide:` and a kebab-case Lucide name — the same rule the registry enforces
 * on upload (`ICON_PATTERN` in the integrations service's `TarballInspector`).
 * A copy, not a shared source: a change on either side has to be made on both.
 */
const PACKAGE_ICON = /^lucide:[a-z0-9]+(-[a-z0-9]+)*$/;

/** The characters PHP's `trim()` removes by default, at either end. */
const PHP_TRIM = /^[ \t\n\r\0\v]+|[ \t\n\r\0\v]+$/g;

/**
 * Why a declared `revenexx.icon` would be refused by the registry, or
 * `undefined` when it is fine (or absent). Lets the build stop where the author
 * can still fix it, rather than at upload. Takes the icon as
 * {@link parsePackageMeta} returns it — trimmed as the registry trims it; an
 * untrimmed raw value can be refused here although the registry accepts it.
 */
export function packageIconProblem(icon: string | undefined): string | undefined {
  if (icon === undefined || PACKAGE_ICON.test(icon)) return undefined;
  return `package.json "revenexx.icon" must be a Lucide icon name such as "lucide:bell", got "${icon}".`;
}

/**
 * Extracts {@link NodePackageMeta} from parsed `package.json` contents, keeping
 * only the registry-relevant fields and coercing anything malformed to a safe
 * shape. All four fields are trimmed — the icon of ASCII whitespace only, as the
 * server's PHP `trim()` does, so a pasted no-break space is refused here as it
 * is there rather than trimmed away; a blank or whitespace-only value becomes
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
  const icon = typeof revenexx.icon === 'string' ? revenexx.icon.replace(PHP_TRIM, '') : '';
  return {
    name: str(obj.name),
    version: str(obj.version),
    displayName: displayName !== '' ? displayName : undefined,
    icon: icon !== '' ? icon : undefined,
  };
}

/**
 * The name patterns the registry enforces on a node's manifest when a package is
 * uploaded (PO-744), as written in the integrations service's node schema
 * (`app/Support/Schema/Versions/Node/V0DraftSchema.php`, read at `973b28c2`, 27
 * October 2026), under the same names. A copy, not a shared source: a change on
 * either side has to be made on both. They are exported as the schema's text, so
 * a test on the other side can compare them byte for byte.
 */
/** A port name, `sourceFromConfig` and `fallback.name`: lowercase kebab-case. */
export const SLUG_PATTERN = '^[a-z][a-z0-9-]{0,62}$';
/** A node's `slug`, and a credential type a setting names: `<namespace>:<slug>`. */
export const NAMESPACED_SLUG_PATTERN = '^[a-z][a-z0-9-]{0,62}:[a-z][a-z0-9-]{0,62}$';
/** A node's `version`. */
export const SEMVER_PATTERN = '^\\d+\\.\\d+\\.\\d+(-[a-zA-Z0-9.-]+)?$';
/** A setting's `key`, `dependsOn[]` and `showIf.key`: camelCase is allowed here, unlike in a port name. */
export const CONFIG_KEY_PATTERN = '^[a-zA-Z][a-zA-Z0-9-]*$';

const PATTERN_HINT: Record<string, string> = {
  [SLUG_PATTERN]: 'lowercase kebab-case, such as "not-found"',
  [NAMESPACED_SLUG_PATTERN]: '"<namespace>:<name>" in lowercase kebab-case, such as "core:http-request"',
  [SEMVER_PATTERN]: 'a semantic version, such as "1.0.0"',
  [CONFIG_KEY_PATTERN]: 'a letter, then letters, digits or "-", such as "postalCode"',
};

/**
 * Why the registry would refuse these nodes' names on upload, one line per value,
 * or `[]` when it would accept them (PO-744). Each line names the node, the path
 * of the field, the value and the pattern. Only values that are present are
 * judged: a missing slug or version is the schema's other rule, and a port may
 * leave its name out. Settings are walked into `properties` and `items` at any
 * depth; the schema allows less, so none is missed.
 */
export function nodeManifestProblems(nodes: readonly INodeDescription[]): string[] {
  const problems: string[] = [];
  for (const [index, node] of nodes.entries()) {
    // The slug names the node in every line, and may itself be the bad value.
    const who = `node ${index + 1} (${typeof node.slug === 'string' ? node.slug : 'no slug'})`;
    const check = (path: string, value: unknown, pattern: string) => {
      if (value === undefined || (typeof value === 'string' && new RegExp(pattern).test(value))) return;
      problems.push(
        `${who}: ${path} ${JSON.stringify(value)} is refused by the registry — it must match ${pattern} (${PATTERN_HINT[pattern]}).`,
      );
    };
    check('slug', node.slug, NAMESPACED_SLUG_PATTERN);
    check('version', node.version, SEMVER_PATTERN);
    for (const [i, port] of (node.outputs ?? []).entries()) {
      check(`outputs[${i}].name`, port.name, SLUG_PATTERN);
      check(`outputs[${i}].sourceFromConfig`, port.sourceFromConfig, SLUG_PATTERN);
      check(`outputs[${i}].fallback.name`, port.fallback?.name, SLUG_PATTERN);
    }
    const checkField = (field: IConfigField, at: string) => {
      check(`${at}.key`, field.key, CONFIG_KEY_PATTERN);
      for (const [j, key] of (field.dependsOn ?? []).entries()) check(`${at}.dependsOn[${j}]`, key, CONFIG_KEY_PATTERN);
      check(`${at}.showIf.key`, field.showIf?.key, CONFIG_KEY_PATTERN);
      const types = field.credentialType;
      if (Array.isArray(types)) {
        for (const [j, type] of types.entries()) check(`${at}.credentialType[${j}]`, type, NAMESPACED_SLUG_PATTERN);
      } else {
        check(`${at}.credentialType`, types, NAMESPACED_SLUG_PATTERN);
      }
      walk(field.properties, `${at}.properties`);
      if (field.items) checkField(field.items, `${at}.items`);
    };
    const walk = (fields: readonly IConfigField[] | undefined, path: string) => {
      for (const [i, field] of (fields ?? []).entries()) checkField(field, `${path}[${i}]`);
    };
    walk(node.config, 'config');
  }
  return problems;
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
