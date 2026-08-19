#!/usr/bin/env node

// H4A extends the admitted H3Z native parser/compiler/CDP/WebGPU witness.
// Exact source substitutions move the compiler onto the promoted H4A geometry
// profiles; structural insertions add a second, whole-character frame so face
// quality and full-fieldcoat legibility are both visible in the durable plate.

import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { deriveH3YHarnessSource } from './check-hololand-model-village-character-appearance-h3y.mjs';
import { deriveH3ZHarnessSource } from './check-hololand-model-village-character-appearance-h3z.mjs';
import { resolveHoloScriptRoot } from './lib/model-village-holoscript-root.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOLOSCRIPT_ROOT = resolveHoloScriptRoot({
  gate: 'H4A',
  // Kept, not deleted: sibling gates derive their runner source by string-substituting
  // this file and assert on this exact literal, so removing it breaks their anchors.
  // The path does not exist, so the resolver tries it and falls through to a real tree.
  candidates: ['C:/holorepo-worktrees/holoscript-h4a-facial-volume-garment-framing'],
});
const BASE_CHECKER_REL = 'scripts/check-hololand-model-village-character-appearance-h3x.mjs';
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h4a-facial-volume-garment-framing.holo';
const POLICY_REL =
  'source/proofs/model-village-character-appearance-h4a-facial-volume-garment-framing-policy.hsplus';
const SEED_REL =
  'source/proofs/model-village-character-appearance-h4a-facial-volume-garment-framing-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h4a-facial-volume-garment-framing-manifest.holo';
const CHECKER_REL = 'scripts/check-hololand-model-village-character-appearance-h4a.mjs';
const TEST_REL = 'scripts/__tests__/hololand-model-village-character-appearance-h4a.test.mjs';
const REPORT_REL =
  'docs/reports/model-village-character-appearance-h4a-facial-volume-garment-framing-2026-07-30.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-appearance-h4a-facial-volume-garment-framing-2026-07-30.png';
const EVIDENCE_REL =
  'docs/assets/model-village/model-village-character-appearance-h4a-facial-volume-garment-framing-2026-07-30.json';
const OUTPUT_REL = '.tmp/hololand/model-village/character-appearance-h4a';
const EXPECTED_COMMIT = '0e5b0a3b7745f4113ee8b9dd62f70be9fc63d8d2';
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];
const EXTRA_HASH_BINDINGS = [
  [
    'packages/engine/src/character-render/AgentAvatarGarment.ts',
    'c771348d58ff637883c2733836c4aa85f1be5e38532292119ff6b8d39468d21c',
  ],
  [
    'packages/engine/src/character-render/AgentAvatarHair.ts',
    '24a9a72c2e9c5eb5ba754c53ff388002635fda24c9c3204b6dbce461663e2e97',
  ],
  [
    'packages/engine/src/character-render/AgentAvatarMesh.ts',
    'db0dc9f6418a320398910d12ae4b234a861740ceebfc320065b3fa630d733731',
  ],
  [
    'packages/engine/src/character-render/CharacterHost.ts',
    '76e29a0e6714e5ffb67efd2d74415a8eaa25d3b6a752276e43e3a06d51ad544c',
  ],
  [
    'packages/engine/src/character-render/CharacterHostFromComposition.ts',
    'cab04d35e897b7952b270e5d136c4f8b2984753e6f98dd135c4efda45179f1d8',
  ],
  [
    'packages/engine/src/character-render/character-render.ts',
    '1d3ad891a5a788a7f463e3c03b11d0fea0de7a8c7d3c42bd6ab4ad36fa9b472f',
  ],
  [
    'packages/core/src/compiler/CharacterWebGPUCompiler.ts',
    'de338e477a470a836f87d67b2df00609e46c07f739c16033a2d729ac85b52d8a',
  ],
];
const DURABLE_FILES = [
  'package.json',
  SOURCE_REL,
  POLICY_REL,
  SEED_REL,
  CHECKER_REL,
  TEST_REL,
  REPORT_REL,
  HERO_REL,
  EVIDENCE_REL,
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256(readFileSync(filePath));
}

function portableSha256(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (['.holo', '.hsplus', '.hs', '.mjs', '.md', '.json'].includes(extension)) {
    return sha256(readFileSync(filePath, 'utf8').replaceAll('\r\n', '\n'));
  }
  return sha256File(filePath);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonical(value));
}

