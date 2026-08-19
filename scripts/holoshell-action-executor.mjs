#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.hardware-action.v0.1.0';
const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_CAPTURE = path.join(DEFAULT_TMP, 'os-ui-capture.json');
const DEFAULT_PROGRAM_REGISTRY = path.join(DEFAULT_TMP, 'program-registry.json');
const DEFAULT_OUTPUT = path.join(DEFAULT_TMP, 'action-latest.json');
const DEFAULT_JS_OUTPUT = path.join(DEFAULT_TMP, 'action-latest.js');
const DEFAULT_RECEIPT_DIR = path.join(DEFAULT_TMP, 'action-receipts');

const READ_ONLY_ACTIONS = new Set([
  'list_windows',
  'list_programs',
  'read_window',
  'read_controls',
  'resolve_target',
  'dry_run_action',
]);

const GUARDED_ACTIONS = new Set([
  'focus_window',
  'launch_app',
  'open_url',
  'open_path',
  'hotkey',
  'click_control',
  'type_text',
  'invoke_control',
]);

const BREAK_GLASS_ACTIONS = new Set([
  'enter_secret',
  'send_message',
  'delete_file',
  'publish',
  'pay',
  'install',
  'uninstall',
  'system_settings',
]);

const SECRET_TEXT_PATTERN =
  /(password|passphrase|token|secret|api[_-]?key|private key|credential|recovery phrase|ssn|credit card)/i;

function parseArgs(argv) {
  const args = {
    action: 'list_windows',
    actor: 'holoshell',
    approved: false,
    execute: false,
    json: false,
    selfTest: false,
    capture: DEFAULT_CAPTURE,
    programRegistry: DEFAULT_PROGRAM_REGISTRY,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    receiptDir: DEFAULT_RECEIPT_DIR,
    approvalBundle: '',
    approvalId: '',
    approvalNonce: '',
    targetWindowId: '',
    windowTitle: '',
    processName: '',
    handle: '',
    targetControlId: '',
    controlName: '',
    text: '',
    url: '',
    filePath: '',
    app: '',
    hotkey: '',
    x: '',
    y: '',
    browserProfile: '',
    browserSession: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--action') args.action = String(argv[++index] || '').trim();
    else if (arg === '--actor') args.actor = String(argv[++index] || '').trim() || 'holoshell';
    else if (arg === '--approved') args.approved = true;
    else if (arg === '--execute') args.execute = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--capture') args.capture = argv[++index];
    else if (arg === '--program-registry') args.programRegistry = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--receipt-dir') args.receiptDir = argv[++index];
    else if (arg === '--approval-bundle') args.approvalBundle = argv[++index];
    else if (arg === '--approval-id') args.approvalId = argv[++index];
    else if (arg === '--approval-nonce') args.approvalNonce = argv[++index];
    else if (arg === '--target-window-id') args.targetWindowId = argv[++index];
    else if (arg === '--window-title') args.windowTitle = argv[++index];
    else if (arg === '--process-name') args.processName = argv[++index];
    else if (arg === '--handle') args.handle = argv[++index];
    else if (arg === '--target-control-id') args.targetControlId = argv[++index];
    else if (arg === '--control-name') args.controlName = argv[++index];
    else if (arg === '--text') args.text = argv[++index] || '';
    else if (arg === '--url') args.url = argv[++index] || '';
    else if (arg === '--path') args.filePath = argv[++index] || '';
    else if (arg === '--app') args.app = argv[++index] || '';
    else if (arg === '--hotkey') args.hotkey = argv[++index] || '';
    else if (arg === '--x') args.x = argv[++index] || '';
    else if (arg === '--y') args.y = argv[++index] || '';
    else if (arg === '--browser-profile') args.browserProfile = argv[++index] || '';
    else if (arg === '--browser-session') args.browserSession = argv[++index] || '';
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.action) throw new Error('Missing --action value');
  return args;
}

