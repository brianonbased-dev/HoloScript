// THE GOLD GAME - Gate 33: HoloMap scanned-space import.
//
// This gate exercises the shipped HoloMap reconstruction session path:
// deterministic RGB device-capture frames -> reconstruction runtime ->
// anchor -> export -> GOLD room/portal artifact.
//
// Honest scope: this repository/drive does not currently contain a real room
// scan video. The input here is therefore a deterministic device-capture fixture
// shaped like a small vault room. The proof is the HoloMap import/export path,
// not a claim that a physical room video was captured in this session.
//
//   node_modules/.bin/tsx examples/gold-game/gate-33-holomap-scan-verify.mjs --emit
//   node_modules/.bin/tsx examples/gold-game/gate-33-holomap-scan-verify.mjs

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import Module from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const imp = (p) => import(pathToFileURL(p).href);

const {
  mcpStartReconstructFromVideo,
  mcpReconstructStep,
  mcpReconstructAnchor,
  mcpReconstructExport,
  __resetHoloReconstructSessionsForTests,
} = await imp(join(repo, 'packages', 'mcp-server', 'src', 'holo-reconstruct-sessions.ts'));
const { computeStateDigest } = await imp(join(repo, 'packages', 'engine', 'src', 'simulation', 'hashes.ts'));

const receiptPath = join(here, 'GATE-33-HOLOMAP-SCAN-receipt.json');
const artifactPath = join(here, 'gold-vault-holomap-room.json');
const WIDTH = 24;
const HEIGHT = 16;
const FRAME_COUNT = 6;
const HASH = 'sha256';

// The verifier must be deterministic on a double-click/offline class machine.
// Some Node builds expose an experimental navigator.gpu; the current WebGPU
// microencoder can vary by adapter and has stricter shape assumptions than this
// tiny capture fixture. Pin this proof to HoloMap's shipped CPU fallback.
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { ...(globalThis.navigator || {}), gpu: undefined },
    configurable: true,
  });
} catch {
  try { if (globalThis.navigator) globalThis.navigator.gpu = undefined; } catch { /* ignore */ }
}
const originalModuleLoad = Module._load;
Module._load = function gate33CpuOnlyModuleLoad(request, parent, isMain) {
  if (request === 'webgpu') throw new Error('Gate 33 pins HoloMap to deterministic CPU fallback');
  return originalModuleLoad.call(this, request, parent, isMain);
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const round = (n, places = 6) => Math.round(Number(n) * 10 ** places) / 10 ** places;
const roundVec = (v, places = 6) => (Array.isArray(v) ? v.map((n) => round(n, places)) : []);
const hexFloats = (hex) => {
  const out = [];
  for (let i = 0; i < hex.length; i += 2) out.push(Number.parseInt(hex.slice(i, i + 2), 16));
  return out;
};
const q = (n) => Math.round(Number(n) * 100000);

function makeFrame(frameIndex, tamper = false) {
  const bytes = new Uint8Array(WIDTH * HEIGHT * 3);
  const pan = (frameIndex - (FRAME_COUNT - 1) / 2) * 0.045;
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const u = x / (WIDTH - 1);
      const v = y / (HEIGHT - 1);
      const idx = (y * WIDTH + x) * 3;

      // Back wall + floor gradient.
      let r = 42 + Math.round(58 * u);
      let g = 52 + Math.round(48 * (1 - v));
      let b = 74 + Math.round(62 * (1 - v));
      if (v > 0.62) {
        r = 95 + Math.round(72 * u);
        g = 70 + Math.round(40 * (1 - u));
        b = 46 + Math.round(18 * (1 - v));
      }

      // Door/portal stripe that shifts with the capture pan.
      const portalCenter = 0.5 + pan;
      if (Math.abs(u - portalCenter) < 0.07 && v > 0.18 && v < 0.78) {
        r = 218;
        g = 174 + frameIndex * 3;
        b = 64;
      }

      // Blue anchor target on the left wall.
      const marker = Math.abs(u - (0.22 + pan * 0.45)) < 0.045 && Math.abs(v - 0.42) < 0.08;
      if (marker) {
        r = 62;
        g = 178;
        b = 230;
      }

      // Diamond peak glint.
      if (Math.abs(u - (0.73 + pan * 0.25)) < 0.035 && Math.abs(v - 0.27) < 0.06) {
        r = 232;
        g = 246;
        b = 255;
      }

      bytes[idx] = r;
      bytes[idx + 1] = g;
      bytes[idx + 2] = b;
    }
  }
  if (tamper && frameIndex === 2) {
    const oneByte = (7 * WIDTH + 11) * 3 + 1;
    bytes[oneByte] = bytes[oneByte] ^ 1;
  }
  return bytes;
}

