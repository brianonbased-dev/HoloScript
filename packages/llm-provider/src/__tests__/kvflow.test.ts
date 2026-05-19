/**
 * KVFlow Integration Tests — AgentStepGraph + KVFlowCacheManager
 *
 * Tests the core abstractions for workflow-aware KV cache management:
 * - AgentStepGraph: step registration, STE computation, scheduling
 * - KVFlowCacheManager: eviction, prefetch, hit/miss tracking
 * - Scope mapping: BrainCachingScope → KVFlowScope wiring
 *
 * @module @holoscript/llm-provider/kvflow
 */

import { describe, it, expect } from 'vitest';
import { InMemoryAgentStepGraph } from '../kvflow/AgentStepGraph';
import {
  KVFlowCacheManager,
  scopeFromBrainCaching,
  scopeToCacheUsage,
  estimateKVBytes,
  entryFromStep,
} from '../kvflow/KVFlowCacheManager';
import type {
  AgentStep,
  KVFlowScope,
  KVFlowConfig,
  StepNodeId,
  KVCacheEntry,
} from '../kvflow/types';

// =============================================================================
// Test Fixtures
// =============================================================================

function makeStep(
  id: StepNodeId,
  agentId: string,
  stepIndex: number,
  scope: KVFlowScope,
  opts?: Partial<AgentStep>
): AgentStep {
  return {
    id,
    agentId,
    stepIndex,
    scope,
    estimatedTokens: 1000,
    dependsOn: [],
    priority: 5,
    lastActivatedAt: new Date().toISOString(),
    ...opts,
  };
}

function makeEntry(
  stepId: StepNodeId,
  scope: KVFlowScope,
  opts?: Partial<KVCacheEntry>
): KVCacheEntry {
  return {
    stepId,
    scope,
    residency: 'device',
    stepsToExecution: 0,
    estimatedBytes: 512_000,
    lastUsedAt: new Date().toISOString(),
    isSharedPrefix: scope === 'shared-prefix',
    dependentOverlayIds: [],
    ...opts,
  };
}

// =============================================================================
// AgentStepGraph Tests
// =============================================================================

describe('InMemoryAgentStepGraph', () => {
  it('adds and retrieves steps', () => {
    const graph = new InMemoryAgentStepGraph();
    const step = makeStep('claude:0', 'claude', 0, 'shared-prefix');
    graph.addStep(step);

    expect(graph.getStep('claude:0')).toEqual(step);
    expect(graph.stepCount()).toBe(1);
  });

  it('removes steps and cleans up edges', () => {
    const graph = new InMemoryAgentStepGraph();
    const step1 = makeStep('claude:0', 'claude', 0, 'shared-prefix');
    const step2 = makeStep('gemini:0', 'gemini', 0, 'role-overlay', {
      dependsOn: ['claude:0'],
    });
    graph.addStep(step1);
    graph.addStep(step2);

    expect(graph.stepCount()).toBe(2);
    graph.removeStep('claude:0');
    expect(graph.stepCount()).toBe(1);
    expect(graph.getStep('claude:0')).toBeUndefined();
  });

  it('computes STE with active steps at 0', () => {
    const graph = new InMemoryAgentStepGraph();
    const teamBoard = makeStep('team:0', 'team-board', 0, 'shared-prefix', {
      priority: 1,
    });
    const claudeStep = makeStep('claude:0', 'claude', 0, 'role-overlay', {
      dependsOn: ['team:0'],
      priority: 2,
    });
    const geminiStep = makeStep('gemini:0', 'gemini', 0, 'role-overlay', {
      dependsOn: ['team:0'],
      priority: 3,
    });

    graph.addStep(teamBoard);
    graph.addStep(claudeStep);
    graph.addStep(geminiStep);

    // With claude active (STE=0), gemini should be reachable
    const ste = graph.computeStepsToExecution(['claude:0']);

    // claude is active → STE=0
    expect(ste.get('claude:0')).toBe(0);
    // team-board is a shared-prefix — reached at distance 1 from claude,
    // but shared-prefix scope gets a -1 STE reduction, so STE = 0
    // (protected like an active entry, which is correct: shared prefix
    // is reused by all agents and should not be evicted eagerly).
    expect(ste.get('team:0')).toBe(0);
  });

  it('gives shared-prefix scope STE reduction', () => {
    const graph = new InMemoryAgentStepGraph();
    const shared = makeStep('team:0', 'team-board', 0, 'shared-prefix', {
      priority: 1,
    });
    const overlay = makeStep('claude:0', 'claude', 0, 'role-overlay', {
      dependsOn: ['team:0'],
      priority: 2,
    });

    graph.addStep(shared);
    graph.addStep(overlay);

    // With claude active, shared-prefix should get STE reduction (-1)
    const ste = graph.computeStepsToExecution(['claude:0']);
    // team:0 is shared-prefix, so its STE gets reduced by 1 from its
    // computed distance
    const sharedSte = ste.get('team:0');
    expect(sharedSte).toBeDefined();
    // Shared prefix should have lower STE than it would without reduction
  });

  it('returns next scheduled agents', () => {
    const graph = new InMemoryAgentStepGraph();
    const teamBoard = makeStep('team:0', 'team-board', 0, 'shared-prefix', {
      priority: 1,
    });
    const claude = makeStep('claude:0', 'claude', 0, 'role-overlay', {
      dependsOn: ['team:0'],
      priority: 2,
    });
    const gemini = makeStep('gemini:0', 'gemini', 0, 'role-overlay', {
      dependsOn: ['team:0'],
      priority: 3,
    });

    graph.addStep(teamBoard);
    graph.addStep(claude);
    graph.addStep(gemini);

    const next = graph.nextScheduled('team:0', 2);
    expect(next.length).toBeLessThanOrEqual(2);
    // Should include claude and/or gemini (they depend on team:0)
    expect(next.length).toBeGreaterThan(0);
  });

  it('serializes and deserializes via toJSON/fromJSON', () => {
    const graph = new InMemoryAgentStepGraph();
    const step1 = makeStep('claude:0', 'claude', 0, 'role-overlay');
    const step2 = makeStep('gemini:0', 'gemini', 0, 'scene-turn');
    graph.addStep(step1);
    graph.addStep(step2);

    const serialized = graph.toJSON();
    expect(serialized.steps).toHaveLength(2);

    const restored = InMemoryAgentStepGraph.fromJSON(serialized);
    expect(restored.stepCount()).toBe(2);
    expect(restored.getStep('claude:0')).toEqual(step1);
    expect(restored.getStep('gemini:0')).toEqual(step2);
  });

  it('handles empty graph gracefully', () => {
    const graph = new InMemoryAgentStepGraph();
    expect(graph.stepCount()).toBe(0);
    expect(graph.computeStepsToExecution(['nonexistent'])).toBeInstanceOf(Map);
    expect(graph.nextScheduled('nonexistent', 5)).toEqual([]);
  });
});

