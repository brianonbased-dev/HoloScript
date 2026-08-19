#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SCHEMA_VERSION = 'hololand.holoshell.process-health.v0.1.0';
const DEFAULT_OUTPUT = path.join('.tmp', 'holoshell', 'process-health.json');
const DEFAULT_RUN_REGISTRY = path.join('.tmp', 'holoshell', 'run-registry.json');
const DEFAULT_HARDWARE_REALITY = path.join('.tmp', 'holoshell', 'hardware-reality.json');
const DEFAULT_LEGACY_WINDOWS = path.join('.tmp', 'holoshell', 'legacy-window-inventory.json');
const REPO_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const DEFAULT_STALE_MINUTES = 120;
const DEFAULT_HIGH_MEMORY_MB = 1500;
const LANE_LABELS = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
  copilot: 'Copilot',
  cursor: 'Cursor',
  ollama: 'Ollama',
};
const LANE_COLORS = {
  claude: 'violet',
  codex: 'cyan',
  gemini: 'amber',
  copilot: 'blue',
  cursor: 'indigo',
  ollama: 'gray',
};

const SHELL_RUN_NAMES = [
  'powershell',
  'pwsh',
  'cmd',
  'bash',
  'zsh',
  'sh',
  'node',
  'pnpm',
  'npm',
  'yarn',
  'python',
  'python3',
  'tsx',
  'ts-node',
  'vitest',
  'vite',
  'next',
  'playwright',
];

function parseArgs(argv) {
  const args = {
    json: false,
    output: DEFAULT_OUTPUT,
    runRegistry: DEFAULT_RUN_REGISTRY,
    hardwareReality: DEFAULT_HARDWARE_REALITY,
    legacyWindows: DEFAULT_LEGACY_WINDOWS,
    selfTest: false,
    includeCommandLines: false,
    staleMinutes: DEFAULT_STALE_MINUTES,
    highMemoryMb: DEFAULT_HIGH_MEMORY_MB,
    planStopPid: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') args.json = true;
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--run-registry') args.runRegistry = argv[++index];
    else if (arg === '--hardware-reality') args.hardwareReality = argv[++index];
    else if (arg === '--legacy-windows') args.legacyWindows = argv[++index];
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--include-command-lines') args.includeCommandLines = true;
    else if (arg === '--stale-minutes') args.staleMinutes = Number(argv[++index]);
    else if (arg === '--high-memory-mb') args.highMemoryMb = Number(argv[++index]);
    else if (arg === '--plan-stop-pid') args.planStopPid = Number(argv[++index]);
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.staleMinutes) || args.staleMinutes < 1) {
    throw new Error('--stale-minutes must be a positive number');
  }
  if (!Number.isFinite(args.highMemoryMb) || args.highMemoryMb < 1) {
    throw new Error('--high-memory-mb must be a positive number');
  }
  if (args.planStopPid !== null && (!Number.isInteger(args.planStopPid) || args.planStopPid <= 0)) {
    throw new Error('--plan-stop-pid must be a positive integer');
  }

  return args;
}

function printHelp() {
  console.log(`HoloShell process and shell-run health

Usage:
  node scripts/holoshell-process-health.mjs [options]

Options:
  --json                    Print process health JSON.
  --output <path>           Write output path. Defaults to .tmp/holoshell/process-health.json.
  --run-registry <path>     Read HoloShell run registry. Defaults to .tmp/holoshell/run-registry.json.
  --hardware-reality <path> Read lane PID evidence. Defaults to .tmp/holoshell/hardware-reality.json.
  --legacy-windows <path>   Read top-level app/window owner evidence. Defaults to .tmp/holoshell/legacy-window-inventory.json.
  --self-test               Assert process health receipt invariants.
  --include-command-lines   Include redacted command previews. Off by default for privacy.
  --stale-minutes <n>       Mark shell/dev runs older than n minutes. Default: ${DEFAULT_STALE_MINUTES}.
  --high-memory-mb <n>      Mark processes above n MB working set. Default: ${DEFAULT_HIGH_MEMORY_MB}.
  --plan-stop-pid <pid>     Emit a break-glass stop plan for a PID. Does not stop it.
  -h, --help                Show this help.
`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: 'utf8',
    timeout: options.timeoutMs || 20000,
    windowsHide: true,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error?.message,
  };
}

function extractJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {}

  const firstArray = text.indexOf('[');
  const lastArray = text.lastIndexOf(']');
  if (firstArray !== -1 && lastArray > firstArray) {
    try {
      return JSON.parse(text.slice(firstArray, lastArray + 1));
    } catch {}
  }

  const firstObject = text.indexOf('{');
  const lastObject = text.lastIndexOf('}');
  if (firstObject !== -1 && lastObject > firstObject) {
    try {
      return JSON.parse(text.slice(firstObject, lastObject + 1));
    } catch {}
  }

  return null;
}

function stableHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

