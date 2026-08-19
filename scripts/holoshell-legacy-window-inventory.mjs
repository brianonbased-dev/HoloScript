#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.legacy-window-inventory.v0.1.0';
const REPO_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const DEFAULT_OUTPUT = path.join('.tmp', 'holoshell', 'legacy-window-inventory.json');
const DEFAULT_JS_OUTPUT = path.join('.tmp', 'holoshell', 'legacy-window-inventory.js');
const DEFAULT_TIMEOUT_MS = 30000;

function parseArgs(argv) {
  const args = {
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--timeout-ms') args.timeoutMs = Number(argv[++index]) || DEFAULT_TIMEOUT_MS;
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`HoloShell legacy window inventory

Usage:
  node scripts/holoshell-legacy-window-inventory.mjs [options]

Options:
  --output <path>       Snapshot output. Default: .tmp/holoshell/legacy-window-inventory.json.
  --js-output <path>    Browser bootstrap JS. Default: .tmp/holoshell/legacy-window-inventory.js.
  --timeout-ms <ms>     PowerShell window probe timeout. Default: ${DEFAULT_TIMEOUT_MS}.
  --json                Print snapshot JSON.
  --self-test           Use synthetic window fixture and assert invariants.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function normalizeProcessName(value) {
  return String(value || 'unknown').trim().replace(/\.exe$/i, '') || 'unknown';
}

function lowerText(...values) {
  return values.map((value) => String(value || '')).join(' ').toLowerCase();
}

function normalizedAppName(window) {
  const text = lowerText(window.processName, window.title);
  const processName = normalizeProcessName(window.processName);
  if (text.includes('codex')) return 'codex';
  if (text.includes('claude')) return 'claude';
  if (text.includes('ollama')) return 'ollama';
  if (text.includes('gemini') || text.includes('antigravity')) return 'gemini';
  if (text.includes('copilot')) return 'copilot';
  if (text.includes('cursor')) return 'cursor';
  if (text.includes('visual studio code') || /^code$/i.test(processName)) return 'vscode';
  if (/(windowsterminal|powershell|pwsh|cmd|bash|terminal)/i.test(processName)) return 'terminal';
  if (/^applicationframehost$/i.test(processName) && text.includes('settings')) return 'systemsettings';
  if (/^systemsettings$/i.test(processName)) return 'systemsettings';
  if (/^ollama app$/i.test(processName)) return 'ollama';
  return processName.replace(/\s+/g, '-').toLowerCase();
}

function appLabel(appName) {
  const labels = new Map([
    ['codex', 'Codex'],
    ['claude', 'Claude'],
    ['ollama', 'Ollama'],
    ['gemini', 'Gemini'],
    ['copilot', 'Copilot'],
    ['cursor', 'Cursor'],
    ['vscode', 'VS Code'],
    ['terminal', 'Terminal'],
    ['msedge', 'Microsoft Edge'],
    ['chrome', 'Chrome'],
    ['explorer', 'File Explorer'],
    ['systemsettings', 'Settings'],
  ]);
  return labels.get(appName) || appName;
}

function archetypeFor(appName, window) {
  const text = lowerText(appName, window?.processName, window?.title);
  if (/(codex|claude|gemini|copilot|cursor|vscode)/.test(text)) return 'ai_peer_surface';
  if (/(terminal|windowsterminal|powershell|pwsh|cmd|bash)/.test(text)) return 'shell_surface';
  if (/(msedge|chrome|firefox|brave)/.test(text)) return 'browser';
  if (/(explorer|files|finder)/.test(text)) return 'file_manager';
  if (/(systemsettings|settings|control)/.test(text)) return 'settings_panel';
  if (/(docker|ollama|webview|native|messagehost|powerautomate|pad\.)/.test(text)) return 'automation_bridge';
  return 'legacy_window';
}

function peerLaneFor(appName, window) {
  const text = lowerText(appName, window?.processName, window?.title);
  if (text.includes('codex')) return { laneId: 'codex', label: 'Codex', colorHint: 'cyan', peerKind: 'agent' };
  if (text.includes('claude')) return { laneId: 'claude', label: 'Claude', colorHint: 'violet', peerKind: 'agent' };
  if (text.includes('ollama')) return { laneId: 'ollama', label: 'Ollama', colorHint: 'gray', peerKind: 'model_runtime' };
  if (text.includes('gemini') || text.includes('antigravity')) return { laneId: 'gemini', label: 'Gemini', colorHint: 'blue', peerKind: 'agent' };
  if (text.includes('copilot')) return { laneId: 'copilot', label: 'Copilot', colorHint: 'green', peerKind: 'agent' };
  if (text.includes('cursor')) return { laneId: 'cursor', label: 'Cursor', colorHint: 'amber', peerKind: 'agent' };
  if (text.includes('vscode') || text.includes('visual studio code')) return { laneId: 'vscode', label: 'VS Code', colorHint: 'green', peerKind: 'ide' };
  if (appName === 'terminal') return { laneId: 'terminal', label: 'Terminal', colorHint: 'white', peerKind: 'shell' };
  return null;
}

function surfaceClassFor(peer) {
  if (!peer) return 'legacy_window';
  if (peer.peerKind === 'shell') return 'shell_surface';
  if (peer.peerKind === 'model_runtime') return 'ai_model_runtime';
  if (peer.peerKind === 'ide') return 'ai_workbench';
  return 'ai_peer_surface';
}

function isAiPeerSurface(surface) {
  return ['agent', 'model_runtime', 'ide'].includes(surface?.peerKind);
}

function isShellSurface(surface) {
  return surface?.peerKind === 'shell';
}

function isContextSurfaceGroup(group, operatingSurfaceNames = new Set()) {
  return operatingSurfaceNames.has(group.appName)
    || ['ai_peer_surface', 'ai_model_runtime', 'ai_workbench', 'shell_surface'].includes(group.archetype);
}

function titleLabel(title, appName) {
  const value = String(title || '').trim();
  const text = value.toLowerCase();
  if (!value) return 'untitled_window';
  if (text === appName || text === appLabel(appName).toLowerCase()) return `${appName}_home`;
  if (text.includes('file explorer')) return 'file_explorer_window';
  if (text.includes('settings')) return 'settings_window';
  if (text.includes('microsoft') && text.includes('edge')) return 'browser_window';
  if (text.includes('docker')) return 'docker_dashboard';
  if (text.includes('continue room marathon')) return 'terminal_task';
  if (text.includes('powershell')) return 'shell_window';
  return `${appName}_window`;
}

function syntheticWindows() {
  return [
    { handle: '0x101', pid: 101, processName: 'Codex', title: 'Codex' },
    { handle: '0x102', pid: 202, processName: 'claude', title: 'Claude' },
    { handle: '0x103', pid: 303, processName: 'WindowsTerminal', title: 'Continue room marathon' },
    { handle: '0x104', pid: 404, processName: 'msedge', title: 'New tab - Microsoft Edge' },
    { handle: '0x105', pid: 505, processName: 'explorer', title: 'HoloLand - File Explorer' },
  ];
}

export function compactPowerShellEnv(env = process.env) {
  const keepNames = [
    'ALLUSERSPROFILE',
    'APPDATA',
    'COMPUTERNAME',
    'ComSpec',
    'HOME',
    'HOMEDRIVE',
    'HOMEPATH',
    'LOCALAPPDATA',
    'NUMBER_OF_PROCESSORS',
    'PATHEXT',
    'PROCESSOR_ARCHITECTURE',
    'PROCESSOR_IDENTIFIER',
    'PROCESSOR_LEVEL',
    'PROCESSOR_REVISION',
    'ProgramData',
    'ProgramFiles',
    'ProgramFiles(x86)',
    'ProgramW6432',
    'PSModulePath',
    'PUBLIC',
    'SystemDrive',
    'SystemRoot',
    'TEMP',
    'TMP',
    'USERDOMAIN',
    'USERNAME',
    'USERPROFILE',
    'windir',
  ];
  const compact = {};
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path');
  if (pathKey) compact[pathKey] = env[pathKey];
  for (const name of keepNames) {
    if (env[name] !== undefined) compact[name] = env[name];
  }
  return compact;
}

export function envBlockUtf16Bytes(env = process.env) {
  const entries = Object.entries(env)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`);
  return (entries.join('\0').length + 2) * 2;
}

