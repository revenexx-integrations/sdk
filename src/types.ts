export type LocalizedString = string | Record<string, string>;

export type DataType = 'any' | 'object' | 'array' | 'string' | 'number' | 'boolean';
export type OutputKind = 'default' | 'branch' | 'error';
export type NodeCategory = 'trigger' | 'action' | 'transform' | 'control' | 'io';
export type ConfigType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'object'
  | 'array'
  | 'expression'
  | 'secret-ref';

export interface IInputPort {
  dataType: DataType;
  required?: boolean;
  description?: LocalizedString;
}

export interface IOutputField {
  dataType: DataType;
  description?: LocalizedString;
}

export interface IOutputPort {
  kind: OutputKind;
  dataType: DataType;
  name?: string;
  label?: LocalizedString;
  description?: LocalizedString;
  fields?: Record<string, IOutputField>;
  sourceFromConfig?: string;
  fallback?: {
    name: string;
    label?: LocalizedString;
    description?: LocalizedString;
  };
}

export interface IConfigOption {
  value: string | number | boolean;
  label: LocalizedString;
}

export interface IConfigValidation {
  pattern?: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
}

export interface IConfigFieldBase {
  key: string;
  label: LocalizedString;
  type: ConfigType;
  description?: LocalizedString;
  required?: boolean;
  default?: unknown;
  placeholder?: LocalizedString;
  expressionAllowed?: boolean;
  multiline?: boolean;
  validation?: IConfigValidation;
  options?: IConfigOption[];
}

export interface IConfigField extends IConfigFieldBase {
  properties?: IConfigFieldBase[];
  items?: IConfigFieldBase;
}

export interface INodeDescription {
  slug: string;
  version: string;
  category: NodeCategory;
  name: LocalizedString;
  description?: LocalizedString;
  icon?: string;
  inputs: Record<string, IInputPort>;
  outputs: IOutputPort[];
  config?: IConfigField[];
}

export interface INodeContext {
  signal: AbortSignal;
  logger: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
  secrets: {
    get(key: string): Promise<string>;
  };
}

export interface INodeResult {
  outputs: Record<string, unknown>;
  branch?: string;
}

export interface INode {
  description: INodeDescription;
  execute(ctx: INodeContext, inputs: Record<string, unknown>): Promise<INodeResult>;
}

/**
 * Optional capability interface for nodes that iterate over a collection.
 * Implement this alongside {@link INode} to signal to the worker that this
 * node drives iteration — the worker will call {@link extractItems} instead
 * of relying on slug-based detection.
 *
 * This interface is the designated dispatch point for future child-workflow
 * execution: once per-iteration isolation is needed, the worker can swap the
 * inline loop for `executeChild` calls without any changes to the node or SDK.
 */
export interface INodeWithIteration {
  /**
   * Extracts the array of items to iterate over from the resolved inputs and
   * config. Must be pure and synchronous — it runs inside a Temporal Activity.
   */
  extractItems(inputs: Record<string, unknown>, config: Record<string, unknown>): unknown[];
}

/**
 * Type guard that checks whether a node implements {@link INodeWithIteration}.
 */
export function isNodeWithIteration(node: INode): node is INode & INodeWithIteration {
  return typeof (node as INode & Partial<INodeWithIteration>).extractItems === 'function';
}
