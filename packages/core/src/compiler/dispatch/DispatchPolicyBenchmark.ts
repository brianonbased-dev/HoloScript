import {
  DispatchPolicy,
  DispatchTier,
  type DispatchDecision,
  type DispatchPolicyConfig,
  type DispatchableOperation,
} from './DispatchPolicy';

export interface DispatchLatencyBenchmarkScenario {
  id: string;
  tier: DispatchTier;
  config: Partial<DispatchPolicyConfig>;
  operation?: DispatchableOperation;
}

export interface DispatchLatencyBenchmarkOptions {
  iterations?: number;
  warmupIterations?: number;
  operation?: DispatchableOperation;
  scenarios?: DispatchLatencyBenchmarkScenario[];
  now?: () => number;
}

export interface DispatchLatencySample {
  iteration: number;
  requestedTier: DispatchTier;
  acceptedTier: DispatchTier;
  accepted: boolean;
  latencyMs: number;
  decisionLatencyMs: number;
  fallbackReason?: string;
  alpha?: number;
  replayFingerprint?: string;
}

export interface DispatchLatencySummary {
  id: string;
  requestedTier: DispatchTier;
  samples: number;
  acceptedSamples: number;
  acceptedTierCounts: Partial<Record<DispatchTier, number>>;
  fallbackReasons: Record<string, number>;
  minLatencyMs: number;
  meanLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  maxLatencyMs: number;
}

export interface DispatchTierDefaultRecommendation {
  tier2DefaultEnabled: boolean;
  reason: string;
  tier2MeanLatencyMs?: number;
  tier3MeanLatencyMs?: number;
  tier2P95LatencyMs?: number;
  tier3P95LatencyMs?: number;
}

export interface DispatchLatencyBenchmarkReport {
  operationTrait: string;
  iterations: number;
  warmupIterations: number;
  summaries: DispatchLatencySummary[];
  recommendation: DispatchTierDefaultRecommendation;
}

const DEFAULT_ITERATIONS = 100;
const DEFAULT_WARMUP_ITERATIONS = 10;

export const DEFAULT_DISPATCH_LATENCY_OPERATION: DispatchableOperation = {
  trait: 'grabbable',
  nodeId: 'dispatch-policy-latency-benchmark',
};

export function createDefaultDispatchLatencyScenarios(
  options: Pick<DispatchLatencyBenchmarkOptions, 'iterations' | 'warmupIterations'> = {}
): DispatchLatencyBenchmarkScenario[] {
  const alphaWindowSize =
    (options.iterations ?? DEFAULT_ITERATIONS) +
    (options.warmupIterations ?? DEFAULT_WARMUP_ITERATIONS);

  return [
    {
      id: 'tier-1-neuromorphic-synsense',
      tier: DispatchTier.TIER_1_NEUROMORPHIC,
      config: {
        tier1NeuromorphicEnabled: true,
        tier1NeuromorphicDevice: 'synsense',
        neuromorphicRuntimeProbe: async () => ({
          available: true,
          device: 'synsense',
          source: 'dispatch-latency-benchmark',
          devices: [{ target: 'synsense', id: 'benchmark-synsense', source: 'benchmark' }],
        }),
      },
    },
    {
      id: 'tier-1-browser-webgpu',
      tier: DispatchTier.TIER_1_BROWSER,
      config: {
        tier1BrowserEnabled: true,
      },
    },
    {
      id: 'tier-2-speculative',
      tier: DispatchTier.TIER_2_SPECULATIVE,
      config: {
        tier2Enabled: true,
        tier2AlphaThreshold: 0,
        alphaWindowSize,
        effectVerifier: async () => ({ passed: true }),
      },
    },
    {
      id: 'tier-3-cpu-direct',
      tier: DispatchTier.TIER_3_CPU_DIRECT,
      config: {
        tier1BrowserEnabled: false,
        tier1NeuromorphicEnabled: false,
        tier2Enabled: false,
      },
    },
  ];
}

export async function runDispatchPolicyLatencyBenchmark(
  options: DispatchLatencyBenchmarkOptions = {}
): Promise<DispatchLatencyBenchmarkReport> {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const warmupIterations = options.warmupIterations ?? DEFAULT_WARMUP_ITERATIONS;
  const operation = options.operation ?? DEFAULT_DISPATCH_LATENCY_OPERATION;
  const scenarios =
    options.scenarios ?? createDefaultDispatchLatencyScenarios({ iterations, warmupIterations });
  const summaries: DispatchLatencySummary[] = [];

  for (const scenario of scenarios) {
    const policy = new DispatchPolicy(scenario.config);
    const scenarioOperation = scenario.operation ?? operation;

    for (let i = 0; i < warmupIterations; i += 1) {
      await policy.route(scenarioOperation);
    }

    const samples: DispatchLatencySample[] = [];
    for (let i = 0; i < iterations; i += 1) {
      samples.push(await measureDispatchSample(policy, scenario, scenarioOperation, i, options.now));
    }

    summaries.push(summarizeDispatchSamples(scenario, samples));
  }

  return {
    operationTrait: operation.trait,
    iterations,
    warmupIterations,
    summaries,
    recommendation: recommendDispatchPolicyDefaults(summaries),
  };
}

