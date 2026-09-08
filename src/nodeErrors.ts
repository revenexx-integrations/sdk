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
    const status = typeof err.meta?.['status'] === 'number' ? (err.meta['status'] as number) : 0;
    return { code: err.code, message: err.message, status };
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return { code: 'TIMEOUT', message: 'Request timed out', status: 0 };
  }
  if (err instanceof Error) {
    return { code: 'REQUEST_FAILED', message: err.message, status: 0 };
  }
  return { code: 'REQUEST_FAILED', message: String(err), status: 0 };
}

/** Wrap an error output into an `INodeResult` routed to the `error` port. */
export function errorResult(output: NodeErrorOutput, port = 'error'): INodeResult {
  return { outputs: { [port]: output }, branch: port };
}

/**
 * Catch-block shortcut: normalize any thrown value and route it to the `error`
 * port. The one helper every node's `catch` funnels into, so the
 * `{ code, message, status }` mapping lives in a single place instead of being
 * re-implemented per protocol (FTP/SFTP) or per package.
 */
export function toErrorResult(err: unknown): INodeResult {
  return errorResult(toErrorOutput(err));
}

/**
 * Catch-block shortcut for the HTTP-style nodes whose `error` port additionally
 * declares `body`: the canonical `{ code, message, status }` mapping plus the
 * response body a {@link NodeError} carries in `meta.body` (`null` when the
 * failure never reached a response).
 */
export function httpErrorResult(err: unknown): INodeResult {
  const body = err instanceof NodeError ? (err.meta?.['body'] ?? null) : null;
  return errorResult({ ...toErrorOutput(err), body });
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