export function deriveH4AHarnessSource(h3zHarnessSource) {
  let source = h3zHarnessSource
    .replaceAll('\r\n', '\n')
    .replaceAll('H3Z', 'H4A')
    .replaceAll('h3z', 'h4a');
  const replacements = [
    [
      'C:/holorepo-worktrees/holoscript-h4a-material-depth-room-response',
      'C:/holorepo-worktrees/holoscript-h4a-facial-volume-garment-framing',
    ],
    [
      'model-village-character-appearance-h4a-material-depth-room-response',
      'model-village-character-appearance-h4a-facial-volume-garment-framing',
    ],
    [
      'model-village-character-appearance-h4a-facial-volume-garment-framing-2026-07-29',
      'model-village-character-appearance-h4a-facial-volume-garment-framing-2026-07-30',
    ],
    [
      'MV_CHARACTER_APPEARANCE_H4A_MATERIAL_DEPTH_ROOM_RESPONSE',
      'MV_CHARACTER_APPEARANCE_H4A_FACIAL_VOLUME_GARMENT_FRAMING',
    ],
    ['3987bb2ba5e70a62c6c9b1aa65d4d55ad3fef989', EXPECTED_COMMIT],
    ['portrait_soft_tissue_v4', 'portrait_facial_volume_v5'],
    ['portrait-soft-tissue-v4', 'portrait-facial-volume-v5'],
    ['stormglass_structured_fieldcoat', 'stormglass_portrait_fieldcoat'],
    ['structured-fieldcoat-shell-v2', 'portrait-full-fieldcoat-v3'],
    ['scalp_flow_breakup_v3', 'scalp_flow_portrait_v4'],
    ['scalp-flow-breakup-v3', 'scalp-flow-portrait-v4'],
    ['layered_ocular_tearfilm_v2', 'layered_ocular_calibrated_v3'],
    ['layered-ocular-tearfilm-v2', 'layered-ocular-calibrated-v3'],
    ['holoscript.agent-avatar-facial-landmarks.v4', 'holoscript.agent-avatar-facial-landmarks.v5'],
    ['holoscript.agent-avatar-garment-geometry.v3', 'holoscript.agent-avatar-garment-geometry.v4'],
    ['holoscript.agent-avatar-groom-geometry.v3', 'holoscript.agent-avatar-groom-geometry.v4'],
    ['holoscript.agent-avatar-ocular-geometry.v2', 'holoscript.agent-avatar-ocular-geometry.v3'],
    ['closureCount === 5', 'closureCount === 7'],
    ['Shell / 5 closures', 'Face volume / 7-closure full fieldcoat'],
    ['shell depth + wetline', 'face volume + full coat'],
    ['H4A Material Depth Room Response', 'H4A Facial Volume Garment Framing'],
    ['H4A material-depth witness', 'H4A dual-frame portrait witness'],
    ['material depth and room response', 'facial volume and garment framing'],
    [
      'Native Chrome WebGPU H4A material-depth witness complete',
      'Native Chrome WebGPU H4A facial-volume and fieldcoat witness complete',
    ],
  ];
  const requiredAnchors = new Set([
    'C:/holorepo-worktrees/holoscript-h4a-material-depth-room-response',
    'model-village-character-appearance-h4a-material-depth-room-response',
    'MV_CHARACTER_APPEARANCE_H4A_MATERIAL_DEPTH_ROOM_RESPONSE',
    '3987bb2ba5e70a62c6c9b1aa65d4d55ad3fef989',
  ]);
  for (const [before, after] of replacements) {
    if (requiredAnchors.has(before)) {
      assert(source.includes(before), `H3Z harness anchor drifted: ${before}`);
    }
    source = source.replaceAll(before, after);
  }

  const frameAnchor = `    const frame = hostRuntime.deriveCharacterDetailFrame(spec.mesh, frameRanges, {
      padding: 1.62,
      minHalfExtent: 0.18,
    });`;
  assert(source.includes(frameAnchor), 'H3Z portrait-frame anchor drifted');
  source = source.replace(
    frameAnchor,
    `${frameAnchor}
    const garmentFrame = hostRuntime.deriveCharacterDetailFrame(
      spec.mesh,
      [{ vertexStart: 0, vertexCount: built.garment.clothVertexCount }],
      { padding: 1.08, minHalfExtent: 0.55, depthHalfExtent: 2.5 }
    );`
  );

  const payloadFrameAnchor = '      viewProj: typedArray(frame.matrix),';
  assert(source.includes(payloadFrameAnchor), 'H3Z payload-frame anchor drifted');
  source = source.replace(
    payloadFrameAnchor,
    `${payloadFrameAnchor}
      garmentViewProj: typedArray(garmentFrame.matrix),`
  );

  const recordFrameAnchor = '      skinMaterial: canonical(built.host.getSkinMaterialReceipt()),';
  assert(source.includes(recordFrameAnchor), 'H3Z compiler-frame receipt anchor drifted');
  source = source.replace(
    recordFrameAnchor,
    `${recordFrameAnchor}
      portraitFrame: canonical(frame),
      garmentFrame: canonical(garmentFrame),`
  );

  const gridAnchor = `      const grid = await runtime.renderCharacter(device, hydrated, {
        size: payload.renderSize,
        viewProj: new Float32Array(resident.viewProj),
        cameraPos: payload.camera,
        clear: payload.clear,
        heightScale: resident.heightScale,
        environmentLight: resident.environmentLight,
      });`;
  assert(source.includes(gridAnchor), 'H3Z primary-grid anchor drifted');
  source = source.replace(
    gridAnchor,
    `${gridAnchor}
      const garmentGrid = await runtime.renderCharacter(device, hydrated, {
        size: payload.renderSize,
        viewProj: new Float32Array(resident.garmentViewProj),
        cameraPos: payload.camera,
        clear: payload.clear,
        heightScale: resident.heightScale,
        environmentLight: resident.environmentLight,
      });`
  );

  const metricsAnchor = '      const metrics = imageMetrics(grid);';
  assert(source.includes(metricsAnchor), 'H3Z metrics anchor drifted');
  source = source.replace(
    metricsAnchor,
    `${metricsAnchor}
      const garmentMetrics = imageMetrics(garmentGrid);`
  );

  const coverageAnchor = `      if (metrics.nonBackgroundPixelCount < 5000) {
        throw new Error(resident.displayLabel + ' portrait coverage is too small');
      }`;
  assert(source.includes(coverageAnchor), 'H3Z coverage gate anchor drifted');
  source = source.replace(
    coverageAnchor,
    `${coverageAnchor}
      if (garmentMetrics.nonBackgroundPixelCount < 3000) {
        throw new Error(resident.displayLabel + ' fieldcoat frame coverage is too small');
      }`
  );

  const drawAnchor = `      drawGrid(
        document.querySelector('[data-resident="' + resident.displayLabel + '"]'),
        grid
      );`;
  assert(source.includes(drawAnchor), 'H3Z canvas draw anchor drifted');
  source = source.replace(
    drawAnchor,
    `${drawAnchor}
      drawGrid(
        document.querySelector('[data-garment-resident="' + resident.displayLabel + '"]'),
        garmentGrid
      );`
  );

  const stateAnchor = '        renderSize: grid.width,';
  assert(source.includes(stateAnchor), 'H3Z browser-state anchor drifted');
  source = source.replace(
    stateAnchor,
    `${stateAnchor}
        garmentPixelSha256: await gridSha256(garmentGrid),
        garmentMetrics,`
  );

  const cardAnchor =
    '        <canvas data-resident="${name}" width="${RENDER_SIZE}" height="${RENDER_SIZE}"></canvas>';
  assert(source.includes(cardAnchor), 'H3Z resident-card anchor drifted');
  source = source.replace(
    cardAnchor,
    `${cardAnchor}
        <canvas class="garment-inset" data-garment-resident="\${name}" width="\${RENDER_SIZE}" height="\${RENDER_SIZE}"></canvas>`
  );

  const canvasCssAnchor = `  .resident canvas { width:295px; height:295px; margin-left:18px;
    background:radial-gradient(circle at 50% 30%,#18333a,#030912 72%); }`;
  assert(source.includes(canvasCssAnchor), 'H3Z portrait-canvas CSS anchor drifted');
  source = source.replace(
    canvasCssAnchor,
    `${canvasCssAnchor}
  .resident canvas.garment-inset { position:absolute; left:191px; bottom:10px;
    width:124px; height:124px; margin:0; z-index:3; border:1px solid var(--accent);
    border-radius:12px; box-shadow:0 10px 28px rgba(0,0,0,.58); }`
  );
  return source;
}

