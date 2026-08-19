#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const SCHEMA_VERSION = 'hololand.holoshell.os-ui-capture.v0.1.0';
const DEFAULT_OUTPUT = path.join('.tmp', 'holoshell', 'os-ui-capture.json');
const DEFAULT_HOLO_OUTPUT = path.join('.tmp', 'holoshell', 'os-ui-capture.holo');
const DEFAULT_JS_OUTPUT = path.join('.tmp', 'holoshell', 'os-ui-capture.js');
const REPO_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

function parseArgs(argv) {
  const args = {
    json: false,
    output: DEFAULT_OUTPUT,
    holoOutput: DEFAULT_HOLO_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    selfTest: false,
    includeMinimized: false,
    uiAutomation: true,
    tmpDir: path.join('.tmp', 'holoshell'),
    targetApp: '',
    maxWindows: 24,
    maxControlsPerWindow: 80,
    targetShapes: 1200,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') args.json = true;
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--holo-output') args.holoOutput = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--include-minimized') args.includeMinimized = true;
    else if (arg === '--no-ui-automation') args.uiAutomation = false;
    else if (arg === '--tmp-dir') args.tmpDir = argv[++index];
    else if (arg === '--target-app' || arg === '--target-process') args.targetApp = argv[++index];
    else if (arg === '--max-windows') args.maxWindows = Number(argv[++index]);
    else if (arg === '--max-controls-per-window') args.maxControlsPerWindow = Number(argv[++index]);
    else if (arg === '--target-shapes') args.targetShapes = Number(argv[++index]);
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  args.maxWindows = clampInteger(args.maxWindows, 1, 64, 24);
  args.maxControlsPerWindow = clampInteger(args.maxControlsPerWindow, 0, 400, 80);
  args.targetShapes = clampInteger(args.targetShapes, 128, 5000, 1200);
  return args;
}

function printHelp() {
  console.log(`HoloShell OS UI capture bridge

Usage:
  node scripts/holoshell-os-ui-capture.mjs [options]

Options:
  --json                         Print capture JSON.
  --output <path>                Write capture JSON. Defaults to .tmp/holoshell/os-ui-capture.json.
  --holo-output <path>           Write generated .holo graph. Defaults to .tmp/holoshell/os-ui-capture.holo.
  --js-output <path>             Write browser bootstrap JS. Defaults to .tmp/holoshell/os-ui-capture.js.
  --self-test                    Assert capture and geometry invariants.
  --include-minimized            Include minimized windows.
  --no-ui-automation             Skip UIAutomation control discovery.
  --tmp-dir <path>               HoloShell temp feed directory. Defaults to .tmp/holoshell.
  --target-app <name>            Select this app/window for reconstruction. Defaults to first legacy capture candidate.
  --target-process <name>        Alias for --target-app.
  --max-windows <n>              Visible window cap. Defaults to 24.
  --max-controls-per-window <n>  Accessibility control cap per window. Defaults to 80.
  --target-shapes <n>            Geometric shard target for selected window. Defaults to 1200.
  -h, --help                     Show this help.
`);
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function stableId(...parts) {
  return createHash('sha256')
    .update(parts.map((part) => String(part ?? '')).join('|'))
    .digest('hex')
    .slice(0, 14);
}

function sanitizeText(value, fallback = '') {
  return String(value ?? fallback)
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function safeIdentifier(value, fallback = 'node') {
  const text = String(value || fallback)
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const normalized = text || fallback;
  return /^[A-Za-z_]/.test(normalized) ? normalized : `_${normalized}`;
}

function runPowerShell(script, timeoutMs = 30000) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const candidates = ['powershell.exe', 'pwsh.exe'];
  let lastResult = null;

  for (const command of candidates) {
    const result = spawnSync(command, [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encoded,
    ], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: timeoutMs,
      windowsHide: true,
    });
    lastResult = result;
    if (result.status === 0 && (result.stdout || '').trim()) break;
    if (result.error?.code === 'ENOENT') continue;
    break;
  }

  return {
    ok: lastResult?.status === 0,
    status: lastResult?.status,
    stdout: lastResult?.stdout || '',
    stderr: lastResult?.stderr || '',
    error: lastResult?.error?.message,
  };
}

function extractJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {}
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch {}
  }
  return null;
}

function readJson(filePath, fallback = {}) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) return fallback;
  try {
    return JSON.parse(readFileSync(resolved, 'utf8'));
  } catch (error) {
    return { ...fallback, readError: error.message };
  }
}

function normalizeAppKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\.exe$/i, '')
    .replace(/^microsoft\s+/, '')
    .replace(/^google\s+/, '')
    .replace(/[^a-z0-9]+/g, '');
}

function appKeyAliases(value) {
  const key = normalizeAppKey(value);
  const aliases = new Set([key]);
  if (key === 'googlechrome') aliases.add('chrome');
  if (key === 'chrome') aliases.add('googlechrome');
  if (key === 'microsoftedge' || key === 'edge') aliases.add('msedge');
  if (key === 'msedge') aliases.add('edge').add('microsoftedge');
  if (key === 'windowssettings' || key === 'settings') aliases.add('systemsettings');
  if (key === 'systemsettings') aliases.add('settings').add('windowssettings');
  if (key === 'fileexplorer') aliases.add('explorer');
  if (key === 'explorer') aliases.add('fileexplorer');
  return aliases;
}

function windowMatchKeys(window) {
  const keys = new Set();
  for (const value of [window.processName, window.title, window.className]) {
    for (const key of appKeyAliases(value)) {
      if (key) keys.add(key);
    }
  }
  return keys;
}

function appGroupKeys(group) {
  const keys = new Set();
  for (const value of [group.appName, group.label, group.archetype]) {
    for (const key of appKeyAliases(value)) {
      if (key) keys.add(key);
    }
  }
  return keys;
}

function loadLegacyAbsorption(tmpDir) {
  return readJson(path.join(tmpDir || path.join('.tmp', 'holoshell'), 'legacy-app-absorption.json'), {});
}

function loadLegacyWindowInventory(tmpDir) {
  return readJson(path.join(tmpDir || path.join('.tmp', 'holoshell'), 'legacy-window-inventory.json'), {});
}

function inferTargetApp(legacyAbsorption) {
  const recommendations = Array.isArray(legacyAbsorption.recommendations)
    ? legacyAbsorption.recommendations
    : [];
  const recommendation = recommendations.find((item) => item?.appName && /^capture_/i.test(item.action || ''))
    || recommendations.find((item) => item?.appName && item.priority === 'high')
    || recommendations.find((item) => item?.appName);
  if (recommendation?.appName) {
    return { appName: recommendation.appName, source: 'legacy_absorption_recommendation' };
  }

  const groups = Array.isArray(legacyAbsorption.appGroups) ? legacyAbsorption.appGroups : [];
  const group = groups.find((item) => item?.captureCandidate && item?.surfaceRole === 'legacy_app_surface')
    || groups.find((item) => item?.captureCandidate);
  if (group?.appName) {
    return { appName: group.appName, source: 'legacy_absorption_candidate' };
  }

  return { appName: '', source: 'foreground' };
}

function findLegacyGroup(legacyAbsorption, window) {
  const groups = Array.isArray(legacyAbsorption.appGroups) ? legacyAbsorption.appGroups : [];
  if (!groups.length || !window) return null;
  const keys = windowMatchKeys(window);
  const pid = Number(window.processId || 0);

  const keyMatch = groups.find((group) => {
    const groupKeys = appGroupKeys(group);
    for (const key of groupKeys) {
      if (keys.has(key)) return true;
    }
    return false;
  });
  if (keyMatch) return keyMatch;

  const processKey = normalizeAppKey(window.processName);
  if (['windowsterminal', 'terminal', 'powershell', 'pwsh', 'cmd'].includes(processKey)) {
    const terminalGroup = groups.find((group) => group.appName === 'terminal');
    if (terminalGroup) return terminalGroup;
  }

  return groups.find((group) => pid && Array.isArray(group.samplePids) && group.samplePids.includes(pid)) || null;
}

function legacySurfaceForGroup(group) {
  if (!group) {
    return {
      appName: '',
      label: '',
      archetype: 'unknown_legacy_app',
      surfaceRole: 'legacy_app_surface',
      mutationPolicy: 'preflight_required',
      captureCandidate: false,
      preflightRequired: true,
      safeActions: ['observe_process', 'capture_window', 'map_visible_controls'],
      blockedActions: ['click_destructive_ui', 'change_app_setting', 'alter_registry', 'uninstall_app', 'submit_form', 'close_window'],
      preflightTool: 'holoshell_preflight_legacy_app_mutation',
      receiptRequired: true,
    };
  }
  return {
    appName: group.appName || '',
    label: group.label || group.appName || '',
    archetype: group.archetype || 'legacy_window',
    surfaceRole: group.surfaceRole || 'legacy_app_surface',
    mutationPolicy: group.mutationPolicy || 'preflight_required',
    captureCandidate: Boolean(group.captureCandidate),
    preflightRequired: group.preflightRequired !== false,
    safeActions: Array.isArray(group.safeActions) ? group.safeActions.slice(0, 12) : ['capture_window'],
    blockedActions: Array.isArray(group.blockedActions) ? group.blockedActions.slice(0, 16) : [],
    preflightTool: group.preflightTool || 'holoshell_preflight_legacy_app_mutation',
    receiptRequired: group.receiptRequired !== false,
  };
}