function makeCapture(tamper = false) {
  const frames = [];
  const h = createHash('sha256');
  for (let i = 0; i < FRAME_COUNT; i += 1) {
    const bytes = makeFrame(i, tamper);
    h.update(Buffer.from([i]));
    h.update(bytes);
    frames.push({ index: i, width: WIDTH, height: HEIGHT, bytes });
  }
  return { frames, captureDigest: h.digest('hex') };
}

function stableManifest(m) {
  return {
    version: m.version,
    worldId: m.worldId,
    displayName: m.displayName,
    frameCount: m.frameCount,
    pointCount: m.pointCount,
    bounds: { min: roundVec(m.bounds?.min), max: roundVec(m.bounds?.max) },
    replayHash: m.replayHash,
    simulationContract: {
      kind: m.simulationContract?.kind,
      replayFingerprint: m.simulationContract?.replayFingerprint,
      holoScriptBuild: m.simulationContract?.holoScriptBuild,
    },
    assets: m.assets,
    weightStrategy: m.weightStrategy,
  };
}

function stableAnchor(a) {
  return {
    anchorFrameIndex: a.anchorFrameIndex,
    anchorPose: {
      position: roundVec(a.anchorPose?.position),
      rotation: roundVec(a.anchorPose?.rotation),
      confidence: round(a.anchorPose?.confidence ?? 0),
    },
    anchorDescriptor: (a.anchorDescriptor || []).map((n) => round(n)),
    revision: a.revision,
  };
}

function digestSpace(stable) {
  const b = stable.manifest.bounds;
  const anchor = stable.anchor.anchorPose.position;
  const trajectory = stable.trajectory.poses.flatMap((p) => [
    p.frameIndex,
    ...p.position.map(q),
    Math.round((p.confidence ?? 0) * 100000),
  ]);
  const fields = {
    capture: Float32Array.from(hexFloats(stable.sourceCapture.captureDigest)),
    bounds: Float32Array.from([...b.min, ...b.max].map(q)),
    anchor: Float32Array.from([...anchor.map(q), stable.anchor.revision]),
    trajectory: Float32Array.from(trajectory),
    export: Float32Array.from([
      stable.manifest.frameCount,
      stable.manifest.pointCount,
      stable.export.exportPointCount,
      ...hexFloats(stable.export.compiledOutputHash).slice(0, 16),
    ]),
  };
  return computeStateDigest({ fieldNames: Object.keys(fields), getField: (name) => fields[name] }, HASH);
}

async function reconstruct(tamper = false) {
  __resetHoloReconstructSessionsForTests();
  const capture = makeCapture(tamper);
  const start = await mcpStartReconstructFromVideo('gold-game://gate33/deterministic-room-capture', {
    ingestVideo: false,
    captureProfile: 'room',
    inputResolution: { width: WIDTH, height: HEIGHT },
    targetFPS: 60,
    maxSequenceLength: 64,
    seed: 33,
    modelHash: 'gold-game-holomap-room-fixture-v1',
    videoHash: capture.captureDigest,
    allowCpuFallback: true,
    weightStrategy: 'distill',
  });

  const steps = [];
  for (const frame of capture.frames) {
    const step = await mcpReconstructStep(
      start.sessionId,
      Buffer.from(frame.bytes).toString('base64'),
      frame.index,
      frame.width,
      frame.height
    );
    steps.push(step);
  }

  const anchorResult = mcpReconstructAnchor(start.sessionId);
  const exported = await mcpReconstructExport(start.sessionId, 'r3f');
  const trajectory = exported.trajectoryJson ? JSON.parse(exported.trajectoryJson) : { poses: [] };
  const stable = {
    kind: 'holomap-scanned-space-import',
    gate: 33,
    sourceCapture: {
      kind: 'deterministic-device-capture-fixture',
      width: WIDTH,
      height: HEIGHT,
      frames: FRAME_COUNT,
      captureDigest: capture.captureDigest,
      note: 'No physical room scan video was present locally; this fixture is a deterministic room-shaped RGB capture used to exercise the shipped HoloMap path.',
    },
    session: {
      replayFingerprint: start.replayFingerprint,
      ingestMode: start.ingestMode,
      framesIngested: start.framesIngested,
      captureProfile: start.captureProfile,
    },
    steps: steps.map((s) => ({
      frameIndex: s.frameIndex,
      pointCount: s.pointCount,
      pose: { position: roundVec(s.pose.position), confidence: round(s.pose.confidence) },
      trajectoryRevision: s.trajectoryRevision,
      anchorRevision: s.anchorRevision,
    })),
    anchor: stableAnchor(anchorResult.anchor),
    manifest: stableManifest(exported.manifest),
    export: {
      target: exported.target,
      compileStatus: exported.compileStatus,
      usedCompilerFallback: exported.usedCompilerFallback === true,
      exportPointCount: exported.exportPointCount || 0,
      compiledOutputHash: sha256(exported.compiledOutput || ''),
      pointCloudPlyHash: sha256(exported.pointCloudPly || ''),
      trajectoryJsonHash: sha256(exported.trajectoryJson || ''),
      compiledOutputBytes: Buffer.byteLength(exported.compiledOutput || '', 'utf8'),
      pointCloudPlyBytes: Buffer.byteLength(exported.pointCloudPly || '', 'utf8'),
      trajectoryJsonBytes: Buffer.byteLength(exported.trajectoryJson || '', 'utf8'),
    },
    trajectory: {
      version: trajectory.version,
      poses: (trajectory.poses || []).map((p) => ({
        frameIndex: p.frameIndex,
        position: roundVec(p.position),
        rotation: roundVec(p.rotation),
        confidence: round(p.confidence),
      })),
    },
  };
  stable.contract = {
    spine: 'computeStateDigest(field-bag, sha256)',
    spaceDigest: digestSpace(stable),
    payloadHash: sha256(JSON.stringify(stable)),
  };
  return { stable, exported };
}