function printHelp() {
  console.log(`HoloShell hardware action executor

Usage:
  node scripts/holoshell-action-executor.mjs [options]

Read-only examples:
  node scripts/holoshell-action-executor.mjs --action list_windows
  node scripts/holoshell-action-executor.mjs --action list_programs
  node scripts/holoshell-action-executor.mjs --action read_controls --window-title Codex --json

Guarded examples:
  node scripts/holoshell-action-executor.mjs --action focus_window --window-title Codex
  node scripts/holoshell-action-executor.mjs --action focus_window --window-title Codex --approved --execute

Options:
  --action <kind>              list_windows, read_window, focus_window, open_url, hotkey, click_control, type_text, ...
  --program-registry <path>    Launchable program registry. Defaults to .tmp/holoshell/program-registry.json.
  --target-window-id <id>      Window id from os-ui-capture.
  --window-title <text>        Fuzzy title match for a target window.
  --process-name <text>        Fuzzy process-name match for a target window.
  --handle <handle>            Native window handle.
  --target-control-id <id>     Control id from os-ui-capture.
  --control-name <text>        Fuzzy control-name match.
  --url <url>                  URL for open_url.
  --path <path>                Path for open_path.
  --app <path-or-name>         App for launch_app.
  --hotkey <keys>              Example: Ctrl+L or Alt+Tab.
  --text <text>                Text for type_text. Secret-like text is treated as break-glass.
  --browser-profile <name>     Browser profile boundary label for browser actions. Defaults to system_default.
  --browser-session <kind>     default, temporary, private, or credential_bearing. Defaults by URL risk.
  --approved                   Marks a guarded action as user-approved.
  --approval-bundle <path>     Nonce-bound HoloShell approval bundle.
  --approval-id <id>           Approval id from the bundle.
  --approval-nonce <nonce>     Approval nonce from the bundle.
  --execute                    Actually performs approved guarded actions. Without this, receipts are plans.
  --json                       Print the receipt.
  --self-test                  Run fixture assertions.
  -h, --help                   Show this help.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function readJson(filePath, fallback = null) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) return fallback;
  return JSON.parse(readFileSync(resolved, 'utf8'));
}

function sameText(left, right) {
  return safeLower(left) === safeLower(right);
}

function validateApprovalBundle(args) {
  if (!args.approvalBundle) return null;
  const bundle = readJson(args.approvalBundle, null);
  if (!bundle) throw new Error('Approval bundle was not found.');
  if (bundle.schemaVersion !== 'hololand.holoshell.hardware-approval.v0.1.0') {
    throw new Error('Approval bundle schema mismatch.');
  }
  if (!args.approvalId || bundle.approvalId !== args.approvalId) {
    throw new Error('Approval id does not match the bundle.');
  }
  if (!args.approvalNonce || bundle.nonce !== args.approvalNonce) {
    throw new Error('Approval nonce does not match the bundle.');
  }
  if (bundle.approval?.expiresAt && Date.parse(bundle.approval.expiresAt) <= Date.now()) {
    throw new Error('Approval bundle has expired.');
  }
  if (!bundle.execution?.allowed) {
    throw new Error(bundle.execution?.blockedReason || 'Approval bundle does not allow execution.');
  }
  if (!sameText(bundle.sourceAction?.actionKind, args.action)) {
    throw new Error('Approval bundle action does not match the requested action.');
  }
  const request = bundle.sourceAction || {};
  if (args.app && request.targetAppName && !sameText(args.app, request.targetAppName)) {
    throw new Error('Approval bundle target app does not match the requested app.');
  }
  if (
    args.windowTitle &&
    request.targetWindowTitle &&
    !sameText(args.windowTitle, request.targetWindowTitle)
  ) {
    throw new Error('Approval bundle target window does not match the requested window.');
  }
  args.approved = true;
  return {
    approvalId: bundle.approvalId,
    sourceActionId: bundle.sourceAction?.actionId || '',
    expiresAt: bundle.approval?.expiresAt || '',
  };
}

function writeJson(filePath, value) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  atomicWriteFile(resolved, `${JSON.stringify(value, null, 2)}\n`);
  return resolved;
}

function writeBrowserBootstrap(filePath, receipt) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(receipt, null, 2).replace(/<\/script/gi, '<\\/script');
  atomicWriteFile(resolved, `window.HOLOSHELL_HARDWARE_ACTION = ${payload};\n`);
  return resolved;
}

function atomicWriteFile(resolvedPath, text) {
  const tempPath = `${resolvedPath}.${process.pid}.${Date.now().toString(36)}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tempPath, text, 'utf8');
  renameSync(tempPath, resolvedPath);
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withFileWriteLock(targetPath, write) {
  const lockDir = `${targetPath}.write.lock`;
  const ownerPath = path.join(lockDir, 'owner.json');
  const started = Date.now();
  while (true) {
    try {
      mkdirSync(lockDir);
      writeFileSync(
        ownerPath,
        JSON.stringify({
          pid: process.pid,
          createdAt: new Date().toISOString(),
          targetPath,
        }),
        'utf8'
      );
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (Date.now() - started > 5000) {
        throw new Error(`Timed out waiting for HoloShell latest-write lock: ${lockDir}`);
      }
      sleepMs(20);
    }
  }

  try {
    return write();
  } finally {
    try {
      unlinkSync(ownerPath);
    } catch {
      // Best effort cleanup; another process may already have observed release.
    }
    try {
      rmdirSync(lockDir);
    } catch {
      // Best effort cleanup; timeout path keeps stale locks visible for diagnosis.
    }
  }
}

function hashValue(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function shortHash(value, length = 14) {
  return hashValue(value).slice(0, length);
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

function safeLower(value) {
  return String(value || '').toLowerCase();
}

function sanitizeTextPreview(text) {
  if (!text) return { provided: false, length: 0, sha256: '' };
  return {
    provided: true,
    length: String(text).length,
    sha256: hashValue(String(text)),
    preview: '[redacted]',
  };
}

function classifyAction(args) {
  if (BREAK_GLASS_ACTIONS.has(args.action)) return 'break_glass';
  if (args.action === 'type_text' && SECRET_TEXT_PATTERN.test(args.text || ''))
    return 'break_glass';
  if (READ_ONLY_ACTIONS.has(args.action)) return 'read_only';
  if (GUARDED_ACTIONS.has(args.action)) return 'guarded_execute';
  return 'unknown';
}

function classifyUrl(url) {
  if (!url) return 'none';
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return 'unknown_web';
  }
  const combined = `${parsed.hostname} ${parsed.pathname} ${parsed.search}`.toLowerCase();
  if (!/^https?:$/i.test(parsed.protocol)) return 'blocked_scheme';
  if (/(checkout|payment|billing|purchase|subscribe|transfer|wallet|bank)/i.test(combined))
    return 'break_glass_payment';
  if (
    /(login|signin|sign-in|account|settings|profile|admin|oauth|auth|password|security|2fa|mfa|upload|download|export|import|delete|remove|submit|compose|send)/i.test(
      combined
    )
  ) {
    return 'credential_adjacent';
  }
  return 'public_web';
}

function isBrowserAction(args, targetProgram) {
  return (
    args.action === 'open_url' ||
    targetProgram?.capabilityClass === 'browser' ||
    /browser|chrome|edge|brave|firefox/i.test(
      `${targetProgram?.displayName || ''} ${targetProgram?.targetPath || ''}`
    )
  );
}

function browserBoundaryFor(args, targetProgram) {
  if (!isBrowserAction(args, targetProgram)) return null;
  const urlClassification = args.action === 'open_url' ? classifyUrl(args.url) : 'not_url_action';
  const publicBrowsing = urlClassification === 'public_web';
  const credentialAdjacent = urlClassification === 'credential_adjacent';
  const accountMutation = urlClassification.startsWith('break_glass');
  let host = '';
  try {
    host = args.url ? new URL(args.url).host : '';
  } catch {
    host = '';
  }

  return {
    boundaryVersion: 'hololand.holoshell.browser-boundary.v0.1.0',
    applies: true,
    browser: targetProgram?.displayName || 'system_default_browser',
    browserDeclared: Boolean(targetProgram?.displayName),
    profileBoundary:
      args.browserProfile ||
      (publicBrowsing
        ? 'system_default_public_ok'
        : credentialAdjacent
          ? 'system_default_account_adjacent'
          : 'break_glass_profile_required'),
    sessionBoundary:
      args.browserSession ||
      (publicBrowsing
        ? 'default_or_temporary_public'
        : credentialAdjacent
          ? 'credential_bearing_existing_profile'
          : 'credential_bearing_requires_explicit_profile'),
    urlClassification,
    publicBrowsing,
    credentialAdjacent,
    accountMutation,
    host,
    cookiePolicy: publicBrowsing
      ? 'may_use_default_browser_cookies_if_user_approves_open'
      : credentialAdjacent
        ? 'profile_cookies_visible_to_browser_only'
        : 'requires_explicit_cookie_policy',
    screenshotPolicy: publicBrowsing
      ? 'local_receipts_allowed'
      : 'local_only_redacted_or_manual_witness',
    downloadUploadPolicy: publicBrowsing ? 'blocked_until_specific_approval' : 'break_glass',
    formSubmitPolicy: publicBrowsing ? 'break_glass' : 'break_glass_requires_app_specific_policy',
    screenshotLocality: 'local_receipt_only',
    receiptsRequired: ['browser_boundary_receipt', 'hardware_action_receipt', 'approval_bundle'],
    note: 'Opening a browser mutates local browser state; account-affecting actions stay behind break-glass gates.',
  };
}

function urlWitness(url) {
  if (!url) {
    return {
      targetUrl: '',
      targetHost: '',
      targetOrigin: '',
      targetPath: '',
      dispatchAccepted: false,
      witnessKind: 'not_url_action',
    };
  }
  try {
    const parsed = new URL(url);
    return {
      targetUrl: parsed.href,
      targetHost: parsed.host,
      targetOrigin: parsed.origin,
      targetPath: `${parsed.pathname}${parsed.search}${parsed.hash}`,
      dispatchAccepted: false,
      witnessKind: 'browser_navigation_target',
    };
  } catch {
    return {
      targetUrl: String(url),
      targetHost: '',
      targetOrigin: '',
      targetPath: '',
      dispatchAccepted: false,
      witnessKind: 'invalid_url_target',
    };
  }
}

function registryWitnessPayload(registry) {
  return {
    summary: {
      status: registry.summary?.status || '',
      windowCount: registry.summary?.windowCount || registry.windows?.length || 0,
      controlCount: registry.summary?.controlCount || 0,
    },
    windows: registry.windows?.map((window) => ({
      id: window.id,
      title: window.title,
      processName: window.processName,
      handle: window.handle,
      controls: Array.isArray(window.controls) ? window.controls.length : 0,
    })),
  };
}

function permissionFor(args) {
  const envelope = classifyAction(args);
  return {
    envelope,
    approvalRequired: envelope !== 'read_only',
    approved: Boolean(args.approved),
    executeRequested: Boolean(args.execute),
    mutating: envelope === 'guarded_execute' || envelope === 'break_glass',
    breakGlass: envelope === 'break_glass',
    receiptRequired: true,
  };
}

function runPowerShell(script, timeoutMs = 12000) {
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: timeoutMs,
      windowsHide: true,
    }
  );

  if (result.error) throw result.error;
  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();
  if (result.status !== 0) {
    throw new Error(stderr || stdout || `PowerShell exited with ${result.status}`);
  }
  return stdout;
}

