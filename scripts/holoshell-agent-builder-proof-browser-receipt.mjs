#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const SCHEMA = 'hololand.holoshell.agent-builder-proof-browser-receipt.v0.1.0';
const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, '.tmp', 'holoshell', 'agent-builder-proof-0');
const DEFAULT_HTML = path.join(DEFAULT_OUTPUT_DIR, 'builder-proof.html');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    html: DEFAULT_HTML,
    url: '',
    browser: process.env.CHROME_PATH || process.env.EDGE_PATH || '',
    outputDir: DEFAULT_OUTPUT_DIR,
    output: '',
    jsOutput: '',
    width: 1360,
    height: 920,
    timeoutMs: 60_000,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[index];
    };

    if (arg === '--html') args.html = path.resolve(next());
    else if (arg === '--url') args.url = next();
    else if (arg === '--browser') args.browser = next();
    else if (arg === '--output-dir') args.outputDir = path.resolve(next());
    else if (arg === '--output') args.output = path.resolve(next());
    else if (arg === '--js-output') args.jsOutput = path.resolve(next());
    else if (arg === '--width') args.width = Number.parseInt(next(), 10);
    else if (arg === '--height') args.height = Number.parseInt(next(), 10);
    else if (arg === '--timeout-ms') args.timeoutMs = Number.parseInt(next(), 10);
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (!args.url) args.url = pathToFileURL(args.html).href;
  args.url = normalizeUrl(args.url);
  if (!args.output) args.output = path.join(args.outputDir, 'browser-receipt.json');
  if (!args.jsOutput) args.jsOutput = path.join(args.outputDir, 'browser-receipt.js');
  if (!Number.isFinite(args.width) || args.width < 320) throw new Error(`Invalid --width: ${args.width}`);
  if (!Number.isFinite(args.height) || args.height < 320) throw new Error(`Invalid --height: ${args.height}`);
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 1_000) throw new Error(`Invalid --timeout-ms: ${args.timeoutMs}`);
  return args;
}

function usage() {
  return `Usage: node scripts/holoshell-agent-builder-proof-browser-receipt.mjs [options]

Loads the Agent Builder Proof 0 render surface in headless Chrome, clicks the
verification control, asserts visible source/validation/render/receipt fields,
and writes a browser receipt.

Options:
  --html <file>        Render HTML path (default: ${DEFAULT_HTML})
  --url <url>          Override URL; http(s) or file URL
  --browser <path>     Chrome/Edge/Chromium executable path
  --output-dir <dir>   Evidence directory
  --output <file>      Receipt JSON path
  --js-output <file>   Receipt bootstrap JS path
  --width <px>         Viewport width
  --height <px>        Viewport height
  --timeout-ms <ms>    Browser timeout
  --json               Print receipt JSON
  -h, --help           Show this help
`;
}

function normalizeUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) {
    throw new Error(`Builder proof URL must be http(s) or file: ${rawUrl}`);
  }
  parsed.hash = '';
  return parsed.toString();
}

function candidateBrowsers(explicitPath) {
  if (explicitPath) return [explicitPath];
  const localAppData = process.env.LOCALAPPDATA || '';
  const programFiles = process.env.PROGRAMFILES || '';
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] || '';
  return [
    path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    'chrome',
    'chrome.exe',
    'msedge',
    'msedge.exe',
    'chromium',
    'chromium-browser',
  ].filter(Boolean);
}

function resolveBrowser(explicitPath) {
  const candidates = candidateBrowsers(explicitPath);
  for (const candidate of candidates) {
    if (candidate.includes(path.sep) || candidate.includes('/')) {
      if (existsSync(candidate)) return candidate;
      continue;
    }
    const probe = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [candidate], {
      stdio: 'ignore',
      windowsHide: true,
    });
    if (probe.status === 0) return candidate;
  }
  throw new Error(`No Chrome/Edge/Chromium executable found. Tried: ${candidates.join(', ')}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, timeoutMs = 2_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForDebuggerTarget(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`, 2_000);
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) return page;
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for Chrome DevTools target: ${lastError?.message || 'no target'}`);
}

function waitForEvent(client, method, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for CDP event ${method}`));
    }, timeoutMs);
    const cleanup = client.onEvent((message) => {
      if (message.method === method) {
        clearTimeout(timeout);
        cleanup();
        resolve(message.params || {});
      }
    });
  });
}

