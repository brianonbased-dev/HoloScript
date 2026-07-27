import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export const MCP_PROCESS_LEASE_SCHEMA = 'holoscript.mcp-process-lease.v1';
export const MCP_PROCESS_REAP_RECEIPT_SCHEMA = 'holoscript.mcp-process-reap-receipt.v1';
export const DEFAULT_MCP_PROCESS_STALE_AFTER_MS = 4 * 60 * 60 * 1000;
export const DEFAULT_MCP_MAX_CONNECTIONS_PER_PARENT = 4;
export const DEFAULT_MCP_CAPACITY_IDLE_AFTER_MS = 10 * 60 * 1000;
export const DEFAULT_MCP_PROCESS_HEARTBEAT_INTERVAL_MS = 30 * 1000;

function finitePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function defaultMcpProcessLeaseDir(env = process.env) {
  const base = env.LOCALAPPDATA || env.XDG_RUNTIME_DIR || tmpdir();
  return join(base, 'HoloScript', 'mcp-runtime', 'leases');
}

export function normalizeProcessPath(value) {
  if (!value) return '';
  return resolve(String(value)).replace(/\\/g, '/').toLowerCase();
}

export function parseProcessCommandLine(commandLine) {
  if (typeof commandLine !== 'string' || !commandLine.trim()) return [];
  const tokens = [];
  const pattern = /"([^"]*)"|'([^']*)'|([^\s]+)/g;
  for (const match of commandLine.matchAll(pattern)) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

export function commandLineOwnsNodeScript(commandLine, scriptPath) {
  const tokens = parseProcessCommandLine(commandLine);
  if (tokens.length < 2) return false;
  const executable = basename(tokens[0]).toLowerCase();
  if (executable !== 'node' && executable !== 'node.exe') return false;
  return normalizeProcessPath(tokens[1]) === normalizeProcessPath(scriptPath);
}

function parseStartedAt(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return Number.NaN;
  const legacy = /^\/Date\((\d+)\)\/$/.exec(value);
  if (legacy) return Number(legacy[1]);
  return Date.parse(value);
}

function normalizedProcess(raw) {
  return {
    pid: Number(raw.pid ?? raw.ProcessId),
    parentPid: Number(raw.parentPid ?? raw.ParentProcessId),
    parentAlive: raw.parentAlive ?? raw.ParentAlive ?? true,
    startedAt: parseStartedAt(raw.startedAt ?? raw.StartedAt ?? raw.CreationDate),
    workingSetBytes: Number(raw.workingSetBytes ?? raw.WorkingSetBytes ?? raw.WorkingSetSize ?? 0),
    privateBytes: Number(raw.privateBytes ?? raw.PrivateBytes ?? raw.PrivatePageCount ?? 0),
    commandLine: String(raw.commandLine ?? raw.CommandLine ?? ''),
  };
}

export function listWindowsNodeProcesses({ spawnSyncImpl = spawnSync } = {}) {
  if (process.platform !== 'win32' && spawnSyncImpl === spawnSync) return [];
  const command = [
    '$items = Get-CimInstance Win32_Process -Filter "Name = \'node.exe\'" | ForEach-Object {',
    '  $parentAlive = $null -ne (Get-Process -Id $_.ParentProcessId -ErrorAction SilentlyContinue)',
    '  [pscustomobject]@{',
    '    pid = [int]$_.ProcessId',
    '    parentPid = [int]$_.ParentProcessId',
    '    parentAlive = $parentAlive',
    "    startedAt = $_.CreationDate.ToUniversalTime().ToString('o')",
    '    workingSetBytes = [double]$_.WorkingSetSize',
    '    privateBytes = [double]$_.PrivatePageCount',
    '    commandLine = [string]$_.CommandLine',
    '  }',
    '}',
    '@($items) | ConvertTo-Json -Compress',
  ].join('\n');
  const result = spawnSyncImpl(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', command],
    { encoding: 'utf8', windowsHide: true }
  );
  if (result.status !== 0) {
    throw new Error(
      `Windows MCP process census failed: ${result.stderr || result.stdout || 'unknown error'}`
    );
  }
  const text = String(result.stdout || '').trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  return (Array.isArray(parsed) ? parsed : [parsed]).map(normalizedProcess);
}