function psSingle(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

function extractJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const objectStart = trimmed.indexOf('{');
    const arrayStart = trimmed.indexOf('[');
    const starts = [objectStart, arrayStart].filter((index) => index >= 0);
    const start = starts.length ? Math.min(...starts) : -1;
    const end = Math.max(trimmed.lastIndexOf(']'), trimmed.lastIndexOf('}'));
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error(`PowerShell did not return JSON: ${trimmed.slice(0, 200)}`);
  }
}

function lightweightWindowCapture() {
  if (process.platform !== 'win32') {
    return {
      schemaVersion: 'hololand.holoshell.program-registry.v0.1.0',
      generatedAt: new Date().toISOString(),
      source: 'node-process',
      host: { platform: process.platform, arch: process.arch, release: os.release() },
      summary: {
        status: 'platform_unsupported_for_window_capture',
        windowCount: 0,
        controlCount: 0,
      },
      windows: [],
    };
  }

  const script = `
$windows = Get-Process |
  Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } |
  Select-Object @{Name='processId';Expression={$_.Id}},
    @{Name='processName';Expression={$_.ProcessName}},
    @{Name='title';Expression={$_.MainWindowTitle}},
    @{Name='handle';Expression={[string]$_.MainWindowHandle}},
    @{Name='controls';Expression={@()}}
$windows | ConvertTo-Json -Depth 5
`;
  const raw = extractJson(runPowerShell(script));
  const windows = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((window) => {
    const identity = `${window.processId}:${window.handle}:${window.title}`;
    return {
      id: `window-${shortHash(identity)}`,
      title: window.title || '',
      processId: window.processId || 0,
      processName: window.processName || '',
      handle: String(window.handle || ''),
      bounds: window.bounds || null,
      controls: [],
      shellSemantics: {
        objectKind: 'program_window',
        intentAddressable: true,
        actionBridge: 'guarded_execute',
      },
    };
  });

  return {
    schemaVersion: 'hololand.holoshell.program-registry.v0.1.0',
    generatedAt: new Date().toISOString(),
    source: 'powershell-get-process',
    host: { platform: process.platform, arch: process.arch, release: os.release() },
    summary: {
      status: 'captured',
      windowCount: windows.length,
      controlCount: 0,
      actionBridgeStatus: 'guarded_execute_available',
    },
    windows,
  };
}

