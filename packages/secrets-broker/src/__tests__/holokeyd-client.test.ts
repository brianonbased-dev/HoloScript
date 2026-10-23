import { createServer, type Server } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  HolokeydClient,
  HoloKeydError,
  createHolokeydClient,
  createHolokeydClientSource,
  createSshTransport,
  createUnixSocketTransport,
  type HoloKeydRequest,
  type HoloKeydTransport,
  type SshRunner,
} from '../holokeyd-client';
import { createServiceSecretResolver } from '../service-secret-resolver';

/** In-memory fake of holokeyd's v1 protocol (no network, no device). */
function fakeDaemon(initial: Record<string, string> = {}) {
  const store = new Map<string, { value: string; version: number }>(
    Object.entries(initial).map(([k, v]) => [k, { value: v, version: 1 }])
  );
  const seen: HoloKeydRequest[] = [];
  const handle = (req: HoloKeydRequest) => {
    seen.push(req);
    const fail = (code: string) => ({ version: 1, id: req.id, ok: false, error: { code } });
    switch (req.op) {
      case 'resolve': {
        const hit = store.get(req.name!);
        return hit
          ? { version: 1, id: req.id, ok: true, result: { value: hit.value } }
          : fail('SECRET_NOT_FOUND');
      }
      case 'has':
        return { version: 1, id: req.id, ok: true, result: { present: store.has(req.name!) } };
      case 'put': {
        const version = (store.get(req.name!)?.version ?? 0) + 1;
        store.set(req.name!, { value: req.value!, version });
        return {
          version: 1,
          id: req.id,
          ok: true,
          result: { stored: true, name: req.name, version },
        };
      }
      default:
        return fail('INVALID_OPERATION');
    }
  };
  const transport: HoloKeydTransport = async (req) => handle(req);
  return { store, seen, handle, transport };
}

const SECRET = 'fake-value-not-a-real-secret';

describe('HolokeydClient', () => {
  it('get returns the stored value and undefined for SECRET_NOT_FOUND', async () => {
    const d = fakeDaemon({ BOT_TOKEN: SECRET });
    const c = new HolokeydClient({ transport: d.transport });
    await expect(c.get('BOT_TOKEN')).resolves.toBe(SECRET);
    await expect(c.get('MISSING')).resolves.toBeUndefined();
    expect(d.seen.every((r) => r.version === 1 && typeof r.id === 'string')).toBe(true);
  });

  it('put stores/rotates and returns the new version; get sees the rotated value', async () => {
    const d = fakeDaemon({ BOT_TOKEN: 'old-fake' });
    const c = new HolokeydClient({ transport: d.transport });
    await expect(c.put('BOT_TOKEN', 'new-fake')).resolves.toEqual({
      name: 'BOT_TOKEN',
      version: 2,
    });
    await expect(c.get('BOT_TOKEN')).resolves.toBe('new-fake');
    await expect(c.has('BOT_TOKEN')).resolves.toBe(true);
  });

  it('rejects bad names and values before any request is sent', async () => {
    const d = fakeDaemon();
    const c = new HolokeydClient({ transport: d.transport });
    await expect(c.get('bad name; rm -rf /')).rejects.toMatchObject({
      code: 'INVALID_SECRET_NAME',
    });
    await expect(c.put('OK', '')).rejects.toMatchObject({ code: 'INVALID_SECRET_VALUE' });
    await expect(c.put('OK', 'a\0b')).rejects.toMatchObject({ code: 'INVALID_SECRET_VALUE' });
    await expect(c.put('OK', 'x'.repeat(64 * 1024 + 1))).rejects.toMatchObject({
      code: 'INVALID_SECRET_VALUE',
    });
    expect(d.seen).toHaveLength(0);
  });

  it('fails closed: daemon errors, mismatched ids and malformed results throw', async () => {
    const denied = new HolokeydClient({
      transport: async (req) => ({
        id: req.id,
        ok: false,
        error: { code: 'OPERATION_NOT_ALLOWED' },
      }),
    });
    await expect(denied.put('X', SECRET)).rejects.toMatchObject({ code: 'OPERATION_NOT_ALLOWED' });
    await expect(denied.get('X')).rejects.toMatchObject({ code: 'OPERATION_NOT_ALLOWED' });

    const wrongId = new HolokeydClient({
      transport: async () => ({ id: randomUUID(), ok: true, result: { value: SECRET } }),
    });
    await expect(wrongId.get('X')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });

    const noVersion = new HolokeydClient({
      transport: async (req) => ({ id: req.id, ok: true, result: { stored: true, name: 'X' } }),
    });
    await expect(noVersion.put('X', SECRET)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });

    const hostile = new HolokeydClient({
      transport: async (req) => ({ id: req.id, ok: false, error: { code: `leak ${SECRET}` } }),
    });
    const err = await hostile.get('X').catch((e: unknown) => e as HoloKeydError);
    expect(err).toBeInstanceOf(HoloKeydError);
    expect(String((err as Error).message)).not.toContain(SECRET);
  });

  it('times out a hung transport', async () => {
    const c = new HolokeydClient({ transport: () => new Promise(() => undefined), timeoutMs: 20 });
    await expect(c.get('X')).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('never puts a value into an error message', async () => {
    const c = new HolokeydClient({
      transport: async () => {
        throw new Error(`boom ${SECRET}`);
      },
    });
    const err = await c.put('X', SECRET).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(HoloKeydError);
    expect(err.message).not.toContain(SECRET);
  });
});