export function readMcpProcessLeases(leaseDir) {
  let names;
  try {
    names = readdirSync(leaseDir).filter((name) => name.endsWith('.json'));
  } catch {
    return [];
  }
  const leases = [];
  for (const name of names) {
    try {
      const lease = JSON.parse(readFileSync(join(leaseDir, name), 'utf8'));
      if (lease?.schema === MCP_PROCESS_LEASE_SCHEMA) leases.push(lease);
    } catch {
      // A partial or stale file is not authority to terminate a process.
    }
  }
  return leases;
}

function matchingLease(processInfo, leases, role, scriptPath) {
  const expectedPath = normalizeProcessPath(scriptPath);
  return leases.find((lease) => {
    if (lease.role !== role || Number(lease.pid) !== processInfo.pid) return false;
    if (normalizeProcessPath(lease.scriptPath) !== expectedPath) return false;
    const leaseStart = Number(lease.startedAtMs);
    return Number.isFinite(leaseStart) && Math.abs(leaseStart - processInfo.startedAt) <= 10_000;
  });
}

export function buildOwnedMcpProcessReapPlan({
  processes,
  leases = [],
  role,
  scriptPath,
  currentPid = process.pid,
  nowMs = Date.now(),
  staleAfterMs = DEFAULT_MCP_PROCESS_STALE_AFTER_MS,
  maxConnectionsPerParent = DEFAULT_MCP_MAX_CONNECTIONS_PER_PARENT,
  capacityIdleAfterMs = DEFAULT_MCP_CAPACITY_IDLE_AFTER_MS,
}) {
  const ttl = finitePositiveNumber(staleAfterMs, DEFAULT_MCP_PROCESS_STALE_AFTER_MS);
  const maxConnections = Math.max(
    1,
    Math.floor(
      finitePositiveNumber(maxConnectionsPerParent, DEFAULT_MCP_MAX_CONNECTIONS_PER_PARENT)
    )
  );
  const capacityGrace = finitePositiveNumber(
    capacityIdleAfterMs,
    DEFAULT_MCP_CAPACITY_IDLE_AFTER_MS
  );
  const candidates = [];
  const owned = [];
  for (const raw of processes) {
    const item = normalizedProcess(raw);
    if (!Number.isInteger(item.pid) || item.pid <= 0) continue;
    if (!Number.isFinite(item.startedAt)) continue;
    if (!commandLineOwnsNodeScript(item.commandLine, scriptPath)) continue;

    const lease = matchingLease(item, leases, role, scriptPath);
    const lastActivityAtMs = lease ? Number(lease.lastActivityAtMs) : item.startedAt;
    const idleMs = Math.max(0, nowMs - lastActivityAtMs);
    const parentDead = item.parentAlive === false;
    const ownedItem = {
      ...item,
      lastActivityAtMs,
      idleMs,
      isCurrent: item.pid === currentPid,
    };
    owned.push(ownedItem);
    if (ownedItem.isCurrent) continue;
    if (!parentDead && idleMs < ttl) continue;

    candidates.push({
      pid: item.pid,
      parentPid: item.parentPid,
      startedAtMs: item.startedAt,
      lastActivityAtMs,
      idleMs,
      role,
      scriptPath: normalizeProcessPath(scriptPath),
      reason: parentDead ? 'parent_dead' : lease ? 'lease_expired' : 'legacy_process_expired',
    });
  }

  const selectedPids = new Set(candidates.map((candidate) => candidate.pid));
  const byParent = new Map();
  for (const item of owned) {
    if (selectedPids.has(item.pid)) continue;
    const group = byParent.get(item.parentPid) ?? [];
    group.push(item);
    byParent.set(item.parentPid, group);
  }
  for (const group of byParent.values()) {
    const excess = Math.max(0, group.length - maxConnections);
    if (excess === 0) continue;
    const idle = group
      .filter((item) => !item.isCurrent && item.idleMs >= capacityGrace)
      .sort((left, right) => right.idleMs - left.idleMs)
      .slice(0, excess);
    for (const item of idle) {
      candidates.push({
        pid: item.pid,
        parentPid: item.parentPid,
        startedAtMs: item.startedAt,
        lastActivityAtMs: item.lastActivityAtMs,
        idleMs: item.idleMs,
        role,
        scriptPath: normalizeProcessPath(scriptPath),
        reason: 'connection_capacity_exceeded',
      });
    }
  }
  return candidates.sort((left, right) => right.idleMs - left.idleMs);
}

