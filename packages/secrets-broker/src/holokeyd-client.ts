/**
 * holokeyd client: get/put against the TPM-bound holokeyd vault on the Jetson.
 *
 * Speaks holokeyd's real wire protocol (v1): one JSON request line over a unix
 * socket, one JSON response line back.
 *
 *   request  {"version":1,"id":"<uuid>","op":"health"|"has"|"resolve"|"put","name":"NAME","value":"..."}
 *   response {"version":1,"id":"<uuid>","ok":true,"result":{...}}
 *            {"version":1,"id":"<uuid>","ok":false,"error":{"code":"SECRET_NOT_FOUND"}}
 *
 * `put` goes to the ADMIN socket (`/run/holokeyd/holokeyd-admin.sock`), everything
 * else to the client socket (`/run/holokeyd/holokeyd.sock`). Auth is the socket's
 * filesystem permissions (group `holokey-clients`); there is no token.
 *
 * Two transports:
 *   - unix socket, for code running ON the device (`HOLOKEYD_SOCKET`).
 *   - ssh to `holokeyctl` (`HOLOKEYD_HOST`), the same path holokeyd-source uses.
 *     Names travel as validated argv / stdin; values travel on stdin only.
 *
 * Configuration is trusted: whoever controls the env (`HOLOKEYD_SOCKET`,
 * `HOLOKEYD_ADMIN_SOCKET`, `HOLOKEYD_HOST`, `HOLOKEYD_CLIENT`, `HOLOKEYD_SSH_KEY`)
 * decides where names are sent and where `put` values go. Socket paths are not
 * checked for owner or permissions, so set them only from a trusted environment.
 *
 * Fail closed: `get` returns `undefined` only for SECRET_NOT_FOUND. Every other
 * failure (transport, timeout, malformed or mismatched response, daemon error)
 * throws a {@link HoloKeydError} whose message carries an error CODE only, never a
 * value. `put` throws on any failure. Every call is bounded by a timeout. Nothing
 * here logs.
 *
 * @module secrets-broker/holokeyd-client
 */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import type { RemoteSecretSource } from './holokeyd-source';

type Env = Record<string, string | undefined>;

export const HOLOKEYD_PROTOCOL_VERSION = 1;
/** Env var with the holokeyd client socket path. Set it to use the on-device transport. */
export const HOLOKEYD_SOCKET_ENV = 'HOLOKEYD_SOCKET';
/** Env var with the holokeyd admin socket path (used for `put`). */
export const HOLOKEYD_ADMIN_SOCKET_ENV = 'HOLOKEYD_ADMIN_SOCKET';
export const HOLOKEYD_DEFAULT_SOCKET = '/run/holokeyd/holokeyd.sock';
export const HOLOKEYD_DEFAULT_ADMIN_SOCKET = '/run/holokeyd/holokeyd-admin.sock';

const NAME_RE = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/u;
// No leading '-' in the user or the host part: ssh would read it as an option
// (e.g. '-Fevil.conf' / '-oProxyCommand=...'). The argv also puts '--' before the host.
const HOST_RE = /^(?:[A-Za-z0-9_.][A-Za-z0-9_.-]*@)?[A-Za-z0-9_.:][A-Za-z0-9_.:-]*$/u;
const PATH_RE = /^\/[A-Za-z0-9_./-]+$/u;
const CODE_RE = /^[A-Z][A-Z0-9_]{0,63}$/u;
const MAX_SECRET_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 70 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;

export type HoloKeydOp = 'health' | 'has' | 'resolve' | 'put';

export interface HoloKeydRequest {
  version: number;
  id: string;
  op: HoloKeydOp;
  name?: string;
  value?: string;
}

export interface HoloKeydResponse {
  version?: number;
  id?: string;
  ok: boolean;
  result?: unknown;
  error?: { code?: string };
}

/** Sends one request, resolves to the daemon's response. Must honour `timeoutMs`. */
export type HoloKeydTransport = (
  req: HoloKeydRequest,
  timeoutMs: number
) => Promise<HoloKeydResponse>;

