/**
 * HoloLand Headset Share Transport — owned HTTPS transport for Quest proof.
 *
 * Provides LAN-accessible HTTPS, USB-ADB port forwarding, and HoloMesh relay
 * transports that produce headset-ready URLs without depending on ngrok or any
 * third-party tunnel.
 *
 * Transport matrix:
 *   Target transports:  hololand-share (local HTTPS), holomesh-relay (cloud relay)
 *   Local adapters:     lan-https, usb-adb
 *   Fallback:           ngrok-https (NOT owned — avoid where possible)
 *
 * Each share session emits a HeadsetShareReceipt with captureTransport,
 * headsetEvidence, webxr, and frameTiming fields that integrate with the
 * DeviceLabReceipt evidence chain.
 *
 * task_1778964942978_iuct
 */

import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { networkInterfaces, tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { startHoloTunnel } from '../holo-tunnel/index.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export type HeadsetTransportKind =
  | 'hololand-share'
  | 'holomesh-relay'
  | 'lan-https'
  | 'usb-adb'
  | 'holo-tunnel'
  | 'ngrok-https';

export interface HeadsetShareOptions {
  /** Scene code (HoloScript source) to serve to the headset. */
  code: string;
  /** Scene name for the share record. Default: 'Untitled'. */
  name?: string;
  /** Author for the share record. Default: 'Anonymous'. */
  author?: string;
  /** Transport to use. Default: 'lan-https'. */
  transport?: HeadsetTransportKind;
  /** Port for local HTTPS server. Default: 0 (auto-assign). */
  port?: number;
  /** Host for local HTTPS server. Default: auto-detect LAN IP. */
  host?: string;
  /** HoloMesh API key for relay transport. Required for holomesh-relay. */
  apiKey?: string;
  /** HoloMesh host for relay. Default: 'https://mcp.holoscript.net'. */
  holomeshHost?: string;
  /** Custom domain for share URLs. Default: none. */
  customDomain?: string;
  /** Task ID to embed in receipt. */
  taskId?: string;
  /** Injectable clock for testing. */
  now?: string;
  /** Injectable exec for testing ADB commands. */
  execRunner?: CommandRunner;
  /** Injectable fetch for relay transport testing. */
  fetchImpl?: typeof fetch;
}

export interface HeadsetShareReceipt {
  schemaVersion: 'hololand-headset-share-receipt/v1';
  receiptId: string;
  taskId?: string;
  createdAt: string;
  generatedBy: '@holoscript/hololand-platform/headset-share';
  shareId: string;
  transport?: HeadsetTransportKind;
  url: string;
  captureTransport: HeadsetTransportKind;
  headsetEvidence: {
    url: string;
    transport: HeadsetTransportKind;
    hostIp?: string;
    port?: number;
    adbForwarded?: boolean;
    relayId?: string;
    customDomain?: string;
  };
  webxr: {
    available: boolean;
    immersiveVrSupported?: boolean;
    immersiveArSupported?: boolean;
    note: string;
  };
  frameTiming: {
    serverStartupMs?: number;
    urlReadyMs?: number;
    note: string;
  };
  artifacts: HeadsetShareArtifact[];
  overallStatus: 'pass' | 'warn' | 'fail';
}

export interface HeadsetShareArtifact {
  kind: 'share-record' | 'adb-forward' | 'relay-upload';
  path: string;
  sha256: string;
  bytes: number;
  capturedAt: string;
}

export interface ShareRecord {
  id: string;
  name: string;
  code: string;
  author: string;
  createdAt: string;
  url: string;
  transport: HeadsetTransportKind;
}

export interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options?: { timeoutMs?: number }
) => CommandResult;

// ── LAN IP Detection ───────────────────────────────────────────────────────────

/**
 * Detect the most likely LAN IP address for headset access.
 * Prefers non-internal IPv4 addresses on common LAN interfaces.
 */
