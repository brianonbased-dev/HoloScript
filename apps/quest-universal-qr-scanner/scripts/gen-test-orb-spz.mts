#!/usr/bin/env tsx
/**
 * Synthetic test-orb .spz generator — proves the sovereign $0 Quest splat pipeline end-to-end with
 * a PROCEDURALLY-generated Gaussian cloud (no captured asset, no paid service, no external download).
 *
 * Builds a recognizable, colorful "glowing orb": a hollow rainbow shell of gaussians around a bright
 * white core, encodes it to Niantic SPZ v3 via our OWN production codec (packages/engine SpzCodec),
 * round-trips it (encode → decode → assert counts/values match), and writes the .spz into the Quest
 * app's bundled assets (android-mr/app/src/main/assets/splats/test-orb.spz) so Meta's native
 * `com.meta.spatial.splat.Splat` (which reads .ply/.spz, ≤150k splats on Quest 3) can render it.
 *
 *   Run:  npx tsx apps/quest-universal-qr-scanner/scripts/gen-test-orb-spz.mts
 *
 * The codec consumed here is the SAME SpzCodec the engine ships — this is a dogfood of our SPZ
 * encoder, not a one-off writer. SPZ is gzip-wrapped, so Node's global CompressionStream is required
 * (Node 18+; verified on Node 24).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SpzCodec } from '../../../packages/engine/src/gpu/codecs/SpzCodec';
import type { GaussianSplatData } from '../../../packages/engine/src/gpu/codecs/types';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..');
const outDir = join(appDir, 'android-mr', 'app', 'src', 'main', 'assets', 'splats');
const outPath = join(outDir, 'test-orb.spz');

// ── deterministic PRNG (mulberry32) so the asset is reproducible byte-for-byte ─────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0xb16b00b5);

// ── HSV → RGB (for a saturated rainbow shell) ──────────────────────────────────────────────────
function hsv(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}

// ── build the orb ───────────────────────────────────────────────────────────────────────────────
// A rainbow SHELL (Fibonacci-sphere distributed gaussians, hue by longitude, height-tinted) plus a
// dense bright-white CORE so it reads as a "glowing orb". Each gaussian: position, RGB color, per-axis
// scale, rotation quaternion (identity — round splats), opacity.
const SHELL = 12000;
const CORE = 4000;
const N = SHELL + CORE;
const RADIUS = 0.6; // metres — a ~1.2 m glowing orb at the world origin

const positions = new Float32Array(N * 3);
const colors = new Float32Array(N * 4); // RGBA; SpzCodec uses .colors[*4 + 0..2] for RGB, [+3] mirrors opacity
const scales = new Float32Array(N * 3);
const rotations = new Float32Array(N * 4);
const opacities = new Float32Array(N);

const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // golden angle for an even Fibonacci sphere

// Shell: even spherical distribution, saturated rainbow by longitude, slight radial jitter.
for (let i = 0; i < SHELL; i++) {
  const y = 1 - (i / (SHELL - 1)) * 2; // 1 → -1
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = GOLDEN * i;
  const x = Math.cos(theta) * r;
  const z = Math.sin(theta) * r;
  const jitter = 1 + (rng() - 0.5) * 0.06; // ±3% radial fuzz so the shell has volume
  const R = RADIUS * jitter;

  positions[i * 3 + 0] = x * R;
  positions[i * 3 + 1] = y * R;
  positions[i * 3 + 2] = z * R;

  // hue from longitude (theta), value lifted toward the poles for a lit look
  const hue = (((theta / (Math.PI * 2)) % 1) + 1) % 1;
  const val = 0.85 + 0.15 * Math.abs(y);
  const [cr, cg, cb] = hsv(hue, 0.9, val);
  colors[i * 4 + 0] = cr;
  colors[i * 4 + 1] = cg;
  colors[i * 4 + 2] = cb;

  const op = 0.9;
  opacities[i] = op;
  colors[i * 4 + 3] = op;

  const s = 0.018 + rng() * 0.01; // small splats so the shell looks finely stippled, not blobby
  scales[i * 3 + 0] = s;
  scales[i * 3 + 1] = s;
  scales[i * 3 + 2] = s;

  rotations[i * 4 + 0] = 0;
  rotations[i * 4 + 1] = 0;
  rotations[i * 4 + 2] = 0;
  rotations[i * 4 + 3] = 1; // identity quaternion
}

// Core: a dense, bright, slightly warm white cloud filling the inner half-radius — the "glow".
for (let j = 0; j < CORE; j++) {
  const i = SHELL + j;
  // uniform-in-volume sample of a ball of radius 0.45*RADIUS
  const u = rng();
  const rr = 0.45 * RADIUS * Math.cbrt(u);
  const ct = rng() * 2 - 1;
  const st = Math.sqrt(Math.max(0, 1 - ct * ct));
  const ph = rng() * Math.PI * 2;
  positions[i * 3 + 0] = rr * st * Math.cos(ph);
  positions[i * 3 + 1] = rr * ct;
  positions[i * 3 + 2] = rr * st * Math.sin(ph);

  colors[i * 4 + 0] = 1.0;
  colors[i * 4 + 1] = 0.97;
  colors[i * 4 + 2] = 0.88; // warm white
  const op = 0.55; // translucent core → additive glow feel
  opacities[i] = op;
  colors[i * 4 + 3] = op;

  const s = 0.03 + rng() * 0.02; // larger, softer core splats
  scales[i * 3 + 0] = s;
  scales[i * 3 + 1] = s;
  scales[i * 3 + 2] = s;

  rotations[i * 4 + 0] = 0;
  rotations[i * 4 + 1] = 0;
  rotations[i * 4 + 2] = 0;
  rotations[i * 4 + 3] = 1;
}

const orb: GaussianSplatData = {
  positions,
  scales,
  rotations,
  colors,
  opacities,
  shDegree: 0, // DC color only — no view-dependent SH (keeps the asset tiny and the test exact)
  count: N,
};

// ── encode → round-trip → write ──────────────────────────────────────────────────────────────────
async function main() {
  const codec = new SpzCodec();

  const enc = await codec.encode(orb, { encodingVersion: 3, shDegree: 0 });
  const bytes = new Uint8Array(enc.data.data);

  // Round-trip: decode the just-encoded buffer and assert it reconstructs faithfully.
  const dec = await codec.decode(enc.data.data, { decodeSH: false });
  const d = dec.data;

  const problems: string[] = [];
  if (d.count !== N) problems.push(`count mismatch: encoded ${N}, decoded ${d.count}`);

  // Position fidelity: SPZ stores positions as 24-bit fixed-point with 12 fractional bits → step
  // 1/4096 ≈ 0.000244 m. Allow a generous quantization tolerance.
  const POS_TOL = 0.0008;
  let maxPosErr = 0;
  for (let i = 0; i < N * 3; i++) {
    maxPosErr = Math.max(maxPosErr, Math.abs(d.positions[i] - positions[i]));
  }
  if (maxPosErr > POS_TOL) problems.push(`max position error ${maxPosErr.toFixed(6)} > ${POS_TOL}`);

  // Color fidelity: round-trips through an 8-bit SH-DC quantization → tolerate ~3/255.
  const COL_TOL = 0.02;
  let maxColErr = 0;
  for (let i = 0; i < N; i++) {
    for (let c = 0; c < 3; c++) {
      maxColErr = Math.max(maxColErr, Math.abs(d.colors[i * 4 + c] - colors[i * 4 + c]));
    }
  }
  if (maxColErr > COL_TOL) problems.push(`max color error ${maxColErr.toFixed(4)} > ${COL_TOL}`);

  // Opacity fidelity: 8-bit → tolerate ~2/255.
  const OP_TOL = 0.01;
  let maxOpErr = 0;
  for (let i = 0; i < N; i++)
    maxOpErr = Math.max(maxOpErr, Math.abs(d.opacities[i] - opacities[i]));
  if (maxOpErr > OP_TOL) problems.push(`max opacity error ${maxOpErr.toFixed(4)} > ${OP_TOL}`);

  // Scale fidelity: log-encoded 8-bit → relative tolerance.
  let maxScaleRelErr = 0;
  for (let i = 0; i < N * 3; i++) {
    const rel = Math.abs(d.scales[i] - scales[i]) / Math.max(1e-6, scales[i]);
    maxScaleRelErr = Math.max(maxScaleRelErr, rel);
  }
  if (maxScaleRelErr > 0.05)
    problems.push(`max scale rel error ${maxScaleRelErr.toFixed(4)} > 0.05`);

  console.log(`[gen-test-orb] gaussians: ${N} (shell ${SHELL} + core ${CORE})`);
  console.log(
    `[gen-test-orb] encoded .spz size: ${bytes.length} bytes (${(bytes.length / 1024).toFixed(1)} KiB)`
  );
  console.log(`[gen-test-orb] round-trip decoded count: ${d.count}`);
  console.log(
    `[gen-test-orb] max errors — pos ${maxPosErr.toFixed(6)} m, color ${maxColErr.toFixed(4)}, opacity ${maxOpErr.toFixed(4)}, scale(rel) ${maxScaleRelErr.toFixed(4)}`
  );

  if (problems.length) {
    console.error(`[gen-test-orb] ROUND-TRIP FAILED:\n  - ${problems.join('\n  - ')}`);
    process.exit(1);
  }
  if (N > 150000) {
    console.error(`[gen-test-orb] ${N} splats exceeds Quest 3 Splat cap (150k)`);
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, bytes);
  console.log(`[gen-test-orb] ROUND-TRIP OK ✓  wrote ${outPath}`);
}

main().catch((e) => {
  console.error('[gen-test-orb] failed:', e);
  process.exit(1);
});