function fixtureRegistry() {
  const windows = [
    {
      id: 'window-fixture-editor',
      title: 'Fixture Editor',
      processId: 101,
      processName: 'notepad',
      handle: '1001',
      bounds: { left: 10, top: 10, right: 650, bottom: 420, width: 640, height: 410 },
      controls: [
        {
          id: 'control-fixture-text',
          name: 'Document',
          controlType: 'Edit',
          enabled: true,
          bounds: { left: 20, top: 60, right: 620, bottom: 390, width: 600, height: 330 },
        },
      ],
    },
    {
      id: 'window-fixture-browser',
      title: 'Fixture Browser',
      processId: 102,
      processName: 'browser',
      handle: '1002',
      bounds: { left: 680, top: 20, right: 1260, bottom: 520, width: 580, height: 500 },
      controls: [],
    },
  ];
  return {
    schemaVersion: 'hololand.holoshell.program-registry.fixture.v0.1.0',
    generatedAt: new Date().toISOString(),
    source: 'fixture',
    host: { platform: 'fixture', arch: 'fixture', release: 'fixture' },
    summary: {
      status: 'captured',
      windowCount: windows.length,
      controlCount: 1,
      actionBridgeStatus: 'guarded_execute_available',
    },
    windows,
  };
}

function readProgramRegistry(args) {
  if (args.selfTest) return fixtureRegistry();
  const capture = readJson(args.capture, null);
  if (capture?.windows?.length) {
    return {
      ...capture,
      source: capture.source || 'scripts/holoshell-os-ui-capture.mjs',
      host: capture.host || {
        platform: process.platform,
        arch: process.arch,
        release: os.release(),
      },
      summary: {
        status: capture.summary?.status || 'captured',
        windowCount: capture.summary?.windowCount || capture.windows.length,
        controlCount:
          capture.summary?.controlCount ||
          capture.windows.reduce((count, window) => count + (window.controls?.length || 0), 0),
        geometryNodeCount: capture.summary?.geometryNodeCount || 0,
        actionBridgeStatus: capture.summary?.actionBridgeStatus || 'guarded_execute_available',
      },
    };
  }
  return lightweightWindowCapture();
}

function fixtureLaunchRegistry() {
  return {
    schemaVersion: 'hololand.holoshell.program-registry.fixture.v0.1.0',
    summary: { programCount: 2, launchableProgramCount: 2 },
    programs: [
      {
        id: 'program-fixture-editor',
        displayName: 'Fixture Editor',
        launchable: true,
        capabilityClass: 'developer_tool',
        launchTarget: {
          type: 'path',
          targetPath: 'C:/Fixture/editor.exe',
          arguments: '--safe',
          workingDirectory: 'C:/Fixture',
        },
      },
      {
        id: 'program-fixture-browser',
        displayName: 'Fixture Browser',
        launchable: true,
        capabilityClass: 'browser',
        launchTarget: {
          type: 'path',
          targetPath: 'C:/Fixture/browser.exe',
          arguments: '',
          workingDirectory: 'C:/Fixture',
        },
      },
    ],
  };
}

function readLaunchRegistry(args) {
  if (args.selfTest) return fixtureLaunchRegistry();
  return readJson(args.programRegistry, { programs: [], summary: {} });
}

function findLaunchProgram(args) {
  const registry = readLaunchRegistry(args);
  const programs = Array.isArray(registry?.programs) ? registry.programs : [];
  const app = safeLower(args.app);
  if (!app) return null;
  return (
    programs.find((program) => safeLower(program.id) === app) ||
    programs.find((program) => safeLower(program.displayName) === app) ||
    programs.find((program) => safeLower(program.displayName).includes(app)) ||
    programs.find((program) => safeLower(program.launchTarget?.targetPath).includes(app)) ||
    null
  );
}

function findTargetWindow(registry, args) {
  const windows = Array.isArray(registry.windows) ? registry.windows : [];
  if (!windows.length) return null;
  if (args.targetWindowId)
    return windows.find((window) => window.id === args.targetWindowId) || null;
  if (args.handle)
    return windows.find((window) => String(window.handle) === String(args.handle)) || null;
  if (args.windowTitle) {
    const needle = safeLower(args.windowTitle);
    return windows.find((window) => safeLower(window.title).includes(needle)) || null;
  }
  if (args.processName) {
    const needle = safeLower(args.processName);
    return windows.find((window) => safeLower(window.processName).includes(needle)) || null;
  }
  if (registry.summary?.foregroundWindowId) {
    return windows.find((window) => window.id === registry.summary.foregroundWindowId) || null;
  }
  return windows[0] || null;
}

function findTargetControl(window, args) {
  if (!window) return null;
  const controls = Array.isArray(window.controls) ? window.controls : [];
  if (!controls.length) return null;
  if (args.targetControlId)
    return controls.find((control) => control.id === args.targetControlId) || null;
  if (args.controlName) {
    const needle = safeLower(args.controlName);
    return (
      controls.find(
        (control) =>
          safeLower(control.name).includes(needle) ||
          safeLower(control.automationId).includes(needle)
      ) || null
    );
  }
  return controls.find((control) => control.enabled && !control.offscreen) || controls[0] || null;
}

function compactWindow(window) {
  if (!window) {
    return {
      windowId: '',
      title: '',
      processName: '',
      processId: 0,
      handle: '',
      controlCount: 0,
    };
  }
  return {
    windowId: window.id || '',
    title: window.title || '',
    processName: window.processName || '',
    processId: window.processId || 0,
    handle: String(window.handle || ''),
    controlCount: Array.isArray(window.controls) ? window.controls.length : 0,
    bounds: window.bounds || null,
  };
}