export function validateH4ACompilerRecords(records) {
  const errors = [];
  for (const record of records || []) {
    const label = record.displayLabel || 'unknown resident';
    if (
      record.face?.facialDetailProfile !== 'portrait-facial-volume-v5' ||
      record.face?.ocularProfile !== 'layered-ocular-calibrated-v3'
    ) {
      errors.push(`${label}: H4A face profiles drifted`);
    }
    if (
      record.facialLandmarks?.schemaVersion !==
        'holoscript.agent-avatar-facial-landmarks.v5' ||
      record.facialLandmarks?.profile !== 'portrait-facial-volume-v5' ||
      record.facialLandmarks?.facialVolumeProfile !==
        'nasal-malar-mandibular-volume-v1' ||
      record.facialLandmarks?.noseBridgeVertexCount <= 200 ||
      record.facialLandmarks?.philtrumVertexCount <= 80 ||
      record.facialLandmarks?.browArcSegments !== 22
    ) {
      errors.push(`${label}: facial-volume receipt drifted`);
    }
    if (
      record.garment?.schemaVersion !== 'holoscript.agent-avatar-garment-geometry.v4' ||
      record.garment?.style !== 'stormglass_portrait_fieldcoat' ||
      record.garment?.constructionProfile !== 'portrait-full-fieldcoat-v3' ||
      record.garment?.closureCount !== 7 ||
      record.garment?.cuffBandCount !== 2 ||
      record.garment?.coatLength <= 1.3 ||
      record.garment?.frontHemSplitDepth <= 0.6 ||
      record.garment?.portraitFramingProfile !== 'full-coat-closures-cuffs-v1'
    ) {
      errors.push(`${label}: full fieldcoat receipt drifted`);
    }
    if (
      record.groom?.schemaVersion !== 'holoscript.agent-avatar-groom-geometry.v4' ||
      record.groom?.profile !== 'scalp-flow-portrait-v4' ||
      record.groom?.facialFramingProfile !== 'portrait-brow-lash-ribbons-v1' ||
      record.groom?.browCardCount !== 2 ||
      record.groom?.lashCardCount !== 4 ||
      record.groom?.facialFramingVertexCount <= 200 ||
      record.groom?.scalpPenetrationVertexCount !== 0
    ) {
      errors.push(`${label}: brow/lash framing receipt drifted`);
    }
    if (
      record.ocular?.schemaVersion !== 'holoscript.agent-avatar-ocular-geometry.v3' ||
      record.ocular?.profile !== 'layered-ocular-calibrated-v3' ||
      record.ocular?.calibrationProfile !== 'portrait-ocular-balance-v1' ||
      record.ocular?.tearMeniscusProfile !== 'lower-cornea-meniscus-v1' ||
      record.ocular?.irisScale !== record.face?.irisScale ||
      record.ocular?.pupilScale !== record.face?.pupilScale
    ) {
      errors.push(`${label}: calibrated ocular receipt drifted`);
    }
    if (
      record.portraitFrame?.selectedVertexCount <= 0 ||
      record.garmentFrame?.selectedVertexCount !== record.garment?.clothVertexCount
    ) {
      errors.push(`${label}: dual source-derived frame receipt drifted`);
    }
  }
  if ((records || []).length !== 4) errors.push('exactly four compiler records are required');
  return { status: errors.length ? 'fail' : 'pass', errors };
}

