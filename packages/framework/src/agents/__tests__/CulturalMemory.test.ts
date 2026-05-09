/**
 * @fileoverview Tests for CulturalMemory — Dual Memory Architecture
 */

import { describe, it, expect } from 'vitest';
import { CulturalMemory } from '../CulturalMemory';
import type { NormProvenance } from '@holoscript/core';

describe('CulturalMemory', () => {
  // ── Episodic Memory ────────────────────────────────────────────────────

  describe('Episodic Memory', () => {
    it('records and recalls memories', () => {
      const mem = new CulturalMemory();
      mem.record('agent1', 'Met agent2 at market', {
        participants: ['agent2'],
        valence: 0.8,
        normId: 'fair_trade',
        tags: ['trade'],
      });
      const recalled = mem.recall('agent1');
      expect(recalled).toHaveLength(1);
      expect(recalled[0].event).toBe('Met agent2 at market');
      expect(recalled[0].valence).toBe(0.8);
    });

    it('filters by normId', () => {
      const mem = new CulturalMemory();
      mem.record('agent1', 'Traded fairly', { normId: 'fair_trade' });
      mem.record('agent1', 'Greeted neighbor', { normId: 'greeting_convention' });
      const filtered = mem.recall('agent1', { normId: 'fair_trade' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].normId).toBe('fair_trade');
    });

    it('filters by tags', () => {
      const mem = new CulturalMemory();
      mem.record('agent1', 'Found resource', { tags: ['resource', 'discovery'] });
      mem.record('agent1', 'Had a fight', { tags: ['conflict'] });
      const filtered = mem.recall('agent1', { tags: ['resource'] });
      expect(filtered).toHaveLength(1);
    });

    it('evicts oldest when over capacity', () => {
      const mem = new CulturalMemory({ episodicCapacity: 3 });
      for (let i = 0; i < 5; i++) {
        mem.record('agent1', `Event ${i}`, { importance: i * 0.2 });
      }
      expect(mem.memoryCount('agent1')).toBe(3);
    });

    it('decays memory strength over ticks', () => {
      const mem = new CulturalMemory({ episodicDecayRate: 0.1 });
      mem.record('agent1', 'Old event');
      const before = mem.recall('agent1')[0].strength;
      mem.tick();
      const after = mem.recall('agent1')[0].strength;
      expect(after).toBeLessThan(before);
    });

    it('prunes memories below threshold', () => {
      const mem = new CulturalMemory({ episodicDecayRate: 0.99 }); // Extreme decay
      mem.record('agent1', 'Fragile memory');
      for (let i = 0; i < 10; i++) mem.tick(); // Decay to near-zero
      expect(mem.memoryCount('agent1')).toBe(0);
    });
  });

  // ── Stigmergic Traces ────────────────────────────────────────────────────

  describe('Stigmergic Traces', () => {
    it('leaves and perceives traces', () => {
      const mem = new CulturalMemory();
      mem.leaveTrace('agent1', 'zone_a', 'danger', [10, 0, 10]);
      const perceived = mem.perceiveTraces('zone_a', [12, 0, 10]);
      expect(perceived).toHaveLength(1);
      expect(perceived[0].label).toBe('danger');
    });

    it('does not perceive out-of-range traces', () => {
      const mem = new CulturalMemory();
      mem.leaveTrace('agent1', 'zone_a', 'far away', [0, 0, 0], { radius: 5 });
      const perceived = mem.perceiveTraces('zone_a', [100, 0, 100]);
      expect(perceived).toHaveLength(0);
    });

    it('reinforces traces', () => {
      const mem = new CulturalMemory();
      const trace = mem.leaveTrace('agent1', 'zone_a', 'food here', [5, 0, 5]);
      const initialIntensity = trace.intensity;
      mem.reinforceTrace(trace.id, 'zone_a');
      const reinforced = mem.zoneTraces('zone_a').find((t) => t.id === trace.id);
      expect(reinforced!.intensity).toBeGreaterThan(initialIntensity);
      expect(reinforced!.reinforcements).toBe(1);
    });

    it('traces decay over ticks', () => {
      const mem = new CulturalMemory({ traceDecayRate: 0.1 });
      const trace = mem.leaveTrace(
        'agent1',
        'zone_a',
        'temp',
        [0, 0, 0],
        { decayRate: 0.1 }
      );
      const before = trace.intensity;
      mem.tick();
      const after = mem.zoneTraces('zone_a').find((t) => t.id === trace.id);
      expect(after!.intensity).toBeLessThan(before);
    });

    it('evaporated traces are pruned', () => {
      const mem = new CulturalMemory();
      mem.leaveTrace('agent1', 'zone_a', 'ephemeral', [0, 0, 0], { decayRate: 1.0 });
      const result = mem.tick();
      expect(result.evaporatedTraces).toBe(1);
      expect(mem.zoneTraces('zone_a')).toHaveLength(0);
    });
  });

  // ── SOP Consolidation ────────────────────────────────────────────────────

  describe('SOP Consolidation', () => {
    it('forms SOP when threshold reached', () => {
      const mem = new CulturalMemory({ consolidationThreshold: 3 });
      for (let i = 0; i < 5; i++) {
        mem.record('agent1', `Traded fairly ${i}`, { normId: 'fair_trade', valence: 0.8 });
      }
      const sops = mem.consolidate('agent1');
      expect(sops).toHaveLength(1);
      expect(sops[0].normId).toBe('fair_trade');
      expect(sops[0].actions).toContain('comply');
    });

    it('does not form SOP below threshold', () => {
      const mem = new CulturalMemory({ consolidationThreshold: 10 });
      for (let i = 0; i < 3; i++) {
        mem.record('agent1', `Event ${i}`, { normId: 'rare_norm' });
      }
      const sops = mem.consolidate('agent1');
      expect(sops).toHaveLength(0);
    });

    it('forms avoidance SOP for negative experiences', () => {
      const mem = new CulturalMemory({ consolidationThreshold: 3 });
      for (let i = 0; i < 5; i++) {
        mem.record('agent1', `Got griefed ${i}`, { normId: 'no_griefing', valence: -0.9 });
      }
      const sops = mem.consolidate('agent1');
      expect(sops[0].actions).toContain('avoid');
    });

    it('retrieves SOPs by agent', () => {
      const mem = new CulturalMemory({ consolidationThreshold: 2 });
      for (let i = 0; i < 3; i++) {
        mem.record('agent1', 'Trade', { normId: 'fair_trade' });
        mem.record('agent2', 'Greet', { normId: 'greeting_convention' });
      }
      mem.consolidate('agent1');
      mem.consolidate('agent2');
      expect(mem.getSOPs('agent1')).toHaveLength(1);
      expect(mem.getSOPs('agent2')).toHaveLength(1);
    });
  });

  // ── State Export/Import ──────────────────────────────────────────────────

  describe('State Persistence', () => {
    it('exports and imports state', () => {
      const mem = new CulturalMemory({ consolidationThreshold: 2 });
      mem.record('agent1', 'Event A', { normId: 'test_norm', tags: ['a'] });
      mem.record('agent1', 'Event B', { normId: 'test_norm', tags: ['b'] });
      mem.leaveTrace('agent1', 'zone_a', 'marker', [1, 2, 3]);
      mem.consolidate('agent1');

      const state = mem.exportState();
      const mem2 = new CulturalMemory();
      mem2.importState(state);

      expect(mem2.memoryCount('agent1')).toBe(2);
      expect(mem2.zoneTraces('zone_a')).toHaveLength(1);
      expect(mem2.getSOPs('agent1')).toHaveLength(1);
    });
  });

  // ── Stats ────────────────────────────────────────────────────────────────

  describe('Stats', () => {
    it('reports correct stats', () => {
      const mem = new CulturalMemory();
      mem.record('agent1', 'A');
      mem.record('agent2', 'B');
      mem.leaveTrace('agent1', 'zone_a', 'x', [0, 0, 0]);
      const s = mem.stats();
      expect(s.agents).toBe(2);
      expect(s.totalMemories).toBe(2);
      expect(s.totalTraces).toBe(1);
      expect(s.zones).toBe(1);
    });
  });

  // ── NormProvenance-weighted traces ─────────────────────────────────────────

  describe('NormProvenance-weighted traces', () => {
    const genuine: NormProvenance = {
      source: 'agent',
      sourceAgentId: 'agent_genuine',
      confidenceClassification: 'genuine',
    };
    const confabulated: NormProvenance = {
      source: 'agent',
      sourceAgentId: 'agent_confab',
      confidenceClassification: 'confabulated',
    };
    const bullshitted: NormProvenance = {
      source: 'agent',
      sourceAgentId: 'agent_bs',
      confidenceClassification: 'bullshitted',
    };

    it('leaveTrace stores normProvenance on trace', () => {
      const mem = new CulturalMemory();
      const trace = mem.leaveTrace('agent1', 'zone_a', 'danger', [10, 0, 10], {
        normProvenance: genuine,
      });
      expect(trace.normProvenance).toEqual(genuine);
    });

    it('perceiveTraces discounts confabulated traces (lower effective intensity)', () => {
      const mem = new CulturalMemory();
      mem.leaveTrace('agent1', 'zone_a', 'genuine_signal', [10, 0, 10], {
        intensity: 1.0,
        normProvenance: genuine,
      });
      mem.leaveTrace('agent1', 'zone_a', 'confab_signal', [10, 0, 10], {
        intensity: 1.0,
        normProvenance: confabulated,
      });
      const perceived = mem.perceiveTraces('zone_a', [12, 0, 10]);
      expect(perceived).toHaveLength(2);
      // Genuine should rank first because effective intensity 1.0 > 0.5
      expect(perceived[0].label).toBe('genuine_signal');
      expect(perceived[1].label).toBe('confab_signal');
    });

    it('perceiveTraces filters out bullshitted traces below effective threshold', () => {
      const mem = new CulturalMemory();
      // Raw intensity 0.05 → effective 0.005 (below 0.01 threshold)
      mem.leaveTrace('agent1', 'zone_a', 'bs_trace', [10, 0, 10], {
        intensity: 0.05,
        normProvenance: bullshitted,
      });
      // Raw intensity 0.05 → effective 0.05 (above threshold)
      mem.leaveTrace('agent1', 'zone_a', 'genuine_trace', [10, 0, 10], {
        intensity: 0.05,
        normProvenance: genuine,
      });
      const perceived = mem.perceiveTraces('zone_a', [12, 0, 10]);
      expect(perceived).toHaveLength(1);
      expect(perceived[0].label).toBe('genuine_trace');
    });

    it('reinforceTrace gives weaker boost to bullshitted traces', () => {
      const mem = new CulturalMemory();
      const genuineTrace = mem.leaveTrace('agent1', 'zone_a', 'g', [0, 0, 0], {
        intensity: 1.0,
        normProvenance: genuine,
      });
      const bsTrace = mem.leaveTrace('agent1', 'zone_a', 'bs', [0, 0, 0], {
        intensity: 1.0,
        normProvenance: bullshitted,
      });
      mem.reinforceTrace(genuineTrace.id, 'zone_a');
      mem.reinforceTrace(bsTrace.id, 'zone_a');
      const g = mem.zoneTraces('zone_a').find((t) => t.id === genuineTrace.id)!;
      const b = mem.zoneTraces('zone_a').find((t) => t.id === bsTrace.id)!;
      expect(g.intensity).toBe(1.1); // +0.1 full weight
      expect(b.intensity).toBe(1.01); // +0.01 (0.1 × 0.1)
    });

    it('reinforceTrace gives half boost to confabulated traces', () => {
      const mem = new CulturalMemory();
      const confTrace = mem.leaveTrace('agent1', 'zone_a', 'cf', [0, 0, 0], {
        intensity: 1.0,
        normProvenance: confabulated,
      });
      mem.reinforceTrace(confTrace.id, 'zone_a');
      const c = mem.zoneTraces('zone_a').find((t) => t.id === confTrace.id)!;
      expect(c.intensity).toBe(1.05); // +0.05 (0.1 × 0.5)
    });

    it('evicts low-effective-intensity traces first when over capacity', () => {
      const mem = new CulturalMemory({ stigmergicCapacity: 2 });
      mem.leaveTrace('agent1', 'zone_a', 'genuine', [0, 0, 0], {
        intensity: 1.0,
        normProvenance: genuine,
      });
      mem.leaveTrace('agent1', 'zone_a', 'confab', [0, 0, 0], {
        intensity: 1.0,
        normProvenance: confabulated,
      });
      mem.leaveTrace('agent1', 'zone_a', 'bullshit', [0, 0, 0], {
        intensity: 1.0,
        normProvenance: bullshitted,
      });
      const traces = mem.zoneTraces('zone_a');
      expect(traces).toHaveLength(2);
      // Bullshitted should be evicted first because effective intensity 0.1 < 0.5 < 1.0
      expect(traces.some((t) => t.label === 'bullshit')).toBe(false);
    });

    it('zoneTraces hides bullshitted traces with low effective intensity', () => {
      const mem = new CulturalMemory();
      mem.leaveTrace('agent1', 'zone_a', 'low_bs', [0, 0, 0], {
        intensity: 0.05,
        normProvenance: bullshitted,
      });
      expect(mem.zoneTraces('zone_a')).toHaveLength(0);
    });
  });
});
