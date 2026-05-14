/**
 * Unified Capability Schema — Unit Tests
 *
 * Verifies the base + all four extensions (agent, steward, shell, mesh).
 */

import { describe, it, expect } from 'vitest';
import {
  validateCapability,
  validateAgentCapability,
  validateStewardCapability,
  validateShellCapability,
  validateMeshCapability,
  isAgentCapability,
  isStewardCapability,
  isShellCapability,
  isMeshCapability,
  cloneCapability,
  cloneAgentCapability,
  cloneStewardCapability,
  cloneShellCapability,
  cloneMeshCapability,
} from '../Capability';
import type {
  Capability,
  AgentCapability,
  StewardCapability,
  ShellCapability,
  MeshCapability,
} from '../Capability';

describe('Base Capability', () => {
  it('validates a minimal capability', () => {
    const cap: Capability = { id: 'test:base:foo', name: 'Foo', kind: 'base' };
    expect(validateCapability(cap)).toEqual([]);
  });

  it('rejects missing id', () => {
    const cap = { name: 'Foo', kind: 'base' } as Capability;
    expect(validateCapability(cap)).toContain('Capability.id is required.');
  });

  it('rejects missing name', () => {
    const cap = { id: 'test:base:foo', kind: 'base' } as Capability;
    expect(validateCapability(cap)).toContain('Capability test:base:foo.name is required.');
  });

  it('rejects missing kind', () => {
    const cap = { id: 'test:base:foo', name: 'Foo' } as Capability;
    expect(validateCapability(cap)).toContain('Capability test:base:foo.kind is required.');
  });

  it('clones without mutating metadata', () => {
    const cap: Capability = {
      id: 'test:base:foo',
      name: 'Foo',
      kind: 'base',
      metadata: { x: 1 },
    };
    const cloned = cloneCapability(cap);
    cloned.metadata!.x = 2;
    expect(cap.metadata).toEqual({ x: 1 });
  });
});

describe('AgentCapability', () => {
  const valid: AgentCapability = {
    id: 'agent:render:visual-synth',
    name: 'Visual Synthesizer',
    kind: 'render',
    domain: 'vision',
    cost: { compute: 80, memory: 60, network: 10 },
    latency: 'fast',
    inputs: ['text/plain'],
    output: 'image/png',
    available: true,
    priority: 50,
  };

  it('validates a rich agent capability', () => {
    expect(validateAgentCapability(valid)).toEqual([]);
  });

  it('rejects missing domain', () => {
    const bad = { ...valid, domain: undefined };
    expect(validateAgentCapability(bad)).toContain(
      'AgentCapability agent:render:visual-synth.domain is required.',
    );
  });

  it('rejects bad latency', () => {
    const bad = { ...valid, latency: 'warp' as any };
    expect(validateAgentCapability(bad)).toContain(
      'AgentCapability agent:render:visual-synth.latency is unsupported: warp.',
    );
  });

  it('type-guard detects agent fields', () => {
    expect(isAgentCapability(valid)).toBe(true);
    expect(isAgentCapability({ id: 'x', name: 'X', kind: 'x' } as Capability)).toBe(false);
  });

  it('clones deeply', () => {
    const cloned = cloneAgentCapability(valid);
    cloned.cost!.compute = 99;
    expect(valid.cost!.compute).toBe(80);
  });
});

describe('StewardCapability', () => {
  const valid: StewardCapability = {
    id: 'steward:oasis:spawn-encounter',
    name: 'Spawn Encounter',
    kind: 'spawn-encounter',
    requiredSkillIds: ['skill_summon_001'],
  };

  it('validates a steward capability', () => {
    expect(validateStewardCapability(valid)).toEqual([]);
  });

  it('rejects unsupported kind', () => {
    const bad = { ...valid, kind: 'fly' as any };
    expect(validateStewardCapability(bad)).toContain(
      'StewardCapability steward:oasis:spawn-encounter.kind is unsupported: fly.',
    );
  });

  it('requires label for capability-other', () => {
    const bad = { ...valid, kind: 'capability-other' as any };
    expect(validateStewardCapability(bad)).toContain(
      'StewardCapability steward:oasis:spawn-encounter kind=capability-other requires label.',
    );
  });

  it('type-guard matches steward kinds', () => {
    expect(isStewardCapability(valid)).toBe(true);
    expect(isStewardCapability({ id: 'x', name: 'X', kind: 'x' } as Capability)).toBe(false);
  });

  it('clones requiredSkillIds', () => {
    const cloned = cloneStewardCapability(valid);
    cloned.requiredSkillIds!.push('new');
    expect(valid.requiredSkillIds).toEqual(['skill_summon_001']);
  });
});

