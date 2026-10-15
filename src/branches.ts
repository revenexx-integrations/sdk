import type { INode, INodeDescription, INodeResult, IOutputPort } from './types.js';

/**
 * A node's output ports are alternatives: exactly one fires. A node with a
 * single port has nothing to choose between, so its result may leave `branch`
 * out; a node with several must say which one it took, because the worker
 * otherwise activates every outgoing connection (PO-751).
 *
 * A node counts as multi-port when EITHER holds:
 *  - more than one port is declared (an `error` port counts: `out` + `error` is two);
 *  - a port is marked `resolveOutputs`, because that set is only known while the
 *    author edits and may hold several.
 *
 * A single port is one way out however it is declared — of kind `branch`, or named
 * from a setting by `sourceFromConfig` (one name, with its `fallback`).
 */
export function isMultiPort(outputs: readonly IOutputPort[] | undefined): boolean {
  if (!outputs) return false;
  return outputs.length > 1 || outputs.some((p) => p.resolveOutputs === true);
}

/** A result that names its branch — what every multi-port node returns. */
export interface IBranchedNodeResult extends INodeResult {
  branch: string;
}

const isGenerated = (p: IOutputPort): boolean => p.sourceFromConfig !== undefined || p.resolveOutputs === true;

/**
 * Declaration problems of a node's output ports that the manifest build can see.
 * Returns one sentence per problem, empty when there is none.
 *
 * A node with several ports must give each fixed port a unique `name`, since `branch`
 * names one of them, and a generated port's `fallback` name must not repeat a fixed
 * one. (Whether `execute` really returns a `branch` cannot be read from a declaration
 * — see {@link assertBranchNamed}.)
 */
export function outputProblems(description: INodeDescription): string[] {
  const outputs = description.outputs ?? [];
  if (!isMultiPort(outputs)) return [];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const [i, port] of outputs.entries()) {
    if (isGenerated(port)) continue;
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
  for (const port of outputs) {
    const fb = port.fallback?.name;
    if (isGenerated(port) && fb !== undefined && seen.has(fb)) {
      problems.push(`${description.slug}: the fallback name "${fb}" is also the name of a fixed output, so a branch "${fb}" is ambiguous.`);
    }
  }
  return problems;
}

/**
 * The warnings `rvnxx-nodes manifest` prints for a package's nodes: every
 * {@link outputProblems} finding, worded for the log. In 1.x they are warnings and the
 * build continues; the next major turns them into errors.
 */
export function outputWarnings(nodes: readonly INode[]): string[] {
  return nodes.flatMap((n) => outputProblems(n.description));
}

/**
 * Check a result against the node's declaration. For a node's own tests:
 * `assertBranchNamed(node, await node.execute(ctx, inputs), config)`.
 *
 * Throws when a multi-port node returned no `branch`, and when the branch is none of
 * the names the node can produce: a fixed name is always accepted; beyond that, a
 * `resolveOutputs` port accepts any name (it is unknown here), and a `sourceFromConfig`
 * port accepts its fallback name and — when `config` is passed — the value it holds
 * (with no `config`, any name). A single-port node may leave `branch` out.
 */
export function assertBranchNamed(
  node: INode | INodeDescription,
  result: INodeResult,
  config?: Record<string, unknown>,
): void {
  const description = 'execute' in node ? node.description : node;
  const outputs = description.outputs ?? [];
  if (!isMultiPort(outputs)) return;
  const branch = result.branch;
  if (typeof branch !== 'string' || branch === '') {
    throw new Error(
      `${description.slug} has several outputs, so its result must name the branch it took; without it every output fires.`,
    );
  }
  if (outputs.some((p) => !isGenerated(p) && p.name === branch)) return;
  const producible = outputs.some((p) => {
    if (p.resolveOutputs === true) return true;
    if (p.sourceFromConfig === undefined) return false;
    if (p.fallback?.name === branch) return true;
    return config === undefined || config[p.sourceFromConfig] === branch;
  });
  if (!producible) {
    const names = outputs.map((p) => p.name ?? p.fallback?.name).filter((n) => n);
    throw new Error(
      `${description.slug} returned branch "${branch}", which none of its outputs can produce (${names.join(', ')}).`,
    );
  }
}