function enrichWindowWithLegacySurface(window, legacyAbsorption) {
  const group = findLegacyGroup(legacyAbsorption, window);
  return {
    ...window,
    legacySurface: legacySurfaceForGroup(group),
  };
}

function matchesTargetApp(window, targetApp) {
  const targetKeys = appKeyAliases(targetApp);
  if (!targetKeys.size || !window) return false;
  const keys = windowMatchKeys(window);
  if (window.legacySurface) {
    for (const key of appGroupKeys(window.legacySurface)) keys.add(key);
  }
  for (const key of targetKeys) {
    if (key && keys.has(key)) return true;
  }
  return false;
}

function findInventoryTargetWindow(legacyWindowInventory, targetApp) {
  const targetKeys = appKeyAliases(targetApp);
  const windows = Array.isArray(legacyWindowInventory.windows) ? legacyWindowInventory.windows : [];
  return windows.find((window) => {
    const keys = new Set();
    for (const value of [window.appName, window.processName, window.titleLabel]) {
      for (const key of appKeyAliases(value)) {
        if (key) keys.add(key);
      }
    }
    for (const key of targetKeys) {
      if (key && keys.has(key)) return true;
    }
    return false;
  }) || null;
}

function inventoryTargetToWindow(inventoryWindow, targetApp, legacyAbsorption) {
  if (!inventoryWindow) return null;
  const appName = inventoryWindow.appName || targetApp || inventoryWindow.processName || 'legacy';
  const label = sanitizeText(inventoryWindow.titleLabel || appName, appName);
  const id = inventoryWindow.windowId || `window-${stableId('inventory', appName, inventoryWindow.pid, label)}`;
  const window = {
    id,
    title: label,
    className: 'legacy_window_inventory',
    processId: Number(inventoryWindow.pid || 0),
    processName: sanitizeText(inventoryWindow.processName, appName),
    handle: '',
    visible: true,
    minimized: false,
    foreground: false,
    bounds: {
      left: 0,
      top: 0,
      right: 1280,
      bottom: 720,
      width: 1280,
      height: 720,
    },
    controls: [],
    captureEvidence: 'legacy_window_inventory',
    shellObject: {
      id: `shell-${id}`,
      kind: 'legacy_window',
      label,
      launchable: false,
      permissionEnvelope: 'read_only',
      replacementPath: 'wrap_then_reimagine',
      receiptRequired: true,
    },
  };
  return enrichWindowWithLegacySurface(window, legacyAbsorption);
}