async function createCdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const eventHandlers = new Set();
  let nextId = 1;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out opening Chrome DevTools socket')), 10_000);
    ws.addEventListener('open', () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
    ws.addEventListener('error', (event) => {
      clearTimeout(timeout);
      reject(new Error(`Chrome DevTools socket error: ${event.message || 'unknown'}`));
    }, { once: true });
  });

  ws.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(item.timeout);
      if (message.error) item.reject(new Error(`${item.method} failed: ${message.error.message}`));
      else item.resolve(message.result || {});
      return;
    }
    for (const handler of eventHandlers) handler(message);
  });

  ws.addEventListener('close', () => {
    for (const item of pending.values()) {
      clearTimeout(item.timeout);
      item.reject(new Error('Chrome DevTools socket closed'));
    }
    pending.clear();
  });

  return {
    send(method, params = {}, timeoutMs = 30_000) {
      const id = nextId;
      nextId += 1;
      const payload = JSON.stringify({ id, method, params });
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        pending.set(id, { method, resolve, reject, timeout });
        ws.send(payload);
      });
    },
    onEvent(handler) {
      eventHandlers.add(handler);
      return () => eventHandlers.delete(handler);
    },
    close() {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    },
  };
}

async function evaluate(client, expression, options = {}) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: options.awaitPromise ?? true,
    returnByValue: options.returnByValue ?? true,
    timeout: options.timeout ?? undefined,
  }, options.timeoutMs ?? 30_000);
  if (result.exceptionDetails) {
    const text = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
    throw new Error(`Browser evaluation failed: ${text}`);
  }
  return result.result?.value;
}

async function waitForExpression(client, expression, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  let lastValue = null;
  while (Date.now() < deadline) {
    lastValue = await evaluate(client, expression, { timeoutMs: 5_000 }).catch(() => null);
    if (lastValue) return lastValue;
    await delay(intervalMs);
  }
  throw new Error(`Timed out waiting for browser condition. Last value: ${JSON.stringify(lastValue)}`);
}

async function waitForExit(child, timeoutMs = 2_000) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function removeDirectoryBestEffort(directory) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      rmSync(directory, { recursive: true, force: true });
      return;
    } catch {
      await delay(150 * (attempt + 1));
    }
  }
}

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join('/');
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

const STATE_EXPRESSION = `(() => {
  const text = (selector) => document.querySelector(selector)?.innerText?.trim() || '';
  const visible = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const proof = window.HOLOSHELL_AGENT_BUILDER_PROOF_0 || {};
  const interaction = window.HOLOSHELL_AGENT_BUILDER_PROOF_0_INTERACTION || {};
  const fullText = document.body.innerText || '';
  const chainItems = Array.from(document.querySelectorAll('#proof-chain li')).map((node) => node.textContent.trim());
  const assertions = {
    rootVisible: visible('#builder-proof-root'),
    agentIntentVisible: visible('#agent-intent') && /agent can author HoloScript source/i.test(text('#agent-intent')),
    sourceVisible: visible('#source-path') && /holoshell-agent-builder-proof-0\\.hsplus/i.test(text('#source-path')),
    sourceHashVisible: Boolean(document.querySelector('#builder-proof-root')?.dataset?.sourceSha256),
    validationVisible: visible('#validation-status') && /pass/i.test(text('#validation-status')),
    renderVisible: visible('#render-output') && /builder-proof\\.html/i.test(text('#render-output')),
    receiptVisible: visible('#receipt-output') && /receipt\\.json/i.test(text('#receipt-output')),
    sourceSnippetVisible: visible('#source-snippet') && /SourcePrecedesBridge/i.test(text('#source-snippet')),
    runtimeReceiptVisible: visible('#runtime-receipt') && /local_browser_file_runtime/i.test(text('#runtime-receipt')),
    proofPathVisible: chainItems.length >= 6,
    interactionCaptured: document.querySelector('#interaction-status')?.dataset?.interacted === 'true' &&
      /Interaction receipt captured/i.test(text('#interaction-status')) &&
      interaction.status === 'pass',
    noR3FTheatreClaim: /NotR3FCompilerTheatre|not_the_goal|not legacy package graph restoration/i.test(fullText),
    embeddedReceiptPresent: proof.schema === 'hololand.holoshell.agent-builder-proof-0.v0.1.0'
  };
  return {
    locationHref: window.location.href,
    title: document.title,
    sourceSha256: document.querySelector('#builder-proof-root')?.dataset?.sourceSha256 || '',
    chainItems,
    visibleTextSamples: {
      intent: text('#agent-intent'),
      source: text('#source-path'),
      validation: text('#validation-status'),
      render: text('#render-output'),
      receipt: text('#receipt-output'),
      interaction: text('#interaction-status')
    },
    interaction,
    assertions
  };
})()`;

function passFromState(state) {
  return Object.values(state.assertions).every(Boolean);
}