const clean = await reconstruct(false);
const tampered = await reconstruct(true);
const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });

check('HoloMap session starts in room profile', clean.stable.session.captureProfile === 'room', clean.stable.session.replayFingerprint.slice(0, 16));
check('all deterministic capture frames step through the runtime', clean.stable.steps.length === FRAME_COUNT && clean.stable.steps.every((s) => s.pointCount > 0), `${clean.stable.steps.length}/${FRAME_COUNT}`);
check('anchor is emitted with revision and pose', clean.stable.anchor.revision >= FRAME_COUNT && clean.stable.anchor.anchorPose.position.length === 3, `rev=${clean.stable.anchor.revision}`);
check('export compiles through the shipped HoloMap export path', clean.stable.export.compileStatus === 'COMPILED' && clean.stable.export.compiledOutputBytes > 0, `${clean.stable.export.target}/${clean.stable.export.compileStatus}`);
check('point cloud + trajectory sidecars are materialized', clean.stable.export.exportPointCount > 0 && clean.stable.trajectory.poses.length === FRAME_COUNT, `points=${clean.stable.export.exportPointCount}, poses=${clean.stable.trajectory.poses.length}`);
check('manifest carries deterministic replay identity', clean.stable.manifest.replayHash === clean.stable.session.replayFingerprint, clean.stable.manifest.replayHash.slice(0, 16));
check('one-byte capture tamper changes the capture digest', clean.stable.sourceCapture.captureDigest !== tampered.stable.sourceCapture.captureDigest, 'negative control');
check('one-byte capture tamper changes the HoloMap replay identity', clean.stable.session.replayFingerprint !== tampered.stable.session.replayFingerprint, 'negative control');
check('one-byte capture tamper changes the GOLD room digest', clean.stable.contract.spaceDigest !== tampered.stable.contract.spaceDigest, 'negative control');

const goldRoom = {
  schema: 'gold-game-holomap-room-v1',
  gate: 33,
  name: 'GOLD Scanned Room Exhibit',
  source: clean.stable.sourceCapture,
  holomap: {
    replayFingerprint: clean.stable.session.replayFingerprint,
    manifest: clean.stable.manifest,
    anchor: clean.stable.anchor,
    export: clean.stable.export,
    trajectory: clean.stable.trajectory,
  },
  portal: {
    id: 'HoloMapRoomPortal',
    label: 'HoloMap Room',
    position: [-4.8, 4.2, -17.5],
    scale: [0.9, 1.7, 0.16],
    color: '#42b7d9',
    target: 'GOLD Scanned Room Exhibit',
  },
  proves: {
    importPath: 'RGB device-capture frames feed the shipped HoloMap session API, not a mocked room JSON.',
    anchor: 'mcpReconstructAnchor returns a frame-driven revision at a FIXED origin pose (position [0,0,0]); the revision is scan-derived but the pose and drift are not yet computed from the scan (placement stub — see anchorScope).',
    export: 'mcpReconstructExport compiles the reconstruction manifest to an r3f target and emits sidecars.',
    loadBearing: 'negative control flips one byte of capture data and changes capture, replay, and room digests.',
  },
  honestScope: 'Offline data-integrity proof for the HoloMap import/export path using a deterministic room-shaped capture fixture. A live physical-room scan video was not present locally, so this gate does not claim new physical capture; it proves that captured frames become an exported GOLD space/portal artifact through the real HoloMap session/runtime/export code.',
  anchorScope: 'The reconstructed POINTS are genuinely per-pixel scan-derived (HoloMapRuntime micro-encoder), but the ANCHOR pose and drift-correction are NOT: HoloMapRuntime sets anchorPose.position=[0,0,0], descriptor=[1,0,0,1], estimatedDriftMeters=0, lastLoopClosureFrame=-1 as constants. The named holomap_anchor_context / holomap_drift_correction traits are not runtime-active here. Scan-derived anchor/drift is a buildable enhancement (see QUEST_PROOF_ENHANCEMENTS.md E4), not proven by this gate.',
  contract: clean.stable.contract,
};