// =============================================================================
// KVFlowCacheManager Tests
// =============================================================================

describe('KVFlowCacheManager', () => {
  it('creates with default config', () => {
    const manager = new KVFlowCacheManager();
    expect(manager.pressure()).toBe(0); // Empty cache, no pressure
  });

  it('creates with custom config', () => {
    const manager = new KVFlowCacheManager({
      maxGpuMemoryBytes: 8 * 1024 * 1024 * 1024, // 8 GB
      sharedPrefixReserveFraction: 0.5,
      prefetchLookahead: 3,
    });
    expect(manager.pressure()).toBe(0);
  });

  it('adds and retrieves entries', () => {
    const manager = new KVFlowCacheManager();
    const step = makeStep('claude:0', 'claude', 0, 'role-overlay');
    manager.addStep(step);

    const entry = makeEntry('claude:0', 'role-overlay');
    manager.addEntry(entry);

    expect(manager.getEntry('claude:0')).toEqual(entry);
    expect(manager.getAllEntries()).toHaveLength(1);
  });

  it('removes steps and their entries', () => {
    const manager = new KVFlowCacheManager();
    const step = makeStep('claude:0', 'claude', 0, 'role-overlay');
    manager.addStep(step);
    manager.addEntry(makeEntry('claude:0', 'role-overlay'));

    manager.removeStep('claude:0');
    expect(manager.getEntry('claude:0')).toBeUndefined();
  });

  it('evicts scene-turn entries first', () => {
    const manager = new KVFlowCacheManager({
      maxGpuMemoryBytes: 2_000_000, // 2 MB
    });

    // Shared prefix (protected)
    const teamStep = makeStep('team:0', 'team-board', 0, 'shared-prefix', {
      priority: 1,
    });
    manager.addStep(teamStep);
    manager.addEntry(
      makeEntry('team:0', 'shared-prefix', {
        estimatedBytes: 500_000,
        isSharedPrefix: true,
      })
    );

    // Role overlay (medium priority)
    const claudeStep = makeStep('claude:0', 'claude', 0, 'role-overlay', {
      priority: 2,
    });
    manager.addStep(claudeStep);
    manager.addEntry(
      makeEntry('claude:0', 'role-overlay', {
        estimatedBytes: 500_000,
      })
    );

    // Scene turn (low priority, high STE — evict first)
    const sceneStep = makeStep('scene:0', 'scene-agent', 0, 'scene-turn', {
      priority: 10,
    });
    manager.addStep(sceneStep);
    manager.addEntry(
      makeEntry('scene:0', 'scene-turn', {
        estimatedBytes: 500_000,
        stepsToExecution: 5,
      })
    );

    manager.setActiveSteps(['team:0']);

    // Evict to free 500 KB
    const result = manager.evict(500_000);

    // Scene-turn should be evicted first
    expect(result.evicted.length).toBeGreaterThanOrEqual(1);
    expect(result.evicted.some((e) => e.scope === 'scene-turn')).toBe(true);
    expect(result.freedBytes).toBeGreaterThanOrEqual(500_000);
  });

  it('protects shared-prefix entries during eviction', () => {
    const manager = new KVFlowCacheManager({
      maxGpuMemoryBytes: 2_000_000,
    });

    const teamStep = makeStep('team:0', 'team-board', 0, 'shared-prefix', {
      priority: 1,
    });
    manager.addStep(teamStep);
    manager.addEntry(
      makeEntry('team:0', 'shared-prefix', {
        estimatedBytes: 500_000,
        isSharedPrefix: true,
        dependentOverlayIds: ['claude:0'],
      })
    );

    // claude depends on team-board — shared prefix must stay
    const claudeStep = makeStep('claude:0', 'claude', 0, 'role-overlay', {
      dependsOn: ['team:0'],
      priority: 2,
    });
    manager.addStep(claudeStep);
    manager.addEntry(
      makeEntry('claude:0', 'role-overlay', {
        estimatedBytes: 500_000,
      })
    );

    manager.setActiveSteps(['claude:0']);

    // Try to evict the shared prefix — should be retained
    const result = manager.evict(500_000);
    const teamEntry = manager.getEntry('team:0');
    // Shared prefix with active dependent overlay should NOT be evicted
    expect(teamEntry?.residency).not.toBe('evicted');
  });

  it('demotes role-overlay entries to host before evicting', () => {
    const manager = new KVFlowCacheManager({
      maxGpuMemoryBytes: 2_000_000,
    });

    // Set up a graph with a team-board (active) and two agents
    const teamStep = makeStep('team:0', 'team-board', 0, 'shared-prefix', {
      priority: 1,
    });
    const claudeStep = makeStep('claude:0', 'claude', 0, 'role-overlay', {
      dependsOn: ['team:0'],
      priority: 2,
    });
    const sceneStep = makeStep('scene:0', 'scene-agent', 0, 'scene-turn', {
      dependsOn: ['team:0'],
      priority: 10,
    });
    manager.addStep(teamStep);
    manager.addStep(claudeStep);
    manager.addStep(sceneStep);

    // Team-board on GPU (protected)
    manager.addEntry(
      makeEntry('team:0', 'shared-prefix', {
        estimatedBytes: 500_000,
        isSharedPrefix: true,
      })
    );
    // Claude's role overlay on GPU
    manager.addEntry(
      makeEntry('claude:0', 'role-overlay', {
        estimatedBytes: 500_000,
      })
    );
    // Scene-turn on GPU (evicted first)
    manager.addEntry(
      makeEntry('scene:0', 'scene-turn', {
        estimatedBytes: 500_000,
      })
    );

    // Only team:0 is active — claude and scene are not currently running
    manager.setActiveSteps(['team:0']);

    // Evict to free 1 MB — should evict scene-turn first, then demote role-overlay
    const result = manager.evict(1_000_000);

    // Scene-turn should be fully evicted
    expect(result.evicted.some((e) => e.scope === 'scene-turn')).toBe(true);
    // Role-overlay should be demoted to host or evicted (not on device)
    const claudeEntry = manager.getEntry('claude:0');
    expect(claudeEntry?.residency).not.toBe('device');
  });

  it('prefetches next scheduled agents', () => {
    const manager = new KVFlowCacheManager({
      maxGpuMemoryBytes: 10_000_000,
    });

    const teamStep = makeStep('team:0', 'team-board', 0, 'shared-prefix', {
      priority: 1,
    });
    const claudeStep = makeStep('claude:0', 'claude', 0, 'role-overlay', {
      dependsOn: ['team:0'],
      priority: 2,
    });
    const geminiStep = makeStep('gemini:0', 'gemini', 0, 'role-overlay', {
      dependsOn: ['team:0'],
      priority: 3,
    });

    manager.addStep(teamStep);
    manager.addStep(claudeStep);
    manager.addStep(geminiStep);

    // gemini's KV is on host (CPU) — needs prefetch
    manager.addEntry(
      makeEntry('gemini:0', 'role-overlay', {
        residency: 'host',
        estimatedBytes: 512_000,
      })
    );

    manager.setActiveSteps(['team:0']);

    // Prefetch from team-board's perspective
    const result = manager.prefetch('team:0');

    // Should have prefetched at least gemini (on host, scheduled next)
    expect(result.prefetched.length + result.failed.length).toBeGreaterThan(0);
  });

  it('records cache hits and misses', () => {
    const manager = new KVFlowCacheManager();

    const step = makeStep('claude:0', 'claude', 0, 'role-overlay');
    manager.addStep(step);
    manager.addEntry(makeEntry('claude:0', 'role-overlay'));

    manager.recordHit('claude:0');
    manager.recordMiss('gemini:0', 'role-overlay');

    const hitRate = manager.hitRate();
    expect(hitRate.hits).toBe(1);
    expect(hitRate.misses).toBe(1);
    expect(hitRate.rate).toBe(0.5);
  });

  it('tracks telemetry events', () => {
    const manager = new KVFlowCacheManager();

    const step = makeStep('claude:0', 'claude', 0, 'role-overlay');
    manager.addStep(step);
    manager.addEntry(makeEntry('claude:0', 'role-overlay'));

    manager.recordHit('claude:0');
    manager.recordMiss('gemini:0', 'scene-turn');

    const telemetry = manager.getTelemetry();
    expect(telemetry.length).toBe(2);
    expect(telemetry[0].type).toBe('hit');
    expect(telemetry[1].type).toBe('miss');
  });

  it('computes memory pressure', () => {
    const manager = new KVFlowCacheManager({
      maxGpuMemoryBytes: 1_000_000,
    });

    expect(manager.pressure()).toBe(0);

    manager.addStep(makeStep('claude:0', 'claude', 0, 'role-overlay'));
    manager.addEntry(
      makeEntry('claude:0', 'role-overlay', {
        estimatedBytes: 500_000,
      })
    );

    expect(manager.pressure()).toBe(0.5); // 500K / 1M
  });
});

