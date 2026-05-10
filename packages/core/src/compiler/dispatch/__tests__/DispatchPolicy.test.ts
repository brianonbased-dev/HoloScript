import { describe, it, expect } from 'vitest';
import {
  DispatchPolicy,
  DispatchTier,
  AlphaTracker,
} from '../DispatchPolicy';
import type { EffectCheckResult } from '../../safety/EffectChecker';

describe('DispatchPolicy', () => {
  it('falls back to Tier-3 when no tiers are enabled', async () => {
    const policy = new DispatchPolicy({
      tier1BrowserEnabled: false,
      tier1NeuromorphicEnabled: false,
      tier2Enabled: false,
    });
    const decision = await policy.route({
      trait: 'grabbable',
      nodeId: 'test-node',
    });
    expect(decision.tier).toBe(DispatchTier.TIER_3_CPU_DIRECT);
    expect(decision.accepted).toBe(true);
    expect(decision.provenance.source).toBe('dispatch-policy');
    expect(decision.replayFingerprint).toMatch(/^fnv1a-64:/);
    expect(decision.metrics.fallbackReason).toBe('No higher tier accepted or enabled');
  });

  it('routes Tier-1 Browser for grabbable when WebGPU present (fallback in Node)', async () => {
    const policy = new DispatchPolicy({
      tier1BrowserEnabled: true,
    });
    const decision = await policy.route({
      trait: 'grabbable',
      nodeId: 'test-node',
    });
    // WebGPU not present in vitest Node env => fallback to Tier-3
    expect(decision.tier).toBe(DispatchTier.TIER_3_CPU_DIRECT);
    expect(decision.metrics.fallbackReason).toContain('WebGPU');
  });

  it('promotes to Tier-2 when verifier passes and alpha exceeds threshold', async () => {
    const policy = new DispatchPolicy({
      tier1BrowserEnabled: false,
      tier1NeuromorphicEnabled: false,
      tier2Enabled: true,
      tier2AlphaThreshold: 0.0,
      alphaWindowSize: 10,
    });
    const decision = await policy.route({
      trait: 'grabbable',
      nodeId: 'n1',
    });
    expect(decision.tier).toBe(DispatchTier.TIER_2_SPECULATIVE);
    expect(decision.accepted).toBe(true);
    expect(decision.metrics.alpha).toBe(1);
    expect(policy.getAlpha()).toBe(1);
  });

  it('blocks Tier-2 when verifier rejects and alpha collapses', async () => {
    const policy = new DispatchPolicy({
      tier1BrowserEnabled: false,
      tier1NeuromorphicEnabled: false,
      tier2Enabled: true,
      tier2AlphaThreshold: 0.5,
      effectVerifier: async () =>
        ({ passed: false } as unknown as EffectCheckResult),
      alphaWindowSize: 10,
    });
    const decision = await policy.route({
      trait: 'grabbable',
      nodeId: 'n2',
    });
    expect(decision.tier).toBe(DispatchTier.TIER_3_CPU_DIRECT);
    expect(decision.accepted).toBe(true); // Tier-3 itself accepted
    expect(decision.metrics.fallbackReason).toContain('rejected');
    expect(policy.getAlpha()).toBe(0);
  });

  it('includes provenance context when supplied', async () => {
    const policy = new DispatchPolicy({
      tier1BrowserEnabled: false,
      tier1NeuromorphicEnabled: false,
      tier2Enabled: false,
    });
    const decision = await policy.route({
      trait: 'grabbable',
      nodeId: 'n5',
      provenanceContext: {
        authorityLevel: 100,
        agentId: 'test-agent',
        sourceType: 'agent',
      },
    });
    expect(decision.provenance.context?.authorityLevel).toBe(100);
    expect(decision.provenance.context?.agentId).toBe('test-agent');
  });
});

describe('AlphaTracker', () => {
  it('computes rolling alpha', () => {
    const tracker = new AlphaTracker(4);
    tracker.recordAttempt(true);
    tracker.recordAttempt(false);
    expect(tracker.getAlpha()).toBe(0.5);
    tracker.recordAttempt(true);
    tracker.recordAttempt(true);
    // window = [false, true, true, true] => 3/4
    expect(tracker.getAlpha()).toBe(0.75);
  });

  it('returns 0 for empty window', () => {
    expect(new AlphaTracker(10).getAlpha()).toBe(0);
  });
});
