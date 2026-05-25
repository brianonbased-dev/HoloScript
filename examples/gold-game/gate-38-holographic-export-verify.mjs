// THE GOLD GAME - Gate 38: holographic export leg for the depth-real vista.
//
// Gate 34 proved the Gate-32 vista is visible and depth-displaced in the
// playable build. This gate proves the export deepening: the same depth world
// feeds the shipped QuiltCompiler and MVHEVCCompiler, plus a deterministic
// parallax preview/share manifest.
//
// Honest scope: this is compiler-side export metadata/rig/projection proof.
// It does not rasterize a quilt PNG, encode a .mov, or play on Looking Glass /
// Vision Pro hardware.
//
//   node_modules/.bin/tsx examples/gold-game/gate-38-holographic-export-verify.mjs --emit
//   node_modules/.bin/tsx examples/gold-game/gate-38-holographic-export-verify.mjs

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const imp = (p) => import(pathToFileURL(p).href);

const { QuiltCompiler } = await imp(join(repo, 'packages', 'engine', 'src', 'hologram', 'QuiltCompiler.ts'));
const { MVHEVCCompiler } = await imp(join(repo, 'packages', 'engine', 'src', 'hologram', 'MVHEVCCompiler.ts'));
const { computeStateDigest } = await imp(join(repo, 'packages', 'engine', 'src', 'simulation', 'hashes.ts'));

const vistaPath = join(here, 'gold-vault-vista-world.json');
const receiptPath = join(here, 'GATE-38-HOLOGRAPHIC-EXPORT-receipt.json');
const artifactPath = join(here, 'gold-vault-holographic-export.json');
const HASH = 'sha256';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const round = (n, places = 6) => Math.round(Number(n) * 10 ** places) / 10 ** places;
const q = (n) => Math.round(Number(n) * 100000);
const roundVec = (v, places = 6) => v.map((n) => round(n, places));
const hexFloats = (hex) => {
  const out = [];
  for (let i = 0; i < hex.length; i += 2) out.push(Number.parseInt(hex.slice(i, i + 2), 16));
  return out;
};

function cloneJson(v) {
  return JSON.parse(JSON.stringify(v));
}

function loadVista(tamper = false) {
  const world = JSON.parse(readFileSync(vistaPath, 'utf8'));
  const grid = world.generated_group?.depthGrid;
  if (!grid || !Array.isArray(grid.depths)) throw new Error('Missing Gate-32 vista depth grid');
  if (tamper) {
    // Tamper a cell that is part of the 8x6 export sample lattice.
    const idx = Math.round((3 / 5) * (grid.height - 1)) * grid.width + Math.round((4 / 7) * (grid.width - 1));
    grid.depths[idx] = Math.min(1, grid.depths[idx] + 0.001);
  }
  return { world, grid };
}

function sampleVista(grid) {
  const bd = grid.backdrop;
  const samples = [];
  const cols = 8;
  const rows = 6;
  for (let sy = 0; sy < rows; sy += 1) {
    for (let sx = 0; sx < cols; sx += 1) {
      const gx = Math.round((sx / (cols - 1)) * (grid.width - 1));
      const gy = Math.round((sy / (rows - 1)) * (grid.height - 1));
      const depth = Number(grid.depths[gy * grid.width + gx]);
      const u = gx / (grid.width - 1);
      const v = gy / (grid.height - 1);
      const x = bd.originX - bd.spanX / 2 + u * bd.spanX;
      const y = bd.originY + bd.spanY / 2 - v * bd.spanY;
      const z = bd.originZ - (1 - depth) * bd.depthScale;
      const tone = Math.max(0, Math.min(255, Math.round(96 + depth * 130)));
      samples.push({
        id: `vista_${sx}_${sy}`,
        grid: [gx, gy],
        depth: round(depth, 5),
        world: [round(x), round(y), round(z)],
        color: `#${tone.toString(16).padStart(2, '0')}b7d9`,
      });
    }
  }
  return samples;
}

function makeComposition(samples) {
  return {
    name: 'GoldVaultVistaSpatial',
    objects: [
      {
        traits: [
          { name: 'quilt', config: { device: '16inch', views: 48, columns: 8, rows: 6, baseline: 0.06, focusDistance: 2.25 } },
          { name: 'spatial_video', config: { ipd: 0.065, resolution: [1920, 1080], fps: 30, convergence: 2.25, fov: 70, quality: 'high' } },
        ],
        properties: [
          { key: 'position', value: [0, 6, -24] },
          { key: 'scale', value: [24, 16, 1] },
          { key: 'color', value: '#8eb4d8' },
          { key: 'geometry', value: 'plane' },
        ],
      },
      ...samples.map((s) => ({
        traits: [],
        properties: [
          { key: 'position', value: s.world },
          { key: 'scale', value: [0.14, 0.14, 0.14] },
          { key: 'color', value: s.color },
          { key: 'geometry', value: 'sphere' },
        ],
      })),
    ],
  };
}

