import { extractManifests } from './extract.js';
import type { INode, INodeDescription } from './types.js';

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
  manifestVersion: string;
  nodes: INodeDescription[];
}

/**
 * Builds the manifest envelope from a list of nodes (typically the `NODES`
 * export of a node package). The result is what gets written to
 * `dist/manifest.json` and uploaded to the registry inside the tarball.
 */
export function buildManifest(nodes: INode[]): NodeManifest {
  return {
    manifestVersion: MANIFEST_VERSION,
    nodes: extractManifests(nodes),
  };
}
