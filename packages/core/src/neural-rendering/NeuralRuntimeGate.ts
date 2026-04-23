/**
 * paper-13 NeuralRuntimeGate — load-time threshold check + fallback dispatch.
 *
 * When an agent requests a T1 neural asset, the gate enforces:
 *   1. Budget check (memory, latency, tokens under caller's declared limit)
 *   2. Threshold check (render one canonical viewpoint, compare against golden)
 *   3. Fallback to upgrade_path mesh proxy on threshold fail
 *   4. Refuse if no fallback and caller hasn't opted in via --accept-approximate
 */

import type { NeuralAssetManifest } from './NeuralAssetManifest';
import type { FrameComparator, ViewMetrics } from './ContractAudit';

export interface RuntimeBudget {
  max_vram_mb?: number;
  max_latency_ms?: number;
  max_tokens?: number;
}

export interface ResolveRequest {
  manifest: NeuralAssetManifest;
  budget: RuntimeBudget;
  accept_approximate: boolean;
  /** Actual observed runtime cost (runtime fills this in before gate decision). */
  observed_cost?: RuntimeBudget;
}

export interface GateDecision {
  decision: 'accept' | 'fallback' | 'refuse';
  reason: string;
  resolved_asset_id: string; // may be the fallback's id if decision=fallback
  threshold_metrics?: ViewMetrics;
  fallback_used?: string;
}

function exceedsBudget(observed: RuntimeBudget | undefined, budget: RuntimeBudget): string | null {
  if (!observed) return null;
  if (budget.max_vram_mb !== undefined && observed.max_vram_mb !== undefined && observed.max_vram_mb > budget.max_vram_mb) {
    return `vram ${observed.max_vram_mb}MB exceeds budget ${budget.max_vram_mb}MB`;
  }
  if (budget.max_latency_ms !== undefined && observed.max_latency_ms !== undefined && observed.max_latency_ms > budget.max_latency_ms) {
    return `latency ${observed.max_latency_ms}ms exceeds budget ${budget.max_latency_ms}ms`;
  }
  if (budget.max_tokens !== undefined && observed.max_tokens !== undefined && observed.max_tokens > budget.max_tokens) {
    return `tokens ${observed.max_tokens} exceeds budget ${budget.max_tokens}`;
  }
  return null;
}

/**
 * Gate decision for a resolve request. T0 assets always accept. T1 assets
 * go through budget + threshold + fallback logic. T2 assets refuse unless
 * accept_approximate is true.
 */
export async function gateResolve(
  req: ResolveRequest,
  comparator: FrameComparator
): Promise<GateDecision> {
  const { manifest, budget, accept_approximate } = req;

  if (manifest.tier === 'T0') {
    return {
      decision: 'accept',
      reason: 'T0 canonical geometry — no threshold check',
      resolved_asset_id: manifest.asset_id,
    };
  }

  if (manifest.tier === 'T2') {
    if (accept_approximate) {
      return {
        decision: 'accept',
        reason: 'T2 unverified + caller opted in via accept_approximate',
        resolved_asset_id: manifest.asset_id,
      };
    }
    return {
      decision: 'refuse',
      reason: 'T2 unverified asset requires --accept-approximate opt-in',
      resolved_asset_id: manifest.asset_id,
    };
  }

  // T1 path
  const bounds = manifest.tolerance_bands;
  if (!bounds) {
    return {
      decision: 'refuse',
      reason: 'T1 manifest missing tolerance_bands (invalid per paper-13 spec)',
      resolved_asset_id: manifest.asset_id,
    };
  }

  const budget_violation = exceedsBudget(req.observed_cost, budget);
  if (budget_violation) {
    if (manifest.upgrade_path) {
      return {
        decision: 'fallback',
        reason: `budget exceeded (${budget_violation}); falling back to ${manifest.upgrade_path}`,
        resolved_asset_id: manifest.upgrade_path,
        fallback_used: manifest.upgrade_path,
      };
    }
    if (accept_approximate) {
      return {
        decision: 'accept',
        reason: `budget exceeded (${budget_violation}) but caller opted in`,
        resolved_asset_id: manifest.asset_id,
      };
    }
    return {
      decision: 'refuse',
      reason: `budget exceeded (${budget_violation}) and no upgrade_path available`,
      resolved_asset_id: manifest.asset_id,
    };
  }

  // Threshold check: render first canonical viewpoint, compare to golden
  const first = manifest.canonical_viewpoints[0];
  if (!first) {
    return {
      decision: 'refuse',
      reason: 'T1 manifest has no canonical_viewpoints — cannot threshold-verify',
      resolved_asset_id: manifest.asset_id,
    };
  }

  const metrics = await comparator.measureView(first, manifest.asset_id);
  const psnr_fail = bounds.psnr_min !== undefined && metrics.psnr !== undefined && metrics.psnr < bounds.psnr_min;
  const ssim_fail = bounds.ssim_min !== undefined && metrics.ssim !== undefined && metrics.ssim < bounds.ssim_min;
  const depth_fail = bounds.depth_l1_max !== undefined && metrics.depth_l1 !== undefined && metrics.depth_l1 > bounds.depth_l1_max;

  if (psnr_fail || ssim_fail || depth_fail) {
    if (manifest.upgrade_path) {
      return {
        decision: 'fallback',
        reason: 'threshold check failed; falling back to upgrade_path',
        resolved_asset_id: manifest.upgrade_path,
        fallback_used: manifest.upgrade_path,
        threshold_metrics: metrics,
      };
    }
    if (accept_approximate) {
      return {
        decision: 'accept',
        reason: 'threshold check failed but caller opted in via accept_approximate',
        resolved_asset_id: manifest.asset_id,
        threshold_metrics: metrics,
      };
    }
    return {
      decision: 'refuse',
      reason: 'threshold check failed and no upgrade_path available',
      resolved_asset_id: manifest.asset_id,
      threshold_metrics: metrics,
    };
  }

  return {
    decision: 'accept',
    reason: 'T1 threshold check passed',
    resolved_asset_id: manifest.asset_id,
    threshold_metrics: metrics,
  };
}
