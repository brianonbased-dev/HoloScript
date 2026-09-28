import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { connect as netConnect } from 'node:net';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LlamaServerCompiler, type LlamaServerBundle } from '../LlamaServerCompiler';
import { createTestCompilerToken } from '../CompilerBase';
import type {
  HoloComposition,
  HoloObjectTrait,
  HoloValue,
} from '../../parser/HoloCompositionTypes';

const token = createTestCompilerToken();

function llamaTrait(config: Record<string, HoloValue>): HoloObjectTrait {
  return {
    type: 'ObjectTrait',
    name: 'llama_serve',
    config,
    args: [],
  };
}

function composition(traitConfig: Record<string, HoloValue>): HoloComposition {
  return {
    type: 'Composition',
    name: 'trace-capture-node',
    traits: [llamaTrait(traitConfig)],
    templates: [],
    objects: [],
    spatialGroups: [],
    lights: [],
    transitions: [],
    timelines: [],
    audio: [],
    zones: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    imports: [],
    conditionals: [],
    iterators: [],
  } as unknown as HoloComposition;
}

const baseConfig: Record<string, HoloValue> = {
  model: 'brittney-edge:v0-4',
  model_path: '/opt/holoscript/models/qwen3-4b-instruct.gguf',
  vision: false,
  host: '192.168.0.119',
  port: 18080,
  platform: 'linux',
  executable: '/opt/holoscript/llama.cpp/build-holo/bin/llama-server',
  node: 'jetson-orin',
  register_as: 'jetson-orin-llamacpp',
};

function compile(config: Record<string, HoloValue>): LlamaServerBundle {
  const compiler = new LlamaServerCompiler();
  return JSON.parse(compiler.compile(composition(config), token)) as LlamaServerBundle;
}

