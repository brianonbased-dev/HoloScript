#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const SCHEMA = 'hololand.holoshell.brittney-operator-chat-browser-receipt.v0.1.0';
const DEFAULT_URL =
  process.env.HOLOSHELL_OPERATOR_CHAT_URL ||
  process.env.HOLOSHELL_SURFACE_URL ||
  'http://holojetson.local:8747';
const DEFAULT_EVIDENCE_DIR = path.join(REPO_ROOT, '.tmp', 'holoshell', 'brittney-operator-chat-browser');
const DEFAULT_PROMPT =
  'Status and next steps for HoloShell operator receipts. Include the laptop reasoning receipt.';

function usage() {
  return `Usage: node scripts/holoshell-brittney-operator-chat-browser-receipt.mjs [options]

Loads the HoloShell operator chat in headless Chrome, sends a Brittney operator
message, asserts lane truth/context/proposal/receipt/input visibility, and
writes a browser receipt under the HoloShell evidence path.

Options:
  --url <url>                 HoloShell live surface URL (default: ${DEFAULT_URL})
  --browser <path>            Chrome/Edge/Chromium executable path
  --output-dir <dir>          Evidence directory (default: ${DEFAULT_EVIDENCE_DIR})
  --output <file>             Receipt JSON path (default: <output-dir>/receipt.json)
  --js-output <file>          Receipt bootstrap JS path (default: <output-dir>/receipt.js)
  --prompt <text>             Chat prompt to send
  --chat-self-test            Add selfTest=true to the chat POST in the loaded page
  --width <px>                Browser viewport width (default: 1440)
  --height <px>               Browser viewport height (default: 1100)
  --timeout-ms <ms>           Interaction timeout (default: 90000)
  --json                      Print receipt JSON to stdout
  --help                      Show this help
`;
}

function parseArgs(argv) {
  const args = {
    url: DEFAULT_URL,
    browser: process.env.CHROME_PATH || process.env.EDGE_PATH || '',
    outputDir: DEFAULT_EVIDENCE_DIR,
    output: '',
    jsOutput: '',
    prompt: DEFAULT_PROMPT,
    chatSelfTest: false,
    width: 1440,
    height: 1100,
    timeoutMs: 90_000,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[index];
    };

    if (arg === '--url') args.url = next();
    else if (arg === '--browser') args.browser = next();
    else if (arg === '--output-dir') args.outputDir = path.resolve(next());
    else if (arg === '--output') args.output = path.resolve(next());
    else if (arg === '--js-output') args.jsOutput = path.resolve(next());
    else if (arg === '--prompt') args.prompt = next();
    else if (arg === '--chat-self-test') args.chatSelfTest = true;
    else if (arg === '--width') args.width = Number.parseInt(next(), 10);
    else if (arg === '--height') args.height = Number.parseInt(next(), 10);
    else if (arg === '--timeout-ms') args.timeoutMs = Number.parseInt(next(), 10);
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (!args.output) args.output = path.join(args.outputDir, 'receipt.json');
  if (!args.jsOutput) args.jsOutput = path.join(args.outputDir, 'receipt.js');
  if (!Number.isFinite(args.width) || args.width < 320) {
    throw new Error(`Invalid --width: ${args.width}`);
  }
  if (!Number.isFinite(args.height) || args.height < 320) {
    throw new Error(`Invalid --height: ${args.height}`);
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 1_000) {
    throw new Error(`Invalid --timeout-ms: ${args.timeoutMs}`);
  }

  args.url = normalizeUrl(args.url);
  return args;
}

function normalizeUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`HoloShell surface URL must be http(s): ${rawUrl}`);
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
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      rmSync(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await delay(150 * (attempt + 1));
    }
  }
  process.stderr.write(`Warning: could not remove temporary Chrome profile ${directory}: ${lastError?.message}\n`);
}

async function fetchJson(url, timeoutMs = 2_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }
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
      if (message.error) {
        item.reject(new Error(`${item.method} failed: ${message.error.message}`));
      } else {
        item.resolve(message.result || {});
      }
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
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      lastValue = await evaluate(client, expression, { timeoutMs: 5_000 });
      if (lastValue) return lastValue;
    } catch (error) {
      lastError = error;
    }
    await delay(intervalMs);
  }
  throw new Error(
    `Timed out waiting for browser condition. Last value: ${JSON.stringify(lastValue)}. ` +
    `Last error: ${lastError?.message || 'none'}`,
  );
}

