/**
 * paper-13 ContractAudit — tolerance-band verification harness.
 *
 * Given a T1 neural asset and a frame-comparator (injectable), renders each
 * canonical viewpoint, computes PSNR/SSIM/depth-L1 vs golden, emits
 * PASS/FAIL + per-viewpoint metrics. Artifact shape is content-addressable
 * so it can be anchored via S.ANC pipeline.
 *
 * This module is framework-agnostic: users pass in a FrameComparator that
 * implements their specific image-comparison + neural-render invocation.
 */

import type { NeuralAssetManifest, ViewSpec, ToleranceBands } from './NeuralAssetManifest';

export interface ViewMetrics {
  view_id: string;
  psnr?: number;
  ssim?: number;
  depth_l1?: number;
  rendered_frame_hash?: string;
}

export interface FrameComparator {
  /** Render + compare: returns metrics for one viewpoint against its golden. */
  measureView(view: ViewSpec, asset_id: string): Promise<ViewMetrics>;
}

export interface ContractAuditResult {
  asset_id: string;
  tier: 'T1';
  audit_at: string;
  per_view: ViewMetrics[];
  pass: boolean;
  violations: Array<{ view_id: string; metric: string; bound: number; observed: number }>;
  bounds_applied: ToleranceBands;
}

function checkBounds(
  m: ViewMetrics,
  bounds: ToleranceBands
): Array<{ metric: string; bound: number; observed: number }> {
  const violations: Array<{ metric: string; bound: number; observed: number }> = [];
  if (bounds.psnr_min !== undefined && m.psnr !== undefined && m.psnr < bounds.psnr_min) {
    violations.push({ metric: 'psnr', bound: bounds.psnr_min, observed: m.psnr });
  }
  if (bounds.ssim_min !== undefined && m.ssim !== undefined && m.ssim < bounds.ssim_min) {
    violations.push({ metric: 'ssim', bound: bounds.ssim_min, observed: m.ssim });
  }
  if (bounds.depth_l1_max !== undefined && m.depth_l1 !== undefined && m.depth_l1 > bounds.depth_l1_max) {
    violations.push({ metric: 'depth_l1', bound: bounds.depth_l1_max, observed: m.depth_l1 });
  }
  return violations;
}

/**
 * Audit a T1 neural asset against its declared tolerance_bands.
 * Throws if manifest.tier !== 'T1' or tolerance_bands is missing.
 */
export async function auditNeuralAsset(
  manifest: NeuralAssetManifest,
  comparator: FrameComparator
): Promise<ContractAuditResult> {
  if (manifest.tier !== 'T1') {
    throw new Error(`auditNeuralAsset: expected T1 manifest, got ${manifest.tier}`);
  }
  const bounds = manifest.tolerance_bands;
  if (!bounds || Object.keys(bounds).length === 0) {
    throw new Error('auditNeuralAsset: T1 manifest must carry non-empty tolerance_bands');
  }

  const per_view: ViewMetrics[] = [];
  const violations: ContractAuditResult['violations'] = [];

  for (const view of manifest.canonical_viewpoints) {
    const m = await comparator.measureView(view, manifest.asset_id);
    per_view.push(m);
    const vs = checkBounds(m, bounds);
    for (const v of vs) {
      violations.push({ view_id: view.view_id, ...v });
    }
  }

  return {
    asset_id: manifest.asset_id,
    tier: 'T1',
    audit_at: new Date().toISOString(),
    per_view,
    pass: violations.length === 0,
    violations,
    bounds_applied: bounds,
  };
}

/** Test/sanity comparator that returns synthesized metrics you specify. */
export function fixedMetricsComparator(metrics_by_view: Record<string, ViewMetrics>): FrameComparator {
  return {
    async measureView(view: ViewSpec): Promise<ViewMetrics> {
      return metrics_by_view[view.view_id] ?? { view_id: view.view_id };
    },
  };
}