function validateExtraPins(holoScriptRoot) {
  const errors = [];
  for (const [relativePath, expected] of EXTRA_HASH_BINDINGS) {
    const absolute = path.join(holoScriptRoot, relativePath);
    if (!existsSync(absolute)) errors.push(`${relativePath} is missing`);
    else if (sha256File(absolute) !== expected) errors.push(`${relativePath} hash drifted`);
  }
  return errors;
}

function parseManifestEntries(source) {
  return [...source.matchAll(/path:\s*"([^"]+)"\s+sha256:\s*"([a-f0-9]{64})"/g)].map(
    ([, filePath, digest]) => ({ path: filePath, sha256: digest })
  );
}

export function validateH4AManifest(root = ROOT) {
  const manifestPath = path.join(root, MANIFEST_REL);
  if (!existsSync(manifestPath)) return { status: 'fail', errors: ['manifest is missing'] };
  const entries = parseManifestEntries(readFileSync(manifestPath, 'utf8'));
  const errors = [];
  for (const relativePath of DURABLE_FILES) {
    const entry = entries.find((candidate) => candidate.path === relativePath);
    const absolute = path.join(root, relativePath);
    if (!entry) errors.push(`${relativePath} missing from manifest`);
    else if (!existsSync(absolute)) errors.push(`${relativePath} is missing`);
    else if (portableSha256(absolute) !== entry.sha256) errors.push(`${relativePath} hash drifted`);
  }
  return { status: errors.length ? 'fail' : 'pass', errors };
}