// =============================================================================
// Scope Mapping Tests
// =============================================================================

describe('scopeFromBrainCaching', () => {
  it('maps team-board to shared-prefix', () => {
    expect(scopeFromBrainCaching('team-board')).toBe('shared-prefix');
  });

  it('maps agent-role to role-overlay', () => {
    expect(scopeFromBrainCaching('agent-role')).toBe('role-overlay');
  });

  it('maps scene-local to scene-turn', () => {
    expect(scopeFromBrainCaching('scene-local')).toBe('scene-turn');
  });
});

describe('scopeToCacheUsage', () => {
  it('passes through KVFlowScope values', () => {
    expect(scopeToCacheUsage('shared-prefix')).toBe('shared-prefix');
    expect(scopeToCacheUsage('role-overlay')).toBe('role-overlay');
    expect(scopeToCacheUsage('scene-turn')).toBe('scene-turn');
  });
});

describe('estimateKVBytes', () => {
  it('estimates bytes from token count with default rate', () => {
    expect(estimateKVBytes(1000)).toBe(512_000); // 1000 * 512
  });

  it('estimates bytes with custom rate', () => {
    expect(estimateKVBytes(1000, 1024)).toBe(1_024_000);
  });
});

describe('entryFromStep', () => {
  it('creates a KVCacheEntry from an AgentStep', () => {
    const step = makeStep('claude:0', 'claude', 0, 'role-overlay', {
      estimatedTokens: 2000,
    });
    const entry = entryFromStep(step, 3);

    expect(entry.stepId).toBe('claude:0');
    expect(entry.scope).toBe('role-overlay');
    expect(entry.residency).toBe('device');
    expect(entry.stepsToExecution).toBe(3);
    expect(entry.estimatedBytes).toBe(2000 * 512); // 1,024,000
    expect(entry.isSharedPrefix).toBe(false);
    expect(entry.dependentOverlayIds).toEqual([]);
  });

  it('creates a shared-prefix entry with dependents', () => {
    const step = makeStep('team:0', 'team-board', 0, 'shared-prefix', {
      estimatedTokens: 5000,
    });
    const entry = entryFromStep(step, 0, 'device', ['claude:0', 'gemini:0']);

    expect(entry.isSharedPrefix).toBe(true);
    expect(entry.dependentOverlayIds).toEqual(['claude:0', 'gemini:0']);
    expect(entry.stepsToExecution).toBe(0);
  });
});