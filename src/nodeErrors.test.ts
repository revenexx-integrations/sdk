import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isVpnErrorCode, NodeError, VPN_ERROR_CODES, VPN_ROUTE_MISSING, VPN_UNAVAILABLE, type VpnErrorCode } from './errors.js';
import { errorPort, errorResult, httpErrorResult, toErrorOutput, toErrorResult } from './nodeErrors.js';
import { extractManifest } from './extract.js';
import type { INode } from './types.js';

test('a NodeError keeps its code, and takes a status only where it carries one [@spec:error-handling:AC-1]', () => {
  assert.deepEqual(toErrorOutput(new NodeError('HTTP_ERROR', 'nope', { status: 503 })), {
    code: 'HTTP_ERROR',
    message: 'nope',
    status: 503,
  });

  // No `status` in meta, and a `status` that is not a number, both read as "none".
  assert.equal(toErrorOutput(new NodeError('MISSING_PATH_PARAM', 'no id')).status, 0);
  assert.equal(toErrorOutput(new NodeError('X', 'y', { status: '503' })).status, 0);

  // And a number that is not a status: NaN and Infinity are `typeof 'number'`,
  // and NaN would reach the author as an empty field rather than a wrong one.
  assert.equal(toErrorOutput(new NodeError('X', 'y', { status: Number.NaN })).status, 0);
  assert.equal(toErrorOutput(new NodeError('X', 'y', { status: Number.POSITIVE_INFINITY })).status, 0);
});

test('an abort becomes TIMEOUT and anything else REQUEST_FAILED [@spec:error-handling:AC-1]', () => {
  // A last resort for an abort nobody recognised. It is NOT how a cancellation is
  // meant to arrive: safeFetch raises its own budget as NodeError('TIMEOUT') — which
  // takes the branch above, not this one — and re-throws the engine's abort reason
  // untouched, and a routing node checks `ctx.signal.aborted` before it ever calls in
  // here. See request-budget AC-4/AC-5, and this spec's gap on the same subject.
  const abort = new Error('The operation was aborted');
  abort.name = 'AbortError';
  assert.deepEqual(toErrorOutput(abort), { code: 'TIMEOUT', message: 'Request timed out', status: 0 });

  // safeFetch's own budget arrives as a NodeError and keeps its code and status,
  // rather than falling through to the line above.
  assert.deepEqual(toErrorOutput(new NodeError('TIMEOUT', 'Request timed out after 5000ms')), {
    code: 'TIMEOUT',
    message: 'Request timed out after 5000ms',
    status: 0,
  });

  assert.deepEqual(toErrorOutput(new Error('socket hang up')), {
    code: 'REQUEST_FAILED',
    message: 'socket hang up',
    status: 0,
  });

  // A node's catch block receives whatever was thrown, which need not be an Error.
  assert.deepEqual(toErrorOutput('just a string'), {
    code: 'REQUEST_FAILED',
    message: 'just a string',
    status: 0,
  });
});

/** The runtime's own shape for a request that got no answer: `TypeError('fetch failed')` with the reason as its cause. */
function fetchFailed(cause?: unknown): TypeError {
  return cause === undefined ? new TypeError('fetch failed') : new TypeError('fetch failed', { cause });
}

/** A system error as the runtime raises it: a message naming the address, and a code. */
function systemError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

test('a request without an answer says which kind of failure it was, and nothing of the address [@spec:error-handling:AC-1]', () => {
  const refused = toErrorOutput(fetchFailed(systemError('ECONNREFUSED', 'connect ECONNREFUSED 10.31.0.41:8080')));
  assert.deepEqual(refused, { code: 'REQUEST_FAILED', message: 'fetch failed (ECONNREFUSED)', status: 0 });

  assert.equal(
    toErrorOutput(fetchFailed(systemError('ECONNRESET', 'read ECONNRESET'))).message,
    'fetch failed (ECONNRESET)',
  );
  assert.equal(
    toErrorOutput(fetchFailed(systemError('ENOTFOUND', 'getaddrinfo ENOTFOUND sap.internal.example'))).message,
    'fetch failed (ENOTFOUND)',
  );

  // Several addresses tried: each distinct code once, in the order met, and none
  // of the addresses the aggregate's own errors name.
  const aggregate = Object.assign(
    new AggregateError(
      [
        systemError('ECONNREFUSED', 'connect ECONNREFUSED 10.31.0.41:8080'),
        systemError('ETIMEDOUT', 'connect ETIMEDOUT [fd00::41]:8080'),
        systemError('ECONNREFUSED', 'connect ECONNREFUSED 10.31.0.42:8080'),
      ],
      'connect failed',
    ),
    { code: 'ECONNREFUSED' },
  );
  const several = toErrorOutput(fetchFailed(aggregate));
  assert.equal(several.message, 'fetch failed (ECONNREFUSED, ETIMEDOUT)');
  assert.doesNotMatch(several.message, /10\.31|fd00|8080/);

  // An aggregate whose errors carry no code still says the code it carries itself.
  const bare = Object.assign(new AggregateError([new Error('one'), new Error('two')], 'connect failed'), {
    code: 'EHOSTUNREACH',
  });
  assert.equal(toErrorOutput(fetchFailed(bare)).message, 'fetch failed (EHOSTUNREACH)');
});