function redactCommandLine(commandLine) {
  if (!commandLine) return null;
  return String(commandLine)
    .replace(new RegExp(os.homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '%USERPROFILE%')
    .replace(/[A-Za-z]:\\Users\\[^\\\s"]+/g, '%USERPROFILE%')
    .replace(/(api[-_]?key|token|secret|password|passwd|pwd|authorization)=("[^"]+"|'[^']+'|[^\s]+)/gi, '$1=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-[redacted]')
    .slice(0, 240);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function loadRunRegistry(registryPath) {
  const resolved = resolveRepoPath(registryPath);
  if (!existsSync(resolved)) {
    return {
      path: resolved,
      loaded: false,
      schemaVersion: null,
      updatedAt: null,
      runs: [],
      error: null,
    };
  }

  try {
    const registry = JSON.parse(readFileSync(resolved, 'utf8'));
    return {
      path: resolved,
      loaded: true,
      schemaVersion: registry.schemaVersion || null,
      updatedAt: registry.updatedAt || null,
      runs: Array.isArray(registry.runs) ? registry.runs : [],
      error: null,
    };
  } catch (error) {
    return {
      path: resolved,
      loaded: false,
      schemaVersion: null,
      updatedAt: null,
      runs: [],
      error: error.message,
    };
  }
}

function normalizeName(name) {
  return String(name || '').toLowerCase().replace(/\.exe$/i, '');
}

function commandTokens(commandLine) {
  return String(commandLine || '')
    .match(/"[^"]*"|'[^']*'|\S+/g)
    ?.map((token) => token.replace(/^["']|["']$/g, ''))
    .filter(Boolean) || [];
}

function tokenStem(token) {
  const normalized = String(token || '').replace(/\\/g, '/').split('/').pop() || '';
  return normalizeName(normalized)
    .replace(/\.(cmd|bat|ps1|js|cjs|mjs|ts)$/i, '');
}

function normalizeLaneId(value) {
  const raw = String(value || '').toLowerCase();
  if (!raw) return '';
  if (raw.includes('codex')) return 'codex';
  if (raw.includes('claude')) return 'claude';
  if (raw.includes('gemini') || raw.includes('antigravity')) return 'gemini';
  if (raw.includes('copilot')) return 'copilot';
  if (raw.includes('cursor')) return 'cursor';
  if (raw.includes('ollama')) return 'ollama';
  return raw.replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
}

function makeLaneOwner(laneId, overrides = {}) {
  const normalized = normalizeLaneId(laneId);
  if (!normalized || normalized === 'terminal' || normalized === 'shell') return null;
  return {
    laneId: normalized,
    laneLabel: overrides.label || LANE_LABELS[normalized] || normalized,
    agentKind: overrides.agentKind || normalized,
    surfaceKind: overrides.surfaceKind || 'agent_process',
    colorHint: overrides.colorHint || LANE_COLORS[normalized] || 'white',
    evidence: overrides.evidence || 'agent_process_name',
    parentPid: Number.isInteger(Number(overrides.parentPid)) ? Number(overrides.parentPid) : null,
    ownerPid: Number.isInteger(Number(overrides.ownerPid)) ? Number(overrides.ownerPid) : null,
    trustState: overrides.trustState || 'inferred_from_local_process_table',
  };
}

function ownerFromProcessInfo(processInfo, evidence = 'agent_process_name') {
  const stems = [
    tokenStem(processInfo.name),
    ...commandTokens(processInfo.commandLine).map(tokenStem),
  ].filter(Boolean);
  const has = (patterns) => stems.some((stem) => patterns.some((pattern) => {
    if (pattern instanceof RegExp) return pattern.test(stem);
    return stem === pattern || stem.startsWith(`${pattern}-`);
  }));

  if (has(['codex', /openai\.codex/])) return makeLaneOwner('codex', { evidence, ownerPid: processInfo.pid });
  if (has(['claude'])) return makeLaneOwner('claude', { evidence, ownerPid: processInfo.pid });
  if (has(['gemini', 'antigravity'])) return makeLaneOwner('gemini', { evidence, ownerPid: processInfo.pid });
  if (has(['copilot'])) return makeLaneOwner('copilot', { evidence, ownerPid: processInfo.pid });
  if (has(['cursor'])) return makeLaneOwner('cursor', { evidence, ownerPid: processInfo.pid });
  if (has(['ollama'])) return makeLaneOwner('ollama', { evidence, ownerPid: processInfo.pid });
  return null;
}

function readJsonIfPresent(filePath) {
  if (!filePath) return null;
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) return null;
  try {
    return JSON.parse(readFileSync(resolved, 'utf8'));
  } catch {
    return null;
  }
}

function numericPids(values) {
  return Array.isArray(values)
    ? values.map(Number).filter((pid) => Number.isInteger(pid) && pid > 0)
    : [];
}

function addOwner(ownerByPid, priorityByPid, pid, owner, priority) {
  const normalizedPid = Number(pid);
  if (!Number.isInteger(normalizedPid) || normalizedPid <= 0 || !owner?.laneId) return;
  const existingPriority = priorityByPid.get(normalizedPid) ?? -1;
  if (priority < existingPriority) return;
  ownerByPid.set(normalizedPid, { ...owner, ownerPid: owner.ownerPid || normalizedPid });
  priorityByPid.set(normalizedPid, priority);
}

function inheritedOwner(owner, parentPid, evidence = 'ancestor_pid') {
  if (!owner) return null;
  return {
    ...owner,
    evidence,
    parentPid: Number.isInteger(Number(parentPid)) ? Number(parentPid) : owner.parentPid,
  };
}

function buildOwnerEvidence(args, processes) {
  const byPid = new Map(processes.map((item) => [Number(item.pid), item]));
  const ownerByPid = new Map();
  const priorityByPid = new Map();
  const hardwareReality = readJsonIfPresent(args.hardwareReality);
  const legacyWindows = readJsonIfPresent(args.legacyWindows);

  for (const lane of Array.isArray(hardwareReality?.lanes) ? hardwareReality.lanes : []) {
    const owner = makeLaneOwner(lane.laneId || lane.agent_id, {
      label: lane.label || lane.laneLabel || lane.lane_label,
      surfaceKind: lane.surfaceKind || lane.surface || 'agent_lane',
      colorHint: lane.colorHint || lane.color || lane.lane_color,
      evidence: 'holoshell_reality_lane',
      trustState: lane.trustState || 'observed_by_holoshell_mcp',
    });
    for (const pid of numericPids(lane.pidLinks || lane.pid_links)) {
      addOwner(ownerByPid, priorityByPid, pid, owner, 80);
    }
  }

  for (const surface of Array.isArray(legacyWindows?.peerSurfaces) ? legacyWindows.peerSurfaces : []) {
    const owner = makeLaneOwner(surface.laneId || surface.agentId, {
      label: surface.label,
      agentKind: surface.peerKind,
      surfaceKind: surface.surfaceClass || 'ai_peer_surface',
      colorHint: surface.colorHint,
      evidence: surface.evidence || 'top_level_window',
      trustState: 'observed_top_level_window',
    });
    for (const pid of numericPids(surface.pids)) {
      addOwner(ownerByPid, priorityByPid, pid, owner, 70);
    }
  }

  for (const processInfo of processes) {
    const owner = ownerFromProcessInfo(processInfo);
    if (owner) addOwner(ownerByPid, priorityByPid, processInfo.pid, owner, 90);
  }

  let changed = true;
  let guard = 0;
  while (changed && guard < 24) {
    changed = false;
    guard += 1;
    for (const processInfo of processes) {
      const pid = Number(processInfo.pid);
      if (ownerByPid.has(pid)) continue;
      const parentPid = Number(processInfo.ppid);
      const parentOwner = ownerByPid.get(parentPid);
      if (!parentOwner || !byPid.has(parentPid)) continue;
      addOwner(ownerByPid, priorityByPid, pid, inheritedOwner(parentOwner, parentPid), 40);
      changed = true;
    }
  }

  return ownerByPid;
}

function classifyRun(processInfo) {
  const name = normalizeName(processInfo.name);
  const command = String(processInfo.commandLine || '').toLowerCase();
  if (/codex/.test(command)) return 'agent_codex';
  if (/claude|cursor/.test(command) || ['cursor', 'code'].includes(name)) return 'agent_or_ide';
  if (/gemini|antigravity/.test(command)) return 'agent_browser_vision';
  if (name === 'windowsterminal') return 'terminal_surface';
  if (name.includes('docker') || command.includes('\\docker\\') || command.includes('/docker/')) return 'container_service';
  if (['powershell', 'pwsh', 'cmd', 'bash', 'zsh', 'sh'].includes(name)) return 'shell';
  if (['pnpm', 'npm', 'yarn'].includes(name)) return 'package_script';
  if (['node', 'tsx', 'ts-node', 'vitest', 'vite', 'next'].includes(name)) return 'node_runtime';
  if (['python', 'python3'].includes(name)) return 'python_runtime';
  if (['chrome', 'msedge', 'firefox', 'brave', 'msedgewebview2'].includes(name)) return 'browser';
  if (['git', 'docker'].includes(name)) return 'tooling';
  return 'process';
}

function isProtectedSurfaceCategory(category) {
  return [
    'agent_codex',
    'agent_or_ide',
    'agent_browser_vision',
    'browser',
    'container_service',
    'terminal_surface',
  ].includes(category);
}

function isExpectedLongRunningDaemon(processInfo, category) {
  const command = String(processInfo.commandLine || '').toLowerCase();
  const name = normalizeName(processInfo.name);
  return category === 'container_service'
    || command.includes('holoshell-control-daemon.mjs')
    || command.includes('holoshell-network-sentinel-service.mjs')
    || (command.includes('holoshell-network-change-sentinel.mjs') && command.includes('--watch'))
    || command.includes('codex-team-daemon.mjs')
    || (name === 'node' && /\bdaemon\b/.test(command));
}

function isShellRunCandidate(processInfo, category = classifyRun(processInfo)) {
  if (isProtectedSurfaceCategory(category)) return false;
  if (category === 'tooling') return false;
  if (isExpectedLongRunningDaemon(processInfo, category)) return false;
  const name = normalizeName(processInfo.name);
  if (SHELL_RUN_NAMES.includes(name)) return true;
  const tokenNames = commandTokens(processInfo.commandLine).map(tokenStem);
  return tokenNames.some((token) => SHELL_RUN_NAMES.includes(token));
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ageMinutes(createdAt) {
  const date = parseDate(createdAt);
  if (!date) return null;
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
}

function isActiveRun(run) {
  return ['planned', 'running'].includes(String(run.status || ''));
}

function isRunOverdue(run) {
  const expectedEnd = parseDate(run.expectedEndAt);
  return Boolean(expectedEnd && expectedEnd.getTime() < Date.now());
}

function buildRunRegistryEvidence(args, pidSet) {
  const registry = loadRunRegistry(args.runRegistry);
  const activeRuns = registry.runs.filter(isActiveRun);
  const runByPid = new Map();

  for (const run of activeRuns) {
    const pid = Number(run.pid);
    if (Number.isInteger(pid) && pid > 0) {
      runByPid.set(pid, run);
    }
  }

  const overdueRuns = activeRuns.filter(isRunOverdue);
  const unmatchedActiveRuns = activeRuns.filter((run) => {
    const pid = Number(run.pid);
    return !Number.isInteger(pid) || pid <= 0 || !pidSet.has(pid);
  });

  return {
    registry,
    activeRuns,
    runByPid,
    overdueRuns,
    unmatchedActiveRuns,
  };
}

function memoryMb(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value)) return null;
  return Number((value / 1024 / 1024).toFixed(1));
}

function collectWindowsProcesses() {
  const ps = `
$items = Get-CimInstance Win32_Process | ForEach-Object {
  $created = $null
  if ($_.CreationDate) {
    try { $created = ([DateTime]$_.CreationDate).ToUniversalTime().ToString("o") } catch { $created = [string]$_.CreationDate }
  }
  [pscustomobject]@{
    pid = [int]$_.ProcessId
    ppid = [int]$_.ParentProcessId
    name = [string]$_.Name
    commandLine = [string]$_.CommandLine
    executablePath = [string]$_.ExecutablePath
    createdAt = $created
    workingSetBytes = [int64]$_.WorkingSetSize
  }
}
$items | ConvertTo-Json -Depth 4
`;

  const result = run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
    timeoutMs: 30000,
  });
  const parsed = extractJson(result.stdout);
  const processes = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  return {
    ok: result.ok || processes.length > 0,
    status: result.status,
    stderr: result.stderr.slice(-1200),
    processes,
  };
}

function parsePsElapsed(text) {
  const parts = String(text || '').trim().split('-');
  let days = 0;
  let timePart = parts[0];
  if (parts.length === 2) {
    days = Number(parts[0]) || 0;
    timePart = parts[1];
  }
  const bits = timePart.split(':').map((part) => Number(part) || 0);
  let seconds = 0;
  if (bits.length === 3) seconds = bits[0] * 3600 + bits[1] * 60 + bits[2];
  if (bits.length === 2) seconds = bits[0] * 60 + bits[1];
  return days * 1440 + Math.round(seconds / 60);
}

function collectPosixProcesses() {
  const result = run('ps', ['-axo', 'pid=,ppid=,rss=,etime=,comm=,args='], {
    timeoutMs: 20000,
  });
  const processes = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s*(.*)$/);
    if (!match) continue;
    const elapsedMinutes = parsePsElapsed(match[4]);
    processes.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      name: path.basename(match[5]),
      commandLine: match[6] || match[5],
      executablePath: match[5],
      createdAt: elapsedMinutes === null ? null : new Date(Date.now() - elapsedMinutes * 60000).toISOString(),
      workingSetBytes: Number(match[3]) * 1024,
    });
  }
  return {
    ok: result.ok || processes.length > 0,
    status: result.status,
    stderr: result.stderr.slice(-1200),
    processes,
  };
}