describe('unix socket transport (fake holokeyd)', () => {
  let servers: Server[] = [];
  let dir: string | undefined;
  afterEach(async () => {
    await Promise.all(servers.map((s) => new Promise((r) => s.close(() => r(undefined)))));
    servers = [];
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  function sockPath(tag: string): string {
    if (process.platform === 'win32') return `\\\\.\\pipe\\holokeyd-test-${tag}-${randomUUID()}`;
    dir ??= mkdtempSync(join(tmpdir(), 'hk-'));
    return join(dir, `${tag}.sock`);
  }

  async function listen(path: string, onLine: (line: string) => string | null): Promise<void> {
    const server = createServer((sock) => {
      let buf = '';
      sock.on('data', (c) => {
        buf += c.toString('utf8');
        const nl = buf.indexOf('\n');
        if (nl < 0) return;
        const out = onLine(buf.slice(0, nl));
        if (out !== null) sock.end(`${out}\n`);
      });
    });
    servers.push(server);
    await new Promise<void>((r) => server.listen(path, () => r()));
  }

  it('routes put to the admin socket and reads to the client socket', async () => {
    const d = fakeDaemon({ BOT_TOKEN: SECRET });
    const clientPath = sockPath('client');
    const adminPath = sockPath('admin');
    const hits: string[] = [];
    await listen(clientPath, (line) => {
      const req = JSON.parse(line) as HoloKeydRequest;
      hits.push(`client:${req.op}`);
      return req.op === 'put'
        ? JSON.stringify({ id: req.id, ok: false, error: { code: 'OPERATION_NOT_ALLOWED' } })
        : JSON.stringify(d.handle(req));
    });
    await listen(adminPath, (line) => {
      const req = JSON.parse(line) as HoloKeydRequest;
      hits.push(`admin:${req.op}`);
      return JSON.stringify(d.handle(req));
    });
    const c = new HolokeydClient({
      transport: createUnixSocketTransport({ socketPath: clientPath, adminSocketPath: adminPath }),
      timeoutMs: 2000,
    });
    await expect(c.get('BOT_TOKEN')).resolves.toBe(SECRET);
    await expect(c.put('BOT_TOKEN', 'rotated-fake')).resolves.toEqual({
      name: 'BOT_TOKEN',
      version: 2,
    });
    await expect(c.get('BOT_TOKEN')).resolves.toBe('rotated-fake');
    expect(hits).toEqual(['client:resolve', 'admin:put', 'client:resolve']);
  });

  it('fails closed on a missing socket, a silent daemon, and garbage', async () => {
    const missing = new HolokeydClient({
      transport: createUnixSocketTransport({
        socketPath: sockPath('nope'),
        adminSocketPath: sockPath('nope2'),
      }),
      timeoutMs: 1000,
    });
    await expect(missing.get('X')).rejects.toMatchObject({ code: 'TRANSPORT_UNAVAILABLE' });

    const silentPath = sockPath('silent');
    await listen(silentPath, () => null);
    const silent = new HolokeydClient({
      transport: createUnixSocketTransport({ socketPath: silentPath }),
      timeoutMs: 50,
    });
    await expect(silent.get('X')).rejects.toMatchObject({ code: 'TIMEOUT' });

    const junkPath = sockPath('junk');
    await listen(junkPath, () => 'not json');
    const junk = new HolokeydClient({
      transport: createUnixSocketTransport({ socketPath: junkPath }),
      timeoutMs: 1000,
    });
    await expect(junk.get('X')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

describe('ssh transport (fake holokeyctl, no spawn)', () => {
  function fakeSsh(d: ReturnType<typeof fakeDaemon>): {
    run: SshRunner;
    calls: { args: string[]; input: string }[];
  } {
    const calls: { args: string[]; input: string }[] = [];
    const run: SshRunner = async (args, input) => {
      calls.push({ args: [...args], input });
      const i = args.indexOf('/usr/local/bin/holokeyctl');
      const [cmd, name] = args.slice(i + 1);
      const op = cmd === 'resolve-stdin' ? 'resolve' : cmd;
      const res = d.handle({
        version: 1,
        id: 'x',
        op: op as HoloKeydRequest['op'],
        name: op === 'resolve' ? input.trim() : name,
        value: op === 'put' ? input : undefined,
      });
      if (!res.ok)
        return { stdout: '', stderr: `holokeyctl: ${res.error!.code}\n`, code: 1, timedOut: false };
      if (op === 'resolve')
        return {
          stdout: (res.result as { value: string }).value,
          stderr: '',
          code: 0,
          timedOut: false,
        };
      return {
        stdout: `${JSON.stringify({ ok: true, operation: op, result: res.result })}\n`,
        stderr: '',
        code: 0,
        timedOut: false,
      };
    };
    return { run, calls };
  }

  it('maps get/put to holokeyctl resolve-stdin / put --json; values only on stdin', async () => {
    const d = fakeDaemon({ BOT_TOKEN: SECRET });
    const ssh = fakeSsh(d);
    const c = new HolokeydClient({
      transport: createSshTransport({ host: 'holojetson', run: ssh.run }),
    });
    await expect(c.get('BOT_TOKEN')).resolves.toBe(SECRET);
    await expect(c.put('BOT_TOKEN', 'rotated-fake')).resolves.toEqual({
      name: 'BOT_TOKEN',
      version: 2,
    });
    await expect(c.get('NOPE')).resolves.toBeUndefined();
    for (const call of ssh.calls) {
      expect(call.args.join(' ')).not.toContain(SECRET);
      expect(call.args.join(' ')).not.toContain('rotated-fake');
      expect(call.args.slice(0, 4)).toEqual(['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5']);
    }
    expect(ssh.calls[1].input).toBe('rotated-fake');
  });

  it('maps ssh exit 255 and timeouts to transport codes', async () => {
    const down = new HolokeydClient({
      transport: createSshTransport({
        host: 'h',
        run: async () => ({ stdout: '', stderr: '', code: 255, timedOut: false }),
      }),
    });
    await expect(down.get('X')).rejects.toMatchObject({ code: 'TRANSPORT_UNAVAILABLE' });
    const slow = new HolokeydClient({
      transport: createSshTransport({
        host: 'h',
        run: async () => ({ stdout: '', stderr: '', code: 'ETIMEDOUT', timedOut: true }),
      }),
    });
    await expect(slow.put('X', SECRET)).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('rejects a hostile host', () => {
    expect(() => createSshTransport({ host: 'h; rm -rf /' })).toThrow(HoloKeydError);
  });

  it('rejects hosts that ssh would read as options, and ends options with --', async () => {
    for (const host of ['-Fevil.conf', '-Eout', '-oProxyCommand=x', '-user@h', 'u@-h']) {
      expect(() => createSshTransport({ host })).toThrow(HoloKeydError);
      expect(createHolokeydClient({ env: { HOLOKEYD_HOST: host } })).toBeNull();
    }
    const calls: string[][] = [];
    const c = new HolokeydClient({
      transport: createSshTransport({
        host: 'holojetson',
        run: async (args) => {
          calls.push([...args]);
          return {
            stdout: '{"ok":true,"result":{"present":true}}\n',
            stderr: '',
            code: 0,
            timedOut: false,
          };
        },
      }),
    });
    await expect(c.has('X')).resolves.toBe(true);
    const args = calls[0];
    expect(args).toContain('StrictHostKeyChecking=yes');
    expect(args[args.indexOf('holojetson') - 1]).toBe('--');
  });

  it('clamps connectTimeoutS to 1..60', async () => {
    const seen: string[] = [];
    for (const t of [0, -5, 999, 7]) {
      const c = new HolokeydClient({
        transport: createSshTransport({
          host: 'h',
          connectTimeoutS: t,
          run: async (args) => {
            seen.push(String(args[3]));
            return {
              stdout: '{"ok":true,"result":{"present":false}}',
              stderr: '',
              code: 0,
              timedOut: false,
            };
          },
        }),
      });
      await c.has('X');
    }
    expect(seen).toEqual([
      'ConnectTimeout=1',
      'ConnectTimeout=1',
      'ConnectTimeout=60',
      'ConnectTimeout=7',
    ]);
  });

  it('get strips exactly one trailing newline from holokeyctl stdout', async () => {
    const mk = (stdout: string) =>
      new HolokeydClient({
        transport: createSshTransport({
          host: 'h',
          run: async () => ({ stdout, stderr: '', code: 0, timedOut: false }),
        }),
      });
    await expect(mk('fake-value\n').get('X')).resolves.toBe('fake-value');
    await expect(mk('fake-value\r\n').get('X')).resolves.toBe('fake-value');
    await expect(mk('fake-value\n\n').get('X')).resolves.toBe('fake-value\n');
    await expect(mk('fake-value').get('X')).resolves.toBe('fake-value');
  });
});

describe('createHolokeydClient / source / resolver wiring', () => {
  it('is OFF without config and for malformed config', () => {
    expect(createHolokeydClient({ env: {} })).toBeNull();
    expect(createHolokeydClient({ env: { HOLOKEYD_HOST: 'a b' } })).toBeNull();
    expect(createHolokeydClient({ env: { HOLOKEYD_SOCKET: 'relative.sock' } })).toBeNull();
  });

  it('prefers the socket over ssh', () => {
    const c = createHolokeydClient({
      env: { HOLOKEYD_SOCKET: '/run/holokeyd/holokeyd.sock', HOLOKEYD_HOST: 'holojetson' },
    });
    expect(c?.id).toBe('holokeyd+unix:///run/holokeyd/holokeyd.sock');
    expect(createHolokeydClient({ env: { HOLOKEYD_HOST: 'holojetson' } })?.id).toBe(
      'holokeyd://holojetson'
    );
  });

  it('source never throws and disables itself after a transport failure', async () => {
    let calls = 0;
    const src = createHolokeydClientSource(
      new HolokeydClient({
        transport: async () => {
          calls += 1;
          throw new HoloKeydError('TRANSPORT_UNAVAILABLE');
        },
      })
    );
    await expect(src.resolve('A')).resolves.toBeUndefined();
    await expect(src.resolve('B')).resolves.toBeUndefined();
    expect(src.reachable()).toBe(false);
    expect(calls).toBe(1);
  });

  it('source does not cache, so a rotated value is seen on the next resolve', async () => {
    const d = fakeDaemon({ BOT_TOKEN: 'v1-fake' });
    const client = new HolokeydClient({ transport: d.transport });
    const src = createHolokeydClientSource(client);
    await expect(src.resolve('BOT_TOKEN')).resolves.toBe('v1-fake');
    await client.put('BOT_TOKEN', 'v2-fake');
    await expect(src.resolve('BOT_TOKEN')).resolves.toBe('v2-fake');
  });

  it('resolver: env wins, holokeyd client answers when env is empty', async () => {
    const d = fakeDaemon({ BOT_TOKEN: SECRET });
    const src = createHolokeydClientSource(new HolokeydClient({ transport: d.transport }));
    const withEnv = createServiceSecretResolver({
      env: { BOT_TOKEN: 'from-env' },
      vault: null,
      remoteSource: src,
      log: () => undefined,
    });
    await expect(withEnv.resolve('BOT_TOKEN')).resolves.toBe('from-env');
    const noEnv = createServiceSecretResolver({
      env: {},
      vault: null,
      remoteSource: src,
      log: () => undefined,
    });
    await expect(noEnv.resolve('BOT_TOKEN')).resolves.toBe(SECRET);
    await expect(noEnv.resolve('ABSENT')).resolves.toBeUndefined();
  });

  it('resolver builds the socket client from HOLOKEYD_SOCKET and logs no value', async () => {
    const lines: string[] = [];
    const r = createServiceSecretResolver({
      env: { HOLOKEYD_SOCKET: '/nonexistent/holokeyd.sock', HOLOKEYD_TIMEOUT_MS: '200' },
      vault: null,
      log: (m) => lines.push(m),
    });
    await expect(r.resolve('ABSENT_NAME')).resolves.toBeUndefined();
    expect(lines.join('\n')).toContain('holokeyd+unix:///nonexistent/holokeyd.sock');
  });
});