function createWindowsCaptureScript(args) {
  const includeMinimized = args.includeMinimized ? '$true' : '$false';
  const useUiAutomation = args.uiAutomation ? '$true' : '$false';
  return `
$ErrorActionPreference = "Stop"
$includeMinimized = ${includeMinimized}
$useUiAutomation = ${useUiAutomation}
$maxWindows = ${args.maxWindows}
$maxControlsPerWindow = ${args.maxControlsPerWindow}

Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public class HoloShellBounds {
  public int left { get; set; }
  public int top { get; set; }
  public int right { get; set; }
  public int bottom { get; set; }
  public int width { get; set; }
  public int height { get; set; }
}

public class HoloShellWindowInfo {
  public string handle { get; set; }
  public string title { get; set; }
  public string className { get; set; }
  public int processId { get; set; }
  public string processName { get; set; }
  public bool visible { get; set; }
  public bool minimized { get; set; }
  public bool foreground { get; set; }
  public HoloShellBounds bounds { get; set; }
}

public class HoloShellWin32Capture {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern int GetWindowTextLength(IntPtr hWnd);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  public static List<HoloShellWindowInfo> Capture(bool includeMinimized, int maxWindows) {
    var output = new List<HoloShellWindowInfo>();
    IntPtr foreground = GetForegroundWindow();

    EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
      if (output.Count >= maxWindows) return false;
      if (!IsWindowVisible(hWnd)) return true;
      bool minimized = IsIconic(hWnd);
      if (minimized && !includeMinimized) return true;

      int textLength = GetWindowTextLength(hWnd);
      if (textLength <= 0) return true;

      var title = new StringBuilder(textLength + 1);
      GetWindowText(hWnd, title, title.Capacity);
      string titleText = title.ToString().Trim();
      if (titleText.Length == 0) return true;

      RECT rect;
      if (!GetWindowRect(hWnd, out rect)) return true;
      int width = rect.Right - rect.Left;
      int height = rect.Bottom - rect.Top;
      if (width <= 24 || height <= 24) return true;

      uint processId;
      GetWindowThreadProcessId(hWnd, out processId);
      string processName = "";
      try {
        processName = Process.GetProcessById((int)processId).ProcessName;
      } catch {}

      var className = new StringBuilder(256);
      GetClassName(hWnd, className, className.Capacity);

      output.Add(new HoloShellWindowInfo {
        handle = hWnd.ToInt64().ToString(),
        title = titleText,
        className = className.ToString(),
        processId = (int)processId,
        processName = processName,
        visible = true,
        minimized = minimized,
        foreground = hWnd == foreground,
        bounds = new HoloShellBounds {
          left = rect.Left,
          top = rect.Top,
          right = rect.Right,
          bottom = rect.Bottom,
          width = width,
          height = height
        }
      });
      return true;
    }, IntPtr.Zero);

    return output;
  }
}
"@

$rawWindows = [HoloShellWin32Capture]::Capture($includeMinimized, $maxWindows)
$uiAutomationStatus = if ($useUiAutomation) { "attempted" } else { "skipped" }
$uiAutomationError = $null

if ($useUiAutomation) {
  try {
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    $uiAutomationStatus = "available"
  } catch {
    $uiAutomationStatus = "unavailable"
    $uiAutomationError = $_.Exception.Message
  }
}

$windows = @()
foreach ($window in @($rawWindows)) {
  $controls = @()
  if ($uiAutomationStatus -eq "available" -and $maxControlsPerWindow -gt 0) {
    try {
      $element = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]::new([Int64]$window.handle))
      if ($null -ne $element) {
        $descendants = $element.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
        $count = 0
        foreach ($child in $descendants) {
          if ($count -ge $maxControlsPerWindow) { break }
          $current = $child.Current
          $bounds = $current.BoundingRectangle
          if ($bounds.Width -le 0 -or $bounds.Height -le 0) { continue }
          $controls += [pscustomobject]@{
            name = $current.Name
            automationId = $current.AutomationId
            className = $current.ClassName
            controlType = ($current.ControlType.ProgrammaticName -replace '^ControlType\\.', '')
            enabled = $current.IsEnabled
            offscreen = $current.IsOffscreen
            bounds = [pscustomobject]@{
              left = [int]$bounds.Left
              top = [int]$bounds.Top
              right = [int]$bounds.Right
              bottom = [int]$bounds.Bottom
              width = [int]$bounds.Width
              height = [int]$bounds.Height
            }
          }
          $count += 1
        }
      }
    } catch {
      if ($null -eq $uiAutomationError) { $uiAutomationError = $_.Exception.Message }
    }
  }

  $windows += [pscustomobject]@{
    handle = $window.handle
    title = $window.title
    className = $window.className
    processId = $window.processId
    processName = $window.processName
    visible = $window.visible
    minimized = $window.minimized
    foreground = $window.foreground
    bounds = $window.bounds
    controls = $controls
  }
}

[pscustomobject]@{
  status = "ok"
  uiAutomation = [pscustomobject]@{
    status = $uiAutomationStatus
    error = $uiAutomationError
  }
  windows = $windows
} | ConvertTo-Json -Depth 16
`;
}

function captureWindows(args) {
  if (process.platform !== 'win32') {
    return {
      status: 'unsupported_platform',
      uiAutomation: { status: 'unavailable', error: 'Win32 capture only in first bridge slice' },
      windows: [],
      error: `Unsupported platform: ${process.platform}`,
    };
  }

  const result = runPowerShell(createWindowsCaptureScript(args), 45000);
  const parsed = extractJson(result.stdout);
  if (!result.ok || !parsed) {
    return {
      status: 'error',
      uiAutomation: { status: 'unknown', error: result.stderr || result.error || 'PowerShell capture failed' },
      windows: [],
      error: result.stderr || result.error || 'PowerShell capture produced no JSON',
      statusCode: result.status,
    };
  }

  return parsed;
}