function collectProcesses() {
  return process.platform === 'win32' ? collectWindowsProcesses() : collectPosixProcesses();
}

function processToReceipt(processInfo, args, pidSet, runByPid, ownerByPid = new Map()) {
  const pid = Number(processInfo.pid);
  const age = ageMinutes(processInfo.createdAt);
  const memory = memoryMb(processInfo.workingSetBytes);
  const category = classifyRun(processInfo);
  const shellRunCandidate = isShellRunCandidate(processInfo, category);
  const orphanLike = Number(processInfo.ppid) > 0 && !pidSet.has(Number(processInfo.ppid));
  const ownedRun = runByPid.get(pid) || null;
  const registeredOwnerBase = ownedRun
    ? makeLaneOwner(ownedRun.laneId, {
      label: ownedRun.laneLabel,
      agentKind: ownedRun.agentKind,
      surfaceKind: ownedRun.surfaceKind,
      evidence: 'run_registry',
      trustState: 'registered_run_receipt',
      ownerPid: pid,
    })
    : null;
  const registeredOwner = registeredOwnerBase
    ? {
      ...registeredOwnerBase,
      laneId: ownedRun.laneId || registeredOwnerBase.laneId,
      laneLabel: ownedRun.laneLabel || registeredOwnerBase.laneLabel,
    }
    : null;
  const inferredOwner = ownerByPid.get(pid) || null;
  const owner = registeredOwner || inferredOwner;
  const ownerLane = owner?.laneId || null;
  const runId = ownedRun?.runId || null;
  const registeredOverdue = Boolean(ownedRun && isRunOverdue(ownedRun));
  const stale = shellRunCandidate && age !== null && age >= args.staleMinutes && !ownedRun;
  const highMemory = memory !== null && memory >= args.highMemoryMb;
  const custodyRelevantParentGap = orphanLike && (shellRunCandidate || ownedRun || highMemory);
  const findings = [];

  if (stale) findings.push('stale_shell_or_dev_run');
  if (registeredOverdue) findings.push('registered_run_overdue');
  if (highMemory) findings.push('high_memory_process');
  if (custodyRelevantParentGap) findings.push('parent_not_visible');

  const custodyActionClass = findings.length === 0
    ? runId ? 'registered_owned' : ownerLane ? 'lane_observed' : shellRunCandidate ? 'tracked' : 'observed'
    : runId ? 'registered_owner_handoff' : ownerLane ? 'lane_owner_handoff' : 'cleanup_candidate';
  const cleanupEligible = custodyActionClass === 'cleanup_candidate';
  const ownerHandoffRequired = custodyActionClass === 'registered_owner_handoff' || custodyActionClass === 'lane_owner_handoff';

  return {
    pid,
    ppid: Number(processInfo.ppid),
    name: processInfo.name || 'unknown',
    category,
    shellRunCandidate,
    ageMinutes: age,
    memoryMb: memory,
    commandHash: stableHash(processInfo.commandLine || processInfo.executablePath || processInfo.name),
    commandPreview: args.includeCommandLines ? redactCommandLine(processInfo.commandLine) : undefined,
    executableName: processInfo.executablePath ? path.basename(String(processInfo.executablePath)) : undefined,
    findings,
    custody: {
      state: ownedRun
        ? registeredOverdue ? 'owned_overdue' : 'owned_active'
        : owner
          ? findings.length > 0 ? 'lane_owned_needs_review' : 'lane_observed'
          : findings.length > 0 ? 'needs_review' : shellRunCandidate ? 'tracked' : 'observed',
      actionClass: custodyActionClass,
      cleanupEligible,
      ownerHandoffRequired,
      ownerLane,
      ownerLaneLabel: owner?.laneLabel || null,
      ownerAgentKind: owner?.agentKind || null,
      ownerSurfaceKind: owner?.surfaceKind || null,
      ownerColorHint: owner?.colorHint || null,
      ownerEvidence: owner?.evidence || null,
      ownerParentPid: owner?.parentPid || null,
      ownerPid: owner?.ownerPid || null,
      ownerTrustState: owner?.trustState || null,
      runId,
      runClass: ownedRun?.runClass || null,
      expectedEndAt: ownedRun?.expectedEndAt || null,
      registeredStatus: ownedRun?.status || null,
      stopPolicy: 'break_glass_required',
      receiptRequired: true,
    },
  };
}