function powershellWindowProbe(timeoutMs) {
  const script = `
$ErrorActionPreference = 'Stop'
$code = @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class HoloShellWindowNative {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
'@
Add-Type -TypeDefinition $code
$processCache = @{}
function Get-HoloProcessName([int]$processId) {
  if ($processCache.ContainsKey($processId)) { return $processCache[$processId] }
  try { $name = (Get-Process -Id $processId -ErrorAction Stop).ProcessName } catch { $name = $null }
  $processCache[$processId] = $name
  return $name
}
$items = New-Object System.Collections.Generic.List[object]
[HoloShellWindowNative]::EnumWindows({
  param($hWnd, $lParam)
  if (-not [HoloShellWindowNative]::IsWindowVisible($hWnd)) { return $true }
  $length = [HoloShellWindowNative]::GetWindowTextLength($hWnd)
  if ($length -le 0) { return $true }
  $builder = New-Object System.Text.StringBuilder ($length + 1)
  [void][HoloShellWindowNative]::GetWindowText($hWnd, $builder, $builder.Capacity)
  $title = $builder.ToString()
  if ([string]::IsNullOrWhiteSpace($title)) { return $true }
  [uint32]$processId = 0
  [void][HoloShellWindowNative]::GetWindowThreadProcessId($hWnd, [ref]$processId)
  $items.Add([pscustomobject]@{
    handle = ('0x{0:x}' -f $hWnd.ToInt64())
    pid = [int]$processId
    processName = Get-HoloProcessName([int]$processId)
    title = $title
  })
  return $true
}, [IntPtr]::Zero) | Out-Null
$items | ConvertTo-Json -Compress -Depth 4
`;
  const result = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    cwd: REPO_ROOT,
    env: compactPowerShellEnv(),
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout || `PowerShell exited ${result.status}`).trim());
  }
  const text = result.stdout.trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function collectWindows(args) {
  if (args.selfTest) return syntheticWindows();
  if (process.platform !== 'win32') {
    throw new Error(`live legacy window inventory requires win32, got ${process.platform}`);
  }
  return powershellWindowProbe(args.timeoutMs);
}