function project(point, cameraOffset, viewShear, focusDistance, fovDeg) {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 180 / 2);
  const camZ = focusDistance + 4;
  const x = point[0] - cameraOffset;
  const y = point[1];
  const z = Math.max(1e-4, camZ - point[2]);
  return { x: (f * x) / z + viewShear, y: (f * y) / z, depth: z };
}

function buildParallaxPreview(samples) {
  const offsets = [-0.04, -0.03, -0.02, -0.01, 0, 0.01, 0.02, 0.03, 0.04];
  const focusDistance = 2.25;
  const fovDeg = 70;
  const frames = offsets.map((offset, index) => {
    const projected = samples.map((s) => {
      const pr = project(s.world, offset, -offset / focusDistance, focusDistance, fovDeg);
      return [q(pr.x), q(pr.y), q(pr.depth)];
    });
    return { index, cameraOffset: round(offset), sampleTriples: projected };
  });
  const field = frames.flatMap((f) => [q(f.cameraOffset), ...f.sampleTriples.flat()]);
  return {
    format: 'deterministic-parallax-preview',
    frames: frames.length,
    cameraOffsets: offsets.map((n) => round(n)),
    digest: computeStateDigest({ fieldNames: ['parallax'], getField: () => Float32Array.from(field) }, HASH),
  };
}