check('GOLD room artifact has a portal and HoloMap anchor', goldRoom.portal.id === 'HoloMapRoomPortal' && goldRoom.holomap.anchor.revision >= FRAME_COUNT, goldRoom.portal.label);

let receiptMatches = true;
let artifactMatches = true;
if (!process.argv.includes('--emit')) {
  if (!existsSync(receiptPath) || !existsSync(artifactPath)) {
    console.error('Gate-33 receipt/artifact missing. Run with --emit first.');
    process.exit(2);
  }
  const oldReceipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  const oldArtifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
  receiptMatches = oldReceipt.contract?.spaceDigest === clean.stable.contract.spaceDigest;
  artifactMatches = oldArtifact.contract?.spaceDigest === clean.stable.contract.spaceDigest;
  check('receipt digest reproduces', receiptMatches, (oldReceipt.contract?.spaceDigest || '').slice(0, 16));
  check('artifact digest reproduces', artifactMatches, (oldArtifact.contract?.spaceDigest || '').slice(0, 16));
}

const passed = checks.filter((c) => c.pass).length;
const total = checks.length;
const allPass = passed === total;

console.log('\nTHE GOLD GAME - Gate 33: HoloMap scanned-space import\n');
for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ' - ' + c.detail : ''}`);
console.log(`\n  ${passed}/${total} checks pass - ${allPass ? 'GATE 33 PASS' : 'GATE 33 FAIL'}\n`);

if (process.argv.includes('--emit') && allPass) {
  const receipt = {
    schema: 'cael-gate-v1',
    gate: 33,
    track: 'flagship',
    name: 'HoloMap scanned-space import',
    verifier: 'examples/gold-game/gate-33-holomap-scan-verify.mjs',
    checks: { passed, total },
    artifact: 'examples/gold-game/gold-vault-holomap-room.json',
    sourceCapture: clean.stable.sourceCapture,
    implementation: {
      sessionApi: 'packages/mcp-server/src/holo-reconstruct-sessions.ts',
      runtime: 'packages/core/src/reconstruction/HoloMapRuntime.ts',
      exportPath: 'packages/mcp-server/src/holo-reconstruct-export.ts',
      contractSpine: 'packages/engine/src/simulation/hashes.ts computeStateDigest',
    },
    holomap: {
      replayFingerprint: clean.stable.session.replayFingerprint,
      framesStepped: clean.stable.steps.length,
      pointsExported: clean.stable.export.exportPointCount,
      compileStatus: clean.stable.export.compileStatus,
      anchorRevision: clean.stable.anchor.revision,
      manifest: clean.stable.manifest,
    },
    negativeControl: {
      oneByteCaptureTamperChangesCaptureDigest: clean.stable.sourceCapture.captureDigest !== tampered.stable.sourceCapture.captureDigest,
      oneByteCaptureTamperChangesReplayFingerprint: clean.stable.session.replayFingerprint !== tampered.stable.session.replayFingerprint,
      oneByteCaptureTamperChangesRoomDigest: clean.stable.contract.spaceDigest !== tampered.stable.contract.spaceDigest,
    },
    contract: clean.stable.contract,
    honestScope: goldRoom.honestScope,
    status: 'PASS',
  };
  writeFileSync(artifactPath, JSON.stringify(goldRoom, null, 2) + '\n');
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(`  artifact -> ${artifactPath}`);
  console.log(`  receipt  -> ${receiptPath}`);
}

process.exit(allPass ? 0 : 1);
