import type { INodeManifestEntry } from './manifest.js';
import type { ICredential, ICredentialDescription, INode } from './types.js';
import { isNodeWithIteration } from './types.js';

/**
 * A node as the manifest carries it: its description, and `iterates` derived from
 * its code. Every path that builds a node manifest goes through here, so none can
 * leave the key out, and the derived value is written last, over anything a
 * description declares under that name (PO-761).
 */
export function extractManifest(node: INode): INodeManifestEntry {
  return { ...node.description, iterates: isNodeWithIteration(node) };
}

export function extractManifests(nodes: INode[]): INodeManifestEntry[] {
  return nodes.map(extractManifest);
}

export function extractCredentialManifest(credential: ICredential): ICredentialDescription {
  return credential.description;
}

export function extractCredentialManifests(credentials: ICredential[]): ICredentialDescription[] {
  return credentials.map(extractCredentialManifest);
}