function normalizeBounds(bounds = {}) {
  const width = Math.max(0, Number(bounds.width || Number(bounds.right || 0) - Number(bounds.left || 0)));
  const height = Math.max(0, Number(bounds.height || Number(bounds.bottom || 0) - Number(bounds.top || 0)));
  return {
    left: Math.round(Number(bounds.left || 0)),
    top: Math.round(Number(bounds.top || 0)),
    right: Math.round(Number(bounds.right || Number(bounds.left || 0) + width)),
    bottom: Math.round(Number(bounds.bottom || Number(bounds.top || 0) + height)),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function normalizeControl(control, windowId, index) {
  const bounds = normalizeBounds(control.bounds);
  const controlType = sanitizeText(control.controlType, 'unknown') || 'unknown';
  const name = sanitizeText(control.name, controlType) || controlType;
  const automationId = sanitizeText(control.automationId);
  return {
    id: `control-${stableId(windowId, index, name, automationId, controlType)}`,
    name,
    automationId,
    className: sanitizeText(control.className),
    controlType,
    enabled: Boolean(control.enabled),
    offscreen: Boolean(control.offscreen),
    bounds,
    shellSemantics: {
      objectKind: 'legacy_control',
      intentAddressable: Boolean(name || automationId),
      actionBridge: 'guarded_execute_pending',
    },
  };
}

function normalizeWindow(window, index) {
  const title = sanitizeText(window.title, `Window ${index + 1}`);
  const processName = sanitizeText(window.processName, 'unknown');
  const bounds = normalizeBounds(window.bounds);
  const id = `window-${stableId(window.handle, title, processName, bounds.left, bounds.top, bounds.width, bounds.height)}`;
  const controls = Array.isArray(window.controls)
    ? window.controls.map((control, controlIndex) => normalizeControl(control, id, controlIndex))
    : [];

  return {
    id,
    title,
    className: sanitizeText(window.className),
    processId: Number(window.processId || 0),
    processName,
    handle: String(window.handle || ''),
    visible: Boolean(window.visible),
    minimized: Boolean(window.minimized),
    foreground: Boolean(window.foreground),
    bounds,
    controls,
    shellObject: {
      id: `shell-${id}`,
      kind: 'legacy_window',
      label: title,
      launchable: false,
      permissionEnvelope: 'read_only',
      replacementPath: 'wrap_then_reimagine',
      receiptRequired: true,
    },
  };
}

function colorForRole(role, index) {
  if (role === 'titlebar') return index % 2 ? '#72f0d3' : '#f0c66e';
  if (role === 'border') return '#8fffe9';
  if (role === 'control') return '#ffb25f';
  if (role === 'foreground') return '#a8a0ff';
  return index % 3 === 0 ? '#36e5ff' : index % 3 === 1 ? '#79ffa8' : '#9bb7ff';
}

function makeGeometryNodes(window, targetShapes) {
  if (!window) return [];
  const bounds = window.bounds || { width: 1200, height: 800 };
  const aspect = Math.max(0.5, Math.min(2.4, bounds.width / Math.max(1, bounds.height)));
  const columns = Math.max(12, Math.ceil(Math.sqrt(targetShapes * aspect)));
  const rows = Math.max(8, Math.ceil(targetShapes / columns));
  const cellWidth = 8 / columns;
  const cellHeight = 4.8 / rows;
  const nodes = [];

  for (let row = 0; row < rows && nodes.length < targetShapes; row += 1) {
    for (let column = 0; column < columns && nodes.length < targetShapes; column += 1) {
      const edge = row === 0 || column === 0 || row === rows - 1 || column === columns - 1;
      const titlebar = row < Math.max(1, Math.floor(rows * 0.08));
      const foreground = window.foreground && row % 11 === 0 && column % 7 === 0;
      const role = titlebar ? 'titlebar' : edge ? 'border' : foreground ? 'foreground' : 'content';
      const index = nodes.length;
      nodes.push({
        id: `geom-${index.toString().padStart(4, '0')}`,
        role,
        sourceWindowId: window.id,
        sourceControlId: null,
        geometry: role === 'titlebar' ? 'cube' : 'plane',
        position: [
          Number((-4 + column * cellWidth + cellWidth / 2).toFixed(4)),
          Number((2.4 - row * cellHeight - cellHeight / 2).toFixed(4)),
          Number((-2.6 + (foreground ? 0.08 : 0)).toFixed(4)),
        ],
        scale: [
          Number((cellWidth * (edge ? 0.9 : 0.74)).toFixed(4)),
          Number((cellHeight * (titlebar ? 0.9 : 0.62)).toFixed(4)),
          role === 'titlebar' ? 0.035 : 0.01,
        ],
        color: colorForRole(role, index),
        opacity: role === 'content' ? 0.42 : 0.72,
      });
    }
  }

  const controlNodes = [];
  for (const [controlIndex, control] of window.controls.slice(0, 96).entries()) {
    const relativeLeft = (control.bounds.left - bounds.left) / Math.max(1, bounds.width);
    const relativeTop = (control.bounds.top - bounds.top) / Math.max(1, bounds.height);
    const relativeWidth = control.bounds.width / Math.max(1, bounds.width);
    const relativeHeight = control.bounds.height / Math.max(1, bounds.height);
    if (!Number.isFinite(relativeLeft) || !Number.isFinite(relativeTop)) continue;
    if (relativeWidth <= 0 || relativeHeight <= 0) continue;
    if (relativeWidth > 0.72 || relativeHeight > 0.62 || relativeWidth * relativeHeight > 0.18) {
      continue;
    }
    controlNodes.push({
      id: `control-geom-${controlIndex.toString().padStart(3, '0')}`,
      role: 'control',
      sourceWindowId: window.id,
      sourceControlId: control.id,
      geometry: 'cube',
      label: control.name || control.controlType,
      position: [
        Number((-4 + relativeLeft * 8 + relativeWidth * 4).toFixed(4)),
        Number((2.4 - relativeTop * 4.8 - relativeHeight * 2.4).toFixed(4)),
        -2.42,
      ],
      scale: [
        Number(Math.max(0.05, relativeWidth * 8).toFixed(4)),
        Number(Math.max(0.035, relativeHeight * 4.8).toFixed(4)),
        0.08,
      ],
      color: colorForRole('control', controlIndex),
      opacity: control.offscreen ? 0.28 : 0.82,
    });
  }

  return [...nodes, ...controlNodes];
}

function makeActionDryRun(window) {
  const control = window?.controls?.find((item) => item.enabled && !item.offscreen && item.name)
    || window?.controls?.find((item) => item.enabled && !item.offscreen)
    || null;
  const legacySurface = window?.legacySurface || {};

  return {
    mode: 'dry_run',
    status: control ? 'route_planned' : 'window_focus_only',
    permissionEnvelope: 'guarded_execute',
    approvalRequired: true,
    selectedWindowId: window?.id || null,
    selectedControlId: control?.id || null,
    selectedAppName: legacySurface.appName || window?.processName || '',
    mutationPolicy: legacySurface.mutationPolicy || 'preflight_required',
    preflightRequired: legacySurface.preflightRequired !== false,
    preflightTool: legacySurface.preflightTool || 'holoshell_preflight_legacy_app_mutation',
    safeActions: Array.isArray(legacySurface.safeActions) ? legacySurface.safeActions.slice(0, 8) : [],
    blockedActions: Array.isArray(legacySurface.blockedActions) ? legacySurface.blockedActions.slice(0, 8) : [],
    proposedAction: control
      ? {
          kind: 'invoke_control',
          label: control.name || control.controlType,
          controlType: control.controlType,
          rollback: 'app_specific_or_manual',
        }
      : {
          kind: 'focus_window',
          label: window?.title || 'unknown window',
          rollback: 'manual',
        },
    note: 'No legacy UI mutation was executed. This receipt proves the bridge can address a target and names the permission envelope for the future action adapter.',
  };
}

function makeHoloGraph(capture) {
  const selected = capture.selectedWindow;
  const safeWindowName = safeIdentifier(selected?.title || 'CapturedWindow', 'CapturedWindow').slice(0, 42);
  const lines = [
    '// Generated by scripts/holoshell-os-ui-capture.mjs',
    '// Read-only projection of a captured legacy UI surface.',
    '',
    'composition "HoloShell Captured Legacy Surface" {',
    '  metadata {',
    `    schemaVersion: "${SCHEMA_VERSION}"`,
    `    generatedAt: "${capture.generatedAt}"`,
    `    sourceWindowId: "${selected?.id || ''}"`,
    `    sourceWindowTitle: ${JSON.stringify(selected?.title || '')}`,
    `    geometryNodeCount: ${capture.summary.geometryNodeCount}`,
    `    actionBridgeStatus: "${capture.actionDryRun.status}"`,
    '  }',
    '',
    '  environment {',
    '    theme: "holo_os_legacy_reconstruction"',
    '    render_mode: "desktop_spatial"',
    '    background: "liquid_shell"',
    '    receipt_required: true',
    '  }',
    '',
    '  template "LegacyPixelShard" {',
    '    type: "visual_shard"',
    '    geometry: "cube"',
    '    material: "hologram_glass"',
    '    source: "os_ui_capture"',
    '    receiptRequired: false',
    '  }',
    '',
    `  spatial_group "${safeWindowName}_GeometricWrapper" {`,
    `    label: ${JSON.stringify(selected?.title || 'Captured Legacy Window')}`,
    `    source_window_id: "${selected?.id || ''}"`,
    `    source_process: ${JSON.stringify(selected?.processName || '')}`,
  ];

  for (const node of capture.geometry.nodes) {
    const objectName = safeIdentifier(node.id, 'Shard');
    lines.push(`    object "${objectName}" using "LegacyPixelShard" {`);
    lines.push(`      role: "${node.role}"`);
    lines.push(`      geometry: "${node.geometry}"`);
    lines.push(`      position: [${node.position.join(', ')}]`);
    lines.push(`      scale: [${node.scale.join(', ')}]`);
    lines.push(`      color: "${node.color}"`);
    lines.push(`      opacity: ${node.opacity}`);
    if (node.sourceControlId) lines.push(`      source_control_id: "${node.sourceControlId}"`);
    if (node.label) lines.push(`      label: ${JSON.stringify(node.label.slice(0, 80))}`);
    lines.push('    }');
  }

  lines.push('  }');
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

function createCapture(args) {
  const legacyAbsorption = loadLegacyAbsorption(args.tmpDir);
  const legacyWindowInventory = loadLegacyWindowInventory(args.tmpDir);
  const inferredTarget = inferTargetApp(legacyAbsorption);
  const targetApp = sanitizeText(args.targetApp || inferredTarget.appName);
  const targetSource = args.targetApp ? 'argument' : inferredTarget.source;
  const raw = captureWindows(args);
  const capturedWindows = Array.isArray(raw.windows)
    ? raw.windows.map((window, index) => normalizeWindow(window, index))
      .map((window) => enrichWindowWithLegacySurface(window, legacyAbsorption))
    : [];
  const targetWindow = targetApp
    ? capturedWindows.find((window) => matchesTargetApp(window, targetApp))
    : null;
  const inventoryTargetWindow = targetWindow
    ? null
    : inventoryTargetToWindow(findInventoryTargetWindow(legacyWindowInventory, targetApp), targetApp, legacyAbsorption);
  const windows = inventoryTargetWindow
    ? [inventoryTargetWindow, ...capturedWindows.filter((window) => window.id !== inventoryTargetWindow.id)]
    : capturedWindows;
  const selectedWindow = targetWindow || inventoryTargetWindow || windows.find((window) => window.foreground) || windows[0] || null;
  const geometryNodes = makeGeometryNodes(selectedWindow, args.targetShapes);
  const controlCount = windows.reduce((sum, window) => sum + window.controls.length, 0);
  const actionDryRun = makeActionDryRun(selectedWindow);
  const status = raw.status === 'ok' && windows.length > 0 ? 'captured' : raw.status === 'ok' ? 'empty' : raw.status;
  const generatedAt = new Date().toISOString();
  const receiptId = `os-ui-capture-${stableId(generatedAt, os.hostname(), selectedWindow?.id || 'none')}`;

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-os-ui-capture.hsplus',
      inventory: 'apps/holoshell/docs/HOLOSCRIPT_INCLUSION_INVENTORY.md',
      adapter: 'scripts/holoshell-os-ui-capture.mjs',
    },
    host: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
    },
    summary: {
      status,
      windowCount: windows.length,
      foregroundWindowId: windows.find((window) => window.foreground)?.id || null,
      selectedWindowId: selectedWindow?.id || null,
      targetApp,
      targetSource,
      targetMatched: Boolean(targetWindow),
      targetResolved: Boolean(targetWindow || inventoryTargetWindow),
      targetResolution: targetWindow ? 'rich_capture' : inventoryTargetWindow ? 'legacy_window_inventory' : 'foreground_fallback',
      selectedAppName: selectedWindow?.legacySurface?.appName || selectedWindow?.processName || '',
      selectedSurfaceRole: selectedWindow?.legacySurface?.surfaceRole || '',
      selectedMutationPolicy: selectedWindow?.legacySurface?.mutationPolicy || '',
      controlCount,
      uiAutomationStatus: raw.uiAutomation?.status || 'unknown',
      geometryNodeCount: geometryNodes.length,
      targetShapes: args.targetShapes,
      actionBridgeStatus: actionDryRun.status,
    },
    capture: {
      mode: 'read_only',
      includeMinimized: args.includeMinimized,
      targetApp,
      targetSource,
      targetResolution: targetWindow ? 'rich_capture' : inventoryTargetWindow ? 'legacy_window_inventory' : 'foreground_fallback',
      maxWindows: args.maxWindows,
      maxControlsPerWindow: args.maxControlsPerWindow,
      errors: [raw.error, raw.uiAutomation?.error].filter(Boolean),
    },
    windows,
    selectedWindow,
    geometry: {
      renderer: 'holo_geometric_wrapper',
      target: 'legacy_ui_reconstruction',
      density: 'thousand_shape_first_slice',
      nodes: geometryNodes,
    },
    actionDryRun,
    receipt: {
      id: receiptId,
      type: SCHEMA_VERSION,
      permissionEnvelope: 'read_only',
      mutatingActionsExecuted: false,
      proves: [
        'visible OS windows enumerated',
        'window metadata normalized as shell objects',
        'selected window reconstructed into geometric shards',
        'legacy action route planned without execution',
      ],
    },
    upstreamGaps: [
      {
        id: 'canonical-os-ui-capture-schema',
        layer: 'HoloScript',
        need: 'Promote window/control/screenshot/OCR/accessibility capture into a reusable HoloScript schema.',
      },
      {
        id: 'legacy-action-adapter',
        layer: 'HoloShell/HoloScript',
        need: 'Implement approved click/type/hotkey/focus adapters with rollback-aware receipts.',
      },
      {
        id: 'ocr-vision-fallback',
        layer: 'HoloShell',
        need: 'Add screenshot hashing, OCR text, and visual bounding boxes for apps with weak accessibility trees.',
      },
      {
        id: 'renderer-scale-proof',
        layer: 'HoloLand',
        need: 'Render generated thousand-shape graph in live R3F/WebGPU shell and capture visual proof.',
      },
    ],
  };
}

