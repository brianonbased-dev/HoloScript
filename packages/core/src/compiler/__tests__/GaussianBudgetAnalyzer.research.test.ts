/**
 * GaussianBudgetAnalyzer Research Implementation Tests
 *
 * Tests for new exports added during SIGGRAPH 2025 research:
 *   - estimateOverdraw() (G.SIG25.02)
 *   - detectGaussianFormat() (W.SIG25.04)
 *   - estimateMultiUserCost() (P.043)
 *   - getAvailableGaussianBudget() (P.XR.07)
 */

import { describe, it, expect } from 'vitest';
import {
  estimateOverdraw,
  detectGaussianFormat,
  estimateMultiUserCost,
  getAvailableGaussianBudget,
} from '../GaussianBudgetAnalyzer';

// =============================================================================
// estimateOverdraw (G.SIG25.02)
// =============================================================================

describe('estimateOverdraw', () => {
  it('returns 0 for zero splats', () => {
    expect(estimateOverdraw(0)).toBe(0);
  });

  it('returns 0 for zero viewport', () => {
    expect(estimateOverdraw(100_000, 0)).toBe(0);
  });

  it('returns low overdraw for small splat count', () => {
    // 10,000 splats with 4px radius on Quest 3 viewport
    const overdraw = estimateOverdraw(10_000);
    expect(overdraw).toBeLessThan(1.0);
  });

  it('returns high overdraw for dense scenes', () => {
    // 500,000 splats on Quest 3 viewport
    const overdraw = estimateOverdraw(500_000);
    expect(overdraw).toBeGreaterThan(1.0);
  });

  it('higher viewport resolution reduces overdraw', () => {
    const quest3 = estimateOverdraw(100_000, 1832 * 1920);
    const desktop = estimateOverdraw(100_000, 2560 * 1440);
    expect(desktop).toBeLessThan(quest3);
  });

  it('larger splat radius increases overdraw', () => {
    const small = estimateOverdraw(100_000, 1832 * 1920, 2);
    const large = estimateOverdraw(100_000, 1832 * 1920, 8);
    expect(large).toBeGreaterThan(small);
  });
});

// =============================================================================
// detectGaussianFormat (W.SIG25.04)
// =============================================================================

describe('detectGaussianFormat', () => {
  it('detects .ply format', () => {
    expect(detectGaussianFormat('scene.ply')).toBe('ply');
  });

  it('detects .splat format', () => {
    expect(detectGaussianFormat('model.splat')).toBe('splat');
  });

  it('detects .spz format', () => {
    expect(detectGaussianFormat('compressed.spz')).toBe('spz');
  });

  it('returns holoscript_native for unknown extensions', () => {
    expect(detectGaussianFormat('data.bin')).toBe('holoscript_native');
    expect(detectGaussianFormat('noext')).toBe('holoscript_native');
  });

  it('handles uppercase extensions', () => {
    expect(detectGaussianFormat('SCENE.PLY')).toBe('ply');
  });
});

// =============================================================================
// estimateMultiUserCost (P.043)
// =============================================================================

describe('estimateMultiUserCost', () => {
  it('returns 1.0 multiplier for single user', () => {
    const result = estimateMultiUserCost(1);
    expect(result.costMultiplier).toBe(1.0);
    expect(result.savingsPercent).toBe(0);
    expect(result.exceedsPracticalCeiling).toBe(false);
  });

  it('returns savings for 4 users', () => {
    const result = estimateMultiUserCost(4);
    expect(result.savingsPercent).toBeGreaterThan(0);
    expect(result.costMultiplier).toBeLessThan(1.0);
    expect(result.exceedsPracticalCeiling).toBe(false);
  });

  it('savings increase with more users', () => {
    const four = estimateMultiUserCost(4);
    const eight = estimateMultiUserCost(8);
    expect(eight.savingsPercent).toBeGreaterThan(four.savingsPercent);
  });

  it('flags exceeding practical ceiling at 13+ users', () => {
    const result = estimateMultiUserCost(13);
    expect(result.exceedsPracticalCeiling).toBe(true);
  });

  it('does not exceed ceiling at 12 users', () => {
    const result = estimateMultiUserCost(12);
    expect(result.exceedsPracticalCeiling).toBe(false);
  });

  it('custom sort fraction changes savings', () => {
    const defaultSort = estimateMultiUserCost(4, 0.6);
    const highSort = estimateMultiUserCost(4, 0.8);
    // Higher sort fraction → more to share → more savings
    expect(highSort.savingsPercent).toBeGreaterThan(defaultSort.savingsPercent);
  });
});

// =============================================================================
// getAvailableGaussianBudget (P.XR.07)
// =============================================================================

describe('getAvailableGaussianBudget', () => {
  it('returns full budget with 0 KV cache', () => {
    const result = getAvailableGaussianBudget('quest3', 0);
    expect(result.maxGaussians).toBeGreaterThan(0);
    expect(result.memoryAvailableMB).toBeGreaterThan(0);
  });

  it('reduces available memory when KV cache is present', () => {
    const withoutKV = getAvailableGaussianBudget('quest3', 0);
    const withKV = getAvailableGaussianBudget('quest3', 512);
    expect(withKV.memoryAvailableMB).toBeLessThan(withoutKV.memoryAvailableMB);
  });

  it('returns 0 budget when KV cache consumes all memory', () => {
    // quest3 has 8192 MB total, 3072 reserved → 5120 available
    // KV cache > available → 0 Gaussians
    const result = getAvailableGaussianBudget('quest3', 6000);
    expect(result.maxGaussians).toBe(0);
  });

  it('desktop_vr has more budget than quest3', () => {
    const quest3 = getAvailableGaussianBudget('quest3', 0);
    const desktop = getAvailableGaussianBudget('desktop_vr', 0);
    expect(desktop.maxGaussians).toBeGreaterThan(quest3.maxGaussians);
  });

  it('impact description mentions GS reduction for non-zero KV', () => {
    const result = getAvailableGaussianBudget('quest3', 256);
    expect(result.kvCacheImpact).toBeTruthy();
  });
});