function writeBootstrap(jsOutput, receipt) {
  const publicReceipt = {
    schema: receipt.schema,
    status: receipt.status,
    capturedAt: receipt.capturedAt,
    url: receipt.url,
    evidence: receipt.evidence,
    assertions: receipt.state.assertions,
    browser: receipt.browser,
  };
  writeFileSync(
    jsOutput,
    `window.HOLOSHELL_AGENT_BUILDER_PROOF_BROWSER_RECEIPT = ${JSON.stringify(publicReceipt, null, 2)};\n`,
    'utf8',
  );
}

async function runReceipt(args) {
  mkdirSync(args.outputDir, { recursive: true });
  if (args.url.startsWith('file:') && !existsSync(args.html)) throw new Error(`HTML file not found: ${args.html}`);
  const browserPath = resolveBrowser(args.browser);
  const profileDir = mkdtempSync(path.join(tmpdir(), 'holoshell-builder-proof-browser-'));
  const port = 21_000 + Math.floor(Math.random() * 20_000);
  const screenshotPath = path.join(args.outputDir, 'builder-proof.png');
  const domPath = path.join(args.outputDir, 'builder-proof.dom.html');
  const capturedAt = new Date().toISOString();
  const consoleMessages = [];
  const exceptions = [];

  const browser = spawn(browserPath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    `--window-size=${args.width},${args.height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-dev-shm-usage',
    '--disable-features=Translate,MediaRouter',
    '--allow-file-access-from-files',
    '--allow-insecure-localhost',
    'about:blank',
  ], {
    cwd: REPO_ROOT,
    stdio: 'ignore',
    windowsHide: true,
  });

  let client;
  try {
    const target = await waitForDebuggerTarget(port, 15_000);
    client = await createCdpClient(target.webSocketDebuggerUrl);
    client.onEvent((message) => {
      if (message.method === 'Runtime.consoleAPICalled') {
        consoleMessages.push({
          level: message.params.type,
          text: (message.params.args || []).map((arg) => arg.value || arg.description || '').join(' '),
        });
      } else if (message.method === 'Runtime.exceptionThrown') {
        exceptions.push({
          text: message.params.exceptionDetails?.text || '',
          description: message.params.exceptionDetails?.exception?.description || '',
        });
      }
    });

    await client.send('Runtime.enable');
    await client.send('Page.enable');
    const loaded = waitForEvent(client, 'Page.loadEventFired', args.timeoutMs);
    await client.send('Page.navigate', { url: args.url });
    await loaded;

    await waitForExpression(
      client,
      `Boolean(window.HOLOSHELL_AGENT_BUILDER_PROOF_0 && document.querySelector('#builder-proof-verify'))`,
      { timeoutMs: args.timeoutMs },
    );
    await evaluate(client, `document.querySelector('#builder-proof-verify').click()`);
    await waitForExpression(
      client,
      `document.querySelector('#interaction-status')?.dataset?.interacted === 'true'`,
      { timeoutMs: args.timeoutMs },
    );

    const state = await evaluate(client, STATE_EXPRESSION, { timeoutMs: 10_000 });
    const dom = await evaluate(client, 'document.documentElement.outerHTML', { timeoutMs: 10_000 });
    writeFileSync(domPath, `${dom}\n`, 'utf8');

    const screenshot = await client.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
    }, 20_000);
    writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));

    const receipt = {
      schema: SCHEMA,
      status: passFromState(state) && exceptions.length === 0 ? 'pass' : 'fail',
      capturedAt,
      url: args.url,
      browser: {
        executable: browserPath,
        port,
        viewport: { width: args.width, height: args.height },
      },
      evidence: {
        output: relativeToRepo(args.output),
        jsOutput: relativeToRepo(args.jsOutput),
        screenshot: relativeToRepo(screenshotPath),
        screenshotSha256: sha256File(screenshotPath),
        dom: relativeToRepo(domPath),
        domSha256: sha256File(domPath),
      },
      interaction: {
        status: state.assertions.interactionCaptured ? 'pass' : 'fail',
        selector: '#builder-proof-verify',
      },
      state,
      consoleMessages,
      exceptions,
    };
    writeFileSync(args.output, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    writeBootstrap(args.jsOutput, receipt);
    return receipt;
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    await waitForExit(browser);
    await removeDirectoryBestEffort(profileDir);
  }
}

async function main() {
  try {
    const args = parseArgs();
    if (args.help) {
      process.stdout.write(usage());
      return;
    }
    const receipt = await runReceipt(args);
    if (args.json) {
      process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    } else {
      process.stdout.write(
        [
          `HoloShell agent builder proof browser receipt: ${receipt.status}`,
          `url: ${receipt.url}`,
          `output: ${receipt.evidence.output}`,
          `screenshot: ${receipt.evidence.screenshot}`,
        ].join('\n') + '\n',
      );
    }
    if (receipt.status !== 'pass') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
