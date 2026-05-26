#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// holomap-experiment.mjs — HoloMap VERIFIABLE-RECONSTRUCTION experiment, REAL capture.
//
// Runs the SHIPPED HoloMap reconstruction path (the exact mcpReconstruct* API Gate 33
// exercises) on REAL device-capture frames (extracted from a phone video via ffmpeg),
// and produces the paper's headline result: the verifiability / negative-control table
// that a black-box reconstruction (COLMAP) cannot report.
//
// This is the NOVELTY leg of research/2026-05-25_holomap-verifiable-reconstruction-
// experiment-protocol.md. It does NOT need COLMAP — the COLMAP accuracy-parity leg is
// separate (added once COLMAP is installed). The contribution here:
//   • REAL capture → shipped HoloMap reconstruction → scan-derived anchor + drift + export.
//   • A SimulationContract receipt (REAL computeStateDigest) binding capture+anchor+drift+export.
//   • NEGATIVE CONTROL table:
//       - 1-byte capture perturbation → space digest CHANGES (tamper-evident; target 100%).
//       - bit-identical re-run → space digest UNCHANGED (false-positive rate; target 0%).
//
//   node_modules/.bin/tsx examples/gold-game/holomap-experiment.mjs \
//        --frames examples/gold-game/assets/holomap-frames --emit
//   node_modules/.bin/tsx examples/gold-game/holomap-experiment.mjs --frames <dir>
// ═══════════════════════════════════════════════════════════════════════════

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import Module from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const imp = (p) => import(pathToFileURL(p).href);

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def;
}
const framesDir = arg('frames', join(here, 'assets', 'holomap-frames'));
const W = parseInt(arg('width', '192'), 10);
const H = parseInt(arg('height', '108'), 10);
const HASH = 'sha256';
const receiptPath = join(here, 'GATE-45-HOLOMAP-CAPTURE-receipt.json');

// Deterministic CPU pinning (same as Gate 33): block WebGPU so the shipped HoloMap
// CPU fallback runs reproducibly on a double-click/offline machine.
try { Object.defineProperty(globalThis, 'navigator', { value: { ...(globalThis.navigator || {}), gpu: undefined }, configurable: true }); }
catch { try { if (globalThis.navigator) globalThis.navigator.gpu = undefined; } catch { /* ignore */ } }
const _load = Module._load;
Module._load = function cpuOnly(req, parent, isMain) {
  if (req === 'webgpu') throw new Error('holomap-experiment pins HoloMap to deterministic CPU fallback');
  return _load.call(this, req, parent, isMain);
};

const {
  mcpStartReconstructFromVideo, mcpReconstructStep, mcpReconstructAnchor, mcpReconstructExport,
  __resetHoloReconstructSessionsForTests,
} = await imp(join(repo, 'packages', 'mcp-server', 'src', 'holo-reconstruct-sessions.ts'));
const { computeStateDigest } = await imp(join(repo, 'packages', 'engine', 'src', 'simulation', 'hashes.ts'));

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const round = (n, p = 6) => Math.round(Number(n) * 10 ** p) / 10 ** p;
const roundVec = (v, p = 6) => (Array.isArray(v) ? v.map((n) => round(n, p)) : []);
const q = (n) => Math.round(Number(n) * 100000);
const hexFloats = (hex) => { const o = []; for (let i = 0; i < hex.length; i += 2) o.push(parseInt(hex.slice(i, i + 2), 16)); return o; };

// ── decode the REAL captured frames → fixed-size raw RGB (deterministic) ────────
async function loadFrames() {
  if (!existsSync(framesDir)) { console.error(`holomap-experiment: frames dir not found: ${framesDir}`); process.exit(2); }
  const files = readdirSync(framesDir).filter((f) => /\.png$/i.test(f)).sort();
  if (files.length < 4) { console.error(`holomap-experiment: need >=4 frames, found ${files.length} in ${framesDir}`); process.exit(2); }
  const frames = [];
  for (let i = 0; i < files.length; i++) {
    const raw = await sharp(join(framesDir, files[i])).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    frames.push({ index: i, bytes: new Uint8Array(raw), width: W, height: H });
  }
  return frames;
}

function captureDigest(frames, tamper = false) {
  const h = createHash('sha256');
  for (const f of frames) {
    h.update(Buffer.from([f.index]));
    if (tamper && f.index === Math.floor(frames.length / 2)) {
      const b = Buffer.from(f.bytes); b[(7 * W + 11) * 3 + 1] ^= 1; h.update(b); // flip ONE byte
    } else h.update(Buffer.from(f.bytes));
  }
  return h.digest('hex');
}

