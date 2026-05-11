// cross-vendor-determinism-runner.mjs
// Empirical cross-vendor LIF determinism probe for Paper #2.
// Runs the canonical probe on every available Dawn adapter and prints hashes.

import { GPUContext, runLIFDeterminismProbe, PAPER_2_CANONICAL_CONFIG } from './dist/index.js';

// ── Bootstrap Dawn (same logic as test setup) ───────────────────────────────
let gpuInstance;
try {
  const { create } = await import('webgpu');
  gpuInstance = create([]);
  if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = {};
  }
  globalThis.navigator.gpu = gpuInstance;
  console.log('[runner] ✅ Dawn WebGPU bootstrapped');
} catch (e) {
  console.error('[runner] Failed to bootstrap Dawn:', e.message);
  process.exit(1);
}

// Dawn doesn't expose usage constants — install them globally
if (typeof globalThis.GPUBufferUsage === 'undefined') {
  globalThis.GPUBufferUsage = {
    MAP_READ: 0x0001,
    MAP_WRITE: 0x0002,
    COPY_SRC: 0x0004,
    COPY_DST: 0x0008,
    INDEX: 0x0010,
    VERTEX: 0x0020,
    UNIFORM: 0x0040,
    STORAGE: 0x0080,
    INDIRECT: 0x0100,
    QUERY_RESOLVE: 0x0200,
  };
}
if (typeof globalThis.GPUMapMode === 'undefined') {
  globalThis.GPUMapMode = { READ: 0x0001, WRITE: 0x0002 };
}

if (!gpuInstance || typeof gpuInstance.requestAdapter !== 'function') {
  console.error('Dawn instance invalid');
  process.exit(1);
}

async function probeOnAdapter(powerPreference) {
  const adapter = await gpuInstance.requestAdapter({ powerPreference });
  if (!adapter) {
    console.log(`No adapter for powerPreference=${powerPreference}`);
    return null;
  }
  const info = adapter.info ?? { vendor: 'unknown', architecture: 'unknown' };
  console.log(`\n--- Adapter: ${powerPreference} ---`);
  console.log(`Vendor : ${info.vendor}`);
  console.log(`Arch   : ${info.architecture}`);

  const ctx = new GPUContext();
  await ctx.initialize({ powerPreference, label: `probe-${powerPreference}` });

  const bytes = await runLIFDeterminismProbe(ctx, PAPER_2_CANONICAL_CONFIG);
  const floats = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);

  // Simple hash for quick comparison
  const hash = await sha256Hex(bytes);
  console.log(`Hash   : sha256:${hash}`);
  console.log(`Size   : ${bytes.byteLength} bytes (${floats.length} floats)`);

  ctx.destroy();
  return { powerPreference, vendor: info.vendor, arch: info.architecture, hash: `sha256:${hash}`, floats };
}

async function sha256Hex(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(bytes).digest('hex');
}

function computeVariance(a, b) {
  let maxAbsDiff = 0;
  let meanAbsDiff = 0;
  let maxRelDiff = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = Math.abs(a[i] - b[i]);
    meanAbsDiff += diff;
    if (diff > maxAbsDiff) maxAbsDiff = diff;
    const base = Math.max(Math.abs(a[i]), Math.abs(b[i]), 1e-9);
    const rel = diff / base;
    if (rel > maxRelDiff) maxRelDiff = rel;
  }
  meanAbsDiff /= a.length;
  return { maxAbsDiff, meanAbsDiff, maxRelDiff };
}

async function main() {
  const results = [];

  const highPerf = await probeOnAdapter('high-performance');
  if (highPerf) results.push(highPerf);

  const lowPower = await probeOnAdapter('low-power');
  if (lowPower) results.push(lowPower);

  console.log('\n========== CROSS-VENDOR SUMMARY ==========');
  for (const r of results) {
    console.log(`${r.vendor.padEnd(12)} (${r.arch.padEnd(8)}) | ${r.hash}`);
  }
  if (results.length >= 2) {
    const allSame = results.every((r) => r.hash === results[0].hash);
    console.log(`\nBit-identical across adapters: ${allSame ? 'YES' : 'NO'}`);
    if (!allSame) {
      const v = computeVariance(results[0].floats, results[1].floats);
      console.log(`\nQuantitative variance (sample: ${results[0].floats.length} neurons):`);
      console.log(`  Max absolute diff : ${v.maxAbsDiff.toExponential(4)}`);
      console.log(`  Mean absolute diff: ${v.meanAbsDiff.toExponential(4)}`);
      console.log(`  Max relative diff : ${(v.maxRelDiff * 100).toFixed(4)}%`);
      console.log('\nWARNING: Cross-vendor hash divergence detected.');
      console.log('Paper #2 determinism claim requires deterministic-float WGSL mode or downgrade to probabilistic.');
    }
  }
  console.log('==========================================');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