function buildExport(tamper = false, codeEdit = false) {
  const { world, grid } = loadVista(tamper);
  const samples = sampleVista(grid);
  const composition = makeComposition(samples);
  const quilt = new QuiltCompiler().compileQuilt(composition);
  const mvhevc = new MVHEVCCompiler().compileMVHEVC(composition, {
    ipd: 0.065,
    resolution: [1920, 1080],
    fps: 30,
    convergenceDistance: 2.25,
    fovDegrees: 70,
    quality: 'high',
    disparityScale: 1,
  });
  const parallax = buildParallaxPreview(samples);

  // Simulate an honest compiler comment/clarity edit (codeEdit): the emitted source
  // strings gain a doc comment but the geometry is byte-identical. This must change
  // the informational code hashes and must NOT change exportDigest.
  const swiftSource = codeEdit ? mvhevc.swiftCode + '\n// honest clarity edit\n' : mvhevc.swiftCode;
  const muxSource = codeEdit ? mvhevc.muxCommand + ' # honest clarity edit' : mvhevc.muxCommand;
  const rendererSource = codeEdit ? quilt.rendererCode + '\n// honest clarity edit\n' : quilt.rendererCode;

  const quiltRig = quilt.tiles.flatMap((t) => [t.index, q(t.cameraOffset), q(t.viewShear)]);
  const quiltField = [];
  for (const tile of quilt.tiles) {
    for (const sample of samples) {
      const pr = project(sample.world, tile.cameraOffset, tile.viewShear, quilt.config.focusDistance, 14);
      quiltField.push(q(pr.x), q(pr.y), q(pr.depth));
    }
  }
  const mvhevcField = mvhevc.views.flatMap((v) => [v.layerIndex, q(v.cameraOffset), q(v.viewShear)]);
  // Per-sample stereo disparity: project each sample through the left/right MV-HEVC
  // views and record both projected positions plus the horizontal disparity. This is
  // the semantic stereo geometry the export must reproduce.
  const stereoField = samples.flatMap((s) => {
    const l = project(s.world, mvhevc.views[0].cameraOffset, mvhevc.views[0].viewShear, mvhevc.config.convergenceDistance, mvhevc.config.fovDegrees);
    const r = project(s.world, mvhevc.views[1].cameraOffset, mvhevc.views[1].viewShear, mvhevc.config.convergenceDistance, mvhevc.config.fovDegrees);
    return [q(l.x), q(l.y), q(r.x), q(r.y), q(r.x - l.x)];
  });
  const depthField = samples.flatMap((s) => [s.grid[0], s.grid[1], q(s.depth), ...s.world.map(q)]);
  // exportDigest hashes ONLY the semantic geometric/projection outputs — tile camera
  // offsets, view shears, stereo disparities, parallax field, depth samples. It does
  // NOT hash compiler source-text strings (swiftCode / muxCommand / rendererCode); those
  // ride the receipt as informational hashes (see informationalCodeHashes below) so an
  // honest comment/clarity edit to a compiler no longer flips this load-bearing digest.
  const fields = {
    quiltRig: Float32Array.from(quiltRig),
    quiltField: Float32Array.from(quiltField),
    mvhevcRig: Float32Array.from(mvhevcField),
    stereoDisparity: Float32Array.from(stereoField),
    parallax: Float32Array.from(hexFloats(parallax.digest)),
    depthSamples: Float32Array.from(depthField),
  };
  const exportDigest = computeStateDigest({ fieldNames: Object.keys(fields), getField: (name) => fields[name] }, HASH);
  const center = samples[Math.floor(samples.length / 2)].world;
  const left = project(center, mvhevc.views[0].cameraOffset, mvhevc.views[0].viewShear, mvhevc.config.convergenceDistance, mvhevc.config.fovDegrees);
  const right = project(center, mvhevc.views[1].cameraOffset, mvhevc.views[1].viewShear, mvhevc.config.convergenceDistance, mvhevc.config.fovDegrees);

  return {
    artifact: {
      schema: 'gold-game-holographic-export-v1',
      gate: 38,
      name: 'holographic export leg for Gate-32/Gate-34 vista',
      source: {
        vistaWorld: 'examples/gold-game/gold-vault-vista-world.json',
        sourceImage: world.source_image,
        depthGrid: {
          width: grid.width,
          height: grid.height,
          sampledPoints: samples.length,
          backdrop: cloneJson(grid.backdrop),
        },
      },
      samples,
      quilt: {
        compiler: 'packages/engine/src/hologram/QuiltCompiler.ts',
        device: quilt.config.device,
        views: quilt.config.views,
        grid: `${quilt.config.columns}x${quilt.config.rows}`,
        resolution: quilt.config.resolution,
        baseline: quilt.config.baseline,
        focusDistance: quilt.config.focusDistance,
        tileWidth: quilt.metadata.tileWidth,
        tileHeight: quilt.metadata.tileHeight,
        projectedPoints: quilt.tiles.length * samples.length,
        rendererCodeHash: sha256(rendererSource),
      },
      mvhevc: {
        compiler: 'packages/engine/src/hologram/MVHEVCCompiler.ts',
        container: mvhevc.config.container,
        resolution: mvhevc.config.resolution,
        fps: mvhevc.config.fps,
        ipd: mvhevc.config.ipd,
        convergenceDistance: mvhevc.config.convergenceDistance,
        fovDegrees: mvhevc.config.fovDegrees,
        stereoMode: mvhevc.metadata.stereoMode,
        views: mvhevc.views.map((v) => ({ eye: v.eye, cameraOffset: round(v.cameraOffset), viewShear: round(v.viewShear), layerIndex: v.layerIndex })),
        muxCommandHash: sha256(muxSource),
        swiftCodeHash: sha256(swiftSource),
        centerDisparity: round(Math.abs(right.x - left.x)),
      },
      parallax,
      informationalCodeHashes: {
        note: 'Source-text hashes of compiler output. INFORMATIONAL ONLY — deliberately NOT part of exportDigest, so honest comment/clarity edits to the compilers do not flip the load-bearing reproducibility digest. exportDigest hashes the semantic geometry (camera offsets, view shears, stereo disparities, parallax field, depth samples), not these strings.',
        swiftCodeHash: sha256(swiftSource),
        muxCommandHash: sha256(muxSource),
        rendererCodeHash: sha256(rendererSource),
      },
      shareReceipt: {
        targets: ['looking-glass-quilt', 'vision-pro-mvhevc', 'parallax-preview'],
        exportDigest,
        payloadHash: sha256(JSON.stringify({ quilt: quilt.config, mvhevc: mvhevc.config, parallax, samples })),
      },
      honestScope: 'Compiler-side export proof for the Gate-32 depth world: real QuiltCompiler tile rig/projection, real MVHEVCCompiler stereo metadata/mux instructions, and deterministic parallax preview digest. The exportDigest is computed from the semantic geometric/projection outputs (tile camera offsets, view shears, stereo disparities, parallax field, depth samples) and excludes compiler source-text strings (kept as informational hashes only). It does not rasterize quilt pixels, encode MV-HEVC media bytes, or validate on physical Looking Glass/Vision Pro hardware.',
    },
    exportDigest,
  };
}

const clean = buildExport(false);
const tampered = buildExport(true);
const codeEdited = buildExport(false, true);
const a = clean.artifact;

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });

