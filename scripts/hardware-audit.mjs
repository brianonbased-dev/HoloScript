#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SCHEMA_VERSION = 'hololand.hardware-receipt.v1';
const DEFAULT_OUTPUT_DIR = path.join('.tmp', 'hardware-receipts');

const WASM_SIMD_VALIDATE_MODULE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
  0x03, 0x02, 0x01, 0x00,
  0x0a, 0x16, 0x01, 0x14, 0x00, 0xfd, 0x0c,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x0b,
]);

const BROWSER_CANDIDATES = [
  process.env.HOLOLAND_HARDWARE_BROWSER,
  process.env.CHROME_PATH,
  process.env.EDGE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'chrome',
  'google-chrome',
  'microsoft-edge',
  'msedge',
  'chromium',
].filter(Boolean);

function parseArgs(argv) {
  const args = {
    browser: undefined,
    json: false,
    manualNotes: [],
    noBrowser: false,
    output: undefined,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    } else if (arg === '--browser') {
      args.browser = argv[++index];
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--manual-note') {
      args.manualNotes.push(argv[++index]);
    } else if (arg === '--no-browser') {
      args.noBrowser = true;
    } else if (arg === '--output') {
      args.output = argv[++index];
    } else if (arg === '--self-test') {
      args.selfTest = true;
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
  console.log(`HoloLand hardware audit

Usage:
  node scripts/hardware-audit.mjs [options]
  pnpm audit:hardware -- [options]

Options:
  --browser <path>        Browser executable to audit.
  --json                  Print the full HardwareReceipt JSON.
  --manual-note <text>    Add a device/runtime note to the receipt. Repeatable.
  --no-browser            Skip browser/WebGPU/WebXR checks.
  --output <path>         Receipt path. Defaults to .tmp/hardware-receipts/.
  --self-test             Assert receipt shape and critical local checks.
  -h, --help              Show this help.
`);
}

function commandExists(command) {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  });
  return result.status === 0 || Boolean(result.stdout || result.stderr);
}

function findBrowser(explicitBrowser) {
  const candidates = explicitBrowser ? [explicitBrowser] : BROWSER_CANDIDATES;

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && existsSync(candidate)) {
      return candidate;
    }

    if (!path.isAbsolute(candidate) && commandExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

function runVersion(command) {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    timeout: 7000,
    windowsHide: true,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    error: result.error ? result.error.message : undefined,
  };
}

function runVersionCandidates(commands) {
  let lastResult = null;

  for (const command of commands.filter(Boolean)) {
    const result = runVersion(command);
    lastResult = { ...result, command };
    if (result.ok || result.stdout || result.stderr) {
      return lastResult;
    }
  }

  return lastResult || {
    ok: false,
    status: null,
    stdout: '',
    stderr: '',
    error: 'No command candidates provided',
    command: null,
  };
}

function runPnpmVersion() {
  const userAgentMatch = (process.env.npm_config_user_agent || '').match(/pnpm\/([^\s]+)/);
  if (userAgentMatch) {
    return {
      ok: true,
      status: 0,
      stdout: userAgentMatch[1],
      stderr: '',
      error: undefined,
      command: 'npm_config_user_agent',
    };
  }

  const directResult = runVersionCandidates([
    'pnpm',
    'pnpm.cmd',
    process.env.PNPM_HOME ? path.join(process.env.PNPM_HOME, 'pnpm.cmd') : null,
    process.env.APPDATA ? path.join(process.env.APPDATA, 'npm', 'pnpm.cmd') : null,
  ]);

  if (directResult.ok || directResult.stdout || directResult.stderr) {
    return directResult;
  }

  const shellResult = os.platform() === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --version'], {
      encoding: 'utf8',
      timeout: 7000,
      windowsHide: true,
    })
    : spawnSync('sh', ['-lc', 'pnpm --version'], {
      encoding: 'utf8',
      timeout: 7000,
      windowsHide: true,
    });

  return {
    ok: shellResult.status === 0,
    status: shellResult.status,
    stdout: (shellResult.stdout || '').trim(),
    stderr: (shellResult.stderr || '').trim(),
    error: shellResult.error
      ? shellResult.error.message
      : shellResult.status === 0
        ? undefined
        : directResult.error,
    command: os.platform() === 'win32' ? 'cmd.exe /c pnpm --version' : 'sh -lc pnpm --version',
  };
}

function parseMajor(versionText) {
  const match = versionText.match(/(\d+)(?:\.\d+){0,2}/);
  return match ? Number(match[1]) : NaN;
}

