import { describe, test, expect } from 'vitest';
import { hashBytes } from '../../../core/src/testing/DeterminismHarness';

function calcStats(samples: number[]) {
  const n = samples.length;
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const variance = samples.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1 || 1);
  const stddev = Math.sqrt(variance);
  return { mean, stddev };
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
      let runSgTime = 0;
      let runPtTime = 0;
      
      for (let i = 0; i < numFramesPerRun; i++) {
        const t0 = performance.now();
        await hashBytes(mockSceneGraph, 'sha256');
        runSgTime += (performance.now() - t0);
        
        const t1 = performance.now();
        for (let t = 0; t < tilesPerFrame; t++) {
          await hashBytes(mockPixelTile, 'sha256');
        }
        runPtTime += (performance.now() - t1);
      }
      
      const runAvgSgMs = runSgTime / numFramesPerRun;
      const runAvgPtMs = runPtTime / (numFramesPerRun * tilesPerFrame);
      const runAvgTotalMs = (runSgTime + runPtTime) / numFramesPerRun;
      
      sgHashSamples.push(runAvgSgMs);
      ptHashSamples.push(runAvgPtMs);
      totalFrameOverheadSamples.push(runAvgTotalMs);
    }

    const sgStats = calcStats(sgHashSamples);
    const ptStats = calcStats(ptHashSamples);
    const frameStats = calcStats(totalFrameOverheadSamples);
    
    const overheadPercent = (frameStats.mean / 16.66) * 100;
    const overheadStddev = (frameStats.stddev / 16.66) * 100;

    console.log(`\nP3-CENTER Dumb Glass Provenance Benchmark (N=${runs} runs of ${numFramesPerRun} frames)`);
    console.log(`Avg Scene-Graph Hash (750KB): ${sgStats.mean.toFixed(3)} ms ± ${sgStats.stddev.toFixed(3)} ms`);
    console.log(`Avg Pixel-Tile Hash (256KB): ${ptStats.mean.toFixed(3)} ms ± ${ptStats.stddev.toFixed(3)} ms`);
    console.log(`Total Provenance Overhead per Frame: ${frameStats.mean.toFixed(3)} ms ± ${frameStats.stddev.toFixed(3)} ms`);
    console.log(`Total Overhead against 16.6ms (60Hz) Budget: ${overheadPercent.toFixed(2)}% ± ${overheadStddev.toFixed(2)}%\n`);

    expect(frameStats.mean).toBeGreaterThan(0);
  }, 60000);
});