describe('ShellCapability', () => {
  const valid: ShellCapability = {
    id: 'shell:cli:package-manager',
    name: 'Package Manager Orchestrator',
    kind: 'PackageManagerOrchestrator',
    agentSource: 'cli',
    trustState: 'known',
    permissions: [
      { with: 'holoscript://fs/node_modules', can: 'fs/write', nb: { scoped: true } },
    ],
    receiptExpectation: {
      schema: 'holoshell-receipt-v1',
      requiredArtifacts: ['exitCode', 'stdout', 'stderr'],
      lifecycle: ['plan', 'spawn', 'stream', 'finalize', 'verify'],
      rollbackTrigger: 'exitCode != 0',
    },
    replacementPath:
      'Sovereign `@holoscript/package-manager` trait with deterministic Nix-style sandbox.',
  };

  it('validates a shell capability', () => {
    expect(validateShellCapability(valid)).toEqual([]);
  });

  it('rejects bad agentSource', () => {
    const bad = { ...valid, agentSource: 'telepathy' as any };
    expect(validateShellCapability(bad)).toContain(
      'ShellCapability shell:cli:package-manager.agentSource is unsupported: telepathy.',
    );
  });

  it('rejects bad trustState', () => {
    const bad = { ...valid, trustState: 'maybe' as any };
    expect(validateShellCapability(bad)).toContain(
      'ShellCapability shell:cli:package-manager.trustState is unsupported: maybe.',
    );
  });

  it('rejects empty permissions', () => {
    const bad = { ...valid, permissions: [] };
    expect(validateShellCapability(bad)).toContain(
      'ShellCapability shell:cli:package-manager.permissions must be a non-empty array.',
    );
  });

  it('rejects missing receiptExpectation', () => {
    const bad = { ...valid, receiptExpectation: undefined as any };
    expect(validateShellCapability(bad)).toContain(
      'ShellCapability shell:cli:package-manager.receiptExpectation is required.',
    );
  });

  it('type-guard detects shell fields', () => {
    expect(isShellCapability(valid)).toBe(true);
    expect(isShellCapability({ id: 'x', name: 'X', kind: 'x' } as Capability)).toBe(false);
  });

  it('clones permissions and receiptExpectation deeply', () => {
    const cloned = cloneShellCapability(valid);
    cloned.permissions[0].nb!.scoped = false;
    expect(valid.permissions[0].nb).toEqual({ scoped: true });
    cloned.receiptExpectation.requiredArtifacts.push('new');
    expect(valid.receiptExpectation.requiredArtifacts).toEqual([
      'exitCode',
      'stdout',
      'stderr',
    ]);
  });
});

describe('MeshCapability', () => {
  const valid: MeshCapability = {
    id: 'mesh:a2a:search',
    name: 'Search',
    kind: 'retrieve',
    tags: ['a2a', 'public'],
  };

  it('validates a mesh capability', () => {
    expect(validateMeshCapability(valid)).toEqual([]);
  });

  it('type-guard falls through for minimal shapes', () => {
    expect(isMeshCapability(valid)).toBe(true);
    expect(isMeshCapability({ id: 'x', name: 'X', kind: 'x' } as Capability)).toBe(true);
  });

  it('does not mistake agent caps for mesh caps', () => {
    const agentLike = { id: 'a', name: 'A', kind: 'k', cost: { compute: 1 } } as Capability;
    expect(isMeshCapability(agentLike)).toBe(false);
  });
});