function decodeHtml(text) {
  return text
    .replaceAll('&quot;', '"')
    .replaceAll('&#34;', '"')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function browserAuditHtml() {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>HoloLand Hardware Audit</title></head>
<body>
<pre id="receipt">{"ready":false}</pre>
<script>
(async function collect() {
  const receipt = {
    ready: true,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    maxTouchPoints: navigator.maxTouchPoints || 0,
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    deviceMemory: navigator.deviceMemory || null,
    mobileSurface: /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent),
    secureContext: window.isSecureContext,
    webgpuApi: Boolean(navigator.gpu),
    webxrApi: Boolean(navigator.xr),
    xrHandApi: typeof XRHand !== "undefined",
    gamepadHapticsApi: typeof GamepadHapticActuator !== "undefined"
  };

  // WebGPU adapter detection with retry and extended timeout.
  // Headless Chrome GPU init can be slow and intermittent — 2026-05-16
  // receipt passed but 2026-05-17 timed out at 5s. Retry once at 15s
  // to distinguish "slow init" from "genuinely unavailable".
  if (navigator.gpu && navigator.gpu.requestAdapter) {
    const ADAPTER_TIMEOUT_MS = 15000;
    const MAX_ADAPTER_ATTEMPTS = 2;
    let lastAdapterResult = null;
    let attempts = 0;

    for (let attempt = 1; attempt <= MAX_ADAPTER_ATTEMPTS; attempt++) {
      attempts = attempt;
      try {
        const adapter = await Promise.race([
          navigator.gpu.requestAdapter(),
          new Promise((resolve) => setTimeout(() => resolve("timeout"), ADAPTER_TIMEOUT_MS))
        ]);

        if (adapter === "timeout") {
          lastAdapterResult = {
            ok: false,
            reason: "timeout",
            attempt,
            timeoutMs: ADAPTER_TIMEOUT_MS,
            headlessMode: /HeadlessChrome/i.test(navigator.userAgent),
          };
          continue; // retry on timeout
        } else if (adapter) {
          // Adapter obtained — also try requestAdapterInfo and device creation
          // to confirm full WebGPU capability (not just API surface).
          let adapterInfo = null;
          if (typeof adapter.requestAdapterInfo === "function") {
            try { adapterInfo = await adapter.requestAdapterInfo(); } catch (_) { /* non-critical */ }
          }

          let deviceResult = null;
          try {
            const device = await Promise.race([
              adapter.requestDevice(),
              new Promise((resolve) => setTimeout(() => resolve("timeout"), ADAPTER_TIMEOUT_MS))
            ]);
            if (device === "timeout") {
              deviceResult = { ok: false, reason: "timeout" };
            } else if (device) {
              deviceResult = {
                ok: true,
                features: Array.from(device.features || []),
                limits: device.limits ? Object.assign({}, device.limits) : null,
              };
            } else {
              deviceResult = { ok: false, reason: "null-device" };
            }
          } catch (deviceError) {
            deviceResult = { ok: false, reason: deviceError && deviceError.message ? deviceError.message : String(deviceError) };
          }

          lastAdapterResult = {
            ok: true,
            features: Array.from(adapter.features || []),
            limits: adapter.limits ? Object.assign({}, adapter.limits) : null,
            adapterInfo,
            device: deviceResult,
            attempt,
            headlessMode: /HeadlessChrome/i.test(navigator.userAgent),
          };
          break; // success — no retry needed
        } else {
          lastAdapterResult = {
            ok: false,
            reason: "null-adapter",
            attempt,
            headlessMode: /HeadlessChrome/i.test(navigator.userAgent),
          };
          break; // null adapter is deterministic — retry won't help
        }
      } catch (error) {
        lastAdapterResult = {
          ok: false,
          reason: error && error.message ? error.message : String(error),
          attempt,
          headlessMode: /HeadlessChrome/i.test(navigator.userAgent),
        };
        break; // exception is deterministic — retry won't help
      }
    }

    receipt.webgpuAdapter = lastAdapterResult || { ok: false, reason: "no-result", attempts };
  } else {
    receipt.webgpuAdapter = { ok: false, reason: "api-missing" };
  }

  document.getElementById("receipt").textContent = JSON.stringify(receipt);
}());
</script>
</body>
</html>`;
}

function parseDumpedDom(stdout) {
  const match = stdout.match(/<pre id="receipt">([\s\S]*?)<\/pre>/i);
  if (!match) {
    return null;
  }

  return JSON.parse(decodeHtml(match[1].trim()));
}

function runBrowserDomAudit(browserPath) {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'hololand-hardware-audit-'));
  const auditHtml = path.join(tempRoot, 'audit.html');
  const profileDir = path.join(tempRoot, 'profile');
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(auditHtml, browserAuditHtml(), 'utf8');

  const browserArgs = [
    '--headless=new',
    '--disable-gpu-sandbox',
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan,WebGPU',
    '--ignore-gpu-blocklist',
    '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=45000',
    `--user-data-dir=${profileDir}`,
    '--dump-dom',
    pathToFileURL(auditHtml).href,
  ];

  try {
    const result = spawnSync(browserPath, browserArgs, {
      encoding: 'utf8',
      timeout: 60000,
      windowsHide: true,
    });
    let parsedReceipt = null;
    let parseError;
    try {
      parsedReceipt = result.stdout ? parseDumpedDom(result.stdout) : null;
    } catch (error) {
      parseError = error && error.message ? error.message : String(error);
    }

    return {
      ok: result.status === 0,
      status: result.status,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      error: result.error ? result.error.message : undefined,
      parseError,
      receipt: parsedReceipt,
    };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function createReceipt(args) {
  const pnpmVersion = runPnpmVersion();
  const nodeVersion = process.version;
  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    taskSource: 'hololand-audit-2026-05-07',
    command: {
      argv: process.argv,
      cwd: process.cwd(),
    },
    host: {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      nodeVersion,
      pnpmVersion: pnpmVersion.stdout || pnpmVersion.stderr || null,
      cpuModel: os.cpus()[0] ? os.cpus()[0].model : null,
      logicalCpus: os.cpus().length,
      totalMemoryGb: Number((os.totalmem() / 1024 / 1024 / 1024).toFixed(2)),
    },
    checks: [],
    notes: [
      'Browser hardware APIs can be gated by browser flags, secure context, attached devices, and headless mode.',
      ...args.manualNotes,
    ],
  };

  const addCheck = (check) => {
    receipt.checks.push({
      critical: false,
      evidence: {},
      notes: [],
      ...check,
    });
  };

  const nodeMajor = parseMajor(nodeVersion);
  addCheck({
    id: 'node-version',
    target: 'Node.js runtime',
    status: nodeMajor >= 22 ? 'pass' : 'fail',
    critical: true,
    evidence: { version: nodeVersion, requiredMajor: 22 },
    notes: nodeMajor >= 22
      ? ['Meets the hardware-native Codex baseline.']
      : ['HoloLand hardware-native sessions require Node.js v22 or newer.'],
  });

  const pnpmMajor = parseMajor(pnpmVersion.stdout || pnpmVersion.stderr || '');
  addCheck({
    id: 'pnpm-version',
    target: 'pnpm package manager',
    status: pnpmVersion.ok && pnpmMajor >= 9 ? 'pass' : 'fail',
    critical: true,
    evidence: pnpmVersion,
    notes: pnpmVersion.ok
      ? ['pnpm is available for local validation commands.']
      : ['pnpm was not available on PATH.'],
  });

  const simdSupported = WebAssembly.validate(WASM_SIMD_VALIDATE_MODULE);
  addCheck({
    id: 'wasm-simd-node',
    target: 'WASM SIMD in Node.js',
    status: simdSupported ? 'pass' : 'fail',
    critical: true,
    evidence: { supported: simdSupported, opcode: 'v128.const' },
    notes: simdSupported
      ? ['Node validates a minimal v128.const module.']
      : ['Node rejected a minimal v128.const module.'],
  });

  const nodeNavigatorGpu = Boolean(globalThis.navigator && globalThis.navigator.gpu);
  addCheck({
    id: 'node-webgpu-surface',
    target: 'Node.js navigator.gpu surface',
    status: nodeNavigatorGpu ? 'pass' : 'skip',
    evidence: { navigatorPresent: Boolean(globalThis.navigator), navigatorGpu: nodeNavigatorGpu },
    notes: [
      nodeNavigatorGpu
        ? 'Node exposes navigator.gpu in this runtime.'
        : 'Node normally lacks navigator.gpu; browser audit is the hardware-relevant check.',
    ],
  });

  if (args.noBrowser) {
    addCheck({
      id: 'browser-audit',
      target: 'Browser WebGPU/WebXR audit',
      status: 'skip',
      evidence: { skippedBy: '--no-browser' },
      notes: ['Browser checks were skipped by command-line option.'],
    });
    return receipt;
  }

  const browserPath = findBrowser(args.browser);
  addCheck({
    id: 'browser-detected',
    target: 'Chromium-family browser executable',
    status: browserPath ? 'pass' : 'warn',
    evidence: { browserPath, explicitBrowser: args.browser || null },
    notes: browserPath
      ? ['A browser executable was found for headless DOM API inspection.']
      : ['No Chrome, Edge, or Chromium executable was found. Use --browser or HOLOLAND_HARDWARE_BROWSER.'],
  });

  if (!browserPath) {
    return receipt;
  }

  const browserVersion = runVersion(browserPath);
  const browserVersionText = `${browserVersion.stdout} ${browserVersion.stderr}`.trim();
  const browserVersionRecognized = /\d+\.\d+|\d+/.test(browserVersionText);
  addCheck({
    id: 'browser-version',
    target: 'Browser version command',
    status: browserVersion.ok && browserVersionRecognized ? 'pass' : 'warn',
    evidence: browserVersion,
    notes: browserVersion.ok && browserVersionRecognized
      ? ['Browser version command completed.']
      : ['Browser version was not clearly reported; continuing with DOM audit.'],
  });

  const domAudit = runBrowserDomAudit(browserPath);
  addCheck({
    id: 'browser-dom-audit',
    target: 'Headless browser DOM hardware API probe',
    status: domAudit.ok && domAudit.receipt ? 'pass' : 'warn',
    evidence: {
      status: domAudit.status,
      error: domAudit.error,
      parseError: domAudit.parseError,
      stderr: domAudit.stderr.trim().slice(0, 2000),
      stdoutPreview: domAudit.receipt ? undefined : domAudit.stdout.slice(0, 2000),
    },
    notes: domAudit.receipt
      ? ['Browser DOM probe returned a structured hardware surface receipt.']
      : ['Browser DOM probe did not return structured output. Headless mode may be unsupported on this machine.'],
  });

  if (!domAudit.receipt) {
    return receipt;
  }

  addCheck({
    id: 'browser-webgpu-api',
    target: 'Browser navigator.gpu API surface',
    status: domAudit.receipt.webgpuApi ? 'pass' : 'warn',
    evidence: {
      webgpuApi: domAudit.receipt.webgpuApi,
      secureContext: domAudit.receipt.secureContext,
      userAgent: domAudit.receipt.userAgent,
    },
    notes: domAudit.receipt.webgpuApi
      ? ['navigator.gpu is present in the audited browser surface.']
      : ['navigator.gpu is absent; this can be a real hardware/browser gap or a headless-mode limitation.'],
  });

  const adapter = domAudit.receipt.webgpuAdapter || { ok: false, reason: 'not-reported' };
  const adapterHeadless = adapter.headlessMode || /HeadlessChrome/i.test(domAudit.receipt.userAgent || '');
  const adapterAttempts = adapter.attempt || 1;
  const adapterTimeoutMs = adapter.timeoutMs || 5000;

  // Status logic: pass if adapter resolved; warn if API present but adapter timed out
  // (intermittent in headless — may work in visible browser); skip if API missing.
  const adapterStatus = adapter.ok
    ? 'pass'
    : domAudit.receipt.webgpuApi
      ? 'warn'
      : 'skip';

  const adapterNotes = adapter.ok
    ? [`navigator.gpu.requestAdapter resolved on attempt ${adapterAttempts}.`]
    : adapter.reason === 'timeout'
      ? [
          `Adapter request timed out after ${adapterTimeoutMs}ms across ${adapterAttempts} attempt(s).`,
          adapterHeadless ? 'Headless Chrome GPU init can be slow — this may pass in a visible browser.' : 'Non-headless context timed out — possible GPU driver or hardware issue.',
          'navigator.gpu API surface was present (see browser-webgpu-api check).',
        ]
      : ['Adapter was not available from this audit surface. Confirm in a visible browser/headset if needed.'];

  addCheck({
    id: 'browser-webgpu-adapter',
    target: 'Browser WebGPU adapter request',
    status: adapterStatus,
    evidence: adapter,
    notes: adapterNotes,
  });

  // Device creation check — verifies full WebGPU pipeline, not just adapter availability.
  const device = adapter.device;
  if (device) {
    addCheck({
      id: 'browser-webgpu-device',
      target: 'Browser WebGPU device creation',
      status: device.ok ? 'pass' : 'warn',
      evidence: {
        ok: device.ok,
        reason: device.reason || undefined,
        features: device.features,
        limits: device.limits,
      },
      notes: device.ok
        ? ['requestDevice() succeeded — full WebGPU pipeline functional.']
        : [`requestDevice() ${device.reason || 'failed'} — adapter available but device creation incomplete.`],
    });
  }

  addCheck({
    id: 'browser-webxr-api',
    target: 'Browser navigator.xr API surface',
    status: domAudit.receipt.webxrApi ? 'pass' : 'warn',
    evidence: {
      webxrApi: domAudit.receipt.webxrApi,
      secureContext: domAudit.receipt.secureContext,
      userAgent: domAudit.receipt.userAgent,
    },
    notes: domAudit.receipt.webxrApi
      ? ['navigator.xr is present in the audited browser surface.']
      : ['navigator.xr is absent; WebXR may require secure context, visible browser session, and compatible hardware.'],
  });

  const inputApiPresent = Boolean(
    domAudit.receipt.xrHandApi
      || domAudit.receipt.gamepadHapticsApi
      || domAudit.receipt.maxTouchPoints > 0
  );
  addCheck({
    id: 'browser-device-input-apis',
    target: 'Headset/mobile input, haptics, and hand-tracking API surfaces',
    status: inputApiPresent ? 'pass' : 'warn',
    evidence: {
      xrHandApi: domAudit.receipt.xrHandApi,
      gamepadHapticsApi: domAudit.receipt.gamepadHapticsApi,
      maxTouchPoints: domAudit.receipt.maxTouchPoints,
      mobileSurface: domAudit.receipt.mobileSurface,
      hardwareConcurrency: domAudit.receipt.hardwareConcurrency,
      deviceMemory: domAudit.receipt.deviceMemory,
      platform: domAudit.receipt.platform,
    },
    notes: inputApiPresent
      ? ['At least one headset/mobile input capability was visible.']
      : ['No headset/mobile-specific input capability was visible from this audit surface.'],
  });

  return receipt;
}

function summarize(receipt) {
  const counts = receipt.checks.reduce((accumulator, check) => {
    accumulator[check.status] = (accumulator[check.status] || 0) + 1;
    return accumulator;
  }, {});
  const failedCritical = receipt.checks.filter((check) => check.critical && check.status === 'fail');

  receipt.summary = {
    status: failedCritical.length === 0 ? 'pass' : 'fail',
    counts,
    failedCritical: failedCritical.map((check) => check.id),
  };

  return receipt.summary;
}

function defaultOutputPath() {
  const stamp = new Date().toISOString().replaceAll(':', '').replace(/\.\d{3}Z$/, 'Z');
  return path.join(DEFAULT_OUTPUT_DIR, `hardware-receipt-${stamp}.json`);
}

function writeReceipt(receipt, outputPath) {
  const resolvedOutput = path.resolve(outputPath || defaultOutputPath());
  mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  receipt.output = { path: resolvedOutput };
  writeFileSync(resolvedOutput, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return resolvedOutput;
}

function assertSelfTest(receipt) {
  const checkById = new Map(receipt.checks.map((check) => [check.id, check]));
  const requiredPasses = ['node-version', 'pnpm-version', 'wasm-simd-node'];
  const failures = [];

  if (receipt.schemaVersion !== SCHEMA_VERSION) {
    failures.push(`schemaVersion=${receipt.schemaVersion}`);
  }

  for (const id of requiredPasses) {
    if (checkById.get(id)?.status !== 'pass') {
      failures.push(`${id}=${checkById.get(id)?.status || 'missing'}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Hardware audit self-test failed: ${failures.join(', ')}`);
  }
}

function printSummary(receipt) {
  const summary = receipt.summary || summarize(receipt);
  console.log(`HardwareReceipt: ${summary.status}`);
  console.log(`Schema: ${receipt.schemaVersion}`);
  console.log(`Generated: ${receipt.generatedAt}`);
  console.log(`Checks: pass=${summary.counts.pass || 0} warn=${summary.counts.warn || 0} skip=${summary.counts.skip || 0} fail=${summary.counts.fail || 0}`);
  if (receipt.output?.path) {
    console.log(`Output: ${receipt.output.path}`);
  }

  for (const check of receipt.checks) {
    const marker = check.status.toUpperCase().padEnd(4, ' ');
    console.log(`${marker} ${check.id} - ${check.target}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const receipt = createReceipt(args);
  summarize(receipt);
  const outputPath = writeReceipt(receipt, args.output);
  receipt.output = { path: outputPath };

  if (args.selfTest) {
    assertSelfTest(receipt);
  }

  if (args.json) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    printSummary(receipt);
  }

  if (receipt.summary.status === 'fail') {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