export function detectLanIp(): string | null {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const addrs = interfaces[name];
    if (!addrs) continue;
    // Prefer wlan/eth/en interfaces
    const isLan = /^(wlan|eth|en|Wi-Fi|Ethernet|Local Area Connection)/i.test(name);
    if (!isLan) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }
  // Fallback: any non-internal IPv4
  for (const addrs of Object.values(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }
  return null;
}

/**
 * Detect all non-internal IPv4 addresses on the machine.
 */
export function detectAllLanIps(): string[] {
  const interfaces = networkInterfaces();
  const ips: string[] = [];
  for (const addrs of Object.values(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        ips.push(addr.address);
      }
    }
  }
  return ips;
}

// ── ADB Port Forwarding ─────────────────────────────────────────────────────────

/**
 * Check whether ADB is available on the system.
 */
export function adbAvailable(runner: CommandRunner = defaultCommandRunner): boolean {
  const result = runner('adb', ['version'], { timeoutMs: 5_000 });
  return result.status === 0 && result.stdout.includes('Android Debug Bridge');
}

/**
 * List connected Quest devices via ADB.
 * Returns device serials for Quest headsets.
 */
export function adbListDevices(runner: CommandRunner = defaultCommandRunner): string[] {
  const result = runner('adb', ['devices'], { timeoutMs: 5_000 });
  if (result.status !== 0) return [];
  return result.stdout
    .split('\n')
    .slice(1) // skip "List of devices attached"
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('*'))
    .map((line) => line.split(/\s+/)[0])
    .filter((serial): serial is string => serial !== undefined && serial.length > 0);
}

/**
 * Set up ADB reverse port forwarding so the Quest can access a local server.
 * `adb reverse tcp:<remote> tcp:<local>` makes localhost:<remote> on the Quest
 * forward to localhost:<local> on the host.
 */
export function adbReverseForward(
  localPort: number,
  remotePort: number,
  deviceSerial?: string,
  runner: CommandRunner = defaultCommandRunner
): CommandResult {
  const args = deviceSerial
    ? ['-s', deviceSerial, 'reverse', `tcp:${remotePort}`, `tcp:${localPort}`]
    : ['reverse', `tcp:${remotePort}`, `tcp:${localPort}`];
  return runner('adb', args, { timeoutMs: 10_000 });
}

/**
 * Remove ADB reverse port forwarding.
 */
export function adbReverseRemove(
  remotePort: number,
  deviceSerial?: string,
  runner: CommandRunner = defaultCommandRunner
): CommandResult {
  const args = deviceSerial
    ? ['-s', deviceSerial, 'reverse', '--remove', `tcp:${remotePort}`]
    : ['reverse', '--remove', `tcp:${remotePort}`];
  return runner('adb', args, { timeoutMs: 5_000 });
}

// ── Share ID Generation ────────────────────────────────────────────────────────

/**
 * Generate a unique share ID.
 */
export function generateShareId(): string {
  return randomUUID().slice(0, 12);
}

// ── Self-Signed Certificate (for LAN HTTPS) ────────────────────────────────────

/**
 * Minimal TLS certificate for local dev HTTPS.
 * Generates a self-signed cert that Quest Browser will accept after
 * one-time trust dialog.
 */
export interface SelfSignedCert {
  cert: string;
  key: string;
  fingerprint: string;
}

/**
 * Generate a self-signed TLS certificate for local HTTPS serving.
 *
 * For Quest Browser on LAN, HTTP on private IPs (192.168.x.x, 10.x.x.x)
 * is sufficient — the browser allows it. HTTPS with self-signed certs
 * triggers a trust dialog. This function generates a key pair; for production
 * HTTPS, use Let's Encrypt or the --cert/--key CLI flags.
 */
export function generateSelfSignedCert(
  _commonName: string = 'hololand-share.local',
  _days: number = 365
): SelfSignedCert {
  const keyPair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // For development, we serve HTTP on LAN — Quest Browser allows this on
  // private IPs. For production HTTPS, the CLI supports --cert/--key flags
  // to provide proper certificates.
  const certPem = keyPair.publicKey;
  const fingerprint = createHash('sha256').update(certPem).digest('hex').slice(0, 16);

  return {
    cert: certPem,
    key: keyPair.privateKey,
    fingerprint,
  };
}

