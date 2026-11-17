import { NodeError } from './errors.js';
import type { INodeResult, IOutputPort } from './types.js';

/**
 * Canonical error-output shape emitted on a node's `error` port. It lives here
 * rather than in a node package because all four of them were building it
 * separately — `integrations-nodes-core` in an internal module, `deepl` in a
 * copy of that module, Business Central in `bc-fetch.ts` and Pipedrive in
 * `pipedrive-client.ts` — so the workflow editor's guarantee of one
 * `{ code, message, status }` payload rested on four files agreeing by hand
 * (PO-442; asked for by PO-134 in June and not done then).
 */
export interface NodeErrorOutput {
  /** Machine-readable error code, e.g. `HTTP_ERROR`, `TIMEOUT`, `REQUEST_FAILED`. */
  code: string;
  message: string;
  /** HTTP status code, or `0` for timeouts / network / non-HTTP errors. */
  status: number;
  /** Optional response body — HTTP-specific. */
  body?: unknown;
}

/**
 * Normalize any caught value into the canonical {@link NodeErrorOutput} shape.
 * Use this in a node's `catch` block before routing to the `error` port.
 */
export function toErrorOutput(err: unknown): NodeErrorOutput {
  if (err instanceof NodeError) {
    // Finite, not merely `typeof 'number'`: NaN and Infinity pass that test and
    // would put a value into `status` that is neither an HTTP status nor the `0`
    // this port promises — and NaN serialises to `null`, so the author would see
    // an empty field rather than a wrong one.
    const raw = err.meta?.['status'];
    const status = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
    return { code: err.code, message: err.message, status };
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return { code: 'TIMEOUT', message: 'Request timed out', status: 0 };
  }
  if (err instanceof Error) {
    return { code: 'REQUEST_FAILED', message: requestFailedMessage(err), status: 0 };
  }
  return { code: 'REQUEST_FAILED', message: String(err), status: 0 };
}

/**
 * What a system error code looks like: `ECONNRESET`, `ENOTFOUND`,
 * `UND_ERR_SOCKET`, `CERT_HAS_EXPIRED`. Anything else in a `code` — a lowercase
 * word, a number, a sentence, a dotted name — is not taken, because the message
 * this feeds reaches the tenant and must carry nothing but a code.
 */
const SYSTEM_ERROR_CODE = /^[A-Z][A-Z0-9_]{1,63}$/;

/**
 * The calls whose own error message names the host or address it tried
 * (`getaddrinfo ENOTFOUND sap.internal`, `connect ECONNREFUSED 10.31.0.41:8080`).
 * Such an error is reported by its call and code alone.
 */
const ADDRESSING_SYSCALLS = new Set(['getaddrinfo', 'connect']);

/** How many entries of an aggregate are read, and how many codes are named at most. */
const MAX_AGGREGATE_ENTRIES = 16;
const MAX_CODES = 4;

/**
 * The message of a `REQUEST_FAILED`, with why the request got no answer where
 * the error says so (IN-105):
 *
 * - The runtime's own `TypeError('fetch failed')` carries the reason as its
 *   `cause`: its `code`, or, where several addresses were tried and the cause is
 *   an `AggregateError`, each distinct code of its `errors`. They are appended:
 *   `fetch failed (ECONNRESET)`.
 * - A system error raised while resolving or connecting — the guard's own lookup
 *   ahead of a `safeFetch` call throws one — names the host or address in its
 *   message, so it is reported as its call and code: `getaddrinfo ENOTFOUND`.
 *
 * Only codes. The wording of a cause, and the message of an addressing system
 * error, carry the address and port the attempt went to, which may be the
 * platform's own network and must not reach a tenant. Reading a hostile error
 * object never throws out of here: the caller is a catch block.
 */
function requestFailedMessage(err: Error): string {
  try {
    const addressing = addressingCall(err);
    if (addressing) return addressing;
    // Several addresses tried by a socket library without fetch: the aggregate
    // itself is thrown, with an empty message and one error per address.
    if (Array.isArray((err as { errors?: unknown }).errors)) {
      const codes = codesOf(err);
      if (codes.length > 0) return `${err.message || 'Connection failed'} (${codes.join(', ')})`;
    }
    const codes = codesOf((err as { cause?: unknown }).cause);
    return codes.length > 0 ? `${err.message} (${codes.join(', ')})` : err.message;
  } catch {
    return 'Request failed';
  }
}

function systemCode(candidate: unknown): string | undefined {
  if (typeof candidate !== 'object' || candidate === null) return undefined;
  const code = (candidate as { code?: unknown }).code;
  return typeof code === 'string' && SYSTEM_ERROR_CODE.test(code) ? code : undefined;
}

/**
 * A system error raised while looking a name up or connecting, as its call and
 * code alone. Node marks one with its `syscall`; the guard's own lookup marks one
 * only with the `hostname` it could not resolve, so that counts as a lookup too.
 */
function addressingCall(err: Error): string | undefined {
  const own = systemCode(err);
  if (!own) return undefined;
  const syscall = (err as { syscall?: unknown }).syscall;
  if (typeof syscall === 'string') return ADDRESSING_SYSCALLS.has(syscall) ? `${syscall} ${own}` : undefined;
  if ('hostname' in err) return `getaddrinfo ${own}`;
  return undefined;
}

/**
 * The codes an error carries for why it failed: each distinct code of its
 * `errors` where it is an aggregate, otherwise — or where none of those carried
 * one — its own `code`.
 */
