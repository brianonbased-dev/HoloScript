#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.program-registry.v0.1.0';
const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_CAPTURE = path.join(DEFAULT_TMP, 'os-ui-capture.json');
const DEFAULT_OUTPUT = path.join(DEFAULT_TMP, 'program-registry.json');
const DEFAULT_JS_OUTPUT = path.join(DEFAULT_TMP, 'program-registry.js');

function parseArgs(argv) {
  const args = {
    json: false,
    selfTest: false,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    capture: DEFAULT_CAPTURE,
    maxApps: 500,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--capture') args.capture = argv[++index];
    else if (arg === '--max-apps') args.maxApps = Number(argv[++index] || args.maxApps);
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.maxApps) || args.maxApps < 1) args.maxApps = 500;
  return args;
}

function printHelp() {
  console.log(`HoloShell program registry

Usage:
  node scripts/holoshell-program-registry.mjs [options]

Options:
  --json              Print the registry.
  --self-test         Run fixture assertions.
  --capture <path>    OS UI capture input. Defaults to .tmp/holoshell/os-ui-capture.json.
  --output <path>     Write JSON output. Defaults to .tmp/holoshell/program-registry.json.
  --js-output <path>  Write browser bootstrap JS. Defaults to .tmp/holoshell/program-registry.js.
  --max-apps <n>      Limit emitted app records. Defaults to 500.
  -h, --help          Show this help.
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

function writeJson(filePath, value) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeBrowserBootstrap(filePath, registry) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(registry, null, 2).replace(/<\/script/gi, '<\\/script');
  writeFileSync(resolved, `window.HOLOSHELL_PROGRAM_REGISTRY = ${payload};\n`, 'utf8');
  return resolved;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function hashValue(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function shortHash(value, length = 14) {
  return hashValue(value).slice(0, length);
}

function safeLower(value) {
  return String(value || '').toLowerCase();
}

function cleanName(value) {
  return String(value || '')
    .replace(/\.lnk$/i, '')
    .replace(/\.exe$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyProgram(program) {
  const text = `${program.displayName} ${program.targetPath} ${program.arguments}`.toLowerCase();
  if (/\b(chrome|edge|firefox|browser|opera|brave)\b/.test(text)) return 'browser';
  if (/\b(code|cursor|visual studio|notepad\+\+|sublime|webstorm|rider|idea)\b/.test(text)) return 'developer_tool';
  if (/\b(powershell|terminal|cmd|bash|git|node|python)\b/.test(text)) return 'command_tool';
  if (/\b(steam|epic games|minecraft|roblox|xbox)\b/.test(text)) return 'game';
  if (/\b(photoshop|blender|unity|unreal|paint|figma|canva|designer)\b/.test(text)) return 'creative_tool';
  if (/\b(word|excel|powerpoint|outlook|onenote|office|teams|zoom|slack|discord)\b/.test(text)) return 'productivity';
  if (/\b(settings|control panel|device manager|registry|windows security)\b/.test(text)) return 'system';
  return 'application';
}

function runPowerShell(script, timeoutMs = 25000) {
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true,
  });

  if (result.error) throw result.error;
  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();
  if (result.status !== 0) {
    throw new Error(stderr || stdout || `PowerShell exited with ${result.status}`);
  }
  return stdout;
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
    const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error(`PowerShell did not return JSON: ${trimmed.slice(0, 200)}`);
  }
}

function scanWindowsProgramSources(maxApps = 500) {
  if (process.platform !== 'win32') {
    return {
      startMenu: [],
      appPaths: [],
      errors: [`program registry is not implemented for ${process.platform}`],
    };
  }

  const maxShortcuts = Math.max(1, Math.min(2000, Number(maxApps) * 2));
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$errors = New-Object System.Collections.Generic.List[string]
$startMenu = New-Object System.Collections.Generic.List[object]
$appPaths = New-Object System.Collections.Generic.List[object]
$maxShortcuts = ${maxShortcuts}
try {
  $shell = New-Object -ComObject WScript.Shell
  $roots = @(
    [Environment]::GetFolderPath('CommonStartMenu'),
    [Environment]::GetFolderPath('StartMenu')
  ) | Where-Object { $_ } | ForEach-Object { Join-Path $_ 'Programs' } | Where-Object { Test-Path $_ } | Select-Object -Unique
  foreach ($root in $roots) {
    Get-ChildItem -LiteralPath $root -Recurse -Filter *.lnk -File | Sort-Object FullName | Select-Object -First $maxShortcuts | ForEach-Object {
      try {
        $shortcut = $shell.CreateShortcut($_.FullName)
        $startMenu.Add([pscustomobject]@{
          displayName = [IO.Path]::GetFileNameWithoutExtension($_.Name)
          shortcutPath = $_.FullName
          targetPath = [string]$shortcut.TargetPath
          arguments = [string]$shortcut.Arguments
          workingDirectory = [string]$shortcut.WorkingDirectory
          iconLocation = [string]$shortcut.IconLocation
          source = 'start_menu'
        })
      } catch {
        $errors.Add("shortcut:$($_.FullName):$($_.Exception.Message)")
      }
    }
  }
} catch {
  $errors.Add("start_menu:$($_.Exception.Message)")
}

try {
  $registryRoots = @(
    @{ hive = [Microsoft.Win32.RegistryHive]::LocalMachine; view = [Microsoft.Win32.RegistryView]::Registry64; name = 'hklm64' },
    @{ hive = [Microsoft.Win32.RegistryHive]::LocalMachine; view = [Microsoft.Win32.RegistryView]::Registry32; name = 'hklm32' },
    @{ hive = [Microsoft.Win32.RegistryHive]::CurrentUser; view = [Microsoft.Win32.RegistryView]::Registry64; name = 'hkcu64' },
    @{ hive = [Microsoft.Win32.RegistryHive]::CurrentUser; view = [Microsoft.Win32.RegistryView]::Registry32; name = 'hkcu32' }
  )
  foreach ($root in $registryRoots) {
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($root.hive, $root.view).OpenSubKey('SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths')
    if ($null -eq $base) { continue }
    foreach ($name in $base.GetSubKeyNames()) {
      try {
        $key = $base.OpenSubKey($name)
        $target = [string]$key.GetValue('')
        if ([string]::IsNullOrWhiteSpace($target)) { continue }
        $appPaths.Add([pscustomobject]@{
          displayName = [IO.Path]::GetFileNameWithoutExtension($name)
          registryName = $name
          targetPath = $target
          path = [string]$key.GetValue('Path')
          source = "app_paths:$($root.name)"
        })
      } catch {
        $errors.Add("app_path:$($name):$($_.Exception.Message)")
      }
    }
  }
} catch {
  $errors.Add("app_paths:$($_.Exception.Message)")
}

[pscustomobject]@{
  startMenu = $startMenu
  appPaths = $appPaths
  errors = $errors
} | ConvertTo-Json -Depth 8
`;

  return extractJson(runPowerShell(script, 90000));
}

function fixtureSources() {
  return {
    startMenu: [
      {
        displayName: 'Fixture Browser',
        shortcutPath: 'C:/Fixture/Fixture Browser.lnk',
        targetPath: 'C:/Fixture/browser.exe',
        arguments: '',
        workingDirectory: 'C:/Fixture',
        iconLocation: '',
        source: 'start_menu',
      },
      {
        displayName: 'Fixture Editor',
        shortcutPath: 'C:/Fixture/Fixture Editor.lnk',
        targetPath: 'C:/Fixture/editor.exe',
        arguments: '--safe',
        workingDirectory: 'C:/Fixture',
        iconLocation: '',
        source: 'start_menu',
      },
    ],
    appPaths: [
      {
        displayName: 'fixture-tool',
        registryName: 'fixture-tool.exe',
        targetPath: 'C:/Fixture/tool.exe',
        path: 'C:/Fixture',
        source: 'app_paths:hklm64',
      },
    ],
    errors: [],
  };
}

function runningWindows(args) {
  const capture = readJson(args.capture, null);
  return Array.isArray(capture?.windows) ? capture.windows.map((window) => ({
    id: window.id,
    title: window.title || '',
    processId: window.processId || 0,
    processName: window.processName || '',
    handle: window.handle || '',
    controlCount: Array.isArray(window.controls) ? window.controls.length : 0,
  })) : [];
}

function normalizeProgram(raw, index) {
  const displayName = cleanName(raw.displayName || raw.registryName || raw.targetPath || `Program ${index + 1}`);
  const targetPath = String(raw.targetPath || '').trim();
  const argumentsText = String(raw.arguments || '').trim();
  const workingDirectory = String(raw.workingDirectory || raw.path || '').trim();
  const source = String(raw.source || 'unknown');
  const launchable = Boolean(targetPath || raw.shortcutPath);
  const base = {
    displayName,
    targetPath,
    arguments: argumentsText,
    workingDirectory,
    shortcutPath: raw.shortcutPath || '',
    registryName: raw.registryName || '',
    source,
  };
  return {
    id: `program-${shortHash(base)}`,
    displayName,
    source,
    capabilityClass: classifyProgram(base),
    trustState: launchable ? 'partial' : 'unknown',
    permissionEnvelope: 'guarded_execute',
    launchable,
    launchTarget: {
      type: targetPath ? 'path' : raw.shortcutPath ? 'shortcut' : 'unknown',
      targetPath,
      arguments: argumentsText,
      workingDirectory,
      shortcutPath: raw.shortcutPath || '',
      registryName: raw.registryName || '',
    },
    receiptRequired: true,
  };
}

function dedupePrograms(programs) {
  const seen = new Set();
  const deduped = [];
  for (const program of programs) {
    const key = `${safeLower(program.displayName)}|${safeLower(program.launchTarget.targetPath)}|${safeLower(program.launchTarget.arguments)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(program);
  }
  return deduped;
}

function correlateRunning(programs, windows) {
  return programs.map((program) => {
    const targetName = cleanName(path.basename(program.launchTarget.targetPath || program.launchTarget.registryName || ''));
    const match = windows.find((window) => {
      const processName = cleanName(window.processName);
      return targetName && processName && (safeLower(targetName) === safeLower(processName) || safeLower(program.displayName).includes(safeLower(processName)));
    });
    return {
      ...program,
      runningWindowId: match?.id || '',
      runningWindowTitle: match?.title || '',
      runningProcessName: match?.processName || '',
    };
  });
}

function buildRegistry(args) {
  const generatedAt = new Date().toISOString();
  const sources = args.selfTest ? fixtureSources() : scanWindowsProgramSources(args.maxApps);
  const windows = args.selfTest ? [
    { id: 'window-fixture-browser', title: 'Fixture Browser', processId: 102, processName: 'browser', handle: '1002', controlCount: 0 },
  ] : runningWindows(args);
  const rawPrograms = [
    ...(Array.isArray(sources.startMenu) ? sources.startMenu : []),
    ...(Array.isArray(sources.appPaths) ? sources.appPaths : []),
  ];
  const programs = correlateRunning(
    dedupePrograms(rawPrograms.map(normalizeProgram))
      .sort((left, right) => left.displayName.localeCompare(right.displayName))
      .slice(0, args.maxApps),
    windows,
  );
  const sourceCounts = programs.reduce((counts, program) => {
    const source = program.source.split(':')[0];
    counts[source] = (counts[source] || 0) + 1;
    return counts;
  }, {});
  const classCounts = programs.reduce((counts, program) => {
    counts[program.capabilityClass] = (counts[program.capabilityClass] || 0) + 1;
    return counts;
  }, {});

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-hardware-control.hsplus',
      adapter: 'scripts/holoshell-program-registry.mjs',
      osUiCapture: 'apps/holoshell/source/holoshell-os-ui-capture.hsplus',
    },
    host: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      hostname: os.hostname(),
    },
    summary: {
      status: programs.length ? 'captured' : 'empty',
      programCount: programs.length,
      launchableProgramCount: programs.filter((program) => program.launchable).length,
      runningWindowCount: windows.length,
      startMenuProgramCount: sourceCounts.start_menu || 0,
      appPathProgramCount: sourceCounts.app_paths || 0,
      classCounts,
      errorCount: Array.isArray(sources.errors) ? sources.errors.length : 0,
      permissionEnvelope: 'guarded_execute_for_launch',
      actionBridgeStatus: 'guarded_execute_available',
    },
    programs,
    runningWindows: windows,
    errors: Array.isArray(sources.errors) ? sources.errors.slice(0, 50) : [],
    receipt: {
      registryHash: hashValue({
        programs: programs.map((program) => ({
          id: program.id,
          displayName: program.displayName,
          source: program.source,
          targetPath: program.launchTarget.targetPath,
        })),
        windows,
      }),
      secretsCaptured: false,
    },
  };
}

function assertSelfTest(registry) {
  const failures = [];
  if (registry.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (registry.summary.programCount !== 3) failures.push('expected fixture program count');
  if (!registry.summary.launchableProgramCount) failures.push('expected launchable fixture programs');
  if (!registry.programs.some((program) => program.capabilityClass === 'browser')) failures.push('expected browser classification');
  if (!registry.programs.some((program) => program.runningWindowId)) failures.push('expected running correlation');
  if (registry.receipt.secretsCaptured) failures.push('registry must not capture secrets');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  const registry = buildRegistry(args);
  if (args.selfTest) assertSelfTest(registry);
  const output = writeJson(args.output, registry);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, registry);

  if (args.json) {
    console.log(JSON.stringify(registry, null, 2));
  } else {
    console.log(`HoloShell program registry: ${output}`);
    console.log(`HoloShell browser bootstrap: ${jsOutput}`);
    console.log(`Programs: ${registry.summary.programCount}`);
    console.log(`Launchable: ${registry.summary.launchableProgramCount}`);
    console.log(`Running windows: ${registry.summary.runningWindowCount}`);
  }
} catch (error) {
  console.error(`holoshell-program-registry failed: ${error.message}`);
  process.exit(1);
}