function normalizeWindow(raw) {
  const appName = normalizedAppName(raw);
  const title = String(raw.title || '');
  const titleHash = sha256(title);
  return {
    windowId: `window-${sha256(`${raw.handle}|${raw.pid}|${titleHash}`).slice(0, 12)}`,
    windowHandle: String(raw.handle || ''),
    pid: Number(raw.pid),
    processName: normalizeProcessName(raw.processName),
    appName,
    appLabel: appLabel(appName),
    archetype: archetypeFor(appName, raw),
    titleHash,
    titleLength: title.length,
    titleLabel: titleLabel(title, appName),
    rawTitleHidden: true,
    receiptRequired: true,
  };
}

function groupWindows(windows) {
  const groups = new Map();
  for (const window of windows) {
    const key = window.appName;
    if (!groups.has(key)) {
      groups.set(key, {
        appName: key,
        label: window.appLabel,
        archetype: window.archetype,
        windowInstanceCount: 0,
        processCount: 0,
        pids: new Set(),
        sampleWindowIds: [],
        titleLabels: new Set(),
        receiptRequired: true,
      });
    }
    const group = groups.get(key);
    group.windowInstanceCount += 1;
    if (Number.isInteger(window.pid)) group.pids.add(window.pid);
    if (group.sampleWindowIds.length < 8) group.sampleWindowIds.push(window.windowId);
    group.titleLabels.add(window.titleLabel);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    pids: [...group.pids].slice(0, 16),
    processCount: group.pids.size,
    titleLabels: [...group.titleLabels].slice(0, 8),
  })).sort((left, right) => right.windowInstanceCount - left.windowInstanceCount);
}

