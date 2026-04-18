import { describe, test, expect } from 'vitest';
import { hashBytes } from '../../../core/src/testing/DeterminismHarness';

function calcStats(samples: number[]) {
  const n = samples.length;
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? samples.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1) : 0;
  const stddev = Math.sqrt(variance);
  const sorted = [...samples].sort((a, b) => a - b);
  const median =
    n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  const p99Idx = Math.min(n - 1, Math.floor(n * 0.99));
  const p99 = sorted[p99Idx];
  return { mean, stddev, median, p99 };
}

describe('Dumb Glass Rendering Contract (P3-CENTER)', () => {
  test('Scene-graph and Pixel-chunk provenance hashing overhead (Multi-Run)', async () => {
    const mockSceneGraphSize = 750 * 1024; // 750 KB
    const mockSceneGraph = new Uint8Array(mockSceneGraphSize);
    for (let i = 0; i < mockSceneGraphSize; i++) {
      mockSceneGraph[i] = Math.floor(Math.random() * 256);
    }
    
    const tileSize = 256 * 256 * 4; // 256 KB
    const mockPixelTile = new Uint8Array(tileSize);
    for (let i = 0; i < tileSize; i++) {
      mockPixelTile[i] = Math.floor(Math.random() * 256);
    }
    
    const runs = 10;
    const numFramesPerRun = 100;
    const tilesPerFrame = 10;
    
    const sgHashSamples: number[] = [];
    const ptHashSamples: number[] = [];
    const totalFrameOverheadSamples: number[] = [];
    
    for (let r = 0; r < runs; r++) {
      for (let i = 0; i < numFramesPerRun; i++) {
        const t0 = performance.now();
        await hashBytes(mockSceneGraph, 'sha256');
        const frameSgMs = performance.now() - t0;
        
        const t1 = performance.now();
        for (let t = 0; t < tilesPerFrame; t++) {
          await hashBytes(mockPixelTile, 'sha256');
        }
        const framePtMs = performance.now() - t1;
        
        sgHashSamples.push(frameSgMs);
        ptHashSamples.push(framePtMs / tilesPerFrame);
        totalFrameOverheadSamples.push(frameSgMs + framePtMs);
      }
    }

    const sgStats = calcStats(sgHashSamples);
    const ptStats = calcStats(ptHashSamples);
    const frameStats = calcStats(totalFrameOverheadSamples);
    
    const overheadMedianPct = (frameStats.median / 16.66) * 100;
    const overheadP99Pct = (frameStats.p99 / 16.66) * 100;
    const overheadMeanPct = (frameStats.mean / 16.66) * 100;
    const overheadStddevPct = (frameStats.stddev / 16.66) * 100;

    console.log(`\nP3-CENTER Dumb Glass Provenance Benchmark (N=${runs * numFramesPerRun} frames)`);
    console.log(`Scene-Graph Hash (750KB) per frame: ${sgStats.median.toFixed(3)} ms (median), ${sgStats.p99.toFixed(3)} ms (p99)`);
    console.log(`Pixel-Tile Hash (256KB) per tile: ${ptStats.median.toFixed(3)} ms (median), ${ptStats.p99.toFixed(3)} ms (p99)`);
    console.log(`Total Provenance Overhead per Frame: ${frameStats.median.toFixed(3)} ms (median), ${frameStats.p99.toFixed(3)} ms (p99)`);
    console.log(
      `Total vs 16.6ms (60Hz) budget: ${overheadMedianPct.toFixed(2)}% (median), ${overheadP99Pct.toFixed(2)}% (p99); mean ${overheadMeanPct.toFixed(2)}% ± ${overheadStddevPct.toFixed(2)}% (stddev — diagnostic only)\n`
    );

    expect(frameStats.median).toBeGreaterThan(0);
  }, 60000);
});