function hasRegisteredCustody(processInfo) {
  return Boolean(processInfo?.custody?.runId);
}

function hasLaneCustody(processInfo) {
  return Boolean(processInfo?.custody?.ownerLane);
}

function hasAnyCustody(processInfo) {
  return hasRegisteredCustody(processInfo) || hasLaneCustody(processInfo);
}

function isOwnerUnknownProcess(processInfo) {
  return !hasAnyCustody(processInfo);
}

function hasFinding(processInfo, finding) {
  return Array.isArray(processInfo?.findings) && processInfo.findings.includes(finding);
}

function isActionableCleanupCandidate(processInfo) {
  return Boolean(processInfo?.custody?.cleanupEligible)
    || (Array.isArray(processInfo?.findings) && processInfo.findings.length > 0 && isOwnerUnknownProcess(processInfo));
}

function isOwnerHandoffCandidate(processInfo) {
  return Boolean(processInfo?.custody?.ownerHandoffRequired)
    || (Array.isArray(processInfo?.findings) && processInfo.findings.length > 0 && hasAnyCustody(processInfo));
}

function createStopPlan(args, processes) {
  if (!args.planStopPid) return null;
  const target = processes.find((item) => item.pid === args.planStopPid);
  if (!target) {
    return {
      status: 'target_not_found',
      pid: args.planStopPid,
      approvalRequired: true,
      safeToExecuteAutomatically: false,
    };
  }

  return {
    status: 'approval_required',
    pid: target.pid,
    name: target.name,
    category: target.category,
    custody: target.custody,
    reason: 'Stopping a process can destroy user work, agent state, local servers, or build/test evidence.',
    approvalRequired: true,
    safeToExecuteAutomatically: false,
    recommendedCommand: process.platform === 'win32'
      ? `Stop-Process -Id ${target.pid} -Confirm`
      : `kill -TERM ${target.pid}`,
    receiptRequired: true,
  };
}

function stopPlanReason(processInfo) {
  if (processInfo.findings.includes('registered_run_overdue')) {
    return 'Registered HoloShell run passed its expected end time.';
  }
  if (processInfo.findings.includes('high_memory_process')) {
    return 'Process exceeds the high-memory threshold.';
  }
  if (processInfo.findings.includes('stale_shell_or_dev_run')) {
    return 'Shell or development run is older than the stale threshold.';
  }
  if (processInfo.findings.includes('parent_not_visible')) {
    return 'Parent process is not visible in the current process table.';
  }
  return 'Process needs custody review before HoloShell recommends cleanup.';
}

function ownerHandoffReason(processInfo) {
  if (processInfo.findings.includes('registered_run_overdue')) {
    return 'Registered HoloShell run passed its expected end time; the owning lane must extend, close, or justify it.';
  }
  if (processInfo.findings.includes('high_memory_process')) {
    return 'High-memory process already has a visible owner lane; route review to that owner before cleanup.';
  }
  if (processInfo.findings.includes('stale_shell_or_dev_run')) {
    return 'Stale shell/dev process already has a visible owner lane; ask the owner to claim, close, or justify it.';
  }
  if (processInfo.findings.includes('parent_not_visible')) {
    return 'Parent process is not visible, but owner evidence exists; route as custody handoff first.';
  }
  return 'Process has owner evidence and needs lane handoff before cleanup.';
}

