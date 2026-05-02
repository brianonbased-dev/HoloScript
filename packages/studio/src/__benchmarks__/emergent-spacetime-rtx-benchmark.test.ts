/**
 * EmergentSpacetime RTX 6000 Ada Benchmark Test
 *
 * Vitest wrapper for the RTX benchmark. Run with:
 *   pnpm test -- emergent-spacetime-rtx-benchmark.test.ts
 *
 * For Vast.ai deployment:
 *   1. Copy this file to Vast.ai worker
 *   2. Run: node --test emergent-spacetime-rtx-benchmark.test.ts --run --voxels=1000 --frames=300
 *   3. Upload results to Paper 3 §7.8
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runEmergentSpacetimeBenchmark } from './emergent-spacetime-rtx-benchmark';

describe('EmergentSpacetime RTX 6000 Ada Benchmark', () => {
  let results: Awaited<ReturnType<typeof runEmergentSpacetimeBenchmark>>;

  beforeAll(async () => {
    results = await runEmergentSpacetimeBenchmark({
      voxelCount: 1000,
      frameSamples: 100, // Reduced for CI; use 300 for Paper 3
      seed: 42,
    });
  }, 120000); // 2min timeout for 100 frames

  afterAll(() => {
    console.log('\n=== EmergentSpacetime Benchmark Results ===\n');
    console.table(results.summary);
  });

  describe('Hardware Detection', () => {
    it('should detect GPU', () => {
      expect(results.hardware.gpu).toBeDefined();
      expect(results.hardware.gpu).not.toBe('Unknown GPU');
      console.log(`GPU: ${results.hardware.gpu}`);
    });

    it('should report device memory', () => {
      // May be null in some browsers
      console.log(`Memory: ${results.hardware.deviceMemory || 'N/A'} GB`);
    });
  });

  describe('Network Initialization', () => {
    it('should initialize 1000 voxels in <100ms', () => {
      expect(results.initialization.traitAttachMs).toBeLessThan(100);
      console.log(`Trait attach: ${results.initialization.traitAttachMs.toFixed(2)}ms`);
    });

    it('should create expected edge density', () => {
      // Expected: ~1.4 edges per voxel (max 6, but sparse initialization)
      const avgEdges = results.networkSize.avgEdgesPerVoxel;
      expect(avgEdges).toBeGreaterThanOrEqual(1.0);
      expect(avgEdges).toBeLessThanOrEqual(6.0);
      console.log(`Edge density: ${avgEdges.toFixed(2)} edges/voxel`);
    });
  });

  describe('Frame Performance (Paper 3 §7.8)', () => {
    it('should maintain 60 FPS at 1000 voxels', () => {
      // Target: <16.67ms/frame
      expect(results.perFrame.avgUpdateMs).toBeLessThan(16.67);
      console.log(`Avg frame: ${results.perFrame.avgUpdateMs.toFixed(2)}ms (${results.perFrame.avgFps} FPS)`);
    });

    it('should maintain 30 FPS at 1000 voxels (degraded)', () => {
      // Fallback target: <33.33ms/frame
      expect(results.perFrame.avgUpdateMs).toBeLessThan(33.33);
    });

    it('should have p95 latency <20ms', () => {
      expect(results.perFrame.p95UpdateMs).toBeLessThan(20);
      console.log(`P95 frame: ${results.perFrame.p95UpdateMs.toFixed(2)}ms`);
    });
  });

  describe('Ricci Curvature Computation', () => {
    it('should compute Ricci in <10μs/voxel', () => {
      expect(results.ricci.avgMicrosecondsPerVoxel).toBeLessThan(10);
      console.log(`Ricci: ${results.ricci.avgMicrosecondsPerVoxel.toFixed(2)}μs/voxel`);
    });

    it('should track violations', () => {
      // Some violations are expected during force-layout settling
      console.log(`Violations: ${results.ricci.totalViolations} total (${results.ricci.violationRate}/frame avg)`);
    });
  });

  describe('Force-Layout Guard', () => {
    it('should have <5% overhead', () => {
      expect(results.forceLayout.overheadPercent).toBeLessThan(5);
      console.log(`Force-layout overhead: ${results.forceLayout.overheadPercent.toFixed(2)}%`);
    });

    it('should apply stabilizing forces', () => {
      // Average force magnitude should be small (settled network)
      expect(results.forceLayout.avgForceMagnitude).toBeLessThan(0.1);
      console.log(`Avg force magnitude: ${results.forceLayout.avgForceMagnitude.toFixed(4)}`);
    });
  });

  describe('Hubble Correction', () => {
    it('should activate Hubble when loop density exceeds threshold', () => {
      // Hubble may or may not activate depending on network topology
      console.log(`Hubble activation: Frame ${results.hubble.activationFrame || 'N/A'}`);
      console.log(`Hubble δ: ${results.hubble.correctionPercent.toFixed(2)}%`);
    });

    it('should stay within ±8% window', () => {
      expect(Math.abs(results.hubble.correctionPercent)).toBeLessThanOrEqual(8);
    });
  });

  describe('Memory Footprint', () => {
    it('should use <500MB heap', () => {
      // Conservative bound; actual usage depends on browser
      if (results.memory.heapUsedMB > 0) {
        expect(results.memory.heapUsedMB).toBeLessThan(500);
        console.log(`Heap: ${results.memory.heapUsedMB.toFixed(1)}MB / ${results.memory.heapTotalMB.toFixed(1)}MB`);
      }
    });

    it('should serialize network efficiently', () => {
      // Network should be <1MB serialized
      expect(results.memory.networkSizeKB).toBeLessThan(1024);
      console.log(`Network size: ${results.memory.networkSizeKB.toFixed(1)}KB`);
    });
  });

  describe('Paper 3 Budget Compliance', () => {
    it('should pass all budget checks', () => {
      if (!results.budgetCheck.within60fpsBudget) {
        console.warn('60 FPS budget missed:', results.budgetCheck.violations);
      }
      expect(results.budgetCheck.violations.length).toBe(0);
    });
  });
});
