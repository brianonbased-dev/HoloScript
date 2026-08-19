#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SCHEMA_VERSION = 'hololand.holoshell.legacy-app-reality.v0.1.0';
const HOLOSCRIPT_CONTRACT_PACKAGE = '@holoscript/framework';
const HOLOSCRIPT_CONTRACT_EXPORTS = [
  'HOLOSHELL_LEGACY_APP_REALITY_SCHEMA_VERSION',
  'validateHoloShellLegacyAppRealitySnapshot',
];
const DEFAULT_OUTPUT = path.join('.tmp', 'holoshell', 'legacy-app-reality.json');
const DEFAULT_JS_OUTPUT = path.join('.tmp', 'holoshell', 'legacy-app-reality.js');
const DEFAULT_PROCESS_HEALTH = path.join('.tmp', 'holoshell', 'process-health.json');
const DEFAULT_NETWORK_REALITY = path.join('.tmp', 'holoshell', 'network-reality.json');
const DEFAULT_LEGACY_WINDOWS = path.join('.tmp', 'holoshell', 'legacy-window-inventory.json');
const DEFAULT_RUN_REGISTRY = path.join('.tmp', 'holoshell', 'run-registry.json');
const REPO_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

const LANE_DEFS = {
  codex: { label: 'Codex', color: 'cyan', agentKind: 'codex' },
  claude: { label: 'Claude', color: 'violet', agentKind: 'claude' },
  gemini: { label: 'Gemini', color: 'blue', agentKind: 'gemini' },
  copilot: { label: 'Copilot', color: 'green', agentKind: 'copilot' },
  cursor: { label: 'Cursor', color: 'amber', agentKind: 'cursor' },
  vscode: { label: 'VS Code', color: 'green', agentKind: 'vscode' },
  ollama: { label: 'Ollama', color: 'gray', agentKind: 'ollama' },
  terminal: { label: 'Terminal', color: 'white', agentKind: 'shell' },
  browser: { label: 'Browser', color: 'blue', agentKind: 'browser' },
};

function parseArgs(argv) {
  const args = {
    json: false,
    selfTest: false,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    processHealth: DEFAULT_PROCESS_HEALTH,
    networkReality: DEFAULT_NETWORK_REALITY,
    legacyWindows: DEFAULT_LEGACY_WINDOWS,
    runRegistry: DEFAULT_RUN_REGISTRY,
    includeCommandLines: false,
    timeoutMs: 25000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--process-health') args.processHealth = argv[++index];
    else if (arg === '--network-reality') args.networkReality = argv[++index];
    else if (arg === '--legacy-windows') args.legacyWindows = argv[++index];
    else if (arg === '--run-registry') args.runRegistry = argv[++index];
    else if (arg === '--include-command-lines') args.includeCommandLines = true;
    else if (arg === '--timeout-ms') args.timeoutMs = Number(argv[++index]) || args.timeoutMs;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.selfTest) {
    args.output = path.join('.tmp', 'holoshell', 'self-test', 'legacy-app-reality.json');
    args.jsOutput = path.join('.tmp', 'holoshell', 'self-test', 'legacy-app-reality.js');
  }
  return args;
}

function printHelp() {
  console.log(`HoloShell legacy app reality adapter

Usage:
  node scripts/holoshell-legacy-app-reality.mjs [options]

Options:
  --json                         Print legacy app reality JSON.
  --output <path>                Write output path. Default: .tmp/holoshell/legacy-app-reality.json.
  --js-output <path>             Browser bootstrap JS path. Default: .tmp/holoshell/legacy-app-reality.js.
  --process-health <path>        Read process-health receipt. Default: .tmp/holoshell/process-health.json.
  --network-reality <path>       Read network reality receipt. Default: .tmp/holoshell/network-reality.json.
  --legacy-windows <path>        Read legacy window inventory. Default: .tmp/holoshell/legacy-window-inventory.json.
  --run-registry <path>          Read run registry. Default: .tmp/holoshell/run-registry.json.
  --include-command-lines        Include redacted command previews. Off by default.
  --timeout-ms <ms>              Windows process probe timeout. Default: 25000.
  --self-test                    Use fixture data and assert contract invariants.
  -h, --help                     Show this help.
`);
}

