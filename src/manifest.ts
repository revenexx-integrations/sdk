import { extractCredentialManifests, extractManifests } from './extract.js';
import type { ICredential, ICredentialDescription, INode, INodeDescription } from './types.js';

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
}

/**
 * Builds the manifest envelope from a package's `NODES` (and optional
 * `CREDENTIALS`) exports. The result is what gets written to
 * `dist/manifest.json` and uploaded to the registry inside the tarball.
 */
export function buildManifest(nodes: INode[], credentials: ICredential[] = []): NodeManifest {
  const manifest: NodeManifest = {
    manifestVersion: MANIFEST_VERSION,
    nodes: extractManifests(nodes),
  };
  if (credentials.length > 0) {
    manifest.credentials = extractCredentialManifests(credentials);
  }
  return manifest;
}