describe('LlamaServerCompiler trace_capture', () => {
  it('is OFF by default: no proxy artifacts, server binds the public address', () => {
    const bundle = compile(baseConfig);
    expect(bundle.config.traceCapture).toBe(false);
    expect(bundle.registryEntry.capabilities.traceCapture).toBe(false);
    expect(bundle.files.some((f) => f.path.includes('holo-inference-proxy'))).toBe(false);
    expect(bundle.launch.args.join(' ')).toContain('192.168.0.119');
    expect(bundle.launch.args.join(' ')).toContain('18080');
  });

  it('rebinds llama-server to loopback upstream and emits proxy script + unit when enabled', () => {
    const bundle = compile({ ...baseConfig, trace_capture: true });

    // llama-server itself moves to loopback:port-1
    const argLine = bundle.launch.args.join(' ');
    expect(argLine).toContain('127.0.0.1');
    expect(argLine).toContain('18079');
    expect(argLine).not.toContain('192.168.0.119');
    expect(bundle.service.systemdUnit).toContain('127.0.0.1');

    // proxy artifacts exist
    const proxyScript = bundle.files.find((f) => f.path === 'holo-inference-proxy.mjs');
    const proxyUnit = bundle.files.find(
      (f) => f.path === 'holo-inference-proxy-jetson-orin-llamacpp.service'
    );
    expect(proxyScript).toBeDefined();
    expect(proxyScript?.executable).toBe(true);
    expect(proxyUnit).toBeDefined();

    // proxy owns the PUBLIC bind and points at the loopback upstream
    expect(proxyUnit?.content).toContain('HOLO_PROXY_BIND_HOST=192.168.0.119');
    expect(proxyUnit?.content).toContain('HOLO_PROXY_BIND_PORT=18080');
    expect(proxyUnit?.content).toContain('HOLO_PROXY_UPSTREAM=http://127.0.0.1:18079');
    expect(proxyUnit?.content).toContain('Restart=always');
    expect(proxyUnit?.content).toContain(
      'After=network-online.target jetson-orin-llamacpp.service'
    );

    // receipt/capsule contract is baked into the script
    expect(proxyScript?.content).toContain('inference-receipt/v0');
    expect(proxyScript?.content).toContain("source: 'inference-proxy'");
    expect(proxyScript?.content).toContain('unattributed');
  });

  it('keeps every public-facing surface on the declared host:port', () => {
    const bundle = compile({ ...baseConfig, trace_capture: true });
    expect(bundle.healthProbe.url).toContain('192.168.0.119:18080');
    expect(bundle.registryEntry.endpoint).toContain('192.168.0.119:18080');
    expect(bundle.registryEntry.healthUrl).toContain('192.168.0.119:18080');
    expect(bundle.registryEntry.capabilities.traceCapture).toBe(true);
    const registryDoc = bundle.files.find((f) => f.path.startsWith('sovereign-devices/'));
    expect(registryDoc?.content).toContain('192.168.0.119:18080');
    expect(registryDoc?.content).not.toContain('18079');
  });

  it('honors explicit trace field overrides', () => {
    const bundle = compile({
      ...baseConfig,
      trace_capture: true,
      trace_upstream_port: 18070,
      attribution_header: 'X-Custom-Agent',
      trace_receipts_dir: '/data/receipts',
      trace_capsules_dir: '/data/capsules',
      trace_capsule_daily_mb: 64,
    });
    expect(bundle.config.traceUpstreamPort).toBe(18070);
    const unit = bundle.files.find((f) => f.path.startsWith('holo-inference-proxy-'));
    expect(unit?.content).toContain('HOLO_PROXY_UPSTREAM=http://127.0.0.1:18070');
    expect(unit?.content).toContain('HOLO_PROXY_ATTRIBUTION_HEADER=X-Custom-Agent');
    expect(unit?.content).toContain('HOLO_PROXY_RECEIPTS_DIR=/data/receipts');
    expect(unit?.content).toContain('HOLO_PROXY_CAPSULES_DIR=/data/capsules');
    expect(unit?.content).toContain('HOLO_PROXY_CAPSULE_DAILY_MB=64');
  });

  it('warns on windows (proxy unit is systemd-only)', () => {
    const bundle = compile({
      ...baseConfig,
      trace_capture: true,
      platform: 'windows',
      executable:
        'C:\\Users\\josep\\Documents\\GitHub\\llama.cpp\\build-holo\\bin\\Release\\llama-server.exe',
    });
    expect(bundle.warnings.some((w) => w.includes('systemd proxy unit'))).toBe(true);
  });

  it('throws when the upstream port collides with the public port', () => {
    const compiler = new LlamaServerCompiler();
    expect(() =>
      compiler.compile(
        composition({ ...baseConfig, trace_capture: true, trace_upstream_port: 18080 }),
        token
      )
    ).toThrow(/differ from the public port/);
  });

  it('documents bearer auth in the proxy unit without Requires=holokeyd', () => {
    const bundle = compile({ ...baseConfig, trace_capture: true });
    const unit = bundle.files.find((f) => f.path.startsWith('holo-inference-proxy-'));
    const script = bundle.files.find((f) => f.path === 'holo-inference-proxy.mjs');
    expect(unit?.content).toContain('HOLO_PROXY_AUTH_MODE=log-only');
    expect(unit?.content).toContain('HOLO_PROXY_AUTH_KEY_NAME=HOLO_INFERENCE_PROXY_KEY');
    expect(unit?.content).toContain('After=holokeyd.service');
    expect(unit?.content).not.toMatch(/^\s*Requires=.*holokeyd/m);
    expect(unit?.content).toContain('does not fall back to log-only');
    expect(unit?.content).toContain('503');
    expect(script?.content).toContain('timingSafeEqual');
    expect(script?.content).toContain('delete upstreamHeaders.authorization');
    expect(script?.content).toContain('HOLOKEY_SOCKET');
    expect(script?.content).toContain('AUTH FAIL CLOSED');
    expect(script?.content).toContain("www-authenticate': 'Bearer realm=\"holo-inference-proxy\"'");
    expect(script?.content).not.toContain('requested enforce is DOWNGRADED');
    expect(script?.content).toContain('launching node stub client on win32');
  });
});

const PROXY_SECRET = 'hkp_supersecret_DO_NOT_LOG_9f3a';
const PROXY_KEY_NAME = 'HOLO_INFERENCE_PROXY_KEY';
const BAD_BEARER = 'presented-bad-token-ZZ';
// Same UTF-8 length as PROXY_SECRET, and not a prefix of it. A check that
// accepts any bearer, or any bearer of the right length, must fail.
const SAME_LENGTH_BAD = `${'x'.repeat(PROXY_SECRET.length - 1)}y`;

const FAKE_HOLOKEYCTL = `#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';
const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  const name = Buffer.concat(chunks).toString('utf8').trim();
  appendFileSync(process.env.HOLO_FAKE_CALL_LOG, JSON.stringify({
    name,
    socket: process.env.HOLOKEY_SOCKET || '',
    argv: process.argv.slice(2),
  }) + '\\n');
  const secret = readFileSync(process.env.HOLO_FAKE_KEY_FILE, 'utf8').trim();
  if (process.env.HOLO_FAKE_FAIL === '1') {
    process.stdout.write(secret + '\\n');
    process.stderr.write(secret + '\\n');
    process.exit(1);
  }
  if (name === process.env.HOLO_FAKE_NAME) process.stdout.write(secret + '\\n');
});
`;