/** Error carrying a protocol/transport code only. Never contains a secret value. */
export class HoloKeydError extends Error {
  readonly code: string;
  constructor(code: string) {
    const safe = CODE_RE.test(code) ? code : 'VAULT_OPERATION_FAILED';
    super(`holokeyd: ${safe}`);
    this.name = 'HoloKeydError';
    this.code = safe;
  }
}

/** Codes that mean the daemon/host itself is unusable, not just one name. */
export const HOLOKEYD_TRANSPORT_CODES: ReadonlySet<string> = new Set([
  'TRANSPORT_UNAVAILABLE',
  'TIMEOUT',
  'INVALID_RESPONSE',
]);

function assertName(name: string): void {
  if (typeof name !== 'string' || !NAME_RE.test(name))
    throw new HoloKeydError('INVALID_SECRET_NAME');
}

function assertValue(value: string): void {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\0') ||
    Buffer.byteLength(value, 'utf8') > MAX_SECRET_BYTES
  ) {
    throw new HoloKeydError('INVALID_SECRET_VALUE');
  }
}

// ---------------------------------------------------------------- unix socket

export interface UnixSocketTransportOpts {
  socketPath?: string;
  adminSocketPath?: string;
}

export function createUnixSocketTransport(opts: UnixSocketTransportOpts = {}): HoloKeydTransport {
  const socketPath = opts.socketPath ?? HOLOKEYD_DEFAULT_SOCKET;
  const adminSocketPath = opts.adminSocketPath ?? HOLOKEYD_DEFAULT_ADMIN_SOCKET;
  return (req, timeoutMs) =>
    new Promise<HoloKeydResponse>((resolve, reject) => {
      const path = req.op === 'put' ? adminSocketPath : socketPath;
      const socket = createConnection(path);
      let received = Buffer.alloc(0);
      let settled = false;
      const finish = (err: HoloKeydError | null, res?: HoloKeydResponse) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        if (err) reject(err);
        else resolve(res as HoloKeydResponse);
      };
      const timer = setTimeout(() => finish(new HoloKeydError('TIMEOUT')), timeoutMs);
      socket.on('connect', () => socket.write(`${JSON.stringify(req)}\n`));
      socket.on('data', (chunk: Buffer) => {
        received = Buffer.concat([received, chunk]);
        if (received.length > MAX_RESPONSE_BYTES)
          return finish(new HoloKeydError('INVALID_RESPONSE'));
        const nl = received.indexOf(0x0a);
        if (nl < 0) return;
        try {
          finish(null, JSON.parse(received.subarray(0, nl).toString('utf8')) as HoloKeydResponse);
        } catch {
          finish(new HoloKeydError('INVALID_RESPONSE'));
        }
      });
      socket.on('error', () => finish(new HoloKeydError('TRANSPORT_UNAVAILABLE')));
      socket.on('end', () => finish(new HoloKeydError('TRANSPORT_UNAVAILABLE')));
    });
}

// ---------------------------------------------------------------- ssh -> holokeyctl

export type SshRunner = (
  args: readonly string[],
  input: string,
  timeoutMs: number
) => Promise<{ stdout: string; stderr: string; code: number | string | null; timedOut: boolean }>;

export interface SshTransportOpts {
  host: string;
  /** Remote holokeyctl path. Default `/usr/local/bin/holokeyctl`. */
  client?: string;
  identity?: string;
  connectTimeoutS?: number;
  /** Override the spawn (tests). */
  run?: SshRunner;
}

const defaultSshRun: SshRunner = (args, input, timeoutMs) =>
  new Promise((resolve) => {
    const child = execFile(
      'ssh',
      args as string[],
      { timeout: timeoutMs, encoding: 'utf8', maxBuffer: MAX_RESPONSE_BYTES, windowsHide: true },
      (err, stdout, stderr) => {
        const e = err as
          (NodeJS.ErrnoException & { killed?: boolean; code?: number | string }) | null;
        resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          code: e ? (e.code ?? 1) : 0,
          timedOut: Boolean(e?.killed),
        });
      }
    );
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(input);
  });