function createStopPlanForProcess(processInfo, rank) {
  return {
    planId: `stop-plan-${processInfo.pid}-${stableHash(`${processInfo.pid}:${processInfo.commandHash}:${rank}`)}`,
    status: 'approval_required',
    pid: processInfo.pid,
    name: processInfo.name,
    category: processInfo.category,
    ageMinutes: processInfo.ageMinutes,
    memoryMb: processInfo.memoryMb,
    findings: processInfo.findings,
    custody: processInfo.custody,
    reason: stopPlanReason(processInfo),
    approvalRequired: true,
    safeToExecuteAutomatically: false,
    recommendedCommand: process.platform === 'win32'
      ? `Stop-Process -Id ${processInfo.pid} -Confirm`
      : `kill -TERM ${processInfo.pid}`,
    receiptRequired: true,
  };
}

function createStopPlans(processes) {
  const candidates = processes
    .filter(isActionableCleanupCandidate)
    .sort((left, right) => {
      const leftScore = left.findings.length * 100000 + (left.memoryMb || 0);
      const rightScore = right.findings.length * 100000 + (right.memoryMb || 0);
      return rightScore - leftScore;
    });

  return candidates.slice(0, 12).map(createStopPlanForProcess);
}

function createOwnerHandoffPlanForProcess(processInfo, rank) {
  return {
    planId: `handoff-plan-${processInfo.pid}-${stableHash(`${processInfo.pid}:${processInfo.commandHash}:${rank}`)}`,
    status: 'owner_review_required',
    pid: processInfo.pid,
    name: processInfo.name,
    category: processInfo.category,
    ageMinutes: processInfo.ageMinutes,
    memoryMb: processInfo.memoryMb,
    findings: processInfo.findings,
    custody: processInfo.custody,
    reason: ownerHandoffReason(processInfo),
    recommendedAction: 'ask_owner_lane_to_extend_close_or_justify',
    approvalRequired: false,
    safeToExecuteAutomatically: false,
    recommendedCommand: null,
    receiptRequired: true,
  };
}

function createOwnerHandoffPlans(processes) {
  const candidates = processes
    .filter(isOwnerHandoffCandidate)
    .sort((left, right) => {
      const leftRegistered = left.custody.runId ? 1 : 0;
      const rightRegistered = right.custody.runId ? 1 : 0;
      const leftScore = leftRegistered * 1000000 + left.findings.length * 100000 + (left.memoryMb || 0);
      const rightScore = rightRegistered * 1000000 + right.findings.length * 100000 + (right.memoryMb || 0);
      return rightScore - leftScore;
    });

  return candidates.slice(0, 24).map(createOwnerHandoffPlanForProcess);
}