interface ProxyHit {
  method: string;
  url: string;
  authorization?: string;
}

interface ProxyCall {
  name: string;
  socket: string;
  argv: string[];
}

interface ProxyHarness {
  port: number;
  logs: () => string;
  hits: () => ProxyHit[];
  calls: () => ProxyCall[];
  receiptText: () => string;
  stop: () => Promise<void>;
}

function lanIPv4(): string {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if ((entry.family === 'IPv4' || entry.family === 4) && !entry.internal) return entry.address;
    }
  }
  throw new Error('a non-loopback IPv4 is required to prove LAN auth');
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const addr = probe.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

function proxyCall(
  host: string,
  port: number,
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ status: number; body: string; headers: IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host, port, path, method: init.method ?? 'GET', headers: init.headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            headers: res.headers,
          })
        );
      }
    );
    req.on('error', reject);
    req.end(init.body);
  });
}

function wwwAuthenticate(headers: IncomingHttpHeaders): string {
  const value = headers['www-authenticate'];
  if (Array.isArray(value)) return value.join(', ');
  return typeof value === 'string' ? value : '';
}

function receiptRows(text: string): Array<Record<string, unknown>> {
  return text
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function waitForTcp(host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host, port }, () => {
      socket.end();
      resolve();
    });
    socket.on('error', reject);
  });
}

async function untilReady(host: string, port: number, proc: ChildProcess, logs: () => string): Promise<void> {
  const deadline = Date.now() + 8000;
  let last = '';
  while (Date.now() < deadline) {
    if (proc.exitCode != null) throw new Error(`proxy exited ${proc.exitCode}: ${logs()}`);
    try {
      await waitForTcp(host, port);
      return;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
  throw new Error(`proxy did not listen: ${last} ${logs()}`);
}

async function startProxy(opts: {
  bindHost: string;
  mode?: string;
  keyName?: string;
  socket?: string;
  fail?: boolean;
  /** Spawn the proxy with process.platform forced to win32, to exercise the node stub launcher. */
  spoofPlatform?: 'win32';
}): Promise<ProxyHarness> {
  const root = mkdtempSync(join(tmpdir(), 'holo-proxy-auth-'));
  const scriptPath = join(root, 'holo-inference-proxy.mjs');
  const clientPath = join(root, 'holokeyctl.mjs');
  const keyFile = join(root, 'key.txt');
  const callLog = join(root, 'calls.ndjson');
  const receiptsDir = join(root, 'receipts');
  const capsulesDir = join(root, 'capsules');
  writeFileSync(scriptPath, compile({ ...baseConfig, trace_capture: true }).files.find((f) => f.path === 'holo-inference-proxy.mjs')!.content);
  writeFileSync(clientPath, FAKE_HOLOKEYCTL);
  chmodSync(clientPath, 0o755);
  writeFileSync(keyFile, `${PROXY_SECRET}\n`);

  const hits: ProxyHit[] = [];
  const upstream = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const headers = req.headers as IncomingHttpHeaders;
      hits.push({
        method: req.method ?? '',
        url: req.url ?? '',
        authorization: headers.authorization,
      });
      const body = Buffer.concat(chunks).toString('utf8');
      if (body.includes(PROXY_SECRET) || String(headers.authorization ?? '').includes(PROXY_SECRET)) {
        hits[hits.length - 1]!.url = `${hits[hits.length - 1]!.url} LEAKED`;
      }
      if (req.url?.startsWith('/v1/models')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ object: 'list', data: [{ id: 'qwen' }] }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: 'pong' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        })
      );
    });
  });
  const upstreamPort = await new Promise<number>((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', () => {
      const addr = upstream.address();
      resolve(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });

  const port = await freePort();
  let logText = '';
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    HOLO_PROXY_BIND_HOST: opts.bindHost,
    HOLO_PROXY_BIND_PORT: String(port),
    HOLO_PROXY_UPSTREAM: `http://127.0.0.1:${upstreamPort}`,
    HOLO_PROXY_RECEIPTS_DIR: receiptsDir,
    HOLO_PROXY_CAPSULES_DIR: capsulesDir,
    HOLOKEYD_CLIENT: clientPath,
    HOLO_FAKE_CALL_LOG: callLog,
    HOLO_FAKE_KEY_FILE: keyFile,
    HOLO_FAKE_NAME: PROXY_KEY_NAME,
  };
  if (opts.mode !== undefined) env.HOLO_PROXY_AUTH_MODE = opts.mode;
  if (opts.keyName !== undefined) env.HOLO_PROXY_AUTH_KEY_NAME = opts.keyName;
  if (opts.socket !== undefined) env.HOLOKEY_SOCKET = opts.socket;
  if (opts.fail) env.HOLO_FAKE_FAIL = '1';
  if (opts.spoofPlatform === 'win32') {
    const preload = join(root, 'spoof-platform.cjs');
    writeFileSync(
      preload,
      "Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });\n"
    );
    env.NODE_OPTIONS = `--require ${preload}`;
  }

  const proc = spawn(process.execPath, [scriptPath], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout?.on('data', (chunk: Buffer) => {
    logText += chunk.toString('utf8');
  });
  proc.stderr?.on('data', (chunk: Buffer) => {
    logText += chunk.toString('utf8');
  });

  const probeHost = opts.bindHost === '::' ? '::1' : '127.0.0.1';
  try {
    await untilReady(probeHost, port, proc, () => logText);
  } catch (err) {
    proc.kill('SIGKILL');
    upstream.close();
    rmSync(root, { recursive: true, force: true });
    throw err;
  }

  return {
    port,
    logs: () => logText,
    hits: () => hits.slice(),
    calls: () => {
      if (!existsSync(callLog)) return [];
      return readFileSync(callLog, 'utf8')
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as ProxyCall);
    },
    receiptText: () => {
      const day = new Date().toISOString().slice(0, 10);
      const file = join(receiptsDir, `inference-${day}.ndjson`);
      return existsSync(file) ? readFileSync(file, 'utf8') : '';
    },
    stop: async () => {
      if (proc.exitCode == null) {
        proc.kill('SIGTERM');
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            resolve();
          }, 1000);
          proc.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
      rmSync(root, { recursive: true, force: true });
    },
  };
}