async function loadHoloScriptContract() {
  try {
    const contract = await import(HOLOSCRIPT_CONTRACT_PACKAGE);
    const missingExports = HOLOSCRIPT_CONTRACT_EXPORTS.filter((name) => !(name in contract));
    if (missingExports.length) {
      return {
        available: false,
        sourcePackage: HOLOSCRIPT_CONTRACT_PACKAGE,
        errors: [`Missing exports: ${missingExports.join(', ')}`],
      };
    }
    if (typeof contract.validateHoloShellLegacyAppRealitySnapshot !== 'function') {
      return {
        available: false,
        sourcePackage: HOLOSCRIPT_CONTRACT_PACKAGE,
        errors: ['validateHoloShellLegacyAppRealitySnapshot is not callable.'],
      };
    }
    return {
      available: true,
      sourcePackage: HOLOSCRIPT_CONTRACT_PACKAGE,
      schemaVersion: contract.HOLOSHELL_LEGACY_APP_REALITY_SCHEMA_VERSION,
      validateSnapshot: contract.validateHoloShellLegacyAppRealitySnapshot,
    };
  } catch (error) {
    return {
      available: false,
      sourcePackage: HOLOSCRIPT_CONTRACT_PACKAGE,
      errors: [error?.message || String(error)],
    };
  }
}

function createContractReceipt(contract, manifest) {
  if (!contract.available) {
    return {
      sourcePackage: contract.sourcePackage,
      validationStatus: 'unavailable',
      checkedAt: new Date().toISOString(),
      expectedSchemaVersion: SCHEMA_VERSION,
      schemaVersion: null,
      errorCount: contract.errors.length,
      errors: contract.errors,
    };
  }

  const schemaVersionMismatch = contract.schemaVersion !== SCHEMA_VERSION
    ? [`Upstream schema version ${contract.schemaVersion} does not match adapter schema version ${SCHEMA_VERSION}.`]
    : [];
  const validationErrors = contract.validateSnapshot(manifest);
  const errors = [...schemaVersionMismatch, ...validationErrors];
  return {
    sourcePackage: contract.sourcePackage,
    validationStatus: errors.length ? 'fail' : 'pass',
    checkedAt: new Date().toISOString(),
    expectedSchemaVersion: SCHEMA_VERSION,
    schemaVersion: contract.schemaVersion,
    errorCount: errors.length,
    errors: errors.slice(0, 16),
  };
}

async function attachHoloScriptContractReceipt(manifest) {
  const contract = await loadHoloScriptContract();
  const receipt = createContractReceipt(contract, manifest);
  manifest.schemaContract = receipt;
  return receipt;
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function readJson(filePath, fallback = {}) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) return fallback;
  try {
    return JSON.parse(readFileSync(resolved, 'utf8'));
  } catch (error) {
    return {
      schemaVersion: 'hololand.holoshell.read-error.v0.1.0',
      generatedAt: new Date().toISOString(),
      path: resolved,
      error: error.message,
    };
  }
}

function writeJson(filePath, data) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeBrowserBootstrap(filePath, data) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(data, null, 2).replace(/<\/script/gi, '<\\/script');
  writeFileSync(resolved, `window.HOLOSHELL_LEGACY_APP_REALITY = ${payload};\n`, 'utf8');
  return resolved;
}

function stableHash(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex').slice(0, 16);
}

function snapshotHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeName(value) {
  return String(value || 'unknown').trim().replace(/\.exe$/i, '').toLowerCase() || 'unknown';
}

function displayProcessName(value) {
  return String(value || 'unknown').trim().replace(/\.exe$/i, '') || 'unknown';
}

