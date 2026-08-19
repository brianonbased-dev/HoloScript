#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RUNNER_VERSION = '1.0.0';
const DEFAULT_TIMEOUT_MS = 30000;
const VALID_DEVICE_KINDS = new Set([
  'quest3',
  'quest3s',
  'quest-pro',
  'vision-pro',
  'pico4',
  'lookingglass',
  'lidar-scanner',
  'camera-rig',
  'hardware-other',
]);

const SIMD_MODULE = Uint8Array.from([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 22, 1, 20, 0, 253, 12, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 11,
]);

function parseArgs(argv) {
  const args = {
    browser: false,
    deviceKind: process.env.HOLOLAND_DEVICE_KIND || 'hardware-other',
    expectHeadset: false,
    host: '127.0.0.1',
    json: false,
    noWrite: false,
    open: false,
    out: '',
    port: 0,
    scenarioId: 'hololand-device-lab',
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--browser') args.browser = true;
    else if (arg === '--device-kind') args.deviceKind = String(argv[++i] || args.deviceKind);
    else if (arg === '--expect-headset') args.expectHeadset = true;
    else if (arg === '--host') args.host = String(argv[++i] || args.host);
    else if (arg === '--json') args.json = true;
    else if (arg === '--no-write') args.noWrite = true;
    else if (arg === '--open') {
      args.open = true;
      args.browser = true;
    } else if (arg === '--out') args.out = String(argv[++i] || '');
    else if (arg === '--port') args.port = Number.parseInt(String(argv[++i] || '0'), 10) || 0;
    else if (arg === '--scenario') args.scenarioId = String(argv[++i] || args.scenarioId);
    else if (arg === '--timeout-ms') {
      args.timeoutMs =
        Number.parseInt(String(argv[++i] || DEFAULT_TIMEOUT_MS), 10) || DEFAULT_TIMEOUT_MS;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`HoloLand device lab probe runner ${RUNNER_VERSION}

Usage:
  node scripts/device-lab-probe.mjs [options]

Options:
  --browser              Serve a browser/WebXR/WebGPU probe page and wait for a result.
  --open                 Open the local browser probe URL automatically.
  --host <host>          Probe server host. Use 0.0.0.0 for headset/LAN checks.
  --port <port>          Probe server port. Default 0 selects a free port.
  --expect-headset       Mark browser result inconclusive when the user agent is not a headset.
  --device-kind <kind>   Receipt kind. Defaults to HOLOLAND_DEVICE_KIND or hardware-other.
                         Valid: ${[...VALID_DEVICE_KINDS].join(', ')}.
  --scenario <id>        ValidationReceipt.scenarioId. Default hololand-device-lab.
  --timeout-ms <ms>      Browser probe wait timeout. Default ${DEFAULT_TIMEOUT_MS}.
  --out <path>           Receipt output path. Default .device-lab/receipts/<id>.json.
  --no-write             Do not write a receipt file.
  --json                 Print full receipt JSON to stdout.

Examples:
  node scripts/device-lab-probe.mjs
  node scripts/device-lab-probe.mjs --browser --open
  node scripts/device-lab-probe.mjs --browser --host 0.0.0.0 --expect-headset --timeout-ms 120000
`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

function statusToOutcome(status) {
  if (status === 'pass') return 'matched';
  if (status === 'fail') return 'diverged';
  if (status === 'skip') return 'skipped';
  return 'errored';
}

function validationStatus(probes, gotchas) {
  if (probes.some((probe) => probe.status === 'fail')) return 'failed';
  if (gotchas.length > 0 || probes.some((probe) => probe.status !== 'pass')) return 'inconclusive';
  return 'passed';
}

function collectNodeRuntime() {
  const major = Number.parseInt(process.versions.node.split('.')[0] || '0', 10);
  return {
    id: 'node-runtime',
    label: 'Node runtime',
    status: major >= 20 ? 'pass' : 'fail',
    details: {
      node: process.version,
      v8: process.versions.v8,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd(),
      runner: fileURLToPath(import.meta.url),
    },
  };
}

function probeWasmSimd() {
  const supported = WebAssembly.validate(SIMD_MODULE);
  return {
    id: 'wasm-simd',
    label: 'WASM SIMD',
    status: supported ? 'pass' : 'fail',
    details: {
      validateReturned: supported,
      moduleBytes: SIMD_MODULE.length,
    },
  };
}

async function collectGpuInventory() {
  if (process.platform === 'win32') {
    const command = [
      '-NoProfile',
      '-Command',
      'Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion,VideoProcessor | ConvertTo-Json -Depth 4',
    ];
    const result = await execFileJson('powershell.exe', command);
    if (result.ok) {
      const adapters = Array.isArray(result.value) ? result.value : [result.value].filter(Boolean);
      return {
        id: 'gpu-inventory',
        label: 'Local GPU inventory',
        status: adapters.length > 0 ? 'pass' : 'fail',
        details: { source: 'Win32_VideoController', adapters },
      };
    }
    return {
      id: 'gpu-inventory',
      label: 'Local GPU inventory',
      status: 'error',
      details: { source: 'Win32_VideoController', error: result.error },
    };
  }

  const lspci = await execFileText('lspci', []);
  if (lspci.ok) {
    const adapters = lspci.stdout
      .split(/\r?\n/)
      .filter((line) => /vga|3d controller|display/i.test(line));
    return {
      id: 'gpu-inventory',
      label: 'Local GPU inventory',
      status: adapters.length > 0 ? 'pass' : 'fail',
      details: { source: 'lspci', adapters },
    };
  }

  return {
    id: 'gpu-inventory',
    label: 'Local GPU inventory',
    status: 'skip',
    details: { source: 'platform-fallback', error: 'No GPU inventory command available.' },
  };
}

function execFileText(file, args) {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { encoding: 'utf8', windowsHide: true, timeout: 10000 },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            ok: false,
            error: stderr || error.message || String(error),
            stdout: stdout || '',
          });
          return;
        }
        resolve({ ok: true, stdout: stdout || '' });
      }
    );
  });
}