function groupPeerSurfaces(windows) {
  const peers = new Map();
  for (const window of windows) {
    const peer = peerLaneFor(window.appName, window);
    if (!peer) continue;
    if (!peers.has(peer.laneId)) {
      peers.set(peer.laneId, {
        laneId: peer.laneId,
        label: peer.label,
        colorHint: peer.colorHint,
        peerKind: peer.peerKind,
        surfaceClass: surfaceClassFor(peer),
        windowInstanceCount: 0,
        processCount: 0,
        pids: new Set(),
        sampleWindowIds: [],
        evidence: 'top_level_windows',
        rawTitleHidden: true,
        receiptRequired: true,
      });
    }
    const entry = peers.get(peer.laneId);
    entry.windowInstanceCount += 1;
    if (Number.isInteger(window.pid)) entry.pids.add(window.pid);
    if (entry.sampleWindowIds.length < 8) entry.sampleWindowIds.push(window.windowId);
  }
  return [...peers.values()].map((peer) => ({
    ...peer,
    pids: [...peer.pids].slice(0, 16),
    processCount: peer.pids.size,
  })).sort((left, right) => right.windowInstanceCount - left.windowInstanceCount);
}

function createSnapshot(rawWindows) {
  const windows = safeArray(rawWindows)
    .map(normalizeWindow)
    .filter((window) => Number.isInteger(window.pid) && window.windowHandle);
  const appGroups = groupWindows(windows);
  const operatingSurfaces = groupPeerSurfaces(windows);
  const peerSurfaces = operatingSurfaces.filter(isAiPeerSurface);
  const shellSurfaces = operatingSurfaces.filter(isShellSurface);
  const operatingSurfaceNames = new Set(operatingSurfaces.map((surface) => surface.laneId));
  const aiPeerWindowCount = peerSurfaces.reduce((sum, peer) => sum + peer.windowInstanceCount, 0);
  const shellWindowCount = shellSurfaces.reduce((sum, shell) => sum + shell.windowInstanceCount, 0);
  const operatingSurfaceWindowCount = aiPeerWindowCount + shellWindowCount;
  const legacyWindowCount = windows.filter((window) => !peerLaneFor(window.appName, window)).length;
  const captureCandidates = appGroups.filter((group) => !isContextSurfaceGroup(group, operatingSurfaceNames)
    && !['system_window'].includes(group.archetype));
  const snapshot = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-legacy-window-inventory.hsplus',
      adapter: 'scripts/holoshell-legacy-window-inventory.mjs',
      dataSource: 'win32.user32.EnumWindows',
    },
    summary: {
      visibleWindowCount: windows.length,
      appGroupCount: appGroups.length,
      peerSurfaceCount: peerSurfaces.length,
      peerWindowCount: aiPeerWindowCount,
      aiPeerSurfaceCount: peerSurfaces.length,
      aiPeerWindowCount,
      shellSurfaceCount: shellSurfaces.length,
      shellWindowCount,
      operatingSurfaceCount: operatingSurfaces.length,
      operatingSurfaceWindowCount,
      legacyWindowCount,
      contextSurfaceGroupCount: operatingSurfaces.length,
      legacyAppGroupCount: appGroups.length - operatingSurfaces.length,
      captureCandidateCount: captureCandidates.length,
      rawWindowTitlesIncluded: false,
      destructiveActionsTaken: false,
    },
    windows: windows.slice(0, 160),
    appGroups,
    peerSurfaces,
    shellSurfaces,
    operatingSurfaces,
    brittneyBrief: {
      status: windows.length ? 'legacy_windows_visible' : 'no_legacy_windows',
      summary: `${windows.length} visible top-level window(s), ${peerSurfaces.length} AI peer surface group(s), ${aiPeerWindowCount} AI peer window(s), ${shellWindowCount} shell window(s).`,
      peerWindowSummary: peerSurfaces.map((peer) => `${peer.label}:${peer.windowInstanceCount}`).join(', ') || 'no peer windows',
      shellWindowSummary: shellSurfaces.map((shell) => `${shell.label}:${shell.windowInstanceCount}`).join(', ') || 'no shell windows',
      requiredNextAction: operatingSurfaces.length
        ? 'Use AI peer window counts separately from shell surface counts before trusting PID lane counts.'
        : 'No peer window correction available.',
      allowedActions: ['observe_window', 'count_peer_windows', 'capture_window', 'map_visible_controls', 'summarize_visible_state'],
      blockedActions: ['close_window', 'click_destructive_ui', 'submit_form', 'change_app_setting', 'alter_registry'],
      operatorRule: 'Window inventory is read-only. Use window counts for peer presence; mutation still requires legacy app preflight.',
    },
    safety: {
      observeOnly: true,
      destructiveActionsTaken: false,
      rawWindowTitlesIncluded: false,
      legacyMutationPerformed: false,
      preflightRequiredForMutation: true,
    },
  };
  return {
    ...snapshot,
    receipt: {
      windowInventoryHash: sha256(JSON.stringify({
        windows: windows.map((window) => [window.windowId, window.pid, window.appName, window.titleHash]),
        peerSurfaces: peerSurfaces.map((peer) => [peer.laneId, peer.windowInstanceCount]),
        shellSurfaces: shellSurfaces.map((shell) => [shell.laneId, shell.windowInstanceCount]),
      })),
      destructiveActionsTaken: false,
      rawCommandsIncluded: false,
      rawWindowTitlesIncluded: false,
    },
  };
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
  writeFileSync(resolved, `window.HOLOSHELL_LEGACY_WINDOW_INVENTORY = ${payload};\n`, 'utf8');
  return resolved;
}