function createHealth(args) {
  const collection = collectProcesses();
  const pidSet = new Set(collection.processes.map((item) => Number(item.pid)).filter(Boolean));
  const runEvidence = buildRunRegistryEvidence(args, pidSet);
  const ownerByPid = buildOwnerEvidence(args, collection.processes);
  const processes = collection.processes
    .map((item) => processToReceipt(item, args, pidSet, runEvidence.runByPid, ownerByPid))
    .sort((left, right) => {
      const leftScore = left.findings.length * 100000 + (left.memoryMb || 0);
      const rightScore = right.findings.length * 100000 + (right.memoryMb || 0);
      return rightScore - leftScore;
    });

  const shellRuns = processes.filter((item) => item.shellRunCandidate);
  const highMemory = processes.filter((item) => item.findings.includes('high_memory_process'));
  const staleRuns = processes.filter((item) => item.findings.includes('stale_shell_or_dev_run'));
  const ownedProcesses = processes.filter((item) => item.custody.runId);
  const laneAttributedProcesses = processes.filter((item) => item.custody.ownerLane && !item.custody.runId);
  const ownerUnknownReview = processes.filter((item) => item.findings.length > 0 && isOwnerUnknownProcess(item));
  const ownerHandoff = processes.filter(isOwnerHandoffCandidate);
  const cleanupCandidates = processes.filter(isActionableCleanupCandidate);
  const overdueOwnedProcesses = processes.filter((item) => item.findings.includes('registered_run_overdue'));
  const orphanLike = processes.filter((item) => item.findings.includes('parent_not_visible'));
  const ownerUnknownStaleRuns = staleRuns.filter(isOwnerUnknownProcess);
  const laneOwnedStaleRuns = staleRuns.filter((item) => hasLaneCustody(item) && !hasRegisteredCustody(item));
  const registeredOwnedStaleRuns = staleRuns.filter(hasRegisteredCustody);
  const ownerUnknownHighMemory = highMemory.filter(isOwnerUnknownProcess);
  const laneOwnedHighMemory = highMemory.filter((item) => hasLaneCustody(item) && !hasRegisteredCustody(item));
  const registeredOwnedHighMemory = highMemory.filter(hasRegisteredCustody);
  const ownerUnknownOrphanLike = orphanLike.filter(isOwnerUnknownProcess);
  const laneOwnedOrphanLike = orphanLike.filter((item) => hasLaneCustody(item) && !hasRegisteredCustody(item));
  const registeredOwnedOrphanLike = orphanLike.filter(hasRegisteredCustody);
  const memoryUsedRatio = 1 - (os.freemem() / os.totalmem());
  const riskState = memoryUsedRatio > 0.9 || highMemory.length > 8
    ? 'critical'
    : cleanupCandidates.length > 0 || ownerHandoff.length > 0 || runEvidence.overdueRuns.length > 0 || runEvidence.unmatchedActiveRuns.length > 0 || memoryUsedRatio > 0.85
      ? 'warn'
      : 'pass';
  const categories = {};
  for (const item of processes) {
    categories[item.category] = (categories[item.category] || 0) + 1;
  }

  const processSample = [
    ...processes.filter((item) => item.findings.length > 0),
    ...ownedProcesses.filter((item) => item.findings.length === 0),
    ...laneAttributedProcesses.filter((item) => item.findings.length === 0 && item.shellRunCandidate),
    ...shellRuns.filter((item) => item.findings.length === 0),
  ].slice(0, 80);

  const stopPlans = createStopPlans(processes);
  const ownerHandoffPlans = createOwnerHandoffPlans(processes);
  const explicitStopPlan = createStopPlan(args, processes);
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-process-health-room.hsplus',
      doc: 'apps/holoshell/docs/PROCESS_SHELL_RUN_HEALTH.md',
      roadmap: 'apps/holoshell/docs/PHASE_1_ROADMAP.md',
    },
    thresholds: {
      staleMinutes: args.staleMinutes,
      highMemoryMb: args.highMemoryMb,
      memoryCriticalRatio: 0.9,
    },
    host: {
      platform: os.platform(),
      arch: os.arch(),
      uptimeMinutes: Math.round(os.uptime() / 60),
      totalMemoryGb: Number((os.totalmem() / 1024 / 1024 / 1024).toFixed(2)),
      freeMemoryGb: Number((os.freemem() / 1024 / 1024 / 1024).toFixed(2)),
      memoryUsedRatio: Number(memoryUsedRatio.toFixed(3)),
      logicalCpus: os.cpus().length,
    },
    summary: {
      riskState,
      processCount: processes.length,
      shellRunCount: shellRuns.length,
      registeredRunCount: runEvidence.registry.runs.length,
      activeRegisteredRunCount: runEvidence.activeRuns.length,
      ownedProcessCount: ownedProcesses.length,
      laneAttributedProcessCount: laneAttributedProcesses.length,
      ownerUnknownReviewCount: ownerUnknownReview.length,
      ownerKnownReviewCount: ownerHandoff.length,
      ownerHandoffPlanCount: ownerHandoffPlans.length,
      actionableCleanupCandidateCount: cleanupCandidates.length,
      cleanupCandidateCount: cleanupCandidates.length,
      overdueRegisteredRunCount: runEvidence.overdueRuns.length,
      overdueOwnedProcessCount: overdueOwnedProcesses.length,
      unmatchedActiveRunCount: runEvidence.unmatchedActiveRuns.length,
      highMemoryCount: highMemory.length,
      ownerUnknownHighMemoryCount: ownerUnknownHighMemory.length,
      laneOwnedHighMemoryCount: laneOwnedHighMemory.length,
      registeredOwnedHighMemoryCount: registeredOwnedHighMemory.length,
      staleRunCount: staleRuns.length,
      ownerUnknownStaleRunCount: ownerUnknownStaleRuns.length,
      laneOwnedStaleRunCount: laneOwnedStaleRuns.length,
      registeredOwnedStaleRunCount: registeredOwnedStaleRuns.length,
      orphanLikeCount: orphanLike.length,
      ownerUnknownOrphanLikeCount: ownerUnknownOrphanLike.length,
      laneOwnedOrphanLikeCount: laneOwnedOrphanLike.length,
      registeredOwnedOrphanLikeCount: registeredOwnedOrphanLike.length,
      cleanupStopPlanCount: stopPlans.length + (explicitStopPlan ? 1 : 0),
      stopPlanCount: stopPlans.length + (explicitStopPlan ? 1 : 0),
      trackedCategoryCount: categories,
    },
    runRegistry: {
      path: runEvidence.registry.path,
      loaded: runEvidence.registry.loaded,
      schemaVersion: runEvidence.registry.schemaVersion,
      updatedAt: runEvidence.registry.updatedAt,
      error: runEvidence.registry.error,
      registeredRunCount: runEvidence.registry.runs.length,
      activeRunCount: runEvidence.activeRuns.length,
      overdueRunCount: runEvidence.overdueRuns.length,
      unmatchedActiveRunCount: runEvidence.unmatchedActiveRuns.length,
      unmatchedActiveRuns: runEvidence.unmatchedActiveRuns.slice(0, 20).map((run) => ({
        runId: run.runId,
        laneId: run.laneId,
        agentKind: run.agentKind,
        runClass: run.runClass,
        status: run.status,
        pid: run.pid || null,
        expectedEndAt: run.expectedEndAt || null,
      })),
    },
    collection: {
      ok: collection.ok,
      status: collection.status,
      stderr: collection.stderr,
      commandLinesIncluded: args.includeCommandLines,
    },
    processIndex: {
      visiblePids: collection.processes
        .map((item) => Number(item.pid))
        .filter((pid) => Number.isInteger(pid) && pid > 0),
    },
    policies: {
      readOnlyByDefault: true,
      automaticTerminationAllowed: false,
      stopPolicy: 'break_glass_required',
      exactPidRequired: true,
      receiptRequired: true,
    },
    recommendations: makeRecommendations({
      memoryUsedRatio,
      staleRuns,
      ownerUnknownStaleRuns,
      laneOwnedStaleRuns,
      registeredOwnedStaleRuns,
      highMemory,
      ownerUnknownHighMemory,
      laneOwnedHighMemory,
      registeredOwnedHighMemory,
      orphanLike,
      ownerUnknownOrphanLike,
      laneOwnedOrphanLike,
      registeredOwnedOrphanLike,
      shellRuns,
      laneAttributedProcesses,
      ownerUnknownReview,
      ownerHandoff,
      cleanupCandidates,
      overdueRuns: runEvidence.overdueRuns,
      unmatchedActiveRuns: runEvidence.unmatchedActiveRuns,
    }),
    shellRuns: shellRuns.slice(0, 160),
    processes: processSample,
    stopPlans,
    ownerHandoffPlans,
    stopPlan: explicitStopPlan,
  };

  return manifest;
}