async function execFileJson(file, args) {
  const result = await execFileText(file, args);
  if (!result.ok) return { ok: false, error: result.error };
  try {
    return { ok: true, value: JSON.parse(result.stdout || 'null') };
  } catch (error) {
    return { ok: false, error: `JSON parse failed: ${error.message}` };
  }
}

async function runBrowserProbe(args) {
  const browserResult = await waitForBrowserProbe(args);
  const details = browserResult.details ?? {};
  const gotchas = [];

  if (browserResult.status === 'timeout') {
    gotchas.push('browser-probe-timeout');
  }
  if (details.navigatorGpu === false) {
    gotchas.push('webgpu-browser-unavailable');
  }
  if (details.secureContext === false) {
    gotchas.push('browser-context-not-secure');
  }
  if (args.expectHeadset && details.isLikelyHeadset === false) {
    gotchas.push('expected-headset-but-user-agent-was-not-headset');
  }

  let status = 'pass';
  if (browserResult.status === 'timeout') status = 'skip';
  if (details.error) status = 'error';
  if (details.navigatorGpu === false || details.adapter === null) status = 'fail';
  if (args.expectHeadset && details.isLikelyHeadset === false) status = 'fail';

  return {
    id: 'browser-webgpu-webxr',
    label: 'Browser WebGPU/WebXR probe',
    status,
    details,
    gotchas,
  };
}

function waitForBrowserProbe(args) {
  return new Promise((resolve) => {
    let settled = false;
    const server = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(browserProbeHtml());
        return;
      }

      if (req.method === 'POST' && req.url === '/browser-result') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 1024 * 1024) req.destroy();
        });
        req.on('end', () => {
          res.writeHead(204);
          res.end();
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          server.close();
          try {
            resolve({ status: 'reported', details: JSON.parse(body) });
          } catch (error) {
            resolve({
              status: 'reported',
              details: { error: `Invalid browser JSON: ${error.message}` },
            });
          }
        });
        return;
      }

      res.writeHead(404);
      res.end('not found');
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const address = server.address();
      server.close();
      resolve({
        status: 'timeout',
        details: {
          timeoutMs: args.timeoutMs,
          urls: urlsForServer(args.host, Number(address?.port || args.port || 0)),
        },
      });
    }, args.timeoutMs);

    server.listen(args.port, args.host, () => {
      const address = server.address();
      const port = Number(address?.port || args.port);
      const urls = urlsForServer(args.host, port);
      console.error('[device-lab] Browser probe page:');
      for (const url of urls) console.error(`  ${url}`);
      if (args.open) openUrl(urls[0]);
    });
  });
}