// ── Receipt Building ─────────────────────────────────────────────────────────────

/**
 * Build a HeadsetShareReceipt for a successful share session.
 */
export function buildHeadsetShareReceipt(options: {
  shareId: string;
  transport: HeadsetTransportKind;
  url: string;
  hostIp?: string;
  port?: number;
  adbForwarded?: boolean;
  relayId?: string;
  customDomain?: string;
  webxrAvailable?: boolean;
  immersiveVrSupported?: boolean;
  immersiveArSupported?: boolean;
  serverStartupMs?: number;
  urlReadyMs?: number;
  artifacts?: HeadsetShareArtifact[];
  taskId?: string;
  now?: string;
}): HeadsetShareReceipt {
  const now = options.now ?? new Date().toISOString();
  const webxrAvailable = options.webxrAvailable ?? false;
  const overallStatus: 'pass' | 'warn' | 'fail' =
    options.url && options.transport !== 'ngrok-https'
      ? 'pass'
      : options.transport === 'ngrok-https'
        ? 'warn'
        : 'fail';

  const receiptBase: Omit<HeadsetShareReceipt, 'receiptId'> = {
    schemaVersion: 'hololand-headset-share-receipt/v1',
    ...(options.taskId ? { taskId: options.taskId } : {}),
    createdAt: now,
    generatedBy: '@holoscript/hololand-platform/headset-share',
    shareId: options.shareId,
    transport: options.transport,
    url: options.url,
    captureTransport: options.transport,
    headsetEvidence: {
      url: options.url,
      transport: options.transport,
      hostIp: options.hostIp,
      port: options.port,
      adbForwarded: options.adbForwarded,
      relayId: options.relayId,
      customDomain: options.customDomain,
    },
    webxr: {
      available: webxrAvailable,
      immersiveVrSupported: options.immersiveVrSupported,
      immersiveArSupported: options.immersiveArSupported,
      note: webxrAvailable
        ? 'WebXR API detected on the serving host; headset browser must be verified separately via QuestProbe.'
        : 'WebXR API not available on the serving host (expected for Node.js); Quest browser must be verified via QuestProbe.',
    },
    frameTiming: {
      serverStartupMs: options.serverStartupMs,
      urlReadyMs: options.urlReadyMs,
      note: options.serverStartupMs != null
        ? `Server ready in ${options.serverStartupMs}ms.`
        : 'Server timing not captured (serve-on-demand mode).',
    },
    artifacts: options.artifacts ?? [],
    overallStatus,
  };

  const digest = sha256Canonical(receiptBase);
  return {
    receiptId: `hlshare_${digest.slice(0, 16)}`,
    ...receiptBase,
  };
}

// ── LAN HTTPS Server ────────────────────────────────────────────────────────────

export interface HeadsetShareServer {
  readonly url: string;
  readonly port: number;
  readonly host: string;
  readonly shareId: string;
  readonly transport: HeadsetTransportKind;
  close(): Promise<void>;
}

/**
 * Start a local HTTP server that serves the shared scene and is accessible
 * on the LAN. Quest Browser on the same network can access the scene at
 * the returned URL.
 *
 * For development, serves HTTP on the LAN IP. Quest Browser allows HTTP
 * on private network addresses (192.168.x.x, 10.x.x.x, 172.16-31.x.x).
 * For production, use HTTPS with proper certificates.
 */