function makeRecommendations({
  memoryUsedRatio,
  staleRuns,
  ownerUnknownStaleRuns = [],
  laneOwnedStaleRuns = [],
  registeredOwnedStaleRuns = [],
  highMemory,
  ownerUnknownHighMemory = [],
  laneOwnedHighMemory = [],
  registeredOwnedHighMemory = [],
  orphanLike,
  ownerUnknownOrphanLike = [],
  laneOwnedOrphanLike = [],
  registeredOwnedOrphanLike = [],
  shellRuns,
  laneAttributedProcesses = [],
  ownerUnknownReview = [],
  ownerHandoff = [],
  cleanupCandidates = [],
  overdueRuns,
  unmatchedActiveRuns,
}) {
  const recommendations = [];
  if (memoryUsedRatio > 0.85) {
    recommendations.push({
      severity: 'high',
      kind: 'memory_pressure',
      text: 'Memory pressure is high. Review high-memory shell/dev runs before starting another build or browser audit.',
    });
  }
  if (cleanupCandidates.length > 0) {
    recommendations.push({
      severity: 'medium',
      kind: 'actionable_cleanup_candidates',
      text: `${cleanupCandidates.length} review-worthy process(es) have no owner lane. These are the only automatic cleanup stop-plan candidates.`,
    });
  }
  if (ownerHandoff.length > 0) {
    recommendations.push({
      severity: 'low',
      kind: 'owner_handoff_required',
      text: `${ownerHandoff.length} review-worthy process(es) already have owner lanes. Route them to the owning agent before any cleanup plan.`,
    });
  }
  if (staleRuns.length > 0) {
    recommendations.push({
      severity: 'medium',
      kind: 'stale_shell_runs',
      text: `${staleRuns.length} shell or dev run candidate(s) are older than the stale threshold: ${ownerUnknownStaleRuns.length} owner-unknown, ${laneOwnedStaleRuns.length} lane-owned, ${registeredOwnedStaleRuns.length} registered-owned.`,
    });
  }
  if (overdueRuns.length > 0) {
    recommendations.push({
      severity: 'medium',
      kind: 'overdue_registered_runs',
      text: `${overdueRuns.length} registered run(s) have passed their expected end time. Ask the owning lane to finish, extend, or close them.`,
    });
  }
  if (unmatchedActiveRuns.length > 0) {
    recommendations.push({
      severity: 'medium',
      kind: 'unmatched_active_runs',
      text: `${unmatchedActiveRuns.length} active registry run(s) do not match a visible PID. Treat them as cleanup candidates before starting heavy work.`,
    });
  }
  if (highMemory.length > 0) {
    recommendations.push({
      severity: 'medium',
      kind: 'high_memory_processes',
      text: `${highMemory.length} process(es) exceed the high-memory threshold: ${ownerUnknownHighMemory.length} owner-unknown, ${laneOwnedHighMemory.length} lane-owned, ${registeredOwnedHighMemory.length} registered-owned. Do not start memory-heavy jobs until reviewed.`,
    });
  }
  if (orphanLike.length > 0) {
    recommendations.push({
      severity: 'medium',
      kind: 'parent_not_visible',
      text: `${orphanLike.length} process(es) have parents that are not visible in the current process table: ${ownerUnknownOrphanLike.length} owner-unknown, ${laneOwnedOrphanLike.length} lane-owned, ${registeredOwnedOrphanLike.length} registered-owned.`,
    });
  }
  if (ownerUnknownReview.length > 0) {
    recommendations.push({
      severity: 'medium',
      kind: 'owner_unknown_review',
      text: `${ownerUnknownReview.length} review-worthy process(es) still have no agent lane owner. Claim before cleanup.`,
    });
  }
  if (laneAttributedProcesses.length > 0) {
    recommendations.push({
      severity: 'low',
      kind: 'lane_attribution_visible',
      text: `${laneAttributedProcesses.length} process(es) inherited an owner lane from visible agent surfaces or process ancestors.`,
    });
  }
  if (shellRuns.length === 0) {
    recommendations.push({
      severity: 'low',
      kind: 'no_shell_runs',
      text: 'No shell/dev run candidates were detected.',
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      severity: 'low',
      kind: 'healthy',
      text: 'No PID or shell-run custody issues crossed current thresholds.',
    });
  }
  return recommendations;
}