function codesOf(cause: unknown): string[] {
  if (typeof cause !== 'object' || cause === null) return [];
  const nested = (cause as { errors?: unknown }).errors;
  const codes: string[] = [];
  const take = (candidate: unknown) => {
    const code = systemCode(candidate);
    if (code && !codes.includes(code) && codes.length < MAX_CODES) codes.push(code);
  };
  if (Array.isArray(nested)) {
    for (let i = 0; i < Math.min(nested.length, MAX_AGGREGATE_ENTRIES); i++) take(nested[i]);
  }
  // The aggregate's own code counts only where none of the addresses tried carried one.
  if (codes.length === 0) take(cause);
  return codes;
}

/** Wrap an error output into an `INodeResult` routed to the `error` port. */
export function errorResult(output: NodeErrorOutput, port = 'error'): INodeResult {
  return { outputs: { [port]: output }, branch: port };
}

/**
 * Catch-block shortcut: normalize any thrown value and route it to the failure
 * output. The one helper every node's `catch` funnels into, so the
 * `{ code, message, status }` mapping lives in a single place instead of being
 * re-implemented per protocol (FTP/SFTP) or per package.
 *
 * `port` is the output taken, `error` unless the node declares its failure
 * output under another name (`{ ...errorPort(), name: 'failed' }`) — pass the
 * same name here, or the branch names a port that node does not have.
 */
export function toErrorResult(err: unknown, port = 'error'): INodeResult {
  return errorResult(toErrorOutput(err), port);
}

/**
 * Catch-block shortcut for the HTTP-style nodes whose failure output additionally
 * declares `body`: the canonical `{ code, message, status }` mapping plus the
 * response body a {@link NodeError} carries in `meta.body` (`null` when the
 * failure never reached a response). `port` names the output as above.
 */
export function httpErrorResult(err: unknown, port = 'error'): INodeResult {
  const body = err instanceof NodeError ? (err.meta?.['body'] ?? null) : null;
  return errorResult({ ...toErrorOutput(err), body }, port);
}

/**
 * Shared `error` output port — the uniform `{ code, message, status }` triple
 * declared on every node that has an `error` branch. Pass `body: true` for
 * HTTP-style nodes that additionally emit a response body on the port.
 *
 * The sentences travel with the port. The three values mean the same thing
 * behind every node, so they are written here once instead of per node; a node
 * whose failures are worth naming more precisely spreads the port and replaces
 * only its `description` (`{ ...errorPort(), description: … }`).
 *
 * The second sentence of the description is the rule this port exists under,
 * and it is promised in `specs/error-handling.md`: a fault in the author's own
 * configuration ends the run, a fault met while running is offered here.
 */
export function errorPort(opts: { body?: boolean } = {}): IOutputPort {
  return {
    name: 'error',
    kind: 'error',
    dataType: 'object',
    label: { en: 'Error', de: 'Fehler' },
    description: {
      en: 'Taken when the attempt fails in a way the workflow can carry on from. A node that cannot run as configured fails the run instead of taking this path.',
      de: 'Wird genommen, wenn der Versuch auf eine Weise fehlschlägt, mit der der Workflow weiterarbeiten kann. Ein Node, der so konfiguriert nicht laufen kann, lässt den Run scheitern, statt diesen Pfad zu nehmen.',
    },
    fields: {
      code: {
        dataType: 'string',
        description: {
          en: 'Machine-readable name of the failure — branch on this rather than on the message. A node that talks to a remote system shares `TIMEOUT` and `REQUEST_FAILED` with every other one; the remaining codes belong to this node alone.',
          de: 'Maschinenlesbarer Name des Fehlers — hierauf verzweigen, nicht auf die Meldung. Ein Node, der mit einem Fremdsystem spricht, teilt `TIMEOUT` und `REQUEST_FAILED` mit allen anderen; die übrigen Codes gehören allein zu diesem Node.',
        },
      },
      message: {
        dataType: 'string',
        description: {
          en: 'Wording for whoever reads the run afterwards, frequently the wording the far end used. It is not a stable value to branch on.',
          de: 'Wortlaut für den, der den Run später liest, häufig der des Gegenübers. Kein stabiler Wert, auf den sich Verzweigungen stützen sollten.',
        },
      },
      status: {
        dataType: 'number',
        description: {
          en: 'How the far end answered, as an HTTP status code, where one answered with a status at all. `0` otherwise — a timeout, a refused connection, an input the node could not use, a node that never leaves the workflow, or a failure the far end reported in its own answer rather than in a status, as a bulk job that ends as failed does. So `0` means there is no status to read, not that nothing was reached.',
          de: 'Wie das Gegenüber geantwortet hat, als HTTP-Statuscode — sofern eines überhaupt mit einem Status geantwortet hat. Sonst `0`: Timeout, abgelehnte Verbindung, eine unbrauchbare Eingabe, ein Node, der den Workflow nicht verlässt, oder ein Fehler, den das Gegenüber in seiner Antwort statt im Status gemeldet hat — wie ein Bulk-Job, der als fehlgeschlagen endet. `0` heißt also: kein Status zu lesen, nicht: nichts erreicht.',
        },
      },
      ...(opts.body
        ? {
            body: {
              dataType: 'any',
              description: {
                en: 'The answer the far end gave, where the failure got far enough to have one: the response body, or the job the platform reported as failed.',
                de: 'Die Antwort des Gegenübers, sofern der Fehler weit genug kam, um eine zu haben: der Response-Body oder der von der Plattform als fehlgeschlagen gemeldete Job.',
              },
            },
          }
        : {}),
    },
  };
}