function installChatProbeExpression(prompt, chatSelfTest) {
  return `(() => {
    const prompt = ${JSON.stringify(prompt)};
    const chatSelfTest = ${JSON.stringify(chatSelfTest)};
    window.__brittneyOperatorChatReceipt = {
      prompt,
      chatSelfTest,
      fetches: [],
      errors: [],
      installedAt: new Date().toISOString()
    };
    if (!window.__brittneyOperatorChatReceiptOriginalFetch) {
      window.__brittneyOperatorChatReceiptOriginalFetch = window.fetch.bind(window);
    }
    window.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      const isChat = String(url).includes('/api/brittney/chat');
      let nextInit = init;
      if (isChat && chatSelfTest) {
        let body = {};
        try {
          body = init?.body ? JSON.parse(init.body) : {};
        } catch (error) {
          window.__brittneyOperatorChatReceipt.errors.push({
            phase: 'parse-chat-body',
            message: error?.message || String(error)
          });
        }
        nextInit = {
          ...init,
          body: JSON.stringify({ ...body, selfTest: true })
        };
      }
      const response = await window.__brittneyOperatorChatReceiptOriginalFetch(input, nextInit);
      if (isChat) {
        try {
          const clone = response.clone();
          const payload = await clone.json();
          window.__brittneyOperatorChatReceipt.fetches.push({
            ok: response.ok,
            status: response.status,
            payload
          });
        } catch (error) {
          window.__brittneyOperatorChatReceipt.errors.push({
            phase: 'read-chat-response',
            message: error?.message || String(error)
          });
        }
      }
      return response;
    };
    return true;
  })()`;
}