function assertSelfTest(snapshot) {
  const failures = [];
  if (snapshot.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (snapshot.summary.visibleWindowCount < 5) failures.push('expected synthetic windows');
  if (snapshot.summary.peerWindowCount !== 2) failures.push('expected AI peer windows to exclude shell surfaces');
  if (snapshot.summary.shellWindowCount !== 1) failures.push('expected one shell window');
  if (snapshot.summary.operatingSurfaceWindowCount !== 3) failures.push('expected three operating surface windows');
  if (snapshot.summary.captureCandidateCount !== 2) failures.push('expected capture candidates to exclude peer and shell surfaces');
  if (!snapshot.peerSurfaces.some((peer) => peer.laneId === 'codex' && peer.windowInstanceCount === 1)) failures.push('expected codex peer window');
  if (!snapshot.peerSurfaces.some((peer) => peer.laneId === 'claude' && peer.windowInstanceCount === 1)) failures.push('expected claude peer window');
  if (snapshot.peerSurfaces.some((peer) => peer.laneId === 'terminal')) failures.push('terminal must not be an AI peer surface');
  if (!snapshot.shellSurfaces.some((surface) => surface.laneId === 'terminal' && surface.windowInstanceCount === 1)) failures.push('expected terminal shell surface');
  if (snapshot.safety.destructiveActionsTaken !== false) failures.push('destructive actions must be false');
  if (snapshot.safety.rawWindowTitlesIncluded !== false) failures.push('raw titles must be hidden');
  const serialized = JSON.stringify(snapshot);
  if (/New tab - Microsoft Edge|HoloLand - File Explorer|Continue room marathon/.test(serialized)) failures.push('raw window title leaked');
  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const snapshot = createSnapshot(collectWindows(args));
  if (args.selfTest) assertSelfTest(snapshot);
  const output = writeJson(args.output, snapshot);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, snapshot);

  if (args.json) {
    console.log(JSON.stringify(snapshot, null, 2));
  } else {
    console.log(`HoloShell legacy window inventory: ${output}`);
    console.log(`HoloShell legacy window browser bootstrap: ${jsOutput}`);
    console.log(`Visible windows: ${snapshot.summary.visibleWindowCount}`);
    console.log(`AI peer windows: ${snapshot.summary.peerWindowCount}`);
    console.log(`AI peer groups: ${snapshot.summary.peerSurfaceCount}`);
    console.log(`Shell windows: ${snapshot.summary.shellWindowCount}`);
    console.log(`Operating surface windows: ${snapshot.summary.operatingSurfaceWindowCount}`);
    console.log(`Raw titles included: ${snapshot.summary.rawWindowTitlesIncluded}`);
    console.log(`Destructive actions: ${snapshot.summary.destructiveActionsTaken}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(`holoshell-legacy-window-inventory failed: ${error.message}`);
    process.exit(1);
  }
}
