import type { ICredential, ICredentialDescription, INode, INodeDescription } from './types.js';

export function extractManifest(node: INode): INodeDescription {
  return node.description;
}

export function extractManifests(nodes: INode[]): INodeDescription[] {
  return nodes.map(extractManifest);
}

export function extractCredentialManifest(credential: ICredential): ICredentialDescription {
  return credential.description;
}

export function extractCredentialManifests(credentials: ICredential[]): ICredentialDescription[] {
  return credentials.map(extractCredentialManifest);
}
