/**
 * AIDriverTrait Research Implementation Tests
 *
 * Tests for InferenceTier (P.XR.01) and npuLoopIntervalMs (P.XR.04).
 */

import { describe, it, expect } from 'vitest';
import type { InferenceTier, AIDriverConfig } from '../AIDriverTrait';

// =============================================================================
// InferenceTier (P.XR.01)
// =============================================================================

describe('InferenceTier', () => {
  it('accepts cpu_reactive tier', () => {
    const tier: InferenceTier = 'cpu_reactive';
    expect(tier).toBe('cpu_reactive');
  });

  it('accepts npu_reasoning tier', () => {
    const tier: InferenceTier = 'npu_reasoning';
    expect(tier).toBe('npu_reasoning');
  });

  it('accepts cloud_strategic tier', () => {
    const tier: InferenceTier = 'cloud_strategic';
    expect(tier).toBe('cloud_strategic');
  });

  it('all 3 tiers are assignable', () => {
    const tiers: InferenceTier[] = ['cpu_reactive', 'npu_reasoning', 'cloud_strategic'];
    expect(tiers).toHaveLength(3);
  });
});

// =============================================================================
// AIDriverConfig (research fields)
// =============================================================================

describe('AIDriverConfig (XR extensions)', () => {
  it('accepts inferenceTier field', () => {
    const config: AIDriverConfig = {
      npcId: 'guard_01',
      decisionMode: 'reactive',
      inferenceTier: 'cpu_reactive',
    };
    expect(config.inferenceTier).toBe('cpu_reactive');
  });

  it('accepts npuLoopIntervalMs field', () => {
    const config: AIDriverConfig = {
      npcId: 'strategist_01',
      decisionMode: 'goal-driven',
      inferenceTier: 'npu_reasoning',
      npuLoopIntervalMs: 200,
    };
    expect(config.npuLoopIntervalMs).toBe(200);
  });

  it('fields are optional (backward compat)', () => {
    const config: AIDriverConfig = {
      npcId: 'npc_01',
      decisionMode: 'hybrid',
    };
    expect(config.inferenceTier).toBeUndefined();
    expect(config.npuLoopIntervalMs).toBeUndefined();
  });
});