function compactControl(control) {
  if (!control) {
    return {
      controlId: '',
      name: '',
      automationId: '',
      controlType: '',
      enabled: false,
    };
  }
  return {
    controlId: control.id || '',
    name: control.name || '',
    automationId: control.automationId || '',
    controlType: control.controlType || '',
    enabled: Boolean(control.enabled),
    bounds: control.bounds || null,
  };
}

function compactProgram(program) {
  if (!program) {
    return {
      programId: '',
      displayName: '',
      capabilityClass: '',
      launchable: false,
      targetPath: '',
    };
  }
  return {
    programId: program.id || '',
    displayName: program.displayName || '',
    capabilityClass: program.capabilityClass || '',
    launchable: Boolean(program.launchable),
    targetPath: program.launchTarget?.targetPath || '',
    arguments: program.launchTarget?.arguments || '',
    workingDirectory: program.launchTarget?.workingDirectory || '',
  };
}

function requiresWindowTarget(action) {
  return [
    'read_window',
    'read_controls',
    'resolve_target',
    'dry_run_action',
    'focus_window',
    'hotkey',
    'click_control',
    'type_text',
    'invoke_control',
  ].includes(action);
}

function requestFor(args) {
  return {
    actor: args.actor,
    actionKind: args.action,
    targetWindowId: args.targetWindowId || '',
    targetWindowTitle: args.windowTitle || '',
    targetProcessName: args.processName || '',
    targetHandle: args.handle || '',
    targetControlId: args.targetControlId || '',
    targetControlName: args.controlName || '',
    targetProgramName: args.app || '',
    url: args.url || '',
    path: args.filePath || '',
    app: args.app || '',
    hotkey: args.hotkey || '',
    browserProfile: args.browserProfile || '',
    browserSession: args.browserSession || '',
    text: sanitizeTextPreview(args.text),
    approved: Boolean(args.approved),
    executeRequested: Boolean(args.execute),
    approvalBundleId: args.approvalId || '',
    secretsIncluded: Boolean(args.text && SECRET_TEXT_PATTERN.test(args.text)),
    receiptRequired: true,
  };
}

function sendKeyChord(input) {
  if (!input) return '';
  const aliases = new Map([
    ['ctrl', '^'],
    ['control', '^'],
    ['alt', '%'],
    ['shift', '+'],
    ['enter', '{ENTER}'],
    ['tab', '{TAB}'],
    ['esc', '{ESC}'],
    ['escape', '{ESC}'],
    ['space', ' '],
    ['delete', '{DELETE}'],
    ['backspace', '{BACKSPACE}'],
    ['up', '{UP}'],
    ['down', '{DOWN}'],
    ['left', '{LEFT}'],
    ['right', '{RIGHT}'],
  ]);
  return input
    .split('+')
    .map((part) => {
      const token = part.trim();
      const alias = aliases.get(safeLower(token));
      if (alias) return alias;
      if (token.length === 1) return token.toLowerCase();
      if (/^f\d{1,2}$/i.test(token)) return `{${token.toUpperCase()}}`;
      return `{${token.toUpperCase()}}`;
    })
    .join('');
}

function sendKeysText(text) {
  return String(text || '').replace(/[+^%~()[\]{}]/g, (character) => `{${character}}`);
}

