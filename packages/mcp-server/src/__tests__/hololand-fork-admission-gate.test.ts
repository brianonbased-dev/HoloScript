/**
 * HoloLand Fork Admission Gate Tests
 *
 * Validates that the gate:
 * 1. Passes benign HoloLand artifacts (world, shard, zone, npc).
 * 2. Blocks artifacts that contain fork indicators in code-bearing fields.
 * 3. Combines structural findings with fork findings.
 * 4. Reports fork signals in the result.
 *
 * Authority: W.GOLD.035, W.GOLD.039, W.GOLD.193
 * Task: task_1778619015439_l51b
 */

import { describe, it, expect } from 'vitest';
import { runHololandForkAdmissionGate } from '../security/hololand-fork-admission-gate';

describe('runHololandForkAdmissionGate', () => {
  // ── Benign artifacts ────────────────────────────────────────────────────────

  it('passes a benign world artifact', () => {
    const report = runHololandForkAdmissionGate({
      artifactKind: 'world',
      artifactId: 'world-benign',
      artifact: {
        metadata: { id: 'world-benign', name: 'Benign World' },
        config: { maxUsers: 50, bounds: { min: [0, 0, 0], max: [100, 100, 100] } },
        spawnPoints: [{ id: 'sp1', position: [0, 0, 0] }],
      },
    });
    expect(report.passed).toBe(true);
    expect(report.forkSignals).toEqual([]);
    expect(report.criticalCount).toBe(0);
  });

  it('passes a benign shard artifact', () => {
    const report = runHololandForkAdmissionGate({
      artifactKind: 'shard',
      artifactId: 'shard-benign',
      artifact: {
        id: 'shard-benign',
        name: 'Benign Shard',
        schemaVersion: 1,
        hash: 'a'.repeat(64),
        hashAlgorithm: 'sha256',
        zones: [{ id: 'z1', name: 'Town', biome: 'urban' }],
        encounters: [],
        quests: [],
        items: [],
        skills: [],
        lootTables: [],
        metadata: {},
      },
    });
    expect(report.passed).toBe(true);
    expect(report.forkSignals).toEqual([]);
  });

  it('passes a benign zone artifact', () => {
    const report = runHololandForkAdmissionGate({
      artifactKind: 'zone',
      artifactId: 'zone-benign',
      artifact: {
        id: 'zone-benign',
        name: 'Benign Zone',
        biome: 'urban',
        encounterIds: [],
        metadata: {},
      },
    });
    expect(report.passed).toBe(true);
    expect(report.forkSignals).toEqual([]);
  });

  it('passes a benign NPC artifact', () => {
    const report = runHololandForkAdmissionGate({
      artifactKind: 'npc',
      artifactId: 'npc-benign',
      artifact: {
        id: 'npc-benign',
        name: 'Benign NPC',
        role: 'guide',
        behavior: 'friendly',
        modelProvider: 'cloud',
        systemPrompt: 'You are a helpful guide.',
        dialogueTree: '{ "greeting": "Hello!" }',
        enabled: true,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      },
    });
    expect(report.passed).toBe(true);
    expect(report.forkSignals).toEqual([]);
  });

  // ── Fork detection in NPC fields ───────────────────────────────────────────

  it('blocks NPC with eval in systemPrompt', () => {
    const report = runHololandForkAdmissionGate({
      artifactKind: 'npc',
      artifactId: 'npc-evil',
      artifact: {
        id: 'npc-evil',
        name: 'Evil NPC',
        role: 'enemy',
        behavior: 'hostile',
        modelProvider: 'cloud',
        systemPrompt: 'eval("process.exit(0)")',
        enabled: true,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      },
    });
    expect(report.passed).toBe(false);
    expect(report.forkSignals).toContain('HS010-blocked-keyword:eval');
    expect(report.forkSignals).toContain('HS010-blocked-keyword:process');
    expect(report.findings.some((f) => f.ruleId === 'FORK-001' && f.severity === 'critical')).toBe(true);
  });

  it('blocks NPC with fs in dialogueTree', () => {
    const report = runHololandForkAdmissionGate({
      artifactKind: 'npc',
      artifactId: 'npc-fs',
      artifact: {
        id: 'npc-fs',
        name: 'FS NPC',
        role: 'merchant',
        behavior: 'neutral',
        modelProvider: 'sovereign',
        dialogueTree: '{ "action": "fs.readFileSync(\"/etc/passwd\")" }',
        enabled: true,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      },
    });
    expect(report.passed).toBe(false);
    expect(report.forkSignals).toContain('HS010-blocked-keyword:fs');
  });

  it('blocks NPC with non-canonical import in systemPrompt', () => {
    const report = runHololandForkAdmissionGate({
      artifactKind: 'npc',
      artifactId: 'npc-import',
      artifact: {
        id: 'npc-import',
        name: 'Import NPC',
        role: 'companion',
        behavior: 'friendly',
        modelProvider: 'sovereign',
        systemPrompt: 'import { evil } from "@evil/package";\norb x {}',
        enabled: true,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      },
    });
    expect(report.passed).toBe(false);
    expect(report.forkSignals).toContain('non-canonical-import');
  });

  it('blocks NPC with unknown compiler version in dialogueTree', () => {
    const report = runHololandForkAdmissionGate({
      artifactKind: 'npc',
      artifactId: 'npc-version',
      artifact: {
        id: 'npc-version',
        name: 'Version NPC',
        role: 'ambient',
        behavior: 'neutral',
        modelProvider: 'local',
        dialogueTree: '@compiler version "99.0.0"\norb x {}',
        enabled: true,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      },
    });
    expect(report.passed).toBe(false);
    expect(report.forkSignals).toContain('unknown-compiler-version:99.0.0');
  });

  it('blocks NPC with no-op security trait', () => {
    const report = runHololandForkAdmissionGate({
      artifactKind: 'npc',
      artifactId: 'npc-noop',
      artifact: {
        id: 'npc-noop',
        name: 'NoOp NPC',
        role: 'ambient',
        behavior: 'neutral',
        modelProvider: 'local',
        systemPrompt: 'orb x { @security_sandbox }',
        enabled: true,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      },
    });
    expect(report.passed).toBe(false);
    expect(report.forkSignals).toContain('no-op-security-trait');
  });

  // ── Fork detection in world fields ─────────────────────────────────────────

  it('blocks world with hostile holoCode in spawnPoints', () => {
    const report = runHololandForkAdmissionGate({
      artifactKind: 'world',
      artifactId: 'world-hostile',
      artifact: {
        metadata: { id: 'world-hostile', name: 'Hostile World' },
        config: { maxUsers: 50, bounds: { min: [0, 0, 0], max: [100, 100, 100] } },
        spawnPoints: [
          {
            id: 'sp1',
            position: [0, 0, 0],
            script: 'eval("bad")',
          },
        ],
      },
    });
    expect(report.passed).toBe(false);
    expect(report.forkSignals).toContain('HS010-blocked-keyword:eval');
  });

  it('blocks world with non-canonical import in metadata', () => {
    const report = runHololandForkAdmissionGate({
      artifactKind: 'world',
      artifactId: 'world-import',
      artifact: {
        metadata: {
          id: 'world-import',
          name: 'Import World',
          extra: 'import { x } from "@evil/pkg";',
        },
        config: { maxUsers: 50, bounds: { min: [0, 0, 0], max: [100, 100, 100] } },
        spawnPoints: [{ id: 'sp1', position: [0, 0, 0] }],
      },
    });
    expect(report.passed).toBe(false);
    expect(report.forkSignals).toContain('non-canonical-import');
  });

  // ── Fork detection in shard fields ─────────────────────────────────────────

  it('blocks shard with hostile code in quest objectives', () => {
    const report = runHololandForkAdmissionGate({
      artifactKind: 'shard',
      artifactId: 'shard-hostile',
      artifact: {
        id: 'shard-hostile',
        name: 'Hostile Shard',
        schemaVersion: 1,
        hash: 'a'.repeat(64),
        hashAlgorithm: 'sha256',
        zones: [{ id: 'z1', name: 'Zone', biome: 'urban' }],
        encounters: [],
        quests: [
          {
            id: 'q1',
            name: 'Quest',
            steps: [{ id: 's1', objective: 'eval("process.exit()")' }],
          },
        ],
        items: [],
        skills: [],
        lootTables: [],
        metadata: {},
      },
    });
    expect(report.passed).toBe(false);
    expect(report.forkSignals).toContain('HS010-blocked-keyword:eval');
    expect(report.forkSignals).toContain('HS010-blocked-keyword:process');
  });

  // ── Fork detection in zone fields ──────────────────────────────────────────

  it('blocks zone with hostile code in metadata', () => {
    const report = runHololandForkAdmissionGate({
      artifactKind: 'zone',
      artifactId: 'zone-hostile',
      artifact: {
        id: 'zone-hostile',
        name: 'Hostile Zone',
        biome: 'urban',
        encounterIds: [],
        metadata: {
          script: 'require("child_process").exec("rm -rf /")',
        },
      },
    });
    expect(report.passed).toBe(false);
    expect(report.forkSignals).toContain('HS010-blocked-keyword:require');
    expect(report.forkSignals).toContain('HS010-blocked-keyword:child_process');
  });

  // ── Combined findings ──────────────────────────────────────────────────────

  it('reports both structural and fork findings', () => {
    const report = runHololandForkAdmissionGate({
      artifactKind: 'world',
      artifactId: 'world-combined',
      artifact: {
        metadata: { id: '', name: '' },
        config: { maxUsers: 0 },
        spawnPoints: [{ id: 'sp1', position: [0, 0, 0], script: 'eval("bad")' }],
      },
    });
    expect(report.passed).toBe(false);
    // Structural finding from artifact-admission-gate
    expect(report.findings.some((f) => f.ruleId === 'WORLD-001')).toBe(true);
    expect(report.findings.some((f) => f.ruleId === 'WORLD-002')).toBe(true);
    // Fork finding
    expect(report.findings.some((f) => f.ruleId === 'FORK-001')).toBe(true);
    expect(report.forkSignals.length).toBeGreaterThan(0);
  });

  // ── Depth limit ────────────────────────────────────────────────────────────

  it('respects recursion depth limit (10) to prevent abuse', () => {
    // Build a deeply nested object (depth 15) with fork signal at the bottom
    let deep: Record<string, unknown> = { payload: 'eval("deep")' };
    for (let i = 0; i < 15; i++) {
      deep = { nested: deep };
    }

    const report = runHololandForkAdmissionGate({
      artifactKind: 'world',
      artifactId: 'world-deep',
      artifact: {
        metadata: { id: 'world-deep', name: 'Deep World' },
        config: { maxUsers: 50, bounds: { min: [0, 0, 0], max: [100, 100, 100] } },
        spawnPoints: [{ id: 'sp1', position: [0, 0, 0] }],
        // The deeply nested object is in an unrelated field — scanner should stop at depth 10
        extra: deep,
      },
    });
    // Because depth > 10, the scanner should stop and not find the signal
    expect(report.forkSignals).toEqual([]);
    expect(report.passed).toBe(true);
  });

  // ── Skip fields ────────────────────────────────────────────────────────────

  it('skips metadata fields that are unlikely to contain code', () => {
    const report = runHololandForkAdmissionGate({
      artifactKind: 'npc',
      artifactId: 'npc-skip',
      artifact: {
        id: 'npc-skip',
        name: 'Skip NPC',
        role: 'guide',
        behavior: 'friendly',
        modelProvider: 'cloud',
        systemPrompt: 'You are a guide.',
        // The "description" field is in SKIP_FIELDS, so this eval should be ignored
        description: 'eval("should be skipped")',
        enabled: true,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      },
    });
    expect(report.passed).toBe(true);
    expect(report.forkSignals).toEqual([]);
  });

  // ── False case: benign strings that happen to contain code keywords ────────

  it('does not flag strings that contain single keywords without code context', () => {
    const report = runHololandForkAdmissionGate({
      artifactKind: 'npc',
      artifactId: 'npc-false',
      artifact: {
        id: 'npc-false',
        name: 'False NPC',
        role: 'guide',
        behavior: 'friendly',
        modelProvider: 'cloud',
        // "process" alone does not trigger looksLikeCode because there are no braces,
        // no @, no orb, etc. The heuristic requires at least one CODE_HEURISTIC marker.
        systemPrompt: 'The creative process is important.',
        enabled: true,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      },
    });
    expect(report.passed).toBe(true);
    expect(report.forkSignals).toEqual([]);
  });
});
