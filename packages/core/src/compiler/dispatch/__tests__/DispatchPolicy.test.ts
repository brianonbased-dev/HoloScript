import { describe, it, expect } from 'vitest';
import {
  DispatchPolicy,
  DispatchTier,
  AlphaTracker,
  createTier3CpuDirectOutput,
  detectNeuromorphicRuntime,
} from '../DispatchPolicy';
import {
  createDefaultDispatchLatencyScenarios,
  recommendDispatchPolicyDefaults,
  runDispatchPolicyLatencyBenchmark,
  type DispatchLatencySummary,
} from '../DispatchPolicyBenchmark';

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
    expect(decision.replayFingerprint).toBe(
      'sha256:1f3d4e416e0199734e5ab109fb3cd9a3c33eac310381d2b91cae1f98e2a1b3a4'
    );
    expect(decision.metrics.fallbackReason).toBe('No higher tier accepted or enabled');
  });

  it('uses a deterministic SHA-256 replay fingerprint', async () => {
    const policy = new DispatchPolicy({
      tier1BrowserEnabled: false,
      tier1NeuromorphicEnabled: false,
      tier2Enabled: false,
    });
    const op = {
      trait: 'grabbable',
      nodeId: 'hash-node',
      config: { ignoredByDecision: true },
    };

    const first = await policy.route(op);
    const second = await policy.route({ ...op });

    expect(first.replayFingerprint).toBe(second.replayFingerprint);
    expect(first.replayFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
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

  it('does not treat a configured NIR target as discovered hardware', async () => {
    const policy = new DispatchPolicy({
      tier1NeuromorphicEnabled: true,
      tier1NeuromorphicDevice: 'loihi',
    });
    const decision = await policy.route({
      trait: 'grabbable',
      nodeId: 'nir-missing',
    });
    expect(decision.tier).toBe(DispatchTier.TIER_3_CPU_DIRECT);
    expect(decision.metrics.fallbackReason).toContain('No loihi NIR runtime device discovered');
    expect(decision.metrics.neuromorphicProbe?.available).toBe(false);
  });

  it('routes Tier-1 Neuromorphic when the runtime probe discovers a compatible device', async () => {
    const policy = new DispatchPolicy({
      tier1NeuromorphicEnabled: true,
      tier1NeuromorphicDevice: 'synsense',
      neuromorphicRuntimeProbe: async () => ({
        available: true,
        device: 'synsense',
        source: 'test-probe',
        devices: [{ target: 'synsense', id: 'speck-1', source: 'test-probe' }],
      }),
    });
    const decision = await policy.route({
      trait: 'grabbable',
      nodeId: 'nir-ready',
    });
    expect(decision.tier).toBe(DispatchTier.TIER_1_NEUROMORPHIC);
    expect(decision.accepted).toBe(true);
    expect(decision.metrics.neuromorphicProbe?.source).toBe('test-probe');
  });

  it('discovers NIR runtime devices from the global runtime registry', () => {
    const runtime = globalThis as typeof globalThis & {
      __HOLOSCRIPT_NIR_DEVICES__?: unknown;
    };
    const previous = runtime.__HOLOSCRIPT_NIR_DEVICES__;
    runtime.__HOLOSCRIPT_NIR_DEVICES__ = [
      { target: 'spinnaker2', id: 'board-01', source: 'vitest' },
    ];

    try {
      const probe = detectNeuromorphicRuntime('spinnaker');
      expect(probe.available).toBe(true);
      expect(probe.device).toBe('spinnaker');
      expect(probe.source).toBe('vitest');
      expect(probe.devices?.[0]?.id).toBe('board-01');
    } finally {
      if (previous === undefined) {
        delete runtime.__HOLOSCRIPT_NIR_DEVICES__;
      } else {
        runtime.__HOLOSCRIPT_NIR_DEVICES__ = previous;
      }
    }
  });

  it('promotes to Tier-2 when proposal output matches Tier-3 and alpha exceeds threshold', async () => {
    const policy = new DispatchPolicy({
      tier1BrowserEnabled: false,
      tier1NeuromorphicEnabled: false,
      tier2Enabled: true,
      llmProposalProvider: (op) => createTier3CpuDirectOutput(op),
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
    expect(decision.metrics.traitEquivalence?.equivalent).toBe(true);
    expect(policy.getAlpha()).toBe(1);
  });

  it('blocks Tier-2 when proposal output differs from Tier-3 and alpha collapses', async () => {
    const policy = new DispatchPolicy({
      tier1BrowserEnabled: false,
      tier1NeuromorphicEnabled: false,
      tier2Enabled: true,
      tier2AlphaThreshold: 0.5,
      llmProposalProvider: (op) => ({
        trait: op.trait,
        nodeId: op.nodeId,
        config: { divergent: true },
      }),
      effectVerifier: async () => ({ passed: true }),
      alphaWindowSize: 10,
    });
    const decision = await policy.route({
      trait: 'grabbable',
      nodeId: 'n2',
    });
    expect(decision.tier).toBe(DispatchTier.TIER_3_CPU_DIRECT);
    expect(decision.accepted).toBe(true); // Tier-3 itself accepted
    expect(decision.metrics.fallbackReason).toContain('equivalence failed');
    expect(decision.metrics.traitEquivalence?.equivalent).toBe(false);
    expect(policy.getAlpha()).toBe(0);
  });

  it('does not define alpha as verifier pass rate', async () => {
    const policy = new DispatchPolicy({
      tier1BrowserEnabled: false,
      tier1NeuromorphicEnabled: false,
      tier2Enabled: true,
      tier2AlphaThreshold: 0.0,
      llmProposalProvider: (op) => createTier3CpuDirectOutput(op),
      effectVerifier: async () => ({ passed: false, reason: 'effect rejected' }),
      alphaWindowSize: 10,
    });

    const decision = await policy.route({
      trait: 'grabbable',
      nodeId: 'n3',
    });

    expect(decision.tier).toBe(DispatchTier.TIER_3_CPU_DIRECT);
    expect(decision.metrics.verifierPassed).toBe(false);
    expect(decision.metrics.traitEquivalence?.equivalent).toBe(true);
    expect(decision.metrics.alpha).toBe(1);
    expect(policy.getAlpha()).toBe(1);
    expect(decision.metrics.fallbackReason).toContain('Verifier rejected');
  });

  it('fails Tier-2 closed when no proposal provider is wired', async () => {
    const policy = new DispatchPolicy({
      tier1BrowserEnabled: false,
      tier1NeuromorphicEnabled: false,
      tier2Enabled: true,
      tier2AlphaThreshold: 0.0,
      alphaWindowSize: 10,
    });

    const decision = await policy.route({
      trait: 'grabbable',
      nodeId: 'n4',
    });

    expect(decision.tier).toBe(DispatchTier.TIER_3_CPU_DIRECT);
    expect(decision.metrics.alpha).toBe(0);
    expect(decision.metrics.traitEquivalence?.reason).toContain('provider returned no output');
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

describe('DispatchPolicy latency benchmark', () => {
  it('measures @grabbable dispatch latency for each policy tier', async () => {
    const runtime = globalThis as typeof globalThis & {
      navigator?: Navigator & { gpu?: unknown };
    };
    const previousNavigator = runtime.navigator;
    Object.defineProperty(runtime, 'navigator', {
      configurable: true,
      value: { gpu: { requestAdapter: async () => ({}) } },
    });

    try {
      const report = await runDispatchPolicyLatencyBenchmark({
        iterations: 3,
        warmupIterations: 1,
      });

      expect(report.operationTrait).toBe('grabbable');
      expect(report.summaries.map((summary) => summary.requestedTier)).toEqual([
        DispatchTier.TIER_1_NEUROMORPHIC,
        DispatchTier.TIER_1_BROWSER,
        DispatchTier.TIER_2_SPECULATIVE,
        DispatchTier.TIER_3_CPU_DIRECT,
      ]);
      for (const summary of report.summaries) {
        expect(summary.samples).toBe(3);
        expect(summary.acceptedSamples).toBe(3);
        expect(summary.maxLatencyMs).toBeGreaterThanOrEqual(summary.minLatencyMs);
      }
      expect(report.recommendation.tier2DefaultEnabled).toBe(false);
    } finally {
      if (previousNavigator) {
        Object.defineProperty(runtime, 'navigator', {
          configurable: true,
          value: previousNavigator,
        });
      } else {
        delete runtime.navigator;
      }
    }
  });

  it('keeps Tier 2 disabled by default when it is not faster than Tier 3', () => {
    const recommendation = recommendDispatchPolicyDefaults([
      latencySummary(DispatchTier.TIER_2_SPECULATIVE, 4, 6),
      latencySummary(DispatchTier.TIER_3_CPU_DIRECT, 2, 3),
    ]);

    expect(recommendation.tier2DefaultEnabled).toBe(false);
    expect(recommendation.reason).toContain('keep Tier 2 disabled by default');
  });

  it('allows Tier 2 only when mean and p95 beat Tier 3', () => {
    const recommendation = recommendDispatchPolicyDefaults([
      latencySummary(DispatchTier.TIER_2_SPECULATIVE, 1, 2),
      latencySummary(DispatchTier.TIER_3_CPU_DIRECT, 3, 4),
    ]);

    expect(recommendation.tier2DefaultEnabled).toBe(true);
  });

  it('sizes Tier-2 alpha window from benchmark iterations and warmup', () => {
    const tier2Scenario = createDefaultDispatchLatencyScenarios({
      iterations: 9,
      warmupIterations: 2,
    }).find((scenario) => scenario.tier === DispatchTier.TIER_2_SPECULATIVE);

    expect(tier2Scenario?.config.alphaWindowSize).toBe(11);
  });
});

function latencySummary(
  requestedTier: DispatchTier,
  meanLatencyMs: number,
  p95LatencyMs: number
): DispatchLatencySummary {
  return {
    id: requestedTier,
    requestedTier,
    samples: 10,
    acceptedSamples: 10,
    acceptedTierCounts: { [requestedTier]: 10 },
    fallbackReasons: {},
    minLatencyMs: meanLatencyMs,
    meanLatencyMs,
    p50LatencyMs: meanLatencyMs,
    p95LatencyMs,
    maxLatencyMs: p95LatencyMs,
  };
}