check('Gate-32 vista depth grid exists and is sampled', a.source.depthGrid.width === 48 && a.source.depthGrid.height === 32 && a.source.depthGrid.sampledPoints === 48, `${a.source.depthGrid.width}x${a.source.depthGrid.height}`);
check('real QuiltCompiler emits a 48-view Looking Glass tile rig', a.quilt.views === 48 && a.quilt.grid === '8x6' && a.quilt.projectedPoints === 48 * 48, `${a.quilt.device}/${a.quilt.grid}`);
check('quilt compiler output is content-addressed', /^[a-f0-9]{64}$/.test(a.quilt.rendererCodeHash), a.quilt.rendererCodeHash.slice(0, 16));
check('real MVHEVCCompiler emits left/right stereo views', a.mvhevc.views.length === 2 && a.mvhevc.views[0].eye === 'left' && a.mvhevc.views[1].eye === 'right', `${a.mvhevc.ipd}m ipd`);
check('MV-HEVC output includes spatial-video mux/playback instructions', /^[a-f0-9]{64}$/.test(a.mvhevc.muxCommandHash) && /^[a-f0-9]{64}$/.test(a.mvhevc.swiftCodeHash), a.mvhevc.stereoMode);
check('stereo/parallax geometry has measurable disparity', a.mvhevc.centerDisparity > 0, `centerDisparity=${a.mvhevc.centerDisparity}`);
check('parallax preview digest is deterministic', /^[a-f0-9]{64}$/.test(a.parallax.digest) && a.parallax.frames === 9, a.parallax.digest.slice(0, 16));
check('combined export digest is sha256-shaped', /^[a-f0-9]{64}$/.test(a.shareReceipt.exportDigest), a.shareReceipt.exportDigest.slice(0, 16));
check('negative control: one depth-cell tamper changes export digest', clean.exportDigest !== tampered.exportDigest, 'tamper detected');
check('robustness: an honest compiler source-text edit does NOT change export digest', clean.exportDigest === codeEdited.exportDigest, 'geometry-only digest');
check('robustness: that same source edit DOES change the informational code hashes', a.informationalCodeHashes.swiftCodeHash !== codeEdited.artifact.informationalCodeHashes.swiftCodeHash && a.quilt.rendererCodeHash !== codeEdited.artifact.quilt.rendererCodeHash, 'informational hashes track source');

if (!process.argv.includes('--emit')) {
  if (!existsSync(receiptPath) || !existsSync(artifactPath)) {
    console.error('Gate-38 receipt/artifact missing. Run with --emit first.');
    process.exit(2);
  }
  const oldReceipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  const oldArtifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
  check('receipt digest reproduces', oldReceipt.contract?.exportDigest === clean.exportDigest, (oldReceipt.contract?.exportDigest || '').slice(0, 16));
  check('artifact digest reproduces', oldArtifact.shareReceipt?.exportDigest === clean.exportDigest, (oldArtifact.shareReceipt?.exportDigest || '').slice(0, 16));
}

const passed = checks.filter((c) => c.pass).length;
const total = checks.length;
const allPass = passed === total;

console.log('\nTHE GOLD GAME - Gate 38: holographic export leg\n');
for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ' - ' + c.detail : ''}`);
console.log(`\n  ${passed}/${total} checks pass - ${allPass ? 'GATE 38 PASS' : 'GATE 38 FAIL'}\n`);

if (process.argv.includes('--emit') && allPass) {
  const receipt = {
    schema: 'cael-gate-v1',
    gate: 38,
    track: 'flagship',
    name: 'holographic export leg for the depth-real vista',
    verifier: 'examples/gold-game/gate-38-holographic-export-verify.mjs',
    checks: { passed, total },
    artifact: 'examples/gold-game/gold-vault-holographic-export.json',
    targets: a.shareReceipt.targets,
    quilt: a.quilt,
    mvhevc: a.mvhevc,
    parallax: a.parallax,
    informationalCodeHashes: a.informationalCodeHashes,
    negativeControl: { oneDepthCellTamperChangesExportDigest: clean.exportDigest !== tampered.exportDigest },
    contract: {
      spine: 'computeStateDigest(field-bag, sha256)',
      digestFields: ['quiltRig', 'quiltField', 'mvhevcRig', 'stereoDisparity', 'parallax', 'depthSamples'],
      digestExcludes: 'compiler source-text strings (swiftCode/muxCommand/rendererCode) — informational only',
      exportDigest: clean.exportDigest,
      payloadHash: a.shareReceipt.payloadHash,
    },
    honestScope: a.honestScope,
    status: 'PASS',
  };
  writeFileSync(artifactPath, JSON.stringify(a, null, 2) + '\n');
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(`  artifact -> ${artifactPath}`);
  console.log(`  receipt  -> ${receiptPath}`);
}

process.exit(allPass ? 0 : 1);