async function waitUntil(read: () => string, needle: string): Promise<string> {
  const deadline = Date.now() + 2000;
  let last = '';
  while (Date.now() < deadline) {
    last = read();
    if (last.includes(needle)) return last;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error(`timed out waiting for ${JSON.stringify(needle)} in:\n${last}`);
}

function assertNoSecret(...parts: string[]): void {
  const blob = parts.join('\n');
  expect(blob).not.toContain(PROXY_SECRET);
  expect(blob).not.toContain(BAD_BEARER);
  expect(blob).not.toContain(SAME_LENGTH_BAD);
}

describe('generated holo-inference-proxy bearer auth', () => {
  const lan = lanIPv4();
  const chatBody = JSON.stringify({ messages: [{ role: 'user', content: 'ping' }] });

  it('allows loopback in enforce with no credentials, and still checks a LAN caller', async () => {
    const running: ProxyHarness[] = [];
    try {
      const v4 = await startProxy({ bindHost: '0.0.0.0', mode: 'enforce', keyName: PROXY_KEY_NAME });
      running.push(v4);
      const v6 = await startProxy({ bindHost: '::', mode: 'enforce', keyName: PROXY_KEY_NAME });
      running.push(v6);
      const loop = await proxyCall('127.0.0.1', v4.port, '/v1/models');
      const mapped = await proxyCall('127.0.0.1', v6.port, '/v1/models');
      const v6Loop = await proxyCall('::1', v6.port, '/v1/models');
      const denied = await proxyCall(lan, v4.port, '/v1/models');
      const deniedV6 = await proxyCall(lan, v6.port, '/v1/models');
      expect(loop.status).toBe(200);
      expect(mapped.status).toBe(200);
      expect(v6Loop.status).toBe(200);
      expect(denied.status).toBe(401);
      expect(deniedV6.status).toBe(401);
      expect(JSON.parse(denied.body)).toEqual({ error: 'unauthorized' });
      expect(v4.hits().some((hit) => hit.url.startsWith('/v1/models'))).toBe(true);
      const v4Logs = await waitUntil(
        () => v4.logs(),
        `auth result=missing ip=${lan} method=GET path=/v1/models`
      );
      const v6Logs = await waitUntil(() => v6.logs(), 'auth result=missing ip=::ffff:');
      expect(v4Logs).not.toContain('ip=127.0.0.1');
      expect(v6Logs).not.toContain('ip=::1');
      expect(v6Logs).not.toContain('ip=::ffff:127.0.0.1');
      assertNoSecret(v4Logs, v6Logs, loop.body, mapped.body, v6Loop.body, denied.body, deniedV6.body);
    } finally {
      for (const proxy of running) await proxy.stop();
    }
  });

  it('log-only forwards missing and bad keys, logs the result, and strips Authorization', async () => {
    const proxy = await startProxy({ bindHost: '0.0.0.0', mode: 'log-only', keyName: PROXY_KEY_NAME });
    try {
      const missing = await proxyCall(lan, proxy.port, '/v1/chat/completions?n=1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: chatBody,
      });
      const bad = await proxyCall(lan, proxy.port, '/v1/models', {
        headers: { authorization: `Bearer ${BAD_BEARER}` },
      });
      const ok = await proxyCall(lan, proxy.port, '/v1/models', {
        headers: { authorization: `bearer ${PROXY_SECRET}` },
      });
      expect(missing.status).toBe(200);
      expect(bad.status).toBe(200);
      expect(ok.status).toBe(200);
      const logs = await waitUntil(() => proxy.logs(), `auth result=ok ip=${lan} method=GET path=/v1/models`);
      expect(logs).toContain(`auth result=missing ip=${lan} method=POST path=/v1/chat/completions`);
      expect(logs).toContain(`auth result=bad ip=${lan} method=GET path=/v1/models`);
      expect(logs).toContain(`auth result=ok ip=${lan} method=GET path=/v1/models`);
      expect(logs).not.toContain('n=1');
      const hits = proxy.hits();
      expect(hits).toHaveLength(3);
      expect(hits.every((hit) => hit.authorization === undefined)).toBe(true);
      expect(hits.some((hit) => hit.url.includes('LEAKED'))).toBe(false);
      expect(proxy.calls()).toEqual([
        { name: PROXY_KEY_NAME, socket: '/run/holokeyd/holokeyd.sock', argv: ['resolve-stdin'] },
      ]);
      const receipts = await waitUntil(() => proxy.receiptText(), '"authResult":"missing"');
      expect(receipts).toContain('"v":"inference-receipt/v0"');
      expect(receipts).toContain('"authResult":"missing"');
      assertNoSecret(logs, missing.body, bad.body, ok.body, receipts, JSON.stringify(hits));
    } finally {
      await proxy.stop();
    }
  });

  it('enforce returns 401 for missing or bad keys and 200 for a good key, including GET /v1/models', async () => {
    const proxy = await startProxy({
      bindHost: '0.0.0.0',
      mode: 'enforce',
      keyName: PROXY_KEY_NAME,
      socket: '/tmp/custom-holokeyd.sock',
    });
    try {
      const missing = await proxyCall(lan, proxy.port, '/v1/models');
      const bad = await proxyCall(lan, proxy.port, '/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${BAD_BEARER}` },
        body: chatBody,
      });
      const ok = await proxyCall(lan, proxy.port, '/v1/models', {
        headers: { authorization: `Bearer ${PROXY_SECRET}` },
      });
      expect(missing.status).toBe(401);
      expect(bad.status).toBe(401);
      expect(wwwAuthenticate(missing.headers)).toBe('Bearer realm="holo-inference-proxy"');
      expect(wwwAuthenticate(bad.headers)).toBe('Bearer realm="holo-inference-proxy"');
      expect(JSON.parse(missing.body)).toEqual({ error: 'unauthorized' });
      expect(JSON.parse(bad.body)).toEqual({ error: 'unauthorized' });
      expect(ok.status).toBe(200);
      expect(ok.body).toContain('qwen');
      const hits = proxy.hits();
      expect(hits).toEqual([{ method: 'GET', url: '/v1/models', authorization: undefined }]);
      expect(proxy.calls()).toEqual([
        { name: PROXY_KEY_NAME, socket: '/tmp/custom-holokeyd.sock', argv: ['resolve-stdin'] },
      ]);
      const receipts = await waitUntil(() => proxy.receiptText(), '"authResult":"bad"');
      const rows = receiptRows(receipts);
      expect(rows.map((row) => row.authResult)).toEqual(['missing', 'bad']);
      expect(rows.every((row) => row.status === 401 && row.v === 'inference-receipt/v0')).toBe(true);
      expect(rows[0]).toMatchObject({
        remoteAddr: expect.stringContaining(lan) as unknown,
        method: 'GET',
        endpoint: '/v1/models',
        authResult: 'missing',
      });
      expect(typeof rows[0]?.ts).toBe('string');
      expect(rows[1]).toMatchObject({
        method: 'POST',
        endpoint: '/v1/chat/completions',
        authResult: 'bad',
      });
      assertNoSecret(proxy.logs(), missing.body, bad.body, ok.body, receipts, JSON.stringify(hits));
    } finally {
      await proxy.stop();
    }
  });

  it('rejects a wrong key of the same length under enforce and records bad under log-only', async () => {
    expect(SAME_LENGTH_BAD).not.toBe(PROXY_SECRET);
    expect(Buffer.byteLength(SAME_LENGTH_BAD)).toBe(Buffer.byteLength(PROXY_SECRET));
    expect(PROXY_SECRET.startsWith(SAME_LENGTH_BAD.slice(0, 4))).toBe(false);
    const running: ProxyHarness[] = [];
    try {
      const enforced = await startProxy({
        bindHost: '0.0.0.0',
        mode: 'enforce',
        keyName: PROXY_KEY_NAME,
      });
      running.push(enforced);
      const logged = await startProxy({
        bindHost: '0.0.0.0',
        mode: 'log-only',
        keyName: PROXY_KEY_NAME,
      });
      running.push(logged);
      const denied = await proxyCall(lan, enforced.port, '/v1/models?token=should-not-receipt', {
        headers: { authorization: `Bearer ${SAME_LENGTH_BAD}` },
      });
      const forwarded = await proxyCall(lan, logged.port, '/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${SAME_LENGTH_BAD}`,
        },
        body: chatBody,
      });
      expect(denied.status).toBe(401);
      expect(wwwAuthenticate(denied.headers)).toMatch(/^Bearer\b/);
      expect(JSON.parse(denied.body)).toEqual({ error: 'unauthorized' });
      expect(enforced.hits()).toEqual([]);
      expect(forwarded.status).toBe(200);
      const logs = await waitUntil(
        () => logged.logs(),
        `auth result=bad ip=${lan} method=POST path=/v1/chat/completions`
      );
      expect(logs).toContain(`auth result=bad ip=${lan} method=POST path=/v1/chat/completions`);
      const enforceLogs = await waitUntil(
        () => enforced.logs(),
        `auth result=bad ip=${lan} method=GET path=/v1/models`
      );
      const receipts = await waitUntil(() => enforced.receiptText(), '"authResult":"bad"');
      const row = receiptRows(receipts)[0];
      expect(row).toMatchObject({
        v: 'inference-receipt/v0',
        method: 'GET',
        endpoint: '/v1/models',
        authResult: 'bad',
        status: 401,
      });
      expect(typeof row?.ts).toBe('string');
      expect(typeof row?.remoteAddr).toBe('string');
      expect(receipts).not.toContain('should-not-receipt');
      expect(receipts).not.toContain('authorization');
      expect(receipts).not.toContain('Authorization');
      const loggedReceipts = await waitUntil(() => logged.receiptText(), '"authResult":"bad"');
      assertNoSecret(
        enforceLogs,
        logs,
        denied.body,
        forwarded.body,
        receipts,
        loggedReceipts,
        JSON.stringify(enforced.hits()),
        JSON.stringify(logged.hits())
      );
    } finally {
      for (const proxy of running) await proxy.stop();
    }
  });

  it('fails closed on an unknown mode and does not guess log-only', async () => {
    const running: ProxyHarness[] = [];
    try {
      const typo = await startProxy({
        bindHost: '0.0.0.0',
        mode: 'enforced',
        keyName: PROXY_KEY_NAME,
      });
      running.push(typo);
      const other = await startProxy({
        bindHost: '0.0.0.0',
        mode: 'logonly',
        keyName: PROXY_KEY_NAME,
      });
      running.push(other);
      const denied = await proxyCall(lan, typo.port, '/v1/models', {
        headers: { authorization: `Bearer ${PROXY_SECRET}` },
      });
      const alsoDenied = await proxyCall(lan, other.port, '/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${SAME_LENGTH_BAD}` },
        body: chatBody,
      });
      const loop = await proxyCall('127.0.0.1', typo.port, '/v1/models');
      expect(denied.status).toBe(503);
      expect(JSON.parse(denied.body)).toEqual({ error: 'auth unavailable' });
      expect(alsoDenied.status).toBe(503);
      expect(loop.status).toBe(200);
      expect(typo.hits()).toEqual([{ method: 'GET', url: '/v1/models', authorization: undefined }]);
      expect(other.hits()).toEqual([]);
      expect(typo.calls()).toEqual([]);
      expect(other.calls()).toEqual([]);
      for (const proxy of [typo, other]) {
        expect(proxy.logs()).toContain('AUTH FAIL CLOSED: unknown HOLO_PROXY_AUTH_MODE');
        expect(proxy.logs()).toContain('auth: fail-closed');
        expect(proxy.logs()).not.toContain('DOWNGRADED to log-only');
        expect(proxy.logs()).not.toContain('auth: log-only');
        expect(proxy.logs()).not.toContain('auth result=');
      }
      assertNoSecret(typo.logs(), other.logs(), denied.body, alsoDenied.body, typo.receiptText());
    } finally {
      for (const proxy of running) await proxy.stop();
    }
  });

  it('fails closed when enforce cannot load the key, and does not retry holokeyd', async () => {
    const proxy = await startProxy({
      bindHost: '0.0.0.0',
      mode: 'enforce',
      keyName: PROXY_KEY_NAME,
      fail: true,
    });
    try {
      const first = await proxyCall(lan, proxy.port, '/v1/models', {
        headers: { authorization: `Bearer ${PROXY_SECRET}` },
      });
      const second = await proxyCall(lan, proxy.port, '/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${SAME_LENGTH_BAD}` },
        body: chatBody,
      });
      const loop = await proxyCall('127.0.0.1', proxy.port, '/v1/models');
      expect(first.status).toBe(503);
      expect(JSON.parse(first.body)).toEqual({ error: 'auth unavailable' });
      expect(second.status).toBe(503);
      expect(loop.status).toBe(200);
      expect(proxy.logs()).toContain('AUTH FAIL CLOSED');
      expect(proxy.logs()).toContain('could not be loaded');
      expect(proxy.logs()).toContain('Not falling back to log-only');
      expect(proxy.logs()).toContain('auth: fail-closed');
      expect(proxy.logs()).not.toContain('DOWNGRADED to log-only');
      expect(proxy.logs()).not.toContain('auth: log-only');
      expect(proxy.logs()).not.toContain('auth result=');
      expect(proxy.calls()).toHaveLength(1);
      expect(proxy.hits()).toEqual([{ method: 'GET', url: '/v1/models', authorization: undefined }]);
      assertNoSecret(proxy.logs(), first.body, second.body, proxy.receiptText());
    } finally {
      await proxy.stop();
    }
  });

  it('fails closed when enforce has no key name, and when the name is not a plain secret name', async () => {
    const running: ProxyHarness[] = [];
    try {
      const missingName = await startProxy({ bindHost: '0.0.0.0', mode: 'enforce' });
      running.push(missingName);
      const badName = await startProxy({
        bindHost: '0.0.0.0',
        mode: 'enforce',
        keyName: '1not-a-name',
      });
      running.push(badName);
      const missingHit = await proxyCall(lan, missingName.port, '/v1/models');
      const badNameHit = await proxyCall(lan, badName.port, '/v1/models', {
        headers: { authorization: `Bearer ${PROXY_SECRET}` },
      });
      expect(missingHit.status).toBe(503);
      expect(badNameHit.status).toBe(503);
      expect(JSON.parse(missingHit.body)).toEqual({ error: 'auth unavailable' });
      expect(missingName.calls()).toEqual([]);
      expect(badName.calls()).toEqual([]);
      expect(missingName.hits()).toEqual([]);
      expect(badName.hits()).toEqual([]);
      expect(missingName.logs()).toContain('HOLO_PROXY_AUTH_KEY_NAME is not set');
      expect(badName.logs()).toContain('not a plain secret name');
      expect(missingName.logs()).toContain('auth: fail-closed');
      expect(badName.logs()).toContain('auth: fail-closed');
      expect(missingName.logs()).not.toContain('DOWNGRADED to log-only');
      expect(badName.logs()).not.toContain('DOWNGRADED to log-only');
      expect(missingName.logs()).not.toContain('auth: log-only');
      assertNoSecret(missingName.logs(), badName.logs(), missingHit.body, badNameHit.body);
    } finally {
      for (const proxy of running) await proxy.stop();
    }
  });

  it('log-only still forwards when the key cannot be loaded', async () => {
    const proxy = await startProxy({
      bindHost: '0.0.0.0',
      mode: 'log-only',
      keyName: PROXY_KEY_NAME,
      fail: true,
    });
    try {
      const first = await proxyCall(lan, proxy.port, '/v1/models');
      const second = await proxyCall(lan, proxy.port, '/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${BAD_BEARER}` },
        body: chatBody,
      });
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      const logs = await waitUntil(
        () => proxy.logs(),
        `auth result=bad ip=${lan} method=POST path=/v1/chat/completions`
      );
      expect(logs).toContain('staying in log-only');
      expect(logs).toContain(`auth result=missing ip=${lan} method=GET path=/v1/models`);
      expect(logs).toContain(`auth result=bad ip=${lan} method=POST path=/v1/chat/completions`);
      expect(logs).toContain('auth: log-only');
      expect(logs).not.toContain('AUTH FAIL CLOSED');
      expect(proxy.calls()).toHaveLength(1);
      expect(proxy.hits()).toHaveLength(2);
      expect(proxy.hits().every((hit) => hit.authorization === undefined)).toBe(true);
      assertNoSecret(logs, first.body, second.body, proxy.receiptText());
    } finally {
      await proxy.stop();
    }
  });

  it('launches the node holokeyctl stub when process.platform is win32', async () => {
    const proxy = await startProxy({
      bindHost: '0.0.0.0',
      mode: 'enforce',
      keyName: PROXY_KEY_NAME,
      spoofPlatform: 'win32',
    });
    try {
      const denied = await proxyCall(lan, proxy.port, '/v1/models', {
        headers: { authorization: `Bearer ${SAME_LENGTH_BAD}` },
      });
      const ok = await proxyCall(lan, proxy.port, '/v1/models', {
        headers: { authorization: `Bearer ${PROXY_SECRET}` },
      });
      expect(denied.status).toBe(401);
      expect(wwwAuthenticate(denied.headers)).toMatch(/^Bearer\b/);
      expect(ok.status).toBe(200);
      expect(proxy.logs()).toContain('launching node stub client on win32');
      expect(proxy.logs()).toContain('auth: enforce');
      expect(proxy.calls()).toEqual([
        { name: PROXY_KEY_NAME, socket: '/run/holokeyd/holokeyd.sock', argv: ['resolve-stdin'] },
      ]);
      const receipts = await waitUntil(() => proxy.receiptText(), '"authResult":"bad"');
      assertNoSecret(proxy.logs(), denied.body, ok.body, receipts);
    } finally {
      await proxy.stop();
    }
  });

  it('stays off until a key name is configured, and an explicit off mode does not load a key', async () => {
    const running: ProxyHarness[] = [];
    try {
      const unset = await startProxy({ bindHost: '0.0.0.0' });
      running.push(unset);
      const explicitOff = await startProxy({
        bindHost: '0.0.0.0',
        mode: 'off',
        keyName: PROXY_KEY_NAME,
      });
      running.push(explicitOff);
      const implicitLogOnly = await startProxy({ bindHost: '0.0.0.0', keyName: PROXY_KEY_NAME });
      running.push(implicitLogOnly);
      const open = await proxyCall(lan, unset.port, '/v1/models', {
        headers: { authorization: `Bearer ${PROXY_SECRET}` },
      });
      const stillOpen = await proxyCall(lan, explicitOff.port, '/v1/models');
      const logged = await proxyCall(lan, implicitLogOnly.port, '/v1/models');
      expect(open.status).toBe(200);
      expect(stillOpen.status).toBe(200);
      expect(logged.status).toBe(200);
      expect(unset.logs()).not.toContain('auth result=');
      expect(explicitOff.logs()).not.toContain('auth result=');
      expect(unset.calls()).toEqual([]);
      expect(explicitOff.calls()).toEqual([]);
      expect(implicitLogOnly.calls()).toHaveLength(1);
      expect(implicitLogOnly.logs()).toContain(`auth result=missing ip=${lan} method=GET path=/v1/models`);
      expect(unset.hits()[0]?.authorization).toBeUndefined();
      const loopReceipt = await proxyCall('127.0.0.1', implicitLogOnly.port, '/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: chatBody,
      });
      expect(loopReceipt.status).toBe(200);
      const exemptReceipt = await waitUntil(() => implicitLogOnly.receiptText(), '"authResult":"exempt"');
      const offPost = await proxyCall(lan, unset.port, '/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: chatBody,
      });
      expect(offPost.status).toBe(200);
      const offReceiptText = await waitUntil(() => unset.receiptText(), '"v":"inference-receipt/v0"');
      const offLines = offReceiptText.trim().split('\n').filter((line) => line.length > 0);
      const offReceipt = JSON.parse(offLines[offLines.length - 1] ?? '{}') as Record<string, unknown>;
      expect(offReceipt.v).toBe('inference-receipt/v0');
      expect(offReceipt).not.toHaveProperty('authResult');
      assertNoSecret(
        unset.logs(),
        explicitOff.logs(),
        implicitLogOnly.logs(),
        open.body,
        offReceiptText,
        exemptReceipt
      );
    } finally {
      for (const proxy of running) await proxy.stop();
    }
  });
});