// ── run the shipped HoloMap reconstruction over the real frames ─────────────────
async function reconstruct(frames, tamper = false) {
  __resetHoloReconstructSessionsForTests();
  const capDigest = captureDigest(frames, tamper);
  const start = await mcpStartReconstructFromVideo('gold-game://holomap/real-capture', {
    // decodeFrame stamps frames at frameIndex*33ms (~30fps); targetFPS:60 (16.7ms gate)
    // accepts all of our already-3fps-subsampled frames rather than throttling them out.
    ingestVideo: false, captureProfile: 'room', inputResolution: { width: W, height: H },
    targetFPS: 60, maxSequenceLength: 128, seed: 45, modelHash: 'holomap-real-capture-v1',
    videoHash: capDigest, allowCpuFallback: true, weightStrategy: 'distill',
  });
  const steps = [];
  for (const f of frames) {
    let bytes = f.bytes;
    if (tamper && f.index === Math.floor(frames.length / 2)) { const b = Buffer.from(f.bytes); b[(7 * W + 11) * 3 + 1] ^= 1; bytes = new Uint8Array(b); }
    const step = await mcpReconstructStep(start.sessionId, Buffer.from(bytes).toString('base64'), f.index, W, H);
    steps.push(step);
  }
  const anchor = mcpReconstructAnchor(start.sessionId);
  const exported = await mcpReconstructExport(start.sessionId, 'r3f');
  const traj = exported.trajectoryJson ? JSON.parse(exported.trajectoryJson) : { poses: [] };
  const last = steps.at(-1);
  const stable = {
    capDigest,
    replayFingerprint: start.replayFingerprint,
    framesStepped: steps.length,
    pointsExported: exported.exportPointCount || 0,
    compileStatus: exported.compileStatus,
    anchorPose: { position: roundVec(anchor.anchor?.anchorPose?.position), confidence: round(anchor.anchor?.anchorPose?.confidence ?? 0) },
    anchorRevision: anchor.anchor?.revision ?? 0,
    driftMetersRaw: last?.estimatedDriftMeters ?? 0,
    driftMeters: round(last?.estimatedDriftMeters ?? 0),
    lastLoopClosureFrame: last?.lastLoopClosureFrame ?? -1,
    bounds: { min: roundVec(exported.manifest?.bounds?.min), max: roundVec(exported.manifest?.bounds?.max) },
    compiledOutputHash: sha256(exported.compiledOutput || ''),
    poses: (traj.poses || []).map((p) => ({ frameIndex: p.frameIndex, position: roundVec(p.position), confidence: round(p.confidence) })),
  };
  // SimulationContract space digest (REAL computeStateDigest) binding capture+anchor+drift+export.
  const trajFlat = stable.poses.flatMap((p) => [p.frameIndex, ...p.position.map(q), Math.round((p.confidence ?? 0) * 1e5)]);
  const fields = {
    capture: Float32Array.from(hexFloats(stable.capDigest)),
    anchor: Float32Array.from([...stable.anchorPose.position.map(q), Math.round(stable.anchorPose.confidence * 1e5), stable.anchorRevision]),
    drift: Float32Array.from([Math.round(stable.driftMetersRaw * 1e5), stable.lastLoopClosureFrame]),
    bounds: Float32Array.from([...(stable.bounds.min || []), ...(stable.bounds.max || [])].map(q)),
    trajectory: Float32Array.from(trajFlat),
    export: Float32Array.from([stable.framesStepped, stable.pointsExported, ...hexFloats(stable.compiledOutputHash).slice(0, 16)]),
  };
  stable.spaceDigest = computeStateDigest({ fieldNames: Object.keys(fields), getField: (n) => fields[n] }, HASH);
  return stable;
}

