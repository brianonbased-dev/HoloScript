#!/usr/bin/env node
/**
 * Deterministic HoloAbsorb sovereign-transport resilience benchmark.
 *
 * This is a synthetic lifecycle benchmark. It does not open network sockets or
 * terminate real processes. It exercises the same lease, heartbeat, capacity,
 * stale-parent, expiry, and registry-pruning primitives used by the stdio MCP
 * transport and emits a machine-readable receipt.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import {
  MCP_PROCESS_LEASE_SCHEMA,
  buildOwnedMcpProcessReapPlan,
  openMcpProcessLease,
  readMcpProcessLeases,
  reapStaleOwnedMcpProcesses,
} from '../../../scripts/lib/mcp-process-lifecycle.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
const role = 'holoscript-mcp-stdio';
const scriptPath = resolve(repoRoot, 'scripts/holoscript-mcp-stdio.mjs');
const minute = 60 * 1000;
const hour = 60 * minute;

function positiveInt(value, flag) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function parseArgs(argv) {
  const options = {
    out: `.scratch/holoabsorb-transport-${stamp}.json`,
    iterations: 25,
    maxConnections: 4096,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (raw === '--help') return { ...options, help: true };
    const [flag, inline] = raw.split('=', 2);
    const value = inline ?? argv[index + 1];
    if (inline === undefined && value && !value.startsWith('--')) index += 1;
    if (flag === '--out') options.out = value;
    if (flag === '--iterations') options.iterations = positiveInt(value, flag);
    if (flag === '--max-connections') options.maxConnections = positiveInt(value, flag);
  }
  return options;
}

function usage() {
  return [
    'Usage: node packages/absorb-service/scripts/bench-holoabsorb-transport.mjs [options]',
    '',
    'Options:',
    '  --out=PATH              Receipt path',
    '  --iterations=N          Samples per scale (default 25)',
    '  --max-connections=N     Largest synthetic registry (default 4096)',
    '  --help                  Show this message',
  ].join('\n');
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function gitValue(args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function syntheticRegistry(size, nowMs) {
  const startedAt = nowMs - hour;
  const processes = Array.from({ length: size }, (_, index) => ({
    pid: index + 1,
    parentPid: 9000,
    parentAlive: true,
    startedAt,
    commandLine: `node "${scriptPath}"`,
  }));
  const leases = processes.map((item) => ({
    schema: MCP_PROCESS_LEASE_SCHEMA,
    role,
    pid: item.pid,
    parentPid: item.parentPid,
    scriptPath,
    startedAtMs: item.startedAt,
    lastActivityAtMs: nowMs,
  }));
  return { processes, leases };
}

function benchmarkRegistry({ size, iterations, nowMs }) {
  const { processes, leases } = syntheticRegistry(size, nowMs);
  const samples = [];
  let candidateCount = null;
  let maxRssBytes = process.memoryUsage().rss;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const started = performance.now();
    const plan = buildOwnedMcpProcessReapPlan({
      processes,
      leases,
      role,
      scriptPath,
      currentPid: size + 1,
      nowMs,
      maxConnectionsPerParent: size,
    });
    samples.push(performance.now() - started);
    candidateCount = plan.length;
    maxRssBytes = Math.max(maxRssBytes, process.memoryUsage().rss);
  }
  samples.sort((left, right) => left - right);
  return {
    connections: size,
    iterations,
    candidateCount,
    medianMs: round(percentile(samples, 0.5)),
    p95Ms: round(percentile(samples, 0.95)),
    p99Ms: round(percentile(samples, 0.99)),
    maxRssBytes,
  };
}

function runFaultScenario() {
  const leaseDir = mkdtempSync(resolve(tmpdir(), 'holoabsorb-transport-bench-'));
  const startedAtMs = Date.parse('2026-07-27T12:00:00.000Z');
  let nowMs = startedAtMs;
  const timers = new Map();
  const cleared = new Set();
  const unrefed = new Set();
  const lifecycles = [];
  const processes = Array.from({ length: 6 }, (_, index) => ({
    pid: 1001 + index,
    parentPid: 7000,
    parentAlive: true,
    startedAt: startedAtMs,
    commandLine: `node "${scriptPath}"`,
  }));

  try {
    for (const processInfo of processes) {
      const timer = {
        pid: processInfo.pid,
        unref() {
          unrefed.add(processInfo.pid);
        },
      };
      const lifecycle = openMcpProcessLease({
        role,
        scriptPath,
        leaseDir,
        pid: processInfo.pid,
        parentPid: processInfo.parentPid,
        startedAtMs,
        now: () => nowMs,
        heartbeatIntervalMs: 30 * 1000,
        setIntervalImpl: (callback) => {
          timers.set(processInfo.pid, callback);
          return timer;
        },
        clearIntervalImpl: (handle) => {
          cleared.add(handle.pid);
        },
        registerProcessHooks: false,
      });
      lifecycles.push(lifecycle);
    }

    nowMs += 20 * minute;
    for (const callback of timers.values()) callback();
    const capacityPlan = buildOwnedMcpProcessReapPlan({
      processes,
      leases: readMcpProcessLeases(leaseDir),
      role,
      scriptPath,
      currentPid: 9999,
      nowMs,
      maxConnectionsPerParent: 4,
      capacityIdleAfterMs: 10 * minute,
    });

    nowMs += 5 * hour;
    for (const processInfo of processes.slice(0, 4)) {
      timers.get(processInfo.pid)?.();
    }
    processes[4].parentAlive = false;
    const reaped = reapStaleOwnedMcpProcesses({
      role,
      scriptPath,
      leaseDir,
      currentPid: 9999,
      nowMs,
      processes,
      leases: readMcpProcessLeases(leaseDir),
      staleAfterMs: 4 * hour,
      maxConnectionsPerParent: 4,
      capacityIdleAfterMs: 10 * minute,
      killTree: (candidate) => ({
        killed: true,
        reason: candidate.reason,
        pid: candidate.pid,
      }),
    });
    const retainedLeases = readMcpProcessLeases(leaseDir);
    for (const lifecycle of lifecycles) lifecycle.close();

    return {
      capacityPressure: {
        connections: 6,
        ceiling: 4,
        idleGraceMs: 10 * minute,
        candidates: capacityPlan,
      },
      faultInjection: {
        expected: {
          parentDeadPid: processes[4].pid,
          expiredPid: processes[5].pid,
        },
        receipt: reaped,
      },
      registryAfterReap: {
        retainedLeasePids: retainedLeases.map((lease) => Number(lease.pid)).sort((a, b) => a - b),
        retainedLeaseCount: retainedLeases.length,
      },
      timerLifecycle: {
        opened: lifecycles.length,
        unrefed: unrefed.size,
        cleared: cleared.size,
      },
    };
  } finally {
    for (const lifecycle of lifecycles) lifecycle.close();
    rmSync(leaseDir, { recursive: true, force: true });
  }
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }

  const outPath = resolve(repoRoot, options.out);
  mkdirSync(dirname(outPath), { recursive: true });
  const nowMs = Date.parse('2026-07-27T12:00:00.000Z');
  const rssAtStart = process.memoryUsage().rss;
  const scales = [...new Set([64, 256, 1024, options.maxConnections])]
    .filter((size) => size <= options.maxConnections)
    .sort((left, right) => left - right);
  const performanceByScale = scales.map((size) =>
    benchmarkRegistry({ size, iterations: options.iterations, nowMs })
  );
  const faults = runFaultScenario();
  const largest = performanceByScale.at(-1);
  const expectedFaults = faults.faultInjection.expected;
  const candidates = faults.faultInjection.receipt.candidates;
  const checks = [
    {
      id: 'healthy-heartbeats-survive-capacity-pressure',
      pass: faults.capacityPressure.candidates.length === 0,
    },
    {
      id: 'dead-parent-reaped',
      pass: candidates.some(
        (candidate) =>
          candidate.pid === expectedFaults.parentDeadPid && candidate.reason === 'parent_dead'
      ),
    },
    {
      id: 'expired-lease-reaped',
      pass: candidates.some(
        (candidate) =>
          candidate.pid === expectedFaults.expiredPid && candidate.reason === 'lease_expired'
      ),
    },
    {
      id: 'faulted-leases-pruned',
      pass:
        faults.faultInjection.receipt.leasesPruned === 2 &&
        faults.registryAfterReap.retainedLeaseCount === 4,
    },
    {
      id: 'heartbeat-timers-unref-and-close',
      pass:
        faults.timerLifecycle.unrefed === faults.timerLifecycle.opened &&
        faults.timerLifecycle.cleared === faults.timerLifecycle.opened,
    },
    {
      id: 'largest-registry-has-no-false-positive',
      pass: largest?.candidateCount === 0,
    },
    {
      id: 'largest-registry-p95-under-one-second',
      pass: typeof largest?.p95Ms === 'number' && largest.p95Ms < 1000,
    },
  ];
  const failedChecks = checks.filter((check) => !check.pass);
  const receipt = {
    schemaVersion: 'holoscript.holoabsorb.transport-resilience.v1',
    kind: 'HoloAbsorbTransportResilienceBenchmark',
    status: failedChecks.length === 0 ? 'pass' : 'fail',
    capturedAt: new Date().toISOString(),
    productName: 'HoloAbsorb',
    repo: {
      commit: gitValue(['rev-parse', 'HEAD']),
      worktreeStatus: gitValue(['status', '--short']),
    },
    runtime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      rssAtStartBytes: rssAtStart,
      rssAtEndBytes: process.memoryUsage().rss,
    },
    options,
    performanceByScale,
    faults,
    checks,
    failedChecks: failedChecks.map((check) => check.id),
    claimBoundary: [
      'This receipt is a deterministic synthetic lifecycle benchmark; it does not claim network throughput or end-to-end MCP request latency.',
      'No real processes are terminated. Fault actions are injected through the canonical ownership-checked reaper interface.',
      'The one-second p95 guardrail detects severe registry-scaling regressions; it is not a production latency service-level objective.',
    ],
  };
  writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(
    `HoloAbsorb transport resilience ${receipt.status.toUpperCase()} -> ${relative(
      repoRoot,
      outPath
    ).replace(/\\/gu, '/')}`
  );
  return receipt.status === 'pass' ? 0 : 1;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(
      `[bench-holoabsorb-transport] ${error instanceof Error ? error.stack : String(error)}`
    );
    process.exitCode = 1;
  }
}