function redactText(value) {
  if (!value) return '';
  return String(value)
    .replace(new RegExp(os.homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '%USERPROFILE%')
    .replace(/[A-Za-z]:\\Users\\[^\\\s"]+/g, '%USERPROFILE%')
    .replace(/(api[-_]?key|token|secret|password|passwd|pwd|authorization)=("[^"]+"|'[^']+'|[^\s]+)/gi, '$1=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-[redacted]')
    .slice(0, 220);
}

function titleLabel(rawTitle, processName = 'window') {
  const value = String(rawTitle || '').trim();
  const process = normalizeName(processName);
  const text = value.toLowerCase();
  if (!value) return `${process}_window`;
  if (text.includes('codex')) return 'codex_window';
  if (text.includes('claude')) return 'claude_window';
  if (text.includes('powershell') || text.includes('terminal')) return 'shell_window';
  if (text.includes('microsoft edge') || text.includes('chrome') || text.includes('firefox')) return 'browser_window';
  if (text.includes('file explorer')) return 'file_explorer_window';
  if (text.includes('settings')) return 'settings_window';
  return `${process}_window`;
}

function parseJsonOutput(text, fallback = []) {
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text.trim());
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {}
  const firstArray = text.indexOf('[');
  const lastArray = text.lastIndexOf(']');
  if (firstArray !== -1 && lastArray > firstArray) {
    try {
      const parsed = JSON.parse(text.slice(firstArray, lastArray + 1));
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {}
  }
  return fallback;
}

function powershellProcessProbe(timeoutMs) {
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$networkByPid = @{}
try {
  Get-NetTCPConnection -State Established | Group-Object -Property OwningProcess | ForEach-Object {
    if ($_.Name) { $networkByPid[[int]$_.Name] = [int]$_.Count }
  }
} catch {}
$items = New-Object System.Collections.Generic.List[object]
Get-CimInstance Win32_Process | ForEach-Object {
  $pidValue = [int]$_.ProcessId
  $gp = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
  $networkCount = 0
  if ($networkByPid.ContainsKey($pidValue)) { $networkCount = [int]$networkByPid[$pidValue] }
  $started = $null
  try {
    if ($gp -and $gp.StartTime) { $started = $gp.StartTime.ToUniversalTime().ToString('o') }
  } catch {}
  $items.Add([pscustomobject]@{
    pid = $pidValue
    parentPid = [int]$_.ParentProcessId
    processName = [string]$_.Name
    commandLine = [string]$_.CommandLine
    mainWindowTitle = if ($gp) { [string]$gp.MainWindowTitle } else { '' }
    memoryBytes = if ($gp) { [double]$gp.WorkingSet64 } else { $null }
    cpuSeconds = if ($gp -and $null -ne $gp.CPU) { [double]$gp.CPU } else { $null }
    startedAt = $started
    networkConnectionCount = $networkCount
  })
}
$items | ConvertTo-Json -Compress -Depth 4
`;
  const result = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    return {
      ok: false,
      error: result.error?.message || result.stderr || `PowerShell exited ${result.status}`,
      processes: [],
    };
  }
  return {
    ok: true,
    error: '',
    processes: parseJsonOutput(result.stdout, []),
  };
}

function fixtureProcesses() {
  return [
    { pid: 101, parentPid: 1, processName: 'Codex.exe', commandLine: 'codex --model gpt', mainWindowTitle: 'Codex', memoryBytes: 400000000, cpuSeconds: 12, startedAt: '2026-05-16T02:00:00.000Z', networkConnectionCount: 0 },
    { pid: 202, parentPid: 1, processName: 'Claude.exe', commandLine: 'claude desktop', mainWindowTitle: 'Claude', memoryBytes: 500000000, cpuSeconds: 9, startedAt: '2026-05-16T02:05:00.000Z', networkConnectionCount: 2 },
    { pid: 303, parentPid: 101, processName: 'WindowsTerminal.exe', commandLine: 'powershell', mainWindowTitle: 'PowerShell', memoryBytes: 150000000, cpuSeconds: 4, startedAt: '2026-05-16T02:10:00.000Z', networkConnectionCount: 0 },
    { pid: 404, parentPid: 1, processName: 'chrome.exe', commandLine: 'chrome --profile-directory=Default', mainWindowTitle: 'Browser', memoryBytes: 600000000, cpuSeconds: 30, startedAt: '2026-05-16T02:15:00.000Z', networkConnectionCount: 8 },
    { pid: 505, parentPid: 1, processName: 'notepad.exe', commandLine: 'notepad.exe', mainWindowTitle: '', memoryBytes: 50000000, cpuSeconds: 1, startedAt: '2026-05-16T02:20:00.000Z', networkConnectionCount: 0 },
  ];
}

function fixtureLegacyWindows() {
  return {
    schemaVersion: 'hololand.holoshell.legacy-window-inventory.v0.1.0',
    summary: { visibleWindowCount: 4, rawWindowTitlesIncluded: false },
    windows: [
      { windowId: 'window-codex', pid: 101, processName: 'Codex', titleLabel: 'codex_window', appName: 'codex', archetype: 'ai_peer_surface' },
      { windowId: 'window-claude', pid: 202, processName: 'Claude', titleLabel: 'claude_window', appName: 'claude', archetype: 'ai_peer_surface' },
      { windowId: 'window-terminal', pid: 303, processName: 'WindowsTerminal', titleLabel: 'shell_window', appName: 'terminal', archetype: 'shell_surface' },
      { windowId: 'window-browser', pid: 404, processName: 'chrome', titleLabel: 'browser_window', appName: 'chrome', archetype: 'browser' },
    ],
  };
}

function inferLane(raw) {
  const text = `${raw.processName || ''} ${raw.commandLine || ''} ${raw.mainWindowTitle || ''} ${raw.appName || ''}`.toLowerCase();
  const name = normalizeName(raw.processName);
  if (text.includes('codex')) return 'codex';
  if (text.includes('claude')) return 'claude';
  if (text.includes('gemini') || text.includes('antigravity')) return 'gemini';
  if (text.includes('copilot')) return 'copilot';
  if (text.includes('cursor')) return 'cursor';
  if (text.includes('visual studio code') || name === 'code') return 'vscode';
  if (text.includes('ollama')) return 'ollama';
  if (/windowsterminal|powershell|pwsh|cmd|bash|terminal/.test(text)) return 'terminal';
  if (/chrome|msedge|firefox|brave/.test(text)) return 'browser';
  return '';
}

function inferRole(raw, laneId = inferLane(raw)) {
  const name = normalizeName(raw.processName);
  const text = `${name} ${raw.commandLine || ''} ${raw.mainWindowTitle || ''} ${raw.appName || ''}`.toLowerCase();
  if (['codex', 'claude', 'gemini', 'copilot', 'cursor'].includes(laneId)) return 'ai_peer_surface';
  if (laneId === 'vscode') return 'ai_workbench';
  if (laneId === 'ollama') return 'ai_model_runtime';
  if (laneId === 'terminal') return 'shell_surface';
  if (laneId === 'browser') return 'browser';
  if (/services|svchost|registry|system|wininit|csrss|lsass|fontdrvhost|dwm/.test(text)) return 'system_service';
  return 'legacy_app';
}

function networkPostureFor(raw, role) {
  const count = Number(raw.networkConnectionCount || raw.connectionCount || 0);
  if (count >= 12) return 'heavy';
  if (count > 0) return 'active';
  if (['browser', 'ai_peer_surface', 'ai_model_runtime'].includes(role)) return 'possible';
  return 'none';
}

function custodyStatusFor(role, laneId, hasVisibleWindow) {
  if (role === 'system_service') return 'do_not_stop';
  if (laneId && ['codex', 'claude', 'gemini', 'copilot', 'cursor', 'vscode', 'ollama', 'terminal'].includes(laneId)) {
    return 'observed';
  }
  if (hasVisibleWindow) return 'owner_unknown';
  return 'safe_to_review';
}

function normalizeWindow(raw, processByPid) {
  const pid = Number(raw.pid || raw.processId || 0);
  const processRecord = processByPid.get(pid) || {};
  const processName = displayProcessName(raw.processName || processRecord.processName);
  const laneId = inferLane({ ...processRecord, ...raw, processName });
  const role = inferRole({ ...processRecord, ...raw, processName }, laneId);
  const lane = laneId ? LANE_DEFS[laneId] : null;
  return {
    id: raw.windowId || raw.id || `window-${stableHash(`${pid}:${processName}:${raw.titleLabel || raw.title || ''}`)}`,
    title: raw.titleLabel || titleLabel(raw.title || raw.mainWindowTitle, processName),
    processId: pid,
    processName,
    role,
    laneId: laneId || null,
    laneColor: lane?.color || null,
    visible: true,
    foreground: Boolean(raw.foreground),
    handle: raw.windowHandle || raw.handle || null,
    evidence: ['legacy_window_inventory'],
  };
}

function windowsFromProcessFallback(processes) {
  return processes
    .filter((process) => String(process.mainWindowTitle || '').trim())
    .map((process) => normalizeWindow({
      pid: Number(process.pid),
      processName: process.processName,
      mainWindowTitle: process.mainWindowTitle,
      title: process.mainWindowTitle,
    }, new Map(processes.map((item) => [Number(item.pid), item]))));
}

function normalizeProcess(raw, visiblePidSet, args) {
  const pid = Number(raw.pid || raw.processId || 0);
  const laneId = inferLane(raw);
  const role = inferRole(raw, laneId);
  const lane = laneId ? LANE_DEFS[laneId] : null;
  const hasVisibleWindow = visiblePidSet.has(pid);
  const networkPosture = networkPostureFor(raw, role);
  const commandLine = redactText(raw.commandLine || '');
  return {
    pid,
    parentPid: Number(raw.parentPid || raw.parentProcessId || 0) || null,
    processName: displayProcessName(raw.processName),
    role,
    laneId: laneId || null,
    laneColor: lane?.color || null,
    agentKind: lane?.agentKind || null,
    hasVisibleWindow,
    networkPosture,
    custodyStatus: custodyStatusFor(role, laneId, hasVisibleWindow),
    memoryBytes: Number.isFinite(Number(raw.memoryBytes)) ? Number(raw.memoryBytes) : null,
    cpuSeconds: Number.isFinite(Number(raw.cpuSeconds)) ? Number(raw.cpuSeconds) : null,
    startedAt: raw.startedAt || null,
    commandHash: commandLine ? stableHash(commandLine) : null,
    commandPreview: args.includeCommandLines ? commandLine : null,
    evidence: [
      'process_table',
      ...(hasVisibleWindow ? ['visible_window'] : []),
      ...(Number(raw.networkConnectionCount || 0) > 0 ? ['network_connection_owner'] : []),
      ...(laneId ? ['lane_classifier'] : []),
    ],
  };
}

function buildLanes(processes, windows, networkConsumers) {
  const lanes = new Map();
  for (const process of processes) {
    if (!process.laneId) continue;
    const def = LANE_DEFS[process.laneId] || {
      label: process.laneId,
      color: process.laneColor || 'white',
      agentKind: process.agentKind || process.laneId,
    };
    if (!lanes.has(process.laneId)) {
      lanes.set(process.laneId, {
        laneId: process.laneId,
        label: def.label,
        color: def.color,
        agentKind: def.agentKind,
        processCount: 0,
        visibleWindowCount: 0,
        networkConsumerCount: 0,
        primaryPid: process.pid,
        evidence: ['lane_classifier'],
      });
    }
    lanes.get(process.laneId).processCount += 1;
  }
  for (const window of windows) {
    if (window.laneId && lanes.has(window.laneId)) lanes.get(window.laneId).visibleWindowCount += 1;
  }
  for (const consumer of networkConsumers) {
    if (consumer.laneId && lanes.has(consumer.laneId)) lanes.get(consumer.laneId).networkConsumerCount += 1;
  }
  return [...lanes.values()].sort((left, right) => left.laneId.localeCompare(right.laneId));
}

function createSnapshot({ args, rawProcesses, legacyWindows, probe }) {
  const processByPid = new Map(rawProcesses.map((process) => [Number(process.pid), process]));
  const inventoryWindows = safeArray(legacyWindows.windows)
    .map((window) => normalizeWindow(window, processByPid))
    .filter((window) => Number.isInteger(window.processId) && window.processId > 0);
  const fallbackWindows = inventoryWindows.length ? [] : windowsFromProcessFallback(rawProcesses);
  const windows = [...inventoryWindows, ...fallbackWindows].slice(0, 240);
  const visiblePidSet = new Set(windows.map((window) => window.processId));
  const processes = rawProcesses
    .map((process) => normalizeProcess(process, visiblePidSet, args))
    .filter((process) => Number.isInteger(process.pid) && process.pid > 0)
    .sort((left, right) => Number(Boolean(right.hasVisibleWindow)) - Number(Boolean(left.hasVisibleWindow)) || left.processName.localeCompare(right.processName));
  const networkConsumers = processes
    .filter((process) => ['active', 'heavy'].includes(process.networkPosture))
    .map((process) => ({
      pid: process.pid,
      processName: process.processName,
      role: process.role,
      laneId: process.laneId,
      networkPosture: process.networkPosture,
      connectionCount: Number(rawProcesses.find((raw) => Number(raw.pid) === process.pid)?.networkConnectionCount || 0),
      evidence: ['network_connection_owner'],
    }));
  const lanes = buildLanes(processes, windows, networkConsumers);
  const agentRoles = new Set(['ai_peer_surface', 'ai_workbench', 'ai_model_runtime']);
  const agentLaneIds = new Set(['codex', 'claude', 'gemini', 'copilot', 'cursor', 'vscode', 'ollama']);
  const agentInstanceCount = lanes.filter((lane) => agentLaneIds.has(lane.laneId)).length
    || windows.filter((window) => agentRoles.has(window.role)).length;
  const shellInstanceCount = windows.filter((window) => window.role === 'shell_surface').length
    || (lanes.some((lane) => lane.laneId === 'terminal') ? 1 : 0);
  const browserCount = windows.filter((window) => window.role === 'browser').length
    || (lanes.some((lane) => lane.laneId === 'browser') ? 1 : 0);
  const now = new Date().toISOString();
  const confidence = args.selfTest ? 'fixture' : probe.ok ? 'os_reported' : 'unavailable';

  const base = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now,
    platform: process.platform,
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-home.hsplus',
      adapter: 'scripts/holoshell-legacy-app-reality.mjs',
      processHealth: args.processHealth,
      networkReality: args.networkReality,
      legacyWindowInventory: args.legacyWindows,
      runRegistry: args.runRegistry,
    },
    summary: {
      processCount: processes.length,
      visibleWindowCount: windows.filter((window) => window.visible).length,
      agentInstanceCount,
      shellInstanceCount,
      legacyAppCount: processes.filter((process) => process.role === 'legacy_app').length,
      browserCount,
      networkConsumerCount: networkConsumers.length,
      heavyNetworkConsumerCount: networkConsumers.filter((consumer) => consumer.networkPosture === 'heavy').length,
      colorLaneCount: lanes.length,
      processCountIsPeerCount: false,
      confidence,
    },
    lanes,
    processes,
    windows,
    networkConsumers,
    redaction: {
      localOnly: true,
      commandLinesIncluded: Boolean(args.includeCommandLines),
      commandLinesRedacted: true,
      rawWindowTitlesIncluded: false,
      remoteEndpointsIncluded: false,
      secretsRedacted: true,
    },
    receipt: {
      receiptType: 'legacy_app_reality_snapshot',
      actionTaken: args.selfTest ? 'self_test_snapshot' : 'legacy_app_reality_snapshot',
      mutationPerformed: false,
      snapshotHash: '',
      hashAlgorithm: 'sha256',
      emittedAt: now,
    },
    metadata: {
      probeStatus: probe.ok ? 'pass' : 'unavailable',
      probeError: probe.ok ? '' : redactText(probe.error || ''),
      processHealthStatus: readJson(args.processHealth, {}).summary?.riskState || 'unknown',
      networkRealityStatus: readJson(args.networkReality, {}).underlay?.classification || 'unknown',
    },
  };
  base.receipt.snapshotHash = snapshotHash({ ...base, receipt: { ...base.receipt, snapshotHash: '' } });
  return base;
}

function collectInputs(args) {
  if (args.selfTest) {
    return {
      rawProcesses: fixtureProcesses(),
      legacyWindows: fixtureLegacyWindows(),
      probe: { ok: true, error: '' },
    };
  }
  const probe = process.platform === 'win32'
    ? powershellProcessProbe(args.timeoutMs)
    : { ok: false, error: `live process probe requires win32, got ${process.platform}`, processes: [] };
  return {
    rawProcesses: probe.processes,
    legacyWindows: readJson(args.legacyWindows, {}),
    probe,
  };
}

function assertSelfTest(snapshot) {
  const failures = [];
  if (snapshot.schemaContract?.validationStatus !== 'pass') failures.push('expected HoloScript schema contract pass');
  if (snapshot.summary.processCount < 5) failures.push('expected fixture processes');
  if (snapshot.summary.agentInstanceCount < 2) failures.push('expected agent/AI peer instances');
  if (snapshot.summary.shellInstanceCount < 1) failures.push('expected shell instance');
  if (snapshot.summary.networkConsumerCount < 2) failures.push('expected network consumers');
  if (snapshot.summary.processCountIsPeerCount !== false) failures.push('process count must never be peer count');
  if (!snapshot.lanes.some((lane) => lane.laneId === 'codex' && lane.color === 'cyan')) failures.push('expected codex cyan lane');
  if (!snapshot.windows.some((window) => window.laneId === 'claude')) failures.push('expected claude window lane');
  if (snapshot.redaction.remoteEndpointsIncluded !== false) failures.push('remote endpoints must stay excluded');
  if (failures.length) throw new Error(`self-test failed:\n- ${failures.join('\n- ')}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputs = collectInputs(args);
  const snapshot = createSnapshot({ args, ...inputs });
  await attachHoloScriptContractReceipt(snapshot);
  if (args.selfTest) assertSelfTest(snapshot);
  const outputPath = writeJson(args.output, snapshot);
  const jsOutputPath = writeBrowserBootstrap(args.jsOutput, snapshot);
  if (args.json) console.log(JSON.stringify(snapshot, null, 2));
  else {
    console.log(`HoloShell legacy app reality: ${outputPath}`);
    console.log(`HoloShell legacy app reality browser bootstrap: ${jsOutputPath}`);
    console.log(`Processes: ${snapshot.summary.processCount}`);
    console.log(`Visible windows: ${snapshot.summary.visibleWindowCount}`);
    console.log(`Agent instances: ${snapshot.summary.agentInstanceCount}`);
    console.log(`Shell instances: ${snapshot.summary.shellInstanceCount}`);
    console.log(`Network consumers: ${snapshot.summary.networkConsumerCount}`);
    console.log(`Color lanes: ${snapshot.summary.colorLaneCount}`);
    console.log(`HoloScript contract: ${snapshot.schemaContract.validationStatus}`);
  }
}

main().catch((error) => {
  console.error(`holoshell-legacy-app-reality failed: ${error.message}`);
  process.exit(1);
});