function urlsForServer(host, port) {
  const urls = [];
  const localHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  urls.push(`http://${localHost}:${port}/`);
  if (host === '0.0.0.0' || host === '::') {
    for (const address of lanAddresses()) {
      urls.push(`http://${address}:${port}/`);
    }
  }
  return [...new Set(urls)];
}

function lanAddresses() {
  const out = [];
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const entry of addresses ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) out.push(entry.address);
    }
  }
  return out;
}

function openUrl(url) {
  if (process.platform === 'win32') {
    execFile('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true }, () => {});
  } else if (process.platform === 'darwin') {
    execFile('open', [url], () => {});
  } else {
    execFile('xdg-open', [url], () => {});
  }
}

function browserProbeHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>HoloLand Device Lab Probe</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { background: #111827; color: #f9fafb; font: 16px system-ui, sans-serif; margin: 2rem; }
    pre { background: #030712; border: 1px solid #374151; padding: 1rem; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>HoloLand Device Lab Probe</h1>
  <pre id="out">Running browser checks...</pre>
  <script>
    const out = document.getElementById('out');
    const headsetPattern = /OculusBrowser|Quest|Pico|Vision Pro|VR|XR/i;
    async function run() {
      const result = {
        capturedAt: new Date().toISOString(),
        userAgent: navigator.userAgent,
        secureContext: window.isSecureContext,
        navigatorGpu: Boolean(navigator.gpu),
        navigatorXr: Boolean(navigator.xr),
        isLikelyHeadset: headsetPattern.test(navigator.userAgent),
        adapter: null,
        adapterInfo: null,
        webxr: {},
      };
      try {
        if (navigator.gpu) {
          const adapter = await navigator.gpu.requestAdapter();
          if (adapter) {
            result.adapter = {
              features: Array.from(adapter.features || []),
              limits: Object.fromEntries(Object.entries(adapter.limits || {}).map(([k, v]) => [k, Number(v)])),
            };
            if (typeof adapter.requestAdapterInfo === 'function') {
              result.adapterInfo = await adapter.requestAdapterInfo();
            }
          }
        }
      } catch (error) {
        result.webgpuError = error && error.message ? error.message : String(error);
      }
      try {
        if (navigator.xr && typeof navigator.xr.isSessionSupported === 'function') {
          result.webxr.immersiveVr = await navigator.xr.isSessionSupported('immersive-vr');
          result.webxr.immersiveAr = await navigator.xr.isSessionSupported('immersive-ar');
        }
      } catch (error) {
        result.webxr.error = error && error.message ? error.message : String(error);
      }
      out.textContent = JSON.stringify(result, null, 2);
      await fetch('/browser-result', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(result),
      });
    }
    run().catch((error) => {
      out.textContent = String(error && error.stack ? error.stack : error);
    });
  </script>
</body>
</html>`;
}

function deriveGotchas(probes) {
  const gotchas = [];
  for (const probe of probes) {
    for (const gotcha of probe.gotchas ?? []) gotchas.push(gotcha);
  }
  if (probes.find((probe) => probe.id === 'node-runtime')?.status === 'fail') {
    gotchas.push('node-version-below-hololand-minimum');
  }
  if (probes.find((probe) => probe.id === 'wasm-simd')?.status === 'fail') {
    gotchas.push('wasm-simd-unavailable');
  }
  const gpuProbe = probes.find((probe) => probe.id === 'gpu-inventory');
  if (gpuProbe && gpuProbe.status !== 'pass') gotchas.push('gpu-inventory-unavailable');
  if (!probes.some((probe) => probe.id === 'browser-webgpu-webxr')) {
    gotchas.push('browser-webgpu-headset-probe-not-run');
  }
  return [...new Set(gotchas)];
}

function buildReceipt({ args, probes, gotchas, startedAt, completedAt }) {
  const hardwareFingerprint = stableStringify({
    arch: os.arch(),
    cpus: os.cpus().map((cpu) => cpu.model),
    gpu: probes.find((probe) => probe.id === 'gpu-inventory')?.details,
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    totalmem: os.totalmem(),
  });
  const hardwareHash = sha256(hardwareFingerprint);
  const receiptId = `val_hololand_device_lab_${completedAt.replace(/[-:.TZ]/g, '').slice(0, 14)}`;
  const status = validationStatus(probes, gotchas);

  const body = {
    id: receiptId,
    scenarioId: args.scenarioId,
    validatedAt: completedAt,
    status,
    hardwareReceipts: [
      {
        id: `hw_${args.deviceKind}_${completedAt.replace(/[-:.TZ]/g, '').slice(0, 14)}`,
        kind: args.deviceKind,
        capturedAt: completedAt,
        hash: hardwareHash,
        hashAlgorithm: 'sha256',
        deviceModel: `${os.hostname()} ${os.platform()} ${os.release()} ${os.arch()}`,
        firmwareVersion: process.version,
        metadata: {
          fingerprintFields: ['hostname', 'platform', 'release', 'arch', 'cpus', 'gpu', 'totalmem'],
        },
      },
    ],
    replayInputs: probes.map((probe) => ({
      id: `input_${probe.id}`,
      at: startedAt,
      source: 'scripts/device-lab-probe.mjs',
      kind: `hardware.${probe.id}`,
      payload: { label: probe.label },
    })),
    replayOutcomes: probes.map((probe) => ({
      id: `outcome_${probe.id}`,
      status: statusToOutcome(probe.status),
      at: completedAt,
      stateHash: sha256(stableStringify(probe.details ?? {})),
      stateHashAlgorithm: 'sha256',
      summary: `${probe.label}: ${probe.status}`,
      metadata: probe.details ?? {},
    })),
    verificationCommands: [
      {
        command: 'node scripts/device-lab-probe.mjs',
        description: 'Run node-only hardware inventory and WASM SIMD checks.',
      },
      {
        command: 'node scripts/device-lab-probe.mjs --browser --open',
        description: 'Run desktop browser WebGPU/WebXR checks and capture a browser receipt.',
      },
      {
        command:
          'node scripts/device-lab-probe.mjs --browser --host 0.0.0.0 --expect-headset --timeout-ms 120000',
        description: 'Expose the probe page on the LAN for Quest/headset validation.',
      },
    ],
    metadata: {
      runner: 'scripts/device-lab-probe.mjs',
      runnerVersion: RUNNER_VERSION,
      startedAt,
      completedAt,
      gotchas,
      probes: probes.map((probe) => ({ id: probe.id, status: probe.status })),
    },
  };

  return {
    ...body,
    hash: sha256(stableStringify(body)),
    hashAlgorithm: 'sha256',
  };
}

async function writeReceipt(receipt, outPath) {
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

function defaultOutPath(receipt) {
  return path.join('.device-lab', 'receipts', `${receipt.id}.json`);
}

function printSummary(receipt, outPath) {
  console.log(`[device-lab] status: ${receipt.status}`);
  console.log(`[device-lab] hash:   ${receipt.hash}`);
  if (outPath) console.log(`[device-lab] wrote:  ${outPath}`);
  const gotchas = receipt.metadata?.gotchas ?? [];
  if (gotchas.length > 0) {
    console.log('[device-lab] gotchas:');
    for (const gotcha of gotchas) console.log(`  - ${gotcha}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!VALID_DEVICE_KINDS.has(args.deviceKind)) {
    throw new Error(
      `Invalid --device-kind ${args.deviceKind}. Valid values: ${[...VALID_DEVICE_KINDS].join(', ')}`
    );
  }

  const startedAt = new Date().toISOString();
  const probes = [collectNodeRuntime(), probeWasmSimd(), await collectGpuInventory()];

  if (args.browser) {
    probes.push(await runBrowserProbe(args));
  }

  const completedAt = new Date().toISOString();
  const gotchas = deriveGotchas(probes);
  const receipt = buildReceipt({ args, probes, gotchas, startedAt, completedAt });
  const outPath = args.noWrite ? '' : args.out || defaultOutPath(receipt);

  if (!args.noWrite) await writeReceipt(receipt, outPath);

  if (args.json) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    printSummary(receipt, outPath);
  }

  process.exit(receipt.status === 'failed' ? 1 : 0);
}

main().catch((error) => {
  console.error(`[device-lab] ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