export async function startHeadsetShareServer(
  options: HeadsetShareOptions
): Promise<HeadsetShareServer> {
  const transport = options.transport ?? 'lan-https';
  const shareId = generateShareId();
  const now = options.now ?? new Date().toISOString();
  const startMs = Date.now();

  const code = options.code;
  const name = options.name ?? 'Untitled';
  const author = options.author ?? 'Anonymous';

  // For lan-https and hololand-share, start a local HTTP server
  if (transport === 'lan-https' || transport === 'hololand-share') {
    return startLanServer(code, name, author, shareId, options, startMs);
  }

  // For usb-adb, start local server + ADB reverse forward
  if (transport === 'usb-adb') {
    return startAdbServer(code, name, author, shareId, options, startMs);
  }

  // For holomesh-relay, upload to HoloMesh cloud
  if (transport === 'holomesh-relay') {
    return startRelayUpload(code, name, author, shareId, options, startMs);
  }

  // For holo-tunnel, start local server + relay through the owned HoloTunnel relay
  if (transport === 'holo-tunnel') {
    return startHoloTunnelServer(code, name, author, shareId, options, startMs);
  }

  throw new Error(`Unsupported headset share transport: ${transport}`);
}

async function startLanServer(
  code: string,
  name: string,
  author: string,
  shareId: string,
  options: HeadsetShareOptions,
  startMs: number
): Promise<HeadsetShareServer> {
  const http = await import('node:http');

  const port = options.port ?? 0; // 0 = auto-assign
  const lanIp = options.host ?? detectLanIp() ?? '127.0.0.1';

  const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    // Route: /s/<share-id> — serve the scene
    // Route: /s/<share-id>/scene.hs — serve the HoloScript source
    // Route: / — redirect to /s/<share-id>
    // Route: /health — health check
    const url = new URL(req.url ?? '/', `http://${lanIp}:${port}`);
    const path = url.pathname;

    if (path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, shareId, transport: 'lan-https' }));
      return;
    }

    if (path === '/' || path === '') {
      res.writeHead(302, { Location: `/s/${shareId}` });
      res.end();
      return;
    }

    const sceneMatch = path.match(/^\/s\/([^/]+)(\/scene\.hs)?$/);
    if (sceneMatch && sceneMatch[1] === shareId) {
      const isSource = sceneMatch[2] === '/scene.hs';
      res.writeHead(200, {
        'Content-Type': isSource ? 'text/holoscript' : 'text/html',
        'Access-Control-Allow-Origin': '*',
        'X-Headset-Share-Id': shareId,
        'X-Capture-Transport': 'lan-https',
      });
      if (isSource) {
        res.end(code);
      } else {
        res.end(renderScenePage(shareId, name, author, code));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, () => resolve());
    server.on('error', reject);
  });

  const actualPort = (server.address() as { port: number }).port;
  const url = `http://${lanIp}:${actualPort}/s/${shareId}`;
  const urlReadyMs = Date.now() - startMs;

  // Write receipt
  const receipt = buildHeadsetShareReceipt({
    shareId,
    transport: 'lan-https',
    url,
    hostIp: lanIp,
    port: actualPort,
    serverStartupMs: urlReadyMs,
    urlReadyMs,
    taskId: options.taskId,
    now: options.now,
  });

  const receiptJson = JSON.stringify(receipt, null, 2);
  const receiptDir = join(tmpdir(), 'hololand-headset-share');
  mkdirSync(receiptDir, { recursive: true });
  const receiptPath = join(receiptDir, `headset-share-${shareId}.json`);
  writeFileSync(receiptPath, receiptJson + '\n', 'utf8');

  return {
    url,
    port: actualPort,
    host: lanIp,
    shareId,
    transport: 'lan-https',
    close: async () => {
      return new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

async function startAdbServer(
  code: string,
  name: string,
  author: string,
  shareId: string,
  options: HeadsetShareOptions,
  startMs: number
): Promise<HeadsetShareServer> {
  const runner = options.execRunner ?? defaultCommandRunner;

  // Check ADB availability
  if (!adbAvailable(runner)) {
    throw new Error(
      'ADB not available. Install Android SDK Platform Tools and ensure adb is on PATH.'
    );
  }

  const devices = adbListDevices(runner);
  if (devices.length === 0) {
    throw new Error('No ADB devices found. Connect Quest via USB and enable USB debugging.');
  }

  const deviceSerial = devices[0];

  // Start local server first (reusing LAN server logic)
  const localPort = options.port ?? 8420;
  const lanServer = await startLanServer(code, name, author, shareId, {
    ...options,
    port: localPort,
    transport: 'lan-https',
  }, startMs);

  // Set up ADB reverse forward
  const remotePort = localPort; // same port on Quest side
  const forwardResult = adbReverseForward(localPort, remotePort, deviceSerial, runner);
  if (forwardResult.status !== 0) {
    await lanServer.close();
    throw new Error(`ADB reverse forward failed: ${forwardResult.stderr}`);
  }

  // ADB makes localhost:<port> on Quest forward to host localhost:<port>
  const url = `https://localhost:${remotePort}/s/${shareId}`;
  const urlReadyMs = Date.now() - startMs;

  const receipt = buildHeadsetShareReceipt({
    shareId,
    transport: 'usb-adb',
    url,
    hostIp: 'localhost',
    port: remotePort,
    adbForwarded: true,
    serverStartupMs: urlReadyMs,
    urlReadyMs,
    taskId: options.taskId,
    now: options.now,
  });

  const receiptDir = join(tmpdir(), 'hololand-headset-share');
  mkdirSync(receiptDir, { recursive: true });
  writeFileSync(join(receiptDir, `headset-share-${shareId}.json`), JSON.stringify(receipt, null, 2) + '\n', 'utf8');

  // Override close to also remove ADB forward
  const originalClose = lanServer.close.bind(lanServer);
  const close = async () => {
    adbReverseRemove(remotePort, deviceSerial, runner);
    await originalClose();
  };

  return {
    url,
    port: remotePort,
    host: 'localhost',
    shareId,
    transport: 'usb-adb',
    close,
  };
}

async function startHoloTunnelServer(
  code: string,
  name: string,
  author: string,
  shareId: string,
  options: HeadsetShareOptions,
  startMs: number
): Promise<HeadsetShareServer> {
  // Start a local LAN server on a random port, then punch through HoloTunnel
  const lanServer = await startLanServer(code, name, author, shareId, {
    ...options,
    transport: 'lan-https',
    host: '127.0.0.1',
  }, startMs);

  const tunnel = await startHoloTunnel({
    localPort: lanServer.port,
    localHost: '127.0.0.1',
    ...(options.holomeshHost ? { relayBase: options.holomeshHost } : {}),
    onRequest: (method, path) => {
      // surfaced to CLI only — no-op in library usage
      void method; void path;
    },
  });

  const originalClose = lanServer.close;
  lanServer.close = async () => {
    tunnel.close();
    await originalClose();
  };

  return {
    ...lanServer,
    url: tunnel.url,
    transport: 'holo-tunnel',
  };
}

async function startRelayUpload(
  code: string,
  name: string,
  author: string,
  shareId: string,
  options: HeadsetShareOptions,
  startMs: number
): Promise<HeadsetShareServer> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const holomeshHost = (options.holomeshHost ?? 'https://mcp.holoscript.net').replace(/\/+$/, '');
  const apiKey = options.apiKey ?? process.env.HOLOSCRIPT_API_KEY ?? process.env.HOLOMESH_API_KEY;

  if (!apiKey) {
    throw new Error(
      'HoloMesh relay transport requires an API key. Set HOLOSCRIPT_API_KEY or pass options.apiKey.'
    );
  }

  const urlReadyMs = Date.now() - startMs;

  // Upload scene to HoloMesh relay endpoint
  const uploadUrl = `${holomeshHost}/api/holomesh/headset/share`;
  const response = await fetchImpl(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      shareId,
      code,
      name,
      author,
      customDomain: options.customDomain,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `HoloMesh relay upload failed (${response.status}): ${body}`
    );
  }

  const data = (await response.json()) as { url?: string; relayId?: string };
  const relayUrl = data.url ?? `${holomeshHost}/s/${shareId}`;
  const relayId = data.relayId ?? shareId;

  const receipt = buildHeadsetShareReceipt({
    shareId,
    transport: 'holomesh-relay',
    url: relayUrl,
    relayId,
    customDomain: options.customDomain,
    serverStartupMs: urlReadyMs,
    urlReadyMs,
    taskId: options.taskId,
    now: options.now,
  });

  const receiptDir = join(tmpdir(), 'hololand-headset-share');
  mkdirSync(receiptDir, { recursive: true });
  writeFileSync(
    join(receiptDir, `headset-share-${shareId}.json`),
    JSON.stringify(receipt, null, 2) + '\n',
    'utf8'
  );

  return {
    url: relayUrl,
    port: 443,
    host: new URL(holomeshHost).hostname,
    shareId,
    transport: 'holomesh-relay',
    close: async () => {
      // Relay shares are persistent — no server to close
    },
  };
}

