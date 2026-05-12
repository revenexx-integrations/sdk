export class NodeError extends Error {
  readonly code: string;
  readonly meta?: Record<string, unknown>;

  constructor(code: string, message: string, meta?: Record<string, unknown>) {
    super(message);
    this.name = 'NodeError';
    this.code = code;
    this.meta = meta;
  }
}