function focusWindow(window) {
  if (!window?.handle) throw new Error('focus_window requires a native window handle');
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class HoloShellWin32Focus {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
"@
$handle = [IntPtr]::new([Int64]${Number(window.handle)})
[HoloShellWin32Focus]::ShowWindowAsync($handle, 9) | Out-Null
$ok = [HoloShellWin32Focus]::SetForegroundWindow($handle)
@{ ok = $ok; handle = ${psSingle(window.handle)} } | ConvertTo-Json -Depth 3
`;
  return extractJson(runPowerShell(script));
}

function foregroundWindowHandle() {
  if (process.platform !== 'win32') return '';
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class HoloShellForeground {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
"@
$fg = [HoloShellForeground]::GetForegroundWindow()
@{ handle = [string]([Int64]$fg) } | ConvertTo-Json -Depth 2
`;
  const result = extractJson(runPowerShell(script));
  return String(result?.handle || '');
}

// Window-scope safety primitive (founder 2026-06-24). SendKeys/mouse_event act on whatever
// window currently has FOCUS, and SetForegroundWindow can SILENTLY FAIL (Windows restricts
// foreground stealing). Without this guard, a click/type intended for the target window lands
// on whatever the user is actually in (e.g. the founder's active app). evaluateWindowScope is
// pure (unit-tested); assertForegroundIsTarget reads the live foreground handle and THROWS
// window_scope_violation on ANY mismatch — so a guarded mutation is REFUSED rather than
// misdirected onto a non-target window. This is the prerequisite before any click/type lane is
// ever admitted on a live desktop.
function evaluateWindowScope(foregroundHandle, targetHandle) {
  const fg = String(foregroundHandle || '');
  const target = String(targetHandle || '');
  return { ok: fg !== '' && fg === target, foregroundHandle: fg, targetHandle: target };
}

function assertForegroundIsTarget(window) {
  if (!window?.handle) {
    throw new Error('window-scope assertion requires a native target window handle');
  }
  const scope = evaluateWindowScope(foregroundWindowHandle(), window.handle);
  if (!scope.ok) {
    throw new Error(
      `window_scope_violation: foreground window ${scope.foregroundHandle || '(none)'} != target ${scope.targetHandle} — refusing to click/type on a non-target window`
    );
  }
  return scope;
}

function startProcessLiteral(value) {
  const navigationWitness = urlWitness(value);
  const script = `
$target = ${psSingle(value)}
Start-Process -FilePath $target
@{ ok = $true; target = $target } | ConvertTo-Json -Depth 3
`;
  const result = extractJson(runPowerShell(script));
  if (/^https?:\/\//i.test(String(value || ''))) {
    return {
      ...result,
      browserNavigation: {
        ...navigationWitness,
        dispatchAccepted: Boolean(result?.ok),
        witnessKind: 'browser_navigation_dispatched',
      },
    };
  }
  return result;
}

function startProcessTarget(target) {
  const targetPath = target?.targetPath || target;
  if (!targetPath) throw new Error('launch_app requires a target path or app name');
  const script = `
$target = ${psSingle(targetPath)}
$arguments = ${psSingle(target?.arguments || '')}
$workingDirectory = ${psSingle(target?.workingDirectory || '')}
$params = @{ FilePath = $target }
if (-not [string]::IsNullOrWhiteSpace($arguments)) { $params.ArgumentList = $arguments }
if (-not [string]::IsNullOrWhiteSpace($workingDirectory) -and (Test-Path -LiteralPath $workingDirectory)) { $params.WorkingDirectory = $workingDirectory }
Start-Process @params
@{ ok = $true; target = $target; hasArguments = -not [string]::IsNullOrWhiteSpace($arguments) } | ConvertTo-Json -Depth 3
`;
  return extractJson(runPowerShell(script));
}

function sendHotkey(window, hotkey) {
  // Focus + window-scope assertion is performed by the caller (executeApprovedAction) so the
  // target is verified foreground immediately before keys are sent.
  const keys = sendKeyChord(hotkey);
  if (!keys) throw new Error('hotkey action requires --hotkey');
  const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait(${psSingle(keys)})
@{ ok = $true; keys = ${psSingle(hotkey)} } | ConvertTo-Json -Depth 3
`;
  return extractJson(runPowerShell(script));
}

function sendText(window, text) {
  // Focus + window-scope assertion is performed by the caller (executeApprovedAction).
  const escaped = sendKeysText(text);
  const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait(${psSingle(escaped)})
@{ ok = $true; textLength = ${String(text || '').length} } | ConvertTo-Json -Depth 3
`;
  return extractJson(runPowerShell(script));
}

function centerOf(bounds) {
  if (!bounds) return null;
  const left = Number(bounds.left);
  const top = Number(bounds.top);
  const width = Number(bounds.width || Number(bounds.right) - left);
  const height = Number(bounds.height || Number(bounds.bottom) - top);
  if (
    !Number.isFinite(left) ||
    !Number.isFinite(top) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  )
    return null;
  return { x: Math.round(left + width / 2), y: Math.round(top + height / 2) };
}

function clickPoint(point) {
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class HoloShellMouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@
[HoloShellMouse]::SetCursorPos(${Number(point.x)}, ${Number(point.y)}) | Out-Null
[HoloShellMouse]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
[HoloShellMouse]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
@{ ok = $true; x = ${Number(point.x)}; y = ${Number(point.y)} } | ConvertTo-Json -Depth 3
`;
  return extractJson(runPowerShell(script));
}

function executeApprovedAction(args, window, control) {
  if (args.selfTest && args.action === 'open_url') {
    return {
      ok: true,
      target: args.url,
      browserNavigation: {
        ...urlWitness(args.url),
        dispatchAccepted: true,
        witnessKind: 'browser_navigation_dispatched',
      },
    };
  }
  if (args.action === 'focus_window') {
    const focusResult = focusWindow(window);
    // Verify the focus actually landed on the target (SetForegroundWindow can silently fail).
    const windowScope = assertForegroundIsTarget(window);
    return { ...focusResult, windowScope };
  }
  if (args.action === 'open_url') {
    if (!/^https?:\/\//i.test(args.url || ''))
      throw new Error('open_url only accepts http or https URLs');
    return startProcessLiteral(args.url);
  }
  if (args.action === 'open_path') {
    if (!args.filePath) throw new Error('open_path requires --path');
    return startProcessLiteral(resolveRepoPath(args.filePath));
  }
  if (args.action === 'launch_app') {
    if (!args.app) throw new Error('launch_app requires --app');
    const program = findLaunchProgram(args);
    return startProcessTarget(program?.launchTarget || args.app);
  }
  // Focus-dependent OS mutations: focus the target, ASSERT it is foreground, THEN send. The
  // assertion refuses (throws window_scope_violation) if focus did not land — so keystrokes/
  // clicks can never leak onto a non-target (e.g. the founder's active) window.
  if (args.action === 'hotkey') {
    focusWindow(window);
    const windowScope = assertForegroundIsTarget(window);
    return { ...sendHotkey(window, args.hotkey), windowScope };
  }
  if (args.action === 'type_text') {
    focusWindow(window);
    const windowScope = assertForegroundIsTarget(window);
    return { ...sendText(window, args.text), windowScope };
  }
  if (args.action === 'click_control' || args.action === 'invoke_control') {
    focusWindow(window);
    const windowScope = assertForegroundIsTarget(window);
    const explicitPoint =
      args.x !== '' && args.y !== '' ? { x: Number(args.x), y: Number(args.y) } : null;
    const point = explicitPoint || centerOf(control?.bounds) || centerOf(window?.bounds);
    if (!point)
      throw new Error(`${args.action} requires control bounds, window bounds, or --x/--y`);
    return { ...clickPoint(point), windowScope };
  }
  throw new Error(`No executor is implemented for ${args.action}`);
}

function listResult(args, registry, targetWindow, targetControl) {
  if (args.action === 'list_windows') {
    return {
      windows: registry.windows.map((window) => ({
        id: window.id,
        title: window.title,
        processName: window.processName,
        processId: window.processId,
        handle: window.handle,
        controlCount: Array.isArray(window.controls) ? window.controls.length : 0,
      })),
    };
  }
  if (args.action === 'list_programs') {
    const launchRegistry = readLaunchRegistry(args);
    return {
      summary: launchRegistry.summary || {},
      programs: (launchRegistry.programs || []).slice(0, 80).map(compactProgram),
    };
  }
  if (args.action === 'launch_app') {
    return {
      app: compactProgram(findLaunchProgram(args)),
      requestedApp: args.app || '',
      action: args.action,
    };
  }
  if (args.action === 'read_window') return { window: compactWindow(targetWindow) };
  if (args.action === 'read_controls') {
    return {
      window: compactWindow(targetWindow),
      controls: (targetWindow?.controls || []).map(compactControl),
    };
  }
  return {
    window: compactWindow(targetWindow),
    control: compactControl(targetControl),
    action: args.action,
  };
}

function buildReceipt(args) {
  const startedAt = new Date().toISOString();
  const registry = readProgramRegistry(args);
  const beforeWitnessPayload = registryWitnessPayload(registry);
  const beforeHash = hashValue(beforeWitnessPayload);
  const permission = permissionFor(args);
  const approvalContext = args.approvalContext || null;
  const targetWindow = requiresWindowTarget(args.action) ? findTargetWindow(registry, args) : null;
  const targetControl = findTargetControl(targetWindow, args);
  const targetProgram =
    args.action === 'launch_app' || args.action === 'list_programs'
      ? findLaunchProgram(args)
      : null;
  const browserBoundary = browserBoundaryFor(args, targetProgram);
  const actionId = `hwa-${Date.now().toString(36)}-${shortHash({ args: requestFor(args), beforeHash }, 10)}`;

  let status = 'unknown';
  let result = {};
  let error = '';
  let mutatingActionExecuted = false;
  let executionPerformed = false;
  let rollback = permission.mutating ? 'manual_or_app_specific' : 'not_applicable_for_read_only';

  try {
    if (permission.envelope === 'unknown') {
      status = 'blocked';
      error = `Unknown hardware action: ${args.action}`;
    } else if (permission.breakGlass) {
      status = 'blocked';
      error = 'Break-glass hardware actions are blocked by default.';
      rollback = 'not_attempted';
    } else if (requiresWindowTarget(args.action) && !targetWindow) {
      status = 'target_not_found';
      error = 'No target window matched the request.';
      rollback = 'not_attempted';
    } else if (permission.envelope === 'read_only') {
      status = 'completed';
      result = listResult(args, registry, targetWindow, targetControl);
      executionPerformed = true;
    } else if (!args.approved) {
      status = 'approval_required';
      result = listResult(
        { ...args, action: 'dry_run_action' },
        registry,
        targetWindow,
        targetControl
      );
      rollback = 'not_attempted';
    } else if (!args.execute) {
      status = 'planned';
      result = listResult(
        { ...args, action: 'dry_run_action' },
        registry,
        targetWindow,
        targetControl
      );
      rollback = 'not_attempted';
    } else {
      result = executeApprovedAction(args, targetWindow, targetControl);
      status = 'completed';
      mutatingActionExecuted = true;
      executionPerformed = true;
    }
  } catch (caught) {
    status = 'error';
    error = caught.message;
    rollback = mutatingActionExecuted ? rollback : 'not_attempted';
  }

  const afterRegistry = mutatingActionExecuted ? readProgramRegistry(args) : registry;
  const afterWitnessPayload = registryWitnessPayload(afterRegistry);
  const afterHash = hashValue(afterWitnessPayload);
  const windowStateChanged = beforeHash !== afterHash;
  const browserNavigation = result?.browserNavigation || null;
  const browserNavigationDispatched = Boolean(browserNavigation?.dispatchAccepted);
  const shellVisibleChange = Boolean(
    mutatingActionExecuted && (windowStateChanged || browserNavigationDispatched)
  );
  const visibleChangeSource = windowStateChanged
    ? 'window_registry_delta'
    : browserNavigationDispatched
      ? 'browser_navigation_dispatched'
      : mutatingActionExecuted
        ? 'execution_receipted_no_visible_delta'
        : 'not_applicable';
  const endedAt = new Date().toISOString();

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: endedAt,
    actionId,
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-hardware-control.hsplus',
      executor: 'scripts/holoshell-action-executor.mjs',
      programRegistry: 'scripts/holoshell-program-registry.mjs',
      osUiCapture: 'apps/holoshell/source/holoshell-os-ui-capture.hsplus',
    },
    host: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      hostname: os.hostname(),
    },
    timing: {
      startedAt,
      endedAt,
    },
    request: requestFor(args),
    permission,
    approvalContext,
    browserBoundary,
    target: {
      ...compactWindow(targetWindow),
      program: compactProgram(targetProgram),
      control: compactControl(targetControl),
    },
    witness: {
      beforeCaptureHash: beforeHash,
      afterCaptureHash: afterHash,
      windowStateChanged,
      shellVisibleChange,
      visibleChangeSource,
      browserNavigation,
      secretsCaptured: false,
    },
    summary: {
      status,
      actionKind: args.action,
      permissionEnvelope: permission.envelope,
      approvalRequired: permission.approvalRequired,
      approved: permission.approved,
      approvalBundleId: approvalContext?.approvalId || '',
      executeRequested: permission.executeRequested,
      executionPerformed,
      mutatingActionExecuted,
      windowCount: registry.summary?.windowCount || registry.windows?.length || 0,
      controlCount: registry.summary?.controlCount || 0,
      targetResolved: Boolean(targetWindow) || !requiresWindowTarget(args.action),
      targetWindowTitle: targetWindow?.title || '',
      targetProcessName: targetWindow?.processName || '',
      targetAppName: targetProgram?.displayName || '',
      targetUrlHost: browserNavigation?.targetHost || browserBoundary?.host || '',
      shellVisibleChange,
      visibleWitnessKind: visibleChangeSource,
      browserBoundaryStatus: browserBoundary?.urlClassification || '',
      browserProfileBoundary: browserBoundary?.profileBoundary || '',
      error,
    },
    result,
    error,
    rollback,
  };
}

function writeReceiptOutputs(args, receipt) {
  const receiptDir = resolveRepoPath(args.receiptDir);
  const receiptPath = path.join(receiptDir, `${receipt.actionId}.json`);
  const outputPath = resolveRepoPath(args.output);
  const jsOutputPath = resolveRepoPath(args.jsOutput);
  const withOutput = {
    ...receipt,
    output: {
      latestPath: outputPath,
      receiptPath,
      browserBootstrap: jsOutputPath,
      latestWriteMode: 'locked_atomic_same_directory_rename',
    },
  };
  writeJson(receiptPath, withOutput);
  withFileWriteLock(outputPath, () => writeJson(args.output, withOutput));
  withFileWriteLock(jsOutputPath, () => writeBrowserBootstrap(args.jsOutput, withOutput));
  return withOutput;
}

function assertSelfTest(args) {
  const readOnly = buildReceipt({ ...args, selfTest: true, action: 'list_windows' });
  const programList = buildReceipt({ ...args, selfTest: true, action: 'list_programs' });
  const guarded = buildReceipt({
    ...args,
    selfTest: true,
    action: 'focus_window',
    windowTitle: 'Fixture Editor',
    approved: false,
    execute: false,
  });
  const launchPlan = buildReceipt({
    ...args,
    selfTest: true,
    action: 'launch_app',
    app: 'Fixture Editor',
    approved: true,
    execute: false,
  });
  const blocked = buildReceipt({
    ...args,
    selfTest: true,
    action: 'delete_file',
    filePath: 'C:/tmp/nope.txt',
    approved: true,
    execute: true,
  });
  const secretText = buildReceipt({
    ...args,
    selfTest: true,
    action: 'type_text',
    windowTitle: 'Fixture Editor',
    text: 'api_key=example',
    approved: true,
    execute: true,
  });
  const publicBrowser = buildReceipt({
    ...args,
    selfTest: true,
    action: 'open_url',
    url: 'https://example.com/status',
    approved: false,
    execute: false,
  });
  const publicBrowserExecution = buildReceipt({
    ...args,
    selfTest: true,
    action: 'open_url',
    url: 'https://example.com/status',
    approved: true,
    execute: true,
  });
  const accountBrowser = buildReceipt({
    ...args,
    selfTest: true,
    action: 'open_url',
    url: 'https://example.com/account/settings',
    approved: false,
    execute: false,
  });
  const failures = [];
  if (readOnly.summary.status !== 'completed')
    failures.push('read-only list_windows should complete');
  if (readOnly.permission.envelope !== 'read_only')
    failures.push('list_windows should be read_only');
  if (programList.summary.status !== 'completed')
    failures.push('read-only list_programs should complete');
  if (!programList.result.programs?.length)
    failures.push('list_programs should include fixture apps');
  if (guarded.summary.status !== 'approval_required')
    failures.push('unapproved focus_window should require approval');
  if (guarded.permission.envelope !== 'guarded_execute')
    failures.push('focus_window should be guarded_execute');
  if (launchPlan.summary.status !== 'planned')
    failures.push('approved launch_app without execute should be planned');
  if (launchPlan.target.program.displayName !== 'Fixture Editor')
    failures.push('launch_app should resolve fixture app');
  if (blocked.summary.status !== 'blocked')
    failures.push('break-glass delete_file should be blocked');
  if (secretText.permission.envelope !== 'break_glass')
    failures.push('secret-looking type_text should become break_glass');
  if (publicBrowser.browserBoundary?.urlClassification !== 'public_web')
    failures.push('public open_url should include public browser boundary');
  if (!publicBrowser.summary.browserProfileBoundary)
    failures.push('browser summary should expose profile boundary');
  if (!publicBrowserExecution.summary.shellVisibleChange)
    failures.push('executed public open_url should expose shell-visible browser navigation');
  if (publicBrowserExecution.summary.visibleWitnessKind !== 'browser_navigation_dispatched')
    failures.push('executed public open_url should name browser navigation witness');
  if (publicBrowserExecution.witness.browserNavigation?.targetHost !== 'example.com')
    failures.push('executed public open_url should preserve target host witness');
  if (accountBrowser.browserBoundary?.urlClassification !== 'credential_adjacent')
    failures.push('account open_url should be credential_adjacent');
  // Window-scope safety primitive (founder 2026-06-24): click/type must land ONLY on the
  // resolved target window. Pure evaluator, no live PowerShell.
  const scopeMatch = evaluateWindowScope('1001', '1001');
  const scopeMismatch = evaluateWindowScope('9999', '1001');
  const scopeEmpty = evaluateWindowScope('', '1001');
  if (!scopeMatch.ok) failures.push('window-scope must PASS when foreground == target');
  if (scopeMismatch.ok) failures.push('window-scope MUST FAIL when foreground != target');
  if (scopeEmpty.ok) failures.push('window-scope MUST FAIL when foreground is unknown/empty');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  return readOnly;
}

try {
  const args = parseArgs(process.argv.slice(2));
  args.approvalContext = validateApprovalBundle(args);
  const receipt = args.selfTest ? assertSelfTest(args) : buildReceipt(args);
  const written = writeReceiptOutputs(args, receipt);

  if (args.json) {
    console.log(JSON.stringify(written, null, 2));
  } else {
    console.log(`HoloShell hardware action: ${written.output.latestPath}`);
    console.log(`Receipt: ${written.output.receiptPath}`);
    console.log(`Action: ${written.summary.actionKind}`);
    console.log(`Status: ${written.summary.status}`);
    console.log(`Permission: ${written.summary.permissionEnvelope}`);
    console.log(`Windows: ${written.summary.windowCount}`);
    if (written.summary.error) console.log(`Error: ${written.summary.error}`);
  }
} catch (error) {
  console.error(`holoshell-action-executor failed: ${error.message}`);
  process.exit(1);
}