function writeHealth(health, outputPath) {
  const resolved = path.resolve(REPO_ROOT, outputPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(health, null, 2)}\n`, 'utf8');
  return resolved;
}

function assertSelfTest(health) {
  const failures = [];
  if (health.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (!health.collection.ok) failures.push('process collection failed');
  if (health.summary.processCount < 1) failures.push('expected at least one process');
  if (!['pass', 'warn', 'critical'].includes(health.summary.riskState)) failures.push('invalid riskState');
  if (health.policies.automaticTerminationAllowed !== false) failures.push('automatic termination must be disabled');
  if (!Array.isArray(health.recommendations) || health.recommendations.length < 1) failures.push('expected recommendations');
  if (!Array.isArray(health.stopPlans)) failures.push('expected stopPlans array');
  const fixturePidSet = new Set([100, 101, 102, 103, 104]);
  const fixtureRuns = new Map();
  const fixtureArgs = {
    staleMinutes: 120,
    highMemoryMb: 1500,
    includeCommandLines: false,
    hardwareReality: '__missing_hardware_reality_fixture__.json',
    legacyWindows: '__missing_legacy_window_fixture__.json',
  };
  const fixtures = [
    {
      name: 'Codex.exe',
      commandLine: '"C:\\Program Files\\WindowsApps\\OpenAI.Codex\\app\\Codex.exe" --secure-schemes=app',
      expectedCategory: 'agent_codex',
      expectedShellRunCandidate: false,
      expectedFindings: [],
    },
    {
      name: 'chrome.exe',
      commandLine: '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --origin-trial-disabled-features=WebAssemblyCustomDescriptors',
      expectedCategory: 'browser',
      expectedShellRunCandidate: false,
      expectedFindings: [],
    },
    {
      name: 'com.docker.backend.exe',
      commandLine: '"C:\\Program Files\\Docker\\Docker\\resources\\com.docker.backend.exe" services',
      expectedCategory: 'container_service',
      expectedShellRunCandidate: false,
      expectedFindings: [],
    },
    {
      name: 'node.exe',
      commandLine: '"C:\\Program Files\\nodejs\\node.exe" scripts\\holoshell-control-daemon.mjs',
      expectedCategory: 'node_runtime',
      expectedShellRunCandidate: false,
      expectedFindings: [],
    },
    {
      name: 'node.exe',
      commandLine: '"C:\\Program Files\\nodejs\\node.exe" scripts\\holoshell-network-change-sentinel.mjs --watch --record-routine',
      expectedCategory: 'node_runtime',
      expectedShellRunCandidate: false,
      expectedFindings: [],
    },
    {
      name: 'node.exe',
      commandLine: '"C:\\Program Files\\nodejs\\node.exe" scripts\\some-old-dev-server.mjs',
      expectedCategory: 'node_runtime',
      expectedShellRunCandidate: true,
      expectedFindings: ['stale_shell_or_dev_run', 'parent_not_visible'],
    },
  ];
  for (const [index, fixture] of fixtures.entries()) {
    const receipt = processToReceipt({
      pid: 1000 + index,
      ppid: 9999,
      name: fixture.name,
      commandLine: fixture.commandLine,
      executablePath: fixture.name,
      createdAt: new Date(Date.now() - 180 * 60_000).toISOString(),
      workingSetBytes: 10 * 1024 * 1024,
    }, fixtureArgs, fixturePidSet, fixtureRuns);
    if (receipt.category !== fixture.expectedCategory) {
      failures.push(`${fixture.name} expected category ${fixture.expectedCategory}, got ${receipt.category}`);
    }
    if (receipt.shellRunCandidate !== fixture.expectedShellRunCandidate) {
      failures.push(`${fixture.name} shellRunCandidate expected ${fixture.expectedShellRunCandidate}`);
    }
    for (const finding of fixture.expectedFindings) {
      if (!receipt.findings.includes(finding)) failures.push(`${fixture.name} missing ${finding}`);
    }
    for (const finding of receipt.findings) {
      if (!fixture.expectedFindings.includes(finding)) failures.push(`${fixture.name} unexpected ${finding}`);
    }
    if (fixture.expectedFindings.length > 0 && receipt.custody.actionClass !== 'cleanup_candidate') {
      failures.push(`${fixture.name} expected cleanup_candidate action class`);
    }
    if (fixture.expectedFindings.length > 0 && receipt.custody.cleanupEligible !== true) {
      failures.push(`${fixture.name} expected cleanupEligible true`);
    }
  }
  const ownerFixtures = [
    {
      pid: 100,
      ppid: 1,
      name: 'Codex.exe',
      commandLine: '"C:\\Program Files\\WindowsApps\\OpenAI.Codex\\app\\Codex.exe" --secure-schemes=app',
      executablePath: 'Codex.exe',
      createdAt: new Date().toISOString(),
      workingSetBytes: 50 * 1024 * 1024,
    },
    {
      pid: 101,
      ppid: 100,
      name: 'pwsh.exe',
      commandLine: 'pwsh -NoLogo',
      executablePath: 'pwsh.exe',
      createdAt: new Date().toISOString(),
      workingSetBytes: 15 * 1024 * 1024,
    },
    {
      pid: 102,
      ppid: 101,
      name: 'node.exe',
      commandLine: 'node scripts\\local-worker.mjs',
      executablePath: 'node.exe',
      createdAt: new Date().toISOString(),
      workingSetBytes: 20 * 1024 * 1024,
    },
  ];
  const ownerEvidence = buildOwnerEvidence(fixtureArgs, ownerFixtures);
  if (ownerEvidence.get(102)?.laneId !== 'codex') {
    failures.push('expected descendant process to inherit codex lane owner');
  }
  const ownedReceipt = processToReceipt(
    ownerFixtures[2],
    fixtureArgs,
    new Set(ownerFixtures.map((item) => item.pid)),
    fixtureRuns,
    ownerEvidence,
  );
  if (ownedReceipt.custody.ownerLane !== 'codex') {
    failures.push('expected process receipt to include inferred owner lane');
  }
  if (ownedReceipt.custody.actionClass !== 'lane_observed') {
    failures.push('expected healthy lane-owned process to be lane_observed');
  }
  const staleOwnedProcess = {
    pid: 103,
    ppid: 101,
    name: 'node.exe',
    commandLine: 'node scripts\\local-worker.mjs',
    executablePath: 'node.exe',
    createdAt: new Date(Date.now() - 180 * 60_000).toISOString(),
    workingSetBytes: 20 * 1024 * 1024,
  };
  const staleOwnerFixtures = [...ownerFixtures, staleOwnedProcess];
  const staleOwnerEvidence = buildOwnerEvidence(fixtureArgs, staleOwnerFixtures);
  const staleOwnedReceipt = processToReceipt(
    staleOwnedProcess,
    fixtureArgs,
    new Set(staleOwnerFixtures.map((item) => item.pid)),
    fixtureRuns,
    staleOwnerEvidence,
  );
  if (!staleOwnedReceipt.findings.includes('stale_shell_or_dev_run')) {
    failures.push('expected lane-owned stale process finding');
  }
  if (staleOwnedReceipt.custody.actionClass !== 'lane_owner_handoff') {
    failures.push('expected lane-owned stale process to route to owner handoff');
  }
  if (staleOwnedReceipt.custody.cleanupEligible !== false) {
    failures.push('lane-owned stale process must not be cleanup eligible');
  }
  const unownedStaleReceipt = processToReceipt({
    pid: 109,
    ppid: 9999,
    name: 'node.exe',
    commandLine: 'node scripts\\unowned-old-worker.mjs',
    executablePath: 'node.exe',
    createdAt: new Date(Date.now() - 180 * 60_000).toISOString(),
    workingSetBytes: 20 * 1024 * 1024,
  }, fixtureArgs, new Set(staleOwnerFixtures.map((item) => item.pid)), fixtureRuns, staleOwnerEvidence);
  const stopPlans = createStopPlans([unownedStaleReceipt, staleOwnedReceipt]);
  if (!stopPlans.some((plan) => plan.pid === 109)) failures.push('expected unowned stale process stop plan');
  if (stopPlans.some((plan) => plan.pid === 103)) failures.push('lane-owned stale process must not create cleanup stop plan');
  const handoffPlans = createOwnerHandoffPlans([unownedStaleReceipt, staleOwnedReceipt]);
  if (!handoffPlans.some((plan) => plan.pid === 103)) failures.push('expected lane-owned stale handoff plan');
  if (handoffPlans.some((plan) => plan.pid === 109)) failures.push('unowned stale process must not create owner handoff plan');
  if (typeof health.summary.actionableCleanupCandidateCount !== 'number') {
    failures.push('expected actionableCleanupCandidateCount summary');
  }
  if (typeof health.summary.ownerHandoffPlanCount !== 'number') {
    failures.push('expected ownerHandoffPlanCount summary');
  }
  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const health = createHealth(args);
  const output = writeHealth(health, args.output);
  if (args.selfTest) assertSelfTest(health);

  if (args.json) {
    console.log(JSON.stringify(health, null, 2));
  } else {
    console.log(`HoloShell process health: ${output}`);
    console.log(`Risk: ${health.summary.riskState}`);
    console.log(`Processes: ${health.summary.processCount}`);
    console.log(`Shell/dev runs: ${health.summary.shellRunCount}`);
    console.log(`Registered runs: ${health.summary.registeredRunCount}`);
    console.log(`Owned processes: ${health.summary.ownedProcessCount}`);
    console.log(`Lane-attributed processes: ${health.summary.laneAttributedProcessCount}`);
    console.log(`Owner-unknown review: ${health.summary.ownerUnknownReviewCount}`);
    console.log(`Owner handoff plans: ${health.summary.ownerHandoffPlanCount}`);
    console.log(`Actionable cleanup candidates: ${health.summary.actionableCleanupCandidateCount}`);
    console.log(`Overdue registered runs: ${health.summary.overdueRegisteredRunCount}`);
    console.log(`Unmatched active runs: ${health.summary.unmatchedActiveRunCount}`);
    console.log(`Stale: ${health.summary.staleRunCount}`);
    console.log(`Stale owner-unknown: ${health.summary.ownerUnknownStaleRunCount}`);
    console.log(`Stale lane-owned: ${health.summary.laneOwnedStaleRunCount}`);
    console.log(`High memory: ${health.summary.highMemoryCount}`);
    console.log(`High memory owner-unknown: ${health.summary.ownerUnknownHighMemoryCount}`);
    console.log(`High memory lane-owned: ${health.summary.laneOwnedHighMemoryCount}`);
    console.log(`Parent not visible: ${health.summary.orphanLikeCount}`);
    console.log(`Cleanup stop plans: ${health.summary.cleanupStopPlanCount}`);
  }
} catch (error) {
  console.error(`holoshell-process-health failed: ${error.message}`);
  process.exit(1);
}
