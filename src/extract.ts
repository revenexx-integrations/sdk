import type { INode, INodeDescription } from './types.js';

export function extractManifest(node: INode): INodeDescription {
  return node.description;
}

export function extractManifests(nodes: INode[]): INodeDescription[] {
  return nodes.map(extractManifest);
}
