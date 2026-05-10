/**
 * dispatchTrace — Studio-side dispatch decision recording + tier telemetry.
 *
 * Mirrors @holoscript/core/compiler/dispatch/DispatchPolicy types so the
 * Studio panel can display tier decisions without pulling the full core
 * dependency graph into the React bundle. Kept in sync with core via
 * the DispatchPolicy contract (packages/core/src/compiler/dispatch).
 */

export type StudioDispatchTier =
  | 'tier-1-browser'
  | 'tier-1-neuromorphic'
  | 'tier-2-speculative'
  | 'tier-3-cpu-direct';

export interface StudioDispatchMetrics {
  tierAttempted: StudioDispatchTier;
  tierAccepted: boolean;
  fallbackReason?: string;
  latencyEstimateMs: number;
  alpha?: number;
  neuromorphicProbe?: {
    available: boolean;
    device?: string;
    source: string;
    reason?: string;
  };
}

export interface StudioDispatchDecision {
  tier: StudioDispatchTier;
  accepted: boolean;
  trait: string;
  nodeId: string;
  metrics: StudioDispatchMetrics;
  replayFingerprint?: string;
  timestamp: number;
}

export interface DispatchTraceEntry {
  frameIndex: number;
  decision: StudioDispatchDecision;
  /** Simulated SNN spike-train values for Tier-1 visualisation */
  spikeTrain?: number[];
}

export interface DispatchTrace {
  entries: DispatchTraceEntry[];
  startTime: number;
  endTime?: number;
}

export interface DispatchPolicyToggle {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

export type DispatchMode =
  | 'tier-1-only'
  | 'tier-1-2'
  | 'all-three'
  | 'cpu-only';

export const DISPATCH_MODES: { value: DispatchMode; label: string; description: string }[] = [
  {
    value: 'tier-1-only',
    label: 'Tier-1 Only',
    description: 'Browser SNN + Neuromorphic only; fail closed to CPU if unavailable',
  },
  {
    value: 'tier-1-2',
    label: 'Tier-1 + Tier-2',
    description: 'SNN/Neuromorphic preferred, LLM speculative with verifier fallback',
  },
  {
    value: 'all-three',
    label: 'All Three Tiers',
    description: 'Full NN-primary inversion: Tier-1 → Tier-2 → Tier-3 CPU backup',
  },
  {
    value: 'cpu-only',
    label: 'CPU Only',
    description: 'Bypass all neural tiers; deterministic CPU-direct for audit/replay',
  },
];

export const TIER_BADGE_CONFIG: Record<
  StudioDispatchTier,
  { label: string; short: string; color: string; bg: string; icon: string }
> = {
  'tier-1-browser': {
    label: 'Tier 1 — Browser SNN',
    short: '1-Browser',
    color: '#22d3ee',
    bg: '#22d3ee22',
    icon: '⚡',
  },
  'tier-1-neuromorphic': {
    label: 'Tier 1 — Neuromorphic',
    short: '1-Neuro',
    color: '#a78bfa',
    bg: '#a78bfa22',
    icon: '🔮',
  },
  'tier-2-speculative': {
    label: 'Tier 2 — Speculative LLM',
    short: '2-LLM',
    color: '#fbbf24',
    bg: '#fbbf2422',
    icon: '🔮',
  },
  'tier-3-cpu-direct': {
    label: 'Tier 3 — CPU Direct',
    short: '3-CPU',
    color: '#f87171',
    bg: '#f8717122',
    icon: '🛡️',
  },
};

export function tierFromCore(tier: string): StudioDispatchTier {
  switch (tier) {
    case 'tier-1-browser':
      return 'tier-1-browser';
    case 'tier-1-neuromorphic':
      return 'tier-1-neuromorphic';
    case 'tier-2-speculative':
      return 'tier-2-speculative';
    case 'tier-3-cpu-direct':
      return 'tier-3-cpu-direct';
    default:
      return 'tier-3-cpu-direct';
  }
}

// ─── Trace Collector ───────────────────────────────────────────────────────

const DEFAULT_HISTORY_SIZE = 120; // 2 seconds at 60fps

export class DispatchTraceCollector {
  private entries: DispatchTraceEntry[] = [];
  private frameIndex = 0;
  private startTime = performance.now();
  private maxSize: number;

  constructor(maxSize = DEFAULT_HISTORY_SIZE) {
    this.maxSize = maxSize;
  }

  record(decision: StudioDispatchDecision, spikeTrain?: number[]): void {
    this.entries.push({
      frameIndex: this.frameIndex++,
      decision,
      spikeTrain,
    });
    if (this.entries.length > this.maxSize) {
      this.entries.shift();
    }
  }

  getTrace(): DispatchTrace {
    return {
      entries: this.entries.slice(),
      startTime: this.startTime,
      endTime: performance.now(),
    };
  }

  getLatest(): DispatchTraceEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  getTierHistory(): StudioDispatchTier[] {
    return this.entries.map((e) => e.decision.tier);
  }

  getAlphaHistory(): (number | undefined)[] {
    return this.entries.map((e) => e.decision.metrics.alpha);
  }

  getLatencyHistory(): number[] {
    return this.entries.map((e) => e.decision.metrics.latencyEstimateMs);
  }

  getSpikeTrains(): (number[] | undefined)[] {
    return this.entries.map((e) => e.spikeTrain);
  }

  getTierCounts(): Record<StudioDispatchTier, number> {
    const counts: Record<string, number> = {
      'tier-1-browser': 0,
      'tier-1-neuromorphic': 0,
      'tier-2-speculative': 0,
      'tier-3-cpu-direct': 0,
    };
    for (const entry of this.entries) {
      counts[entry.decision.tier] = (counts[entry.decision.tier] ?? 0) + 1;
    }
    return counts as Record<StudioDispatchTier, number>;
  }

  reset(): void {
    this.entries = [];
    this.frameIndex = 0;
    this.startTime = performance.now();
  }

  toCAELPayload(): Record<string, unknown>[] {
    return this.entries.map((e) => ({
      frame: e.frameIndex,
      tier: e.decision.tier,
      accepted: e.decision.accepted,
      trait: e.decision.trait,
      latencyMs: e.decision.metrics.latencyEstimateMs,
      alpha: e.decision.metrics.alpha ?? null,
      fallbackReason: e.decision.metrics.fallbackReason ?? null,
      fingerprint: e.decision.replayFingerprint ?? null,
    }));
  }
}