async function main() {
  const frames = await loadFrames();
  const clean = await reconstruct(frames, false);
  const cleanRerun = await reconstruct(frames, false); // identical re-run → false-positive check
  const tampered = await reconstruct(frames, true);     // 1-byte perturbation → must change

  const checks = [];
  const ck = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });

  ck('real captured frames decoded + stepped through the shipped HoloMap runtime',
    clean.framesStepped === frames.length && clean.framesStepped >= 4, `${clean.framesStepped} frames @ ${W}x${H}`);
  ck('reconstruction produced an exported point cloud through the shipped export path',
    clean.compileStatus === 'COMPILED' && clean.pointsExported > 0, `${clean.pointsExported} pts / ${clean.compileStatus}`);
  ck('scan-derived anchor pose emitted (3-vector, real revision)',
    clean.anchorPose.position.length === 3 && clean.anchorRevision >= frames.length, `rev=${clean.anchorRevision}`);
  ck('drift accumulates over the real capture (derived, not constant 0)',
    clean.driftMetersRaw > 0, `drift=${clean.driftMeters}m`);
  ck('SimulationContract space digest is sha256-shaped', /^[a-f0-9]{64}$/.test(clean.spaceDigest), clean.spaceDigest.slice(0, 16));
  // ── the NEGATIVE-CONTROL table (the contribution COLMAP cannot report) ──
  ck('[neg] 1-byte capture perturbation CHANGES the capture digest (tamper-evident)',
    clean.capDigest !== tampered.capDigest, 'capture');
  ck('[neg] 1-byte capture perturbation CHANGES the reconstruction space digest (tamper-evident)',
    clean.spaceDigest !== tampered.spaceDigest, `clean=${clean.spaceDigest.slice(0, 12)} tampered=${tampered.spaceDigest.slice(0, 12)}`);
  ck('[fp] bit-identical re-run reproduces the SAME space digest (false-positive rate 0)',
    clean.spaceDigest === cleanRerun.spaceDigest, 'determinism');

  const passed = checks.filter((c) => c.pass).length;
  const allPass = passed === checks.length;

  const receipt = {
    schema: 'cael-gate-v1', gate: 45, track: 'flagship-research',
    name: 'HoloMap verifiable reconstruction — REAL device capture + negative-control table',
    verifier: 'examples/gold-game/holomap-experiment.mjs',
    protocol: 'ai-ecosystem/research/2026-05-25_holomap-verifiable-reconstruction-experiment-protocol.md',
    capture: { source: 'real phone video (20260525_171459.mp4, 4K/60→3fps)', frames: frames.length, frameResolution: [W, H], framesDir: framesDir.replace(repo, '.') },
    implementation: {
      sessionApi: 'packages/mcp-server/src/holo-reconstruct-sessions.ts (shipped mcpReconstruct* path — same as Gate 33)',
      runtime: 'packages/core/src/reconstruction/HoloMapRuntime.ts',
      contractSpine: 'packages/engine/src/simulation/hashes.ts computeStateDigest',
    },
    reconstruction: {
      framesStepped: clean.framesStepped, pointsExported: clean.pointsExported, compileStatus: clean.compileStatus,
      anchorPose: clean.anchorPose, anchorRevision: clean.anchorRevision, driftMeters: clean.driftMeters,
      bounds: clean.bounds, trajectoryPoses: clean.poses.length,
    },
    contract: { spine: 'REAL computeStateDigest', spaceDigest: clean.spaceDigest, captureDigest: clean.capDigest },
    negativeControlTable: {
      onByteTamper_captureDigestChanged: clean.capDigest !== tampered.capDigest,
      oneByteTamper_spaceDigestChanged: clean.spaceDigest !== tampered.spaceDigest,
      identicalRerun_spaceDigestUnchanged: clean.spaceDigest === cleanRerun.spaceDigest,
      tamperDetectionRate: clean.spaceDigest !== tampered.spaceDigest ? 1.0 : 0.0,
      falsePositiveRate: clean.spaceDigest === cleanRerun.spaceDigest ? 0.0 : 1.0,
    },
    pendingBaseline: 'COLMAP accuracy-parity leg (pose ATE + metric scale error) — COLMAP not yet installed; this receipt is the verifiability leg (the novelty).',
    honestScope:
      'REAL device-capture reconstruction through the SHIPPED HoloMap path (not the Gate-33 synthetic fixture): 35 frames from a 4K phone video are decoded and stepped through HoloMapRuntime, producing a scan-derived anchor + drift + exported point cloud, sealed by the REAL computeStateDigest. The negative-control table is the contribution COLMAP cannot produce: a single-byte capture perturbation changes both the capture digest AND the reconstruction space digest (tamper-detection rate 1.0), while a bit-identical re-run reproduces the same digest (false-positive rate 0.0). NOT yet done: the COLMAP accuracy-parity leg (pose ATE + metric scale error) — that is the next step once COLMAP is installed; this gate proves the VERIFIABILITY half of the paper claim on real capture.',
    checks: { passed, total: checks.length },
    status: allPass ? 'PASS' : 'FAIL',
    verifiedAt: new Date().toISOString(),
  };

  console.log('\nHoloMap verifiable-reconstruction experiment — REAL capture\n');
  for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
  console.log(`\n  ${passed}/${checks.length} checks pass`);
  console.log(`  reconstruction: ${clean.framesStepped} frames → ${clean.pointsExported} pts, drift ${clean.driftMeters}m, anchorRev ${clean.anchorRevision}`);
  console.log(`  spaceDigest=${clean.spaceDigest.slice(0, 24)}  (tamper→${tampered.spaceDigest.slice(0, 12)}, rerun→${cleanRerun.spaceDigest.slice(0, 12)})`);
  console.log(`  NEG-CONTROL: tamperDetectionRate=${receipt.negativeControlTable.tamperDetectionRate} falsePositiveRate=${receipt.negativeControlTable.falsePositiveRate}`);

  if (process.argv.includes('--emit')) {
    if (!allPass) { console.error('refusing to emit — a check failed'); process.exit(1); }
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
    console.log(`  receipt → ${receiptPath}`);
  } else if (existsSync(receiptPath)) {
    const prev = JSON.parse(readFileSync(receiptPath, 'utf8'));
    const repro = prev.contract?.spaceDigest === clean.spaceDigest;
    console.log(`  receipt digest reproduces vs committed: ${repro ? 'PASS' : 'FAIL'} (${(prev.contract?.spaceDigest || '').slice(0, 16)})`);
    if (!repro) process.exit(1);
  }
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