function writeJson(filePath, data) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeHolo(filePath, capture) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, makeHoloGraph(capture), 'utf8');
  return resolved;
}

function writeBrowserBootstrap(filePath, capture) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(capture, null, 2).replace(/<\/script/gi, '<\\/script');
  writeFileSync(resolved, `window.HOLOSHELL_OS_UI_CAPTURE = ${payload};\n`, 'utf8');
  return resolved;
}

function assertSelfTest(capture) {
  const failures = [];
  if (capture.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (process.platform === 'win32' && capture.summary.status === 'error') {
    failures.push(`capture failed: ${capture.capture.errors.join('; ')}`);
  }
  if (process.platform === 'win32' && capture.summary.windowCount < 1) {
    failures.push('expected at least one visible window on Windows');
  }
  if (capture.summary.geometryNodeCount < Math.min(1000, capture.summary.targetShapes)) {
    failures.push('expected thousand-shape geometric reconstruction');
  }
  if (!capture.receipt || capture.receipt.mutatingActionsExecuted !== false) {
    failures.push('expected read-only receipt with no mutating actions');
  }
  if (!capture.actionDryRun || capture.actionDryRun.permissionEnvelope !== 'guarded_execute') {
    failures.push('expected guarded action dry-run envelope');
  }
  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const capture = createCapture(args);
  const output = writeJson(args.output, capture);
  const holoOutput = writeHolo(args.holoOutput, capture);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, capture);
  if (args.selfTest) assertSelfTest(capture);

  if (args.json) {
    console.log(JSON.stringify(capture, null, 2));
  } else {
    console.log(`HoloShell OS UI capture: ${output}`);
    console.log(`HoloShell OS UI graph: ${holoOutput}`);
    console.log(`HoloShell OS UI browser bootstrap: ${jsOutput}`);
    console.log(`Windows: ${capture.summary.windowCount}`);
    console.log(`Controls: ${capture.summary.controlCount}`);
    console.log(`Geometry nodes: ${capture.summary.geometryNodeCount}`);
    console.log(`Action bridge: ${capture.summary.actionBridgeStatus}`);
  }
} catch (error) {
  console.error(`holoshell-os-ui-capture failed: ${error.message}`);
  process.exit(1);
}