test('a lookup or connect error raised directly is reported by its call and code, without the host [@spec:error-handling:AC-1]', () => {
  // The shape the guard ahead of every safeFetch call re-throws when a name does not resolve.
  const lookup = Object.assign(new Error('getaddrinfo ENOTFOUND sap.internal.example'), {
    code: 'ENOTFOUND',
    syscall: 'getaddrinfo',
    hostname: 'sap.internal.example',
  });
  assert.deepEqual(toErrorOutput(lookup), { code: 'REQUEST_FAILED', message: 'getaddrinfo ENOTFOUND', status: 0 });

  // A client that connects without fetch (an FTP, SFTP or SMTP library) throws the socket's own error.
  const connect = Object.assign(new Error('connect ECONNREFUSED 10.31.0.41:8080'), {
    code: 'ECONNREFUSED',
    syscall: 'connect',
    address: '10.31.0.41',
    port: 8080,
  });
  assert.equal(toErrorOutput(connect).message, 'connect ECONNREFUSED');

  // The guard's own lookup marks its error only with the hostname, not with a syscall.
  const guarded = Object.assign(new Error('getaddrinfo ENOTFOUND sftp.internal.example'), {
    code: 'ENOTFOUND',
    hostname: 'sftp.internal.example',
  });
  assert.equal(toErrorOutput(guarded).message, 'getaddrinfo ENOTFOUND');

  // A socket library trying several addresses throws the aggregate itself, with no message.
  const both = Object.assign(
    new AggregateError(
      [
        Object.assign(new Error('connect ECONNREFUSED 10.31.0.41:22'), { code: 'ECONNREFUSED', syscall: 'connect' }),
        Object.assign(new Error('connect ECONNREFUSED [fd00::41]:22'), { code: 'ECONNREFUSED', syscall: 'connect' }),
      ],
      '',
    ),
    { code: 'ECONNREFUSED' },
  );
  assert.equal(toErrorOutput(both).message, 'Connection failed (ECONNREFUSED)');

  // A socket error on a connection already open names no address, and keeps its message.
  const reset = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET', syscall: 'read' });
  assert.equal(toErrorOutput(reset).message, 'read ECONNRESET');
});

test('socket and certificate failures from the runtime are named too [@spec:error-handling:AC-1]', () => {
  // A connection the far end dropped arrives from undici as a SocketError, not as ECONNRESET.
  const dropped = Object.assign(new Error('other side closed'), { name: 'SocketError', code: 'UND_ERR_SOCKET' });
  assert.equal(toErrorOutput(fetchFailed(dropped)).message, 'fetch failed (UND_ERR_SOCKET)');
  assert.equal(
    toErrorOutput(fetchFailed(systemError('CERT_HAS_EXPIRED', 'certificate has expired'))).message,
    'fetch failed (CERT_HAS_EXPIRED)',
  );
});

test('an error object that resists being read still routes [@spec:error-handling:AC-1]', () => {
  const hostile = fetchFailed();
  Object.defineProperty(hostile, 'cause', {
    get() {
      throw new Error('no');
    },
  });
  assert.deepEqual(toErrorOutput(hostile), { code: 'REQUEST_FAILED', message: 'Request failed', status: 0 });

  // A sparse aggregate of enormous length is read only so far, and names few codes.
  const errors: unknown[] = [];
  errors.length = 2 ** 31;
  for (const [i, code] of ['EA', 'EB', 'EC', 'ED', 'EE', 'EF'].entries()) errors[i] = { code };
  const wide = toErrorOutput(fetchFailed({ errors }));
  assert.equal(wide.message, 'fetch failed (EA, EB, EC, ED)');
});

test('a failure without a readable cause code keeps its message as it was [@spec:error-handling:AC-1]', () => {
  assert.deepEqual(toErrorOutput(fetchFailed()), { code: 'REQUEST_FAILED', message: 'fetch failed', status: 0 });
  // A cause without a code, a cause that is not an object, and a code that is not
  // a system error code (it could carry anything) add nothing.
  assert.equal(toErrorOutput(fetchFailed(new Error('connect to 10.31.0.41 failed'))).message, 'fetch failed');
  assert.equal(toErrorOutput(fetchFailed('10.31.0.41:8080')).message, 'fetch failed');
  assert.equal(toErrorOutput(fetchFailed(systemError('refused by 10.31.0.41', 'x'))).message, 'fetch failed');
  assert.equal(toErrorOutput(fetchFailed({ code: 111 })).message, 'fetch failed');

  // The code and status an author branches on do not change.
  const out = toErrorOutput(fetchFailed(systemError('ECONNRESET', 'read ECONNRESET')));
  assert.equal(out.code, 'REQUEST_FAILED');
  assert.equal(out.status, 0);

  // A NodeError keeps its own message: what it says was written for the author already.
  const node = new NodeError('TIMEOUT', 'Request timed out after 5000ms');
  (node as Error & { cause?: unknown }).cause = systemError('ETIMEDOUT', 'connect ETIMEDOUT 10.31.0.41:8080');
  assert.equal(toErrorOutput(node).message, 'Request timed out after 5000ms');
});