export function createSshTransport(opts: SshTransportOpts): HoloKeydTransport {
  if (!HOST_RE.test(opts.host)) throw new HoloKeydError('INVALID_CONFIG');
  const client = opts.client ?? '/usr/local/bin/holokeyctl';
  if (!PATH_RE.test(client)) throw new HoloKeydError('INVALID_CONFIG');
  const connectTimeoutS = Number.isFinite(opts.connectTimeoutS)
    ? Math.min(60, Math.max(1, Math.round(Number(opts.connectTimeoutS))))
    : 5;
  const run = opts.run ?? defaultSshRun;
  const base = [
    '-o',
    'BatchMode=yes',
    '-o',
    `ConnectTimeout=${connectTimeoutS}`,
    '-o',
    'StrictHostKeyChecking=yes',
    ...(opts.identity ? ['-i', opts.identity] : []),
    '--',
    opts.host,
    client,
  ];
  return async (req, timeoutMs) => {
    let cmd: string[];
    let input = '';
    switch (req.op) {
      case 'resolve':
        cmd = ['resolve-stdin'];
        input = `${req.name}\n`;
        break;
      case 'has':
        cmd = ['has', String(req.name), '--json'];
        break;
      case 'put':
        cmd = ['put', String(req.name), '--json'];
        input = String(req.value);
        break;
      case 'health':
        cmd = ['health', '--json'];
        break;
      default:
        throw new HoloKeydError('INVALID_OPERATION');
    }
    const r = await run([...base, ...cmd], input, timeoutMs);
    if (r.timedOut) throw new HoloKeydError('TIMEOUT');
    if (r.code === 255 || r.code === 'ENOENT') throw new HoloKeydError('TRANSPORT_UNAVAILABLE');
    if (r.code !== 0) {
      // holokeyctl prints "holokeyctl: <CODE>" on failure. Only a bare code is kept.
      const m = /holokeyctl: ([A-Z][A-Z0-9_]*)\s*$/mu.exec(r.stderr);
      return { id: req.id, ok: false, error: { code: m ? m[1] : 'VAULT_OPERATION_FAILED' } };
    }
    if (req.op === 'resolve') {
      // holokeyctl ends the value with one newline; strip exactly that one.
      const value = r.stdout.replace(/\r?\n$/u, '');
      return { id: req.id, ok: true, result: { value } };
    }
    try {
      const parsed = JSON.parse(r.stdout.trim()) as { ok?: boolean; result?: unknown };
      if (parsed.ok !== true) throw new Error('not ok');
      return { id: req.id, ok: true, result: parsed.result };
    } catch {
      throw new HoloKeydError('INVALID_RESPONSE');
    }
  };
}

// ---------------------------------------------------------------- client

export interface HolokeydClientOpts {
  transport: HoloKeydTransport;
  /** Per-call timeout. Default 10s. */
  timeoutMs?: number;
  /** Label for affirmation logs. Carries no secret material. */
  id?: string;
}

export class HolokeydClient {
  readonly id: string;
  private readonly transport: HoloKeydTransport;
  private readonly timeoutMs: number;

  constructor(opts: HolokeydClientOpts) {
    this.transport = opts.transport;
    this.timeoutMs = opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
    this.id = opts.id ?? 'holokeyd';
  }

  /** Secret value, `undefined` if holokeyd does not hold it. Throws on any other failure. */
  async get(name: string): Promise<string | undefined> {
    assertName(name);
    let res: HoloKeydResponse;
    try {
      res = await this.call({ op: 'resolve', name });
    } catch (e) {
      if (e instanceof HoloKeydError && e.code === 'SECRET_NOT_FOUND') return undefined;
      throw e;
    }
    const value = (res.result as { value?: unknown } | undefined)?.value;
    if (typeof value !== 'string' || value.length === 0)
      throw new HoloKeydError('INVALID_RESPONSE');
    return value;
  }

  /** Store (or rotate) `name`. Returns the new version. Throws on any failure. */
  async put(name: string, value: string): Promise<{ name: string; version: number }> {
    assertName(name);
    assertValue(value);
    const res = await this.call({ op: 'put', name, value });
    const r = res.result as { stored?: unknown; name?: unknown; version?: unknown } | undefined;
    if (!r || r.name !== name || typeof r.version !== 'number')
      throw new HoloKeydError('INVALID_RESPONSE');
    return { name, version: r.version };
  }