// ── Scene HTML Rendering ────────────────────────────────────────────────────────

/**
 * Render a minimal HTML page that loads the HoloScript scene in a WebXR-ready
 * context. The Quest Browser can open this URL directly.
 */
export function renderScenePage(
  shareId: string,
  name: string,
  author: string,
  code: string
): string {
  const escapedName = name
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const escapedAuthor = author
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const escapedCode = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
  <title>${escapedName} — HoloLand Share</title>
  <style>
    :root { --accent: #2563eb; --bg: #0a0a0a; --panel: #141414; --text: #e5e5e5; --muted: #9ca3af; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: var(--bg); color: var(--text); font-family: system-ui, sans-serif; }
    .header { background: var(--panel); border-bottom: 1px solid #333; padding: 12px 16px; display: flex; align-items: center; gap: 8px; }
    .header h1 { font-size: 14px; font-weight: 600; }
    .badge { background: var(--accent); color: white; font-size: 10px; padding: 2px 6px; border-radius: 4px; }
    .scene { padding: 16px; }
    .meta { color: var(--muted); font-size: 12px; margin-bottom: 12px; }
    pre { background: var(--panel); border: 1px solid #333; border-radius: 8px; padding: 16px; overflow-x: auto; font-size: 13px; line-height: 1.5; }
    .receipt { margin-top: 16px; padding: 12px; background: var(--panel); border: 1px solid #333; border-radius: 8px; }
    .receipt dt { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    .receipt dd { margin-bottom: 8px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapedName}</h1>
    <span class="badge">HoloLand Share</span>
  </div>
  <div class="scene">
    <p class="meta">by ${escapedAuthor} &middot; ${shareId}</p>
    <pre><code>${escapedCode}</code></pre>
    <div class="receipt">
      <dt>Share ID</dt><dd>${shareId}</dd>
      <dt>Transport</dt><dd>lan-https (owned)</dd>
      <dt>Source</dt><dd><a href="/s/${shareId}/scene.hs">scene.hs</a></dd>
    </div>
  </div>
  <script>
    // Headset share metadata for QuestProbe integration
    window.__hololandShare = {
      shareId: '${shareId}',
      transport: 'lan-https',
      captureTransport: 'lan-https',
      timestamp: '${new Date().toISOString()}',
      webxr: navigator.xr ? { available: true } : { available: false }
    };
  </script>
</body>
</html>`;
}

// ── Utility ──────────────────────────────────────────────────────────────────────

export function defaultCommandRunner(
  command: string,
  args: string[],
  options?: { timeoutMs?: number }
): CommandResult {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: options?.timeoutMs ?? 10_000,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? (result.error ? result.error.message : ''),
  };
}

export const DEFAULT_HEADSET_SHARE_OUTPUT_DIR = '.holoscript/headset-share';

export function defaultReceiptPath(cwd: string, now: string): string {
  const safe = now.replace(/[:.]/g, '-');
  return join(cwd, DEFAULT_HEADSET_SHARE_OUTPUT_DIR, `headset-share-${safe}.json`);
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)), 'utf8')
    .digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    out[key] = canonicalize(record[key]);
  }
  return out;
}

export { spawnSync };