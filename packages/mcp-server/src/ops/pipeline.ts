/**
 * Lightweight ops primitives for MCP hosting: anomaly detection, autoscaling loop,
 * and predictive load balancing. Used by integration tests (docs/ops/ops-pipeline.test.ts).
 */

export interface ToolCallMetric {
  toolName: string;
  latencyMs: number;
  error: boolean;
  timestamp: number;
}

export type AnomalyAlertHandler = (detail: { reason: string; windowSize: number; errorRate: number }) => void;

/**
 * Ingests tool-call metrics in a sliding window; fires when error rate crosses threshold.
 */
export class AnomalyDetector {
  private readonly window: ToolCallMetric[] = [];

  constructor(
    private readonly opts: {
      windowMs: number;
      /** Minimum samples before evaluating */
      minSamples: number;
      /** Inclusive threshold, e.g. 0.4 means >=40% errors triggers alert */
      maxErrorRate: number;
      onAlert: AnomalyAlertHandler;
    }
  ) {}

  ingest(metric: ToolCallMetric): void {
    const now = metric.timestamp;
    const cutoff = now - this.opts.windowMs;
    let i = 0;
    while (i < this.window.length && this.window[i]!.timestamp <= cutoff) i++;
    if (i > 0) this.window.splice(0, i);

    this.window.push(metric);

    if (this.window.length < this.opts.minSamples) return;

    const errors = this.window.filter((m) => m.error).length;
    const errorRate = errors / this.window.length;
    if (errorRate >= this.opts.maxErrorRate) {
      this.opts.onAlert({
        reason: 'high_tool_error_rate',
        windowSize: this.window.length,
        errorRate,
      });
    }
  }
}

export interface ScalingPolicy {
  minReplicas: number;
  maxReplicas: number;
  /** Scale up when utilization is above this fraction (0–1) */
  scaleUpUtilThreshold: number;
  /** Scale down when utilization is below this fraction */
  scaleDownUtilThreshold: number;
}

export interface Scaler {
  setReplicas(n: number): Promise<void>;
}

/**
 * Evaluates utilization against policy and invokes scaler with target replica count.
 */
export class AutoScalingLoop {
  constructor(
    private readonly scaler: Scaler,
    private policy: ScalingPolicy
  ) {}

  async evaluate(input: {
    utilization: number;
    currentReplicas: number;
  }): Promise<{ desiredReplicas: number }> {
    let desired = input.currentReplicas;
    const { minReplicas, maxReplicas, scaleUpUtilThreshold, scaleDownUtilThreshold } = this.policy;

    if (input.utilization >= scaleUpUtilThreshold && desired < maxReplicas) {
      desired = Math.min(maxReplicas, desired + 1);
    } else if (input.utilization <= scaleDownUtilThreshold && desired > minReplicas) {
      desired = Math.max(minReplicas, desired - 1);
    }

    await this.scaler.setReplicas(desired);
    return { desiredReplicas: desired };
  }
}

/**
 * Maintains normalized routing weights per backend from health scores (0–1).
 */
export class PredictiveLoadBalancer {
  private readonly backends: string[];
  private weights = new Map<string, number>();

  constructor(backends: string[]) {
    if (backends.length === 0) throw new Error('PredictiveLoadBalancer requires at least one backend');
    this.backends = [...backends];
    const w = 1 / backends.length;
    for (const b of backends) this.weights.set(b, w);
  }

  /** Pass latest health per backend id (higher = healthier). Weights sum to 1. */
  updateWeights(healthByBackend: Record<string, number>): void {
    let sum = 0;
    const raw = new Map<string, number>();
    for (const id of this.backends) {
      const h = Math.max(0, healthByBackend[id] ?? 0);
      const score = h <= 0 ? 0.01 : h;
      raw.set(id, score);
      sum += score;
    }
    if (sum <= 0) {
      const w = 1 / this.backends.length;
      for (const id of this.backends) this.weights.set(id, w);
      return;
    }
    for (const id of this.backends) {
      this.weights.set(id, (raw.get(id) || 0) / sum);
    }
  }

  getWeight(backendId: string): number {
    return this.weights.get(backendId) ?? 0;
  }

  getWeights(): ReadonlyMap<string, number> {
    return new Map(this.weights);
  }
}