  /** Whether holokeyd holds `name`. Throws on failure. */
  async has(name: string): Promise<boolean> {
    assertName(name);
    const res = await this.call({ op: 'has', name });
    const present = (res.result as { present?: unknown } | undefined)?.present;
    if (typeof present !== 'boolean') throw new HoloKeydError('INVALID_RESPONSE');
    return present;
  }

  private async call(body: {
    op: HoloKeydOp;
    name?: string;
    value?: string;
  }): Promise<HoloKeydResponse> {
    const req: HoloKeydRequest = { version: HOLOKEYD_PROTOCOL_VERSION, id: randomUUID(), ...body };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let res: HoloKeydResponse;
    try {
      res = await Promise.race([
        this.transport(req, this.timeoutMs),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new HoloKeydError('TIMEOUT')), this.timeoutMs + 250);
        }),
      ]);
    } catch (e) {
      if (e instanceof HoloKeydError) throw e;
      throw new HoloKeydError('TRANSPORT_UNAVAILABLE');
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!res || typeof res !== 'object' || typeof res.ok !== 'boolean')
      throw new HoloKeydError('INVALID_RESPONSE');
    if (res.id !== undefined && res.id !== req.id) throw new HoloKeydError('INVALID_RESPONSE');
    if (!res.ok) throw new HoloKeydError(String(res.error?.code ?? 'VAULT_OPERATION_FAILED'));
    return res;
  }
}

/**
 * Build a client from env, or `null` when holokeyd is not configured.
 * `HOLOKEYD_SOCKET` (on-device) wins over `HOLOKEYD_HOST` (ssh). Malformed config
 * returns `null` (OFF), never a half-configured client.
 */
export function createHolokeydClient(
  opts: { env?: Env; timeoutMs?: number } = {}
): HolokeydClient | null {
  const env = opts.env ?? process.env;
  const timeoutMs = opts.timeoutMs ?? Number(env.HOLOKEYD_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const socketPath = env[HOLOKEYD_SOCKET_ENV]?.trim();
  if (socketPath) {
    const adminSocketPath = env[HOLOKEYD_ADMIN_SOCKET_ENV]?.trim() || HOLOKEYD_DEFAULT_ADMIN_SOCKET;
    if (!PATH_RE.test(socketPath) || !PATH_RE.test(adminSocketPath)) return null;
    return new HolokeydClient({
      transport: createUnixSocketTransport({ socketPath, adminSocketPath }),
      timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS,
      id: `holokeyd+unix://${socketPath}`,
    });
  }
  const host = env.HOLOKEYD_HOST?.trim();
  if (!host || !HOST_RE.test(host)) return null;
  try {
    return new HolokeydClient({
      transport: createSshTransport({
        host,
        client: env.HOLOKEYD_CLIENT?.trim() || undefined,
        identity: env.HOLOKEYD_SSH_KEY?.trim() || undefined,
        connectTimeoutS: Number(env.HOLOKEYD_CONNECT_TIMEOUT_S ?? 5),
      }),
      timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS,
      id: `holokeyd://${host}`,
    });
  } catch {
    return null;
  }
}

/**
 * Adapt a client to the resolver's {@link RemoteSecretSource} contract: never throws,
 * `undefined` on any failure, and a transport failure disables the source for the rest
 * of the process so a dead device costs one timeout, not one per secret. No cache, so
 * a value rotated with `put` is seen on the next resolve.
 */
export function createHolokeydClientSource(client: HolokeydClient): RemoteSecretSource {
  let unreachable = false;
  return {
    id: client.id,
    reachable: () => !unreachable,
    async resolve(name: string): Promise<string | undefined> {
      if (unreachable || !NAME_RE.test(name)) return undefined;
      try {
        return await client.get(name);
      } catch (e) {
        if (e instanceof HoloKeydError && HOLOKEYD_TRANSPORT_CODES.has(e.code)) unreachable = true;
        return undefined;
      }
    },
  };
}