async function materializeHarness(root, outputDir) {
  const h3ySource = deriveH3YHarnessSource(
    readFileSync(path.join(root, BASE_CHECKER_REL), 'utf8')
  );
  const h3zSource = deriveH3ZHarnessSource(h3ySource);
  const source = deriveH4AHarnessSource(h3zSource);
  mkdirSync(outputDir, { recursive: true });
  const generatedPath = path.join(outputDir, 'h4a-derived-webgpu-harness.mjs');
  writeFileSync(generatedPath, source);
  return import(`${pathToFileURL(generatedPath).href}?sha=${sha256(source)}`);
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    root: ROOT,
    holoScriptRoot: DEFAULT_HOLOSCRIPT_ROOT,
    outputDir: path.join(ROOT, OUTPUT_REL),
    browser: null,
    writeArtifacts: false,
    skipManifest: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    else if (arg === '--root') options.root = path.resolve(argv[++index]);
    else if (arg === '--holoscript-root') options.holoScriptRoot = path.resolve(argv[++index]);
    else if (arg === '--output-dir') options.outputDir = path.resolve(argv[++index]);
    else if (arg === '--browser') options.browser = argv[++index];
    else if (arg === '--write-artifacts') options.writeArtifacts = true;
    else if (arg === '--skip-manifest') options.skipManifest = true;
    else if (arg === '--json') options.json = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

export async function runCharacterAppearanceH4A(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const holoScriptRoot = path.resolve(options.holoScriptRoot || DEFAULT_HOLOSCRIPT_ROOT);
  const outputDir = path.resolve(options.outputDir || path.join(root, OUTPUT_REL));
  const pinErrors = validateExtraPins(holoScriptRoot);
  assert(pinErrors.length === 0, pinErrors.join('\n'));
  const harness = await materializeHarness(root, outputDir);
  const result = await harness.runCharacterAppearanceH4A({
    ...options,
    root,
    holoScriptRoot,
    outputDir,
    skipManifest: true,
  });
  const recordValidation = validateH4ACompilerRecords(result.receipt.compilerAdmission.records);
  assert(recordValidation.status === 'pass', recordValidation.errors.join('\n'));
  for (const resident of result.receipt.browserWebgpuAdmission.residents) {
    assert(
      resident.environmentDifference?.changedPixelCount > 25,
      `${resident.displayLabel}: room-basis counterfactual is not visible`
    );
    assert(
      resident.garmentMetrics?.nonBackgroundPixelCount > 3000,
      `${resident.displayLabel}: whole-character fieldcoat frame is not visible`
    );
    resident.roomCounterfactualPixelDifference =
      resident.environmentDifference.changedPixelCount;
  }
  result.receipt.schema =
    'hololand.model-village.character-appearance-h4a-facial-volume-garment-framing-witness.v1';
  result.receipt.milestone =
    'MV_CHARACTER_APPEARANCE_H4A_FACIAL_VOLUME_GARMENT_FRAMING';
  result.receipt.boundaries = {
    ...result.receipt.boundaries,
    facialVolumeReceipted: true,
    browLashFramingReceipted: true,
    calibratedOcularGeometryReceipted: true,
    fullFieldcoatReceipted: true,
    sourceDerivedPortraitFrameReceipted: true,
    sourceDerivedGarmentFrameReceipted: true,
    dualFrameBrowserRenderMeasured: true,
    photographicHdriClaimed: false,
    taaConvergenceMeasured: false,
    gpuTimestampMeasured: false,
    freshRtxBenchmarkClaimed: false,
    questHeadsetMeasured: false,
    browserWebxrMeasured: false,
    photorealismClaimed: false,
    fullWorldPerformanceClaimed: false,
  };
  delete result.receipt.integrity;
  result.receipt.integrity = { canonicalSha256: sha256(canonicalJson(result.receipt)) };
  if (options.writeArtifacts) {
    writeFileSync(path.join(root, EVIDENCE_REL), `${JSON.stringify(result.receipt, null, 2)}\n`);
  }
  if (!options.skipManifest) {
    const manifest = validateH4AManifest(root);
    assert(manifest.status === 'pass', manifest.errors.join('\n'));
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCharacterAppearanceH4A(parseArgs())
    .then(({ receipt }) => {
      if (process.argv.includes('--json')) console.log(JSON.stringify(receipt, null, 2));
      else {
        console.log(
          `PASS H4A facial volume and garment framing: ${receipt.compilerAdmission.residentCount} residents; ` +
            `${receipt.browserWebgpuAdmission.residents.length} Chrome WebGPU dual-frame witnesses; ` +
            `TAA=${receipt.boundaries.taaConvergenceMeasured}; ` +
            `RTX benchmark=${receipt.boundaries.freshRtxBenchmarkClaimed}`
        );
      }
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}