function inspectWindowsProcess(pid, { spawnSyncImpl = spawnSync } = {}) {
  const command = [
    `$item = Get-CimInstance Win32_Process -Filter \"ProcessId = ${Number(pid)}\"`,
    'if ($null -eq $item) { return }',
    '[pscustomobject]@{',
    '  pid = [int]$item.ProcessId',
    "  startedAt = $item.CreationDate.ToUniversalTime().ToString('o')",
    '  commandLine = [string]$item.CommandLine',
    '} | ConvertTo-Json -Compress',
  ].join('\n');
  const result = spawnSyncImpl(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', command],
    { encoding: 'utf8', windowsHide: true }
  );
  if (result.status !== 0 || !String(result.stdout || '').trim()) return null;
  return normalizedProcess(JSON.parse(result.stdout));
}

export function killOwnedWindowsProcessTree(
  candidate,
  { spawnSyncImpl = spawnSync, inspectProcess = inspectWindowsProcess } = {}
) {
  const current = inspectProcess(candidate.pid, { spawnSyncImpl });
  if (!current) return { killed: false, reason: 'already_exited', pid: candidate.pid };
  const sameStart = Math.abs(current.startedAt - candidate.startedAtMs) <= 1_000;
  const sameOwner = commandLineOwnsNodeScript(current.commandLine, candidate.scriptPath);
  if (!sameStart || !sameOwner) {
    return { killed: false, reason: 'ownership_changed', pid: candidate.pid };
  }
  const result = spawnSyncImpl('taskkill.exe', ['/PID', String(candidate.pid), '/T', '/F'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  return {
    killed: result.status === 0,
    reason: result.status === 0 ? candidate.reason : 'taskkill_failed',
    pid: candidate.pid,
  };
}

export function reapStaleOwnedMcpProcesses({
  role,
  scriptPath,
  leaseDir = defaultMcpProcessLeaseDir(),
  staleAfterMs = finitePositiveNumber(
    process.env.HOLOSCRIPT_MCP_CONNECTION_TTL_MS,
    DEFAULT_MCP_PROCESS_STALE_AFTER_MS
  ),
  maxConnectionsPerParent = finitePositiveNumber(
    process.env.HOLOSCRIPT_MCP_MAX_CONNECTIONS_PER_PARENT,
    DEFAULT_MCP_MAX_CONNECTIONS_PER_PARENT
  ),
  capacityIdleAfterMs = finitePositiveNumber(
    process.env.HOLOSCRIPT_MCP_CAPACITY_IDLE_AFTER_MS,
    DEFAULT_MCP_CAPACITY_IDLE_AFTER_MS
  ),
  currentPid = process.pid,
  nowMs = Date.now(),
  processes,
  leases,
  listProcesses = listWindowsNodeProcesses,
  killTree = killOwnedWindowsProcessTree,
  dryRun = false,
} = {}) {
  if (!role || !scriptPath) throw new Error('role and scriptPath are required');
  const observed = processes ?? listProcesses();
  const knownLeases = leases ?? readMcpProcessLeases(leaseDir);
  const candidates = buildOwnedMcpProcessReapPlan({
    processes: observed,
    leases: knownLeases,
    role,
    scriptPath,
    currentPid,
    nowMs,
    staleAfterMs,
    maxConnectionsPerParent,
    capacityIdleAfterMs,
  });
  const actions = candidates.map((candidate) =>
    dryRun ? { killed: false, reason: 'dry_run', pid: candidate.pid } : killTree(candidate)
  );
  let leasesPruned = 0;
  if (!dryRun) {
    const observedPids = new Set(observed.map((item) => Number(item.pid ?? item.ProcessId)));
    for (const lease of knownLeases) {
      if (lease.role !== role) continue;
      if (normalizeProcessPath(lease.scriptPath) !== normalizeProcessPath(scriptPath)) continue;
      const action = actions.find((entry) => entry.pid === Number(lease.pid));
      const actionResolved =
        action?.killed ||
        action?.reason === 'already_exited' ||
        action?.reason === 'ownership_changed';
      if (observedPids.has(Number(lease.pid)) && !actionResolved) continue;
      rmSync(join(leaseDir, `${role}-${Number(lease.pid)}.json`), { force: true });
      leasesPruned += 1;
    }
  }
  return {
    schema: MCP_PROCESS_REAP_RECEIPT_SCHEMA,
    role,
    scriptPath: normalizeProcessPath(scriptPath),
    generatedAt: new Date(nowMs).toISOString(),
    staleAfterMs,
    maxConnectionsPerParent,
    capacityIdleAfterMs,
    observedProcesses: observed.length,
    candidates,
    actions,
    leasesPruned,
  };
}

export function openMcpProcessLease({
  role,
  scriptPath,
  leaseDir = defaultMcpProcessLeaseDir(),
  pid = process.pid,
  parentPid = process.ppid,
  now = Date.now,
  startedAtMs = now() - process.uptime() * 1000,
  heartbeatIntervalMs = finitePositiveNumber(
    process.env.HOLOSCRIPT_MCP_HEARTBEAT_INTERVAL_MS,
    DEFAULT_MCP_PROCESS_HEARTBEAT_INTERVAL_MS
  ),
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  registerProcessHooks = true,
} = {}) {
  if (!role || !scriptPath) throw new Error('role and scriptPath are required');
  mkdirSync(leaseDir, { recursive: true });
  const leasePath = join(leaseDir, `${role}-${pid}.json`);
  const lease = {
    schema: MCP_PROCESS_LEASE_SCHEMA,
    instanceId: randomUUID(),
    role,
    pid,
    parentPid,
    scriptPath: normalizeProcessPath(scriptPath),
    startedAtMs,
    lastActivityAtMs: now(),
    heartbeatIntervalMs,
  };
  let closed = false;
  let lastWriteAt = 0;
  let heartbeatTimer = null;

  const persist = (force = false) => {
    if (closed) return;
    if (!force && lease.lastActivityAtMs - lastWriteAt < 1_000) return;
    const tempPath = `${leasePath}.${lease.instanceId}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(lease)}\n`, 'utf8');
    renameSync(tempPath, leasePath);
    lastWriteAt = lease.lastActivityAtMs;
  };
  const touch = () => {
    lease.lastActivityAtMs = now();
    persist();
  };
  const close = () => {
    if (closed) return;
    closed = true;
    if (heartbeatTimer !== null) {
      clearIntervalImpl(heartbeatTimer);
      heartbeatTimer = null;
    }
    rmSync(leasePath, { force: true });
  };
  persist(true);
  heartbeatTimer = setIntervalImpl(touch, heartbeatIntervalMs);
  heartbeatTimer?.unref?.();
  if (registerProcessHooks) process.once('exit', close);
  return { lease, leasePath, touch, close, heartbeatIntervalMs };
}

export function startMcpProcessLifecycle(options) {
  const reapReceipt = reapStaleOwnedMcpProcesses(options);
  const lease = openMcpProcessLease(options);
  return { ...lease, reapReceipt };
}