function sendChatExpression(prompt) {
  return `(() => {
    const prompt = ${JSON.stringify(prompt)};
    const input = document.querySelector('#brittney-input');
    const button = document.querySelector('#brittney-send');
    if (!input || !button) {
      throw new Error('Brittney input or send button is missing');
    }
    input.focus();
    input.value = prompt;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    button.click();
    return true;
  })()`;
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
  const titleTexts = Array.from(document.querySelectorAll('.operator-turn-card strong'))
    .map((node) => node.textContent.trim())
    .filter(Boolean);
  const cardTexts = Array.from(document.querySelectorAll('.operator-turn-card'))
    .map((node) => node.innerText.trim())
    .filter(Boolean);
  const pillTexts = Array.from(document.querySelectorAll('#operator-state-rail .operator-pill'))
    .map((node) => node.innerText.trim())
    .filter(Boolean);
  const messageTexts = Array.from(document.querySelectorAll('#brittney-messages .brittney-message, #brittney-messages .chat-message-row'))
    .map((node) => node.innerText.trim())
    .filter(Boolean);
  const chatFetches = window.__brittneyOperatorChatReceipt?.fetches || [];
  const lastFetch = chatFetches[chatFetches.length - 1] || null;
  const operatorText = text('#operator-state-rail');
  const contextText = text('#context-capsule-panel');
  const nativeProofText = text('#native-proof-strip');
  const messagesText = text('#brittney-messages');
  const proposalCards = titleTexts.filter((title) => title.startsWith('Proposal:')).length;
  const receiptNarrationCards = titleTexts.filter((title) => title === 'Receipt narration').length;
  const runtimeTruthCards = titleTexts.filter((title) => title === 'Runtime truth').length;
  const agentHandoffCards = titleTexts.filter((title) => title === 'Agent handoff').length;
  const laneTruthVisible =
    visible('#operator-state-rail') &&
    /Brittney/i.test(operatorText) &&
    /Jetson Route/i.test(operatorText) &&
    /Reasoning/i.test(operatorText) &&
    /Receipts/i.test(operatorText);
  const sourceOwnedVisible =
    visible('#operator-state-rail') &&
    /Source Owned/i.test(operatorText) &&
    /domains/i.test(operatorText);
  const contextCapsuleVisible =
    visible('#context-capsule-panel') &&
    contextText.length > 20 &&
    !/checking context/i.test(contextText);
  const browserSelfTestVisible =
    visible('#native-proof-strip') &&
    /Browser Self-Test/i.test(nativeProofText) &&
    /GET \\//i.test(nativeProofText) &&
    /browser receipt/i.test(nativeProofText);
  const nativeWindowVisible =
    visible('#native-proof-strip') &&
    /Native Window/i.test(nativeProofText) &&
    /Start-HoloShellFounderHost\\.ps1/i.test(nativeProofText);
  const holoServicesVisible =
    visible('#native-proof-strip') &&
    /Holo Services/i.test(nativeProofText) &&
    /terminal supervisor/i.test(nativeProofText);
  const sourceEnvelopeVisible =
    visible('#native-proof-strip') &&
    /Source Envelope/i.test(nativeProofText) &&
    /HoloScript native capability lanes/i.test(nativeProofText);
  const terminalEventsVisible =
    visible('#native-proof-strip') &&
    /Terminal Events/i.test(nativeProofText) &&
    /append-only HoloScript terminal event stream/i.test(nativeProofText);
  const inputVisible = visible('#brittney-input');
  const sendVisible = visible('#brittney-send');
  const messageVisible = visible('#brittney-messages') && messageTexts.length >= 2;
  return {
    locationHref: window.location.href,
    title: document.title,
    visible: {
      mount: visible('#brittney-chat-mount'),
      operatorStateRail: visible('#operator-state-rail'),
      operatorAlerts: visible('#operator-alerts'),
      nativeProofStrip: visible('#native-proof-strip'),
      contextCapsulePanel: visible('#context-capsule-panel'),
      cockpitActionCards: visible('#cockpit-action-cards'),
      messages: visible('#brittney-messages'),
      input: inputVisible,
      sendButton: sendVisible
    },
    counts: {
      operatorPills: pillTexts.length,
      operatorCards: cardTexts.length,
      proposalCards,
      receiptNarrationCards,
      runtimeTruthCards,
      agentHandoffCards,
      messages: messageTexts.length,
      chatFetches: chatFetches.length
    },
    samples: {
      operatorText,
      contextText,
      nativeProofText,
      cardTitles: titleTexts,
      cards: cardTexts,
      messages: messageTexts
    },
    chat: {
      ok: Boolean(lastFetch?.ok),
      status: lastFetch?.status || null,
      receiptType: lastFetch?.payload?.receiptType || null,
      selectedBrainId: lastFetch?.payload?.selectedBrain?.id || lastFetch?.payload?.brainSelection?.selectedBrainId || '',
      selectedCompatibilitySkillId: lastFetch?.payload?.selectedCompatibilitySkill?.id || lastFetch?.payload?.brainSelection?.selectedCompatibilitySkillId || '',
      selectedBrainConsumerProfileId: lastFetch?.payload?.brainSelection?.selectedConsumerProfileId || '',
      hasReply: Boolean(lastFetch?.payload?.reply),
      hasSystemStatus: Boolean(lastFetch?.payload?.systemStatus),
      proposalCount: Array.isArray(lastFetch?.payload?.proposals) ? lastFetch.payload.proposals.length : 0,
      modelInvocationPerformed: Boolean(lastFetch?.payload?.systemStatus?.laptopReasoning?.modelInvocationPerformed),
      selfTest: Boolean(window.__brittneyOperatorChatReceipt?.chatSelfTest),
      errors: window.__brittneyOperatorChatReceipt?.errors || []
    },
    assertions: {
      laneTruthVisible,
      sourceOwnedVisible,
      contextCapsuleVisible,
      browserSelfTestVisible,
      nativeWindowVisible,
      holoServicesVisible,
      sourceEnvelopeVisible,
      terminalEventsVisible,
      proposalCardsVisible: proposalCards > 0,
      receiptNarrationVisible: receiptNarrationCards > 0,
      runtimeTruthVisible: runtimeTruthCards > 0,
      messageInputVisible: inputVisible && sendVisible && messageVisible,
      chatResponseCaptured: Boolean(lastFetch?.ok && lastFetch?.payload),
      contextCapsuleMentionsReceipts: /receipt/i.test(contextText),
      operatorRailMentionsReceipts: /receipt/i.test(operatorText)
    }
  };
})()`;

function passFromState(state) {
  return Object.values(state.assertions).every(Boolean);
}

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join('/');
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function writeBootstrap(jsOutput, receipt) {
  const publicReceipt = {
    schema: receipt.schema,
    status: receipt.status,
    capturedAt: receipt.capturedAt,
    url: receipt.url,
    evidence: receipt.evidence,
    assertions: receipt.state.assertions,
    counts: receipt.state.counts,
    browser: receipt.browser,
  };
  writeFileSync(
    jsOutput,
    `window.HOLOSHELL_BRITTNEY_OPERATOR_CHAT_BROWSER_RECEIPT = ${JSON.stringify(publicReceipt, null, 2)};\n`,
  );
}

async function runReceipt(args) {
  mkdirSync(args.outputDir, { recursive: true });
  const browserPath = resolveBrowser(args.browser);
  const profileDir = mkdtempSync(path.join(tmpdir(), 'holoshell-brittney-browser-'));
  const port = 19_000 + Math.floor(Math.random() * 20_000);
  const screenshotPath = path.join(args.outputDir, 'operator-chat.png');
  const domPath = path.join(args.outputDir, 'operator-chat.dom.html');
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
    '--allow-insecure-localhost',
    'about:blank',
  ], {
    cwd: REPO_ROOT,
    stdio: 'ignore',
    windowsHide: true,
  });

  let client;
  let browserSpawnError = null;
  try {
    browser.on('error', (error) => {
      browserSpawnError = error;
      consoleMessages.push({
        level: 'browser-spawn-error',
        text: error.message,
      });
    });
    browser.on('exit', (code, signal) => {
      if (code !== 0 && signal !== 'SIGTERM') {
        consoleMessages.push({
          level: 'browser-exit',
          text: `Chrome exited with code=${code} signal=${signal}`,
        });
      }
    });

    const target = await waitForDebuggerTarget(port, 15_000).catch((error) => {
      if (browserSpawnError) {
        throw new Error(`Chrome did not start: ${browserSpawnError.message}`);
      }
      throw error;
    });
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
      `Boolean(document.querySelector('#brittney-input') && document.querySelector('#brittney-send') && document.querySelector('#operator-state-rail') && document.querySelector('#context-capsule-panel'))`,
      { timeoutMs: args.timeoutMs },
    );

    await waitForExpression(
      client,
      `(() => {
        const rail = document.querySelector('#operator-state-rail')?.innerText || '';
        const context = document.querySelector('#context-capsule-panel')?.innerText || '';
        return /Brittney/i.test(rail) && /Reasoning/i.test(rail) && context.length > 20 && !/checking context/i.test(context);
      })()`,
      { timeoutMs: args.timeoutMs },
    );

    await evaluate(client, installChatProbeExpression(args.prompt, args.chatSelfTest));
    await evaluate(client, sendChatExpression(args.prompt));

    await waitForExpression(
      client,
      `(() => {
        const receipt = window.__brittneyOperatorChatReceipt;
        const titles = Array.from(document.querySelectorAll('.operator-turn-card strong')).map((node) => node.textContent.trim());
        return Boolean(
          receipt?.fetches?.length &&
          titles.some((title) => title === 'Runtime truth') &&
          titles.some((title) => title.startsWith('Proposal:')) &&
          titles.some((title) => title === 'Receipt narration')
        );
      })()`,
      { timeoutMs: args.timeoutMs },
    );

    const state = await evaluate(client, STATE_EXPRESSION, { timeoutMs: 10_000 });
    const dom = await evaluate(client, 'document.documentElement.outerHTML', { timeoutMs: 10_000 });
    writeFileSync(domPath, `${dom}\n`);

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
      prompt: args.prompt,
      chatSelfTest: args.chatSelfTest,
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
      state,
      consoleMessages,
      exceptions,
    };
    writeFileSync(args.output, `${JSON.stringify(receipt, null, 2)}\n`);
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
    const args = parseArgs(process.argv.slice(2));
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
          `HoloShell Brittney operator chat browser receipt: ${receipt.status}`,
          `url: ${receipt.url}`,
          `output: ${receipt.evidence.output}`,
          `screenshot: ${receipt.evidence.screenshot}`,
          `dom: ${receipt.evidence.dom}`,
        ].join('\n') + '\n',
      );
    }
    if (receipt.status !== 'pass') {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
