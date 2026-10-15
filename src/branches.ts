import type { INode, INodeDescription, INodeResult, IOutputPort } from './types.js';

/**
 * A node's output ports are alternatives: exactly one fires. A node with a
 * single port has nothing to choose between, so its result may leave `branch`
 * out; a node with several must say which one it took, because the worker
 * otherwise activates every outgoing connection (PO-751).
 *
 * "Several" is not always countable from the declaration, so a node counts as
 * multi-port when ANY of these holds:
 *  - more than one port is declared (an `error` port counts: `out` + `error` is two);
 *  - a port is of kind `branch`;
 *  - a port's names come from elsewhere — `sourceFromConfig` or `resolveOutputs` —
 *    so how many there are is only known later.
 */
export function isMultiPort(outputs: readonly IOutputPort[] | undefined): boolean {
  if (!outputs) return false;
  return (
    outputs.length > 1 ||
    outputs.some((p) => p.kind === 'branch' || p.sourceFromConfig !== undefined || p.resolveOutputs === true)
  );
}

/** A result that names its branch — what every multi-port node returns. */
export interface IBranchedNodeResult extends INodeResult {
  branch: string;
}

/**
 * Declaration problems of a node's output ports that the manifest build can see.
 * Returns one sentence per problem, empty when there is none.
 *
 * A node with several fixed ports must give each a unique `name`, since `branch`
 * names one of them. (Whether `execute` really returns a `branch` cannot be read
 * from a declaration — see {@link assertBranchNamed}.)
 */
export function outputProblems(description: INodeDescription): string[] {
  const outputs = description.outputs ?? [];
  if (!isMultiPort(outputs)) return [];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const [i, port] of outputs.entries()) {
    const generated = port.sourceFromConfig !== undefined || port.resolveOutputs === true;
    if (generated) continue;
    if (port.name === undefined || port.name === '') {
      problems.push(
        `${description.slug}: output ${i + 1} has no name, so a branch cannot choose it — a node with several outputs must name each one.`,
      );
    } else if (seen.has(port.name)) {
      problems.push(`${description.slug}: output name "${port.name}" is declared twice.`);
    } else {
      seen.add(port.name);
    }
  }
  return problems;
}

/**
 * Check a result against the node's declaration. For a node's own tests:
 * `assertBranchNamed(node, await node.execute(ctx, inputs))`.
 *
 * Throws when a multi-port node returned no `branch`, and, where every port is
 * fixed, when the branch is not one of the declared names. A single-port node
 * may leave `branch` out.
 */
export function assertBranchNamed(node: INode | INodeDescription, result: INodeResult): void {
  const description = 'execute' in node ? node.description : node;
  const outputs = description.outputs ?? [];
  if (!isMultiPort(outputs)) return;
  if (typeof result.branch !== 'string' || result.branch === '') {
    throw new Error(
      `${description.slug} has several outputs, so its result must name the branch it took; without it every output fires.`,
    );
  }
  const fixed = outputs.every((p) => p.sourceFromConfig === undefined && p.resolveOutputs !== true && p.name);
  if (fixed && !outputs.some((p) => p.name === result.branch)) {
    throw new Error(
      `${description.slug} returned branch "${result.branch}", which is none of its outputs (${outputs.map((p) => p.name).join(', ')}).`,
    );
  }
}
