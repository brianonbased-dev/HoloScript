#!/usr/bin/env node
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MCP_PROCESS_LEASE_SCHEMA,
  buildOwnedMcpProcessReapPlan,
  commandLineOwnsNodeScript,
  killOwnedWindowsProcessTree,
  openMcpProcessLease,
  reapStaleOwnedMcpProcesses,
} from '../lib/mcp-process-lifecycle.mjs';

const scriptPath = 'C:/repo/scripts/holoscript-mcp-stdio.mjs';

function ownedProcess(pid, startedAt, overrides = {}) {
  return {
    pid,
    parentPid: 99,
    parentAlive: true,
    startedAt,
    commandLine: `"C:/Program Files/nodejs/node.exe" ${scriptPath}`,
    ...overrides,
  };
}

test('command ownership requires the exact Node script token', () => {
  assert.equal(
    commandLineOwnsNodeScript(
      '"C:/Program Files/nodejs/node.exe" C:/repo/scripts/holoscript-mcp-stdio.mjs',
      scriptPath
    ),
    true
  );
  assert.equal(
    commandLineOwnsNodeScript(
      '"C:/Program Files/nodejs/node.exe" C:/work/unrelated.mjs C:/repo/scripts/holoscript-mcp-stdio.mjs',
      scriptPath
    ),
    false,
    'mentioning the owned path as an argument must not grant ownership'
  );
});

test('reap plan selects expired owned leases and legacy roots, never unrelated Node', () => {
  const nowMs = Date.parse('2026-07-19T12:00:00.000Z');
  const hour = 60 * 60 * 1000;
  const processes = [
    ownedProcess(10, nowMs - 8 * hour),
    ownedProcess(11, nowMs - 8 * hour),
    ownedProcess(12, nowMs - 8 * hour),
    ownedProcess(13, nowMs - 8 * hour, {
      commandLine: '"C:/Program Files/nodejs/node.exe" C:/work/unrelated.mjs',
    }),
    ownedProcess(14, nowMs - 8 * hour),
  ];
  const leases = [
    {
      schema: MCP_PROCESS_LEASE_SCHEMA,
      role: 'holoscript-mcp-stdio',
      pid: 10,
      scriptPath,
      startedAtMs: nowMs - 8 * hour,
      lastActivityAtMs: nowMs - 5 * hour,
    },
    {
      schema: MCP_PROCESS_LEASE_SCHEMA,
      role: 'holoscript-mcp-stdio',
      pid: 11,
      scriptPath,
      startedAtMs: nowMs - 8 * hour,
      lastActivityAtMs: nowMs - hour,
    },
  ];

  const plan = buildOwnedMcpProcessReapPlan({
    processes,
    leases,
    role: 'holoscript-mcp-stdio',
    scriptPath,
    currentPid: 14,
    nowMs,
    staleAfterMs: 4 * hour,
  });

  assert.deepEqual(
    plan.map((candidate) => [candidate.pid, candidate.reason]),
    [
      [12, 'legacy_process_expired'],
      [10, 'lease_expired'],
    ]
  );
});

test('kill revalidates PID start time and ownership before taskkill', () => {
  const calls = [];
  const result = killOwnedWindowsProcessTree(
    {
      pid: 20,
      startedAtMs: 1000,
      scriptPath,
      reason: 'lease_expired',
    },
    {
      inspectProcess: () =>
        ownedProcess(20, 2000, {
          commandLine: '"C:/Program Files/nodejs/node.exe" C:/work/unrelated.mjs',
        }),
      spawnSyncImpl: (...args) => {
        calls.push(args);
        return { status: 0 };
      },
    }
  );

  assert.deepEqual(result, { killed: false, reason: 'ownership_changed', pid: 20 });
  assert.deepEqual(calls, []);
});

test('connection ceiling evicts only the least-recently-active owned roots', () => {
  const nowMs = Date.parse('2026-07-19T12:00:00.000Z');
  const minute = 60 * 1000;
  const processes = [20, 18, 12, 8, 4, 1].map((ageMinutes, index) =>
    ownedProcess(index + 1, nowMs - ageMinutes * minute)
  );

  const plan = buildOwnedMcpProcessReapPlan({
    processes,
    role: 'holoscript-mcp-stdio',
    scriptPath,
    currentPid: 6,
    nowMs,
    staleAfterMs: 4 * 60 * minute,
    maxConnectionsPerParent: 4,
    capacityIdleAfterMs: 10 * minute,
  });

  assert.deepEqual(
    plan.map(({ pid, reason }) => [pid, reason]),
    [
      [1, 'connection_capacity_exceeded'],
      [2, 'connection_capacity_exceeded'],
    ]
  );
});

test('lease writes activity and removes its own file on close', () => {
  const leaseDir = mkdtempSync(join(tmpdir(), 'holoscript-mcp-lease-test-'));
  let nowMs = 100_000;
  try {
    const lifecycle = openMcpProcessLease({
      role: 'holoscript-mcp-stdio',
      scriptPath,
      leaseDir,
      pid: 55,
      parentPid: 44,
      startedAtMs: 90_000,
      now: () => nowMs,
      registerProcessHooks: false,
    });
    assert.equal(JSON.parse(readFileSync(lifecycle.leasePath, 'utf8')).lastActivityAtMs, nowMs);
    nowMs += 2_000;
    lifecycle.touch();
    assert.equal(JSON.parse(readFileSync(lifecycle.leasePath, 'utf8')).lastActivityAtMs, nowMs);
    lifecycle.close();
    assert.throws(() => readFileSync(lifecycle.leasePath, 'utf8'), /ENOENT/);
  } finally {
    rmSync(leaseDir, { recursive: true, force: true });
  }
});

test('registry pruning removes leases whose exact process no longer exists', () => {
  const leaseDir = mkdtempSync(join(tmpdir(), 'holoscript-mcp-prune-test-'));
  try {
    const lifecycle = openMcpProcessLease({
      role: 'holoscript-mcp-stdio',
      scriptPath,
      leaseDir,
      pid: 77,
      parentPid: 66,
      registerProcessHooks: false,
    });
    const receipt = reapStaleOwnedMcpProcesses({
      role: 'holoscript-mcp-stdio',
      scriptPath,
      leaseDir,
      processes: [],
      leases: [lifecycle.lease],
      killTree: () => {
        throw new Error('no process should be killed while pruning an absent PID');
      },
    });
    assert.equal(receipt.leasesPruned, 1);
    assert.throws(() => readFileSync(lifecycle.leasePath, 'utf8'), /ENOENT/);
    lifecycle.close();
  } finally {
    rmSync(leaseDir, { recursive: true, force: true });
  }
});