test('a routed failure names the output it took [@spec:error-handling:AC-2]', () => {
  const res = errorResult({ code: 'TIMEOUT', message: 'too slow', status: 0 });
  assert.equal(res.branch, 'error');
  assert.deepEqual(res.outputs['error'], { code: 'TIMEOUT', message: 'too slow', status: 0 });

  // A node whose failure output is named something else keeps branch and payload together.
  const named = errorResult({ code: 'X', message: 'y', status: 0 }, 'failed');
  assert.equal(named.branch, 'failed');
  assert.deepEqual(Object.keys(named.outputs), ['failed']);
});

test('the catch-block shortcuts normalise and route in one step [@spec:error-handling:AC-2]', () => {
  const routed = toErrorResult(new NodeError('REFUSED', 'blocked', { status: 0 }));
  assert.equal(routed.branch, 'error');
  assert.deepEqual(routed.outputs['error'], { code: 'REFUSED', message: 'blocked', status: 0 });

  // The HTTP shortcut adds the body a NodeError carried, and `null` where it carried none.
  const withBody = httpErrorResult(new NodeError('HTTP_ERROR', 'bad', { status: 400, body: { e: 1 } }));
  assert.deepEqual(withBody.outputs['error'], {
    code: 'HTTP_ERROR',
    message: 'bad',
    status: 400,
    body: { e: 1 },
  });
  assert.equal((httpErrorResult(new Error('gone')).outputs['error'] as { body: unknown }).body, null);

  // And both keep branch and payload together on a node that named its failure
  // output something else — a branch no port declares reaches nothing.
  const renamed = toErrorResult(new Error('gone'), 'failed');
  assert.equal(renamed.branch, 'failed');
  assert.deepEqual(Object.keys(renamed.outputs), ['failed']);

  const renamedHttp = httpErrorResult(new NodeError('HTTP_ERROR', 'bad', { status: 400 }), 'failed');
  assert.equal(renamedHttp.branch, 'failed');
  assert.deepEqual(Object.keys(renamedHttp.outputs), ['failed']);
});

test('the declared error output carries the three fields, and body only when asked [@spec:error-handling:AC-3]', () => {
  const port = errorPort();
  assert.equal(port.name, 'error');
  assert.equal(port.kind, 'error');
  assert.deepEqual(Object.keys(port.fields ?? {}), ['code', 'message', 'status']);
  assert.deepEqual(Object.keys(errorPort({ body: true }).fields ?? {}), [
    'code',
    'message',
    'status',
    'body',
  ]);
});

test('the port tells an author what will not reach it [@spec:error-handling:AC-3]', () => {
  const node: INode = {
    description: {
      slug: 'revenexx:test',
      version: '1.0.0',
      category: 'action',
      name: 'Test',
      inputs: { in: { dataType: 'any' } },
      outputs: [{ name: 'out', kind: 'default', dataType: 'object' }, errorPort()],
      config: [],
    },
    async execute() {
      return { outputs: {} };
    },
  };

  const manifest = extractManifest(node);
  const port = manifest.outputs.find((o) => o.name === 'error');
  assert.ok(port, 'the error output survives into the manifest');

  // The rule the port exists under reaches the author here or nowhere: a fault in
  // the node's own configuration ends the run instead of arriving on this path.
  const en = (port.description as Record<string, string>)['en'] ?? '';
  const de = (port.description as Record<string, string>)['de'] ?? '';
  assert.match(en, /cannot run as configured fails the run/);
  assert.match(de, /nicht laufen kann, lässt den Run scheitern/);
});

// The VPN codes keep their literal types, so a reader can narrow on them and a switch
// over them is checked for completeness by the compiler (PO-828 review).
test('the VPN error codes narrow, and a switch over them is exhaustive', () => {
  const describe = (code: VpnErrorCode): string => {
    switch (code) {
      case VPN_UNAVAILABLE:
        return 'unavailable';
      case VPN_ROUTE_MISSING:
        return 'missing';
      default: {
        const unreachable: never = code;
        return unreachable;
      }
    }
  };
  const code: string = 'VPN_ROUTE_MISSING';
  assert.equal(isVpnErrorCode(code) ? describe(code) : 'other', 'missing');
  assert.equal(isVpnErrorCode('BLOCKED_ADDRESS'), false);
  assert.deepEqual([...VPN_ERROR_CODES], ['VPN_UNAVAILABLE', 'VPN_ROUTE_MISSING']);
  assert.equal(Object.isFrozen(VPN_ERROR_CODES), true);
});