export function recommendDispatchPolicyDefaults(
  summaries: DispatchLatencySummary[]
): DispatchTierDefaultRecommendation {
  const tier2 = summaries.find((summary) => summary.requestedTier === DispatchTier.TIER_2_SPECULATIVE);
  const tier3 = summaries.find((summary) => summary.requestedTier === DispatchTier.TIER_3_CPU_DIRECT);

  if (!tier2) {
    return {
      tier2DefaultEnabled: false,
      reason: 'Tier 2 benchmark summary missing; keep speculative dispatch disabled by default.',
    };
  }

  if (!tier3) {
    return {
      tier2DefaultEnabled: false,
      reason: 'Tier 3 CPU-direct baseline missing; keep speculative dispatch disabled by default.',
    };
  }

  const tier2Comparable = tier2.acceptedSamples > 0;
  const tier3Comparable = tier3.acceptedSamples > 0;
  if (!tier2Comparable || !tier3Comparable) {
    return {
      tier2DefaultEnabled: false,
      reason: 'Tier 2 or Tier 3 did not accept benchmark samples; keep speculative dispatch disabled by default.',
      tier2MeanLatencyMs: tier2.meanLatencyMs,
      tier3MeanLatencyMs: tier3.meanLatencyMs,
      tier2P95LatencyMs: tier2.p95LatencyMs,
      tier3P95LatencyMs: tier3.p95LatencyMs,
    };
  }

  const tier2Faster =
    tier2.meanLatencyMs < tier3.meanLatencyMs && tier2.p95LatencyMs < tier3.p95LatencyMs;

  if (!tier2Faster) {
    return {
      tier2DefaultEnabled: false,
      reason:
        'Tier 2 speculative dispatch is not faster than Tier 3 CPU direct on mean and p95 latency; keep Tier 2 disabled by default.',
      tier2MeanLatencyMs: tier2.meanLatencyMs,
      tier3MeanLatencyMs: tier3.meanLatencyMs,
      tier2P95LatencyMs: tier2.p95LatencyMs,
      tier3P95LatencyMs: tier3.p95LatencyMs,
    };
  }

  return {
    tier2DefaultEnabled: true,
    reason: 'Tier 2 speculative dispatch beat Tier 3 CPU direct on mean and p95 latency.',
    tier2MeanLatencyMs: tier2.meanLatencyMs,
    tier3MeanLatencyMs: tier3.meanLatencyMs,
    tier2P95LatencyMs: tier2.p95LatencyMs,
    tier3P95LatencyMs: tier3.p95LatencyMs,
  };
}

export function formatDispatchLatencyBenchmarkReport(
  report: DispatchLatencyBenchmarkReport
): string {
  const lines = [
    `DispatchPolicy @${report.operationTrait} latency benchmark`,
    `iterations=${report.iterations} warmup=${report.warmupIterations}`,
    '',
    'requested tier | accepted samples | mean ms | p50 ms | p95 ms | max ms | accepted tiers',
  ];

  for (const summary of report.summaries) {
    lines.push(
      [
        summary.requestedTier,
        `${summary.acceptedSamples}/${summary.samples}`,
        formatMs(summary.meanLatencyMs),
        formatMs(summary.p50LatencyMs),
        formatMs(summary.p95LatencyMs),
        formatMs(summary.maxLatencyMs),
        formatTierCounts(summary.acceptedTierCounts),
      ].join(' | ')
    );
  }

  lines.push('');
  lines.push(
    `Tier 2 default: ${report.recommendation.tier2DefaultEnabled ? 'enabled' : 'disabled'}`
  );
  lines.push(report.recommendation.reason);
  return lines.join('\n');
}

async function measureDispatchSample(
  policy: DispatchPolicy,
  scenario: DispatchLatencyBenchmarkScenario,
  operation: DispatchableOperation,
  iteration: number,
  now: (() => number) | undefined
): Promise<DispatchLatencySample> {
  const clock = now ?? (() => performance.now());
  const started = clock();
  const decision = await policy.route(operation);
  const latencyMs = Math.max(0, clock() - started);

  return toLatencySample(iteration, scenario.tier, decision, latencyMs);
}

function toLatencySample(
  iteration: number,
  requestedTier: DispatchTier,
  decision: DispatchDecision,
  latencyMs: number
): DispatchLatencySample {
  return {
    iteration,
    requestedTier,
    acceptedTier: decision.tier,
    accepted: decision.accepted,
    latencyMs,
    decisionLatencyMs: decision.metrics.latencyEstimateMs,
    fallbackReason: decision.metrics.fallbackReason,
    alpha: decision.metrics.alpha,
    replayFingerprint: decision.replayFingerprint,
  };
}

function summarizeDispatchSamples(
  scenario: DispatchLatencyBenchmarkScenario,
  samples: DispatchLatencySample[]
): DispatchLatencySummary {
  const latencies = samples.map((sample) => sample.latencyMs).sort((a, b) => a - b);
  const acceptedTierCounts: Partial<Record<DispatchTier, number>> = {};
  const fallbackReasons: Record<string, number> = {};
  let acceptedSamples = 0;

  for (const sample of samples) {
    acceptedTierCounts[sample.acceptedTier] = (acceptedTierCounts[sample.acceptedTier] ?? 0) + 1;
    if (sample.accepted) acceptedSamples += 1;
    if (sample.fallbackReason) {
      fallbackReasons[sample.fallbackReason] = (fallbackReasons[sample.fallbackReason] ?? 0) + 1;
    }
  }

  return {
    id: scenario.id,
    requestedTier: scenario.tier,
    samples: samples.length,
    acceptedSamples,
    acceptedTierCounts,
    fallbackReasons,
    minLatencyMs: latencies[0] ?? 0,
    meanLatencyMs: mean(latencies),
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    maxLatencyMs: latencies[latencies.length - 1] ?? 0,
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(sortedValues: number[], percentileValue: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1)
  );
  return sortedValues[index] ?? 0;
}

function formatMs(value: number): string {
  return value.toFixed(3);
}

function formatTierCounts(counts: Partial<Record<DispatchTier, number>>): string {
  return Object.entries(counts)
    .map(([tier, count]) => `${tier}:${count}`)
    .join(',');
}
