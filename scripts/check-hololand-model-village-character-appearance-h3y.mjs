#!/usr/bin/env node

// H3Y extends the already admitted H3X browser/WebGPU witness instead of
// duplicating its CDP, PNG, parser, compiler, and readback machinery. The base
// harness is materialized into .tmp with exact profile substitutions, then this
// wrapper adds H3Y-only receipt and immutable-manifest admission.

import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveHoloScriptRoot } from './lib/model-village-holoscript-root.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOLOSCRIPT_ROOT = resolveHoloScriptRoot({
  gate: 'H3Y',
  // Kept, not deleted: sibling gates derive their runner source by string-substituting
  // this file and assert on this exact literal, so removing it breaks their anchors.
  // The path does not exist, so the resolver tries it and falls through to a real tree.
  candidates: ['C:/holorepo-worktrees/holoscript-h3y-constructed-soft-tissue-probe'],
});
const BASE_CHECKER_REL = 'scripts/check-hololand-model-village-character-appearance-h3x.mjs';
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3y-constructed-soft-tissue-probe.holo';
const POLICY_REL =
  'source/proofs/model-village-character-appearance-h3y-constructed-soft-tissue-probe-policy.hsplus';
const SEED_REL =
  'source/proofs/model-village-character-appearance-h3y-constructed-soft-tissue-probe-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3y-constructed-soft-tissue-probe-manifest.holo';
const CHECKER_REL = 'scripts/check-hololand-model-village-character-appearance-h3y.mjs';
const TEST_REL =
  'scripts/__tests__/hololand-model-village-character-appearance-h3y.test.mjs';
const REPORT_REL =
  'docs/reports/model-village-character-appearance-h3y-constructed-soft-tissue-probe-2026-07-29.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-appearance-h3y-constructed-soft-tissue-probe-2026-07-29.png';
const EVIDENCE_REL =
  'docs/assets/model-village/model-village-character-appearance-h3y-constructed-soft-tissue-probe-2026-07-29.json';
const OUTPUT_REL = '.tmp/hololand/model-village/character-appearance-h3y';
const EXPECTED_COMMIT = '293bd5f8e1b6bd4a4e4e8d9c970bbee545b0c898';
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];
const EXTRA_HASH_BINDINGS = [
  [
    'packages/engine/src/character-render/AgentAvatarGarment.ts',
    '249fa99bcd2b999123081ba4982d223ab57c9beab7a85c2b80de066814eb98bb',
  ],
  [
    'packages/engine/src/character-render/AgentAvatarHair.ts',
    'e472ac9555208b50e534d9ba72f33255ac8bc0ab415fd7c128a9d94964e28c3b',
  ],
  [
    'packages/engine/src/rendering/webgpu/shaders/skin-skinning.wgsl',
    'b6e3d1eb320365eff8b48238cea0d3e7cf2335f30439fcc6922272a7be5d76d5',
  ],
];
const DURABLE_FILES = [
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

export function deriveH3YHarnessSource(baseSource) {
  let source = baseSource
    .replaceAll('\r\n', '\n')
    .replaceAll('H3X', 'H3Y')
    .replaceAll('h3x', 'h3y');
  const replacements = [
    [
      'C:/holorepo-worktrees/holoscript-h3y-cranial-expression-normals-proof',
      'C:/holorepo-worktrees/holoscript-h3y-constructed-soft-tissue-probe',
    ],
    [
      'model-village-character-appearance-h3y-cranial-expression-normals',
      'model-village-character-appearance-h3y-constructed-soft-tissue-probe',
    ],
    [
      'h3y-cranial-expression-normals.png',
      'h3y-constructed-soft-tissue-probe.png',
    ],
    [
      'MV_CHARACTER_APPEARANCE_H3Y_CRANIAL_EXPRESSION_NORMALS',
      'MV_CHARACTER_APPEARANCE_H3Y_CONSTRUCTED_SOFT_TISSUE_PROBE',
    ],
    ['df6ebcd00b5e36fa6bc5fcc8ed8dde36dbd655c2', EXPECTED_COMMIT],
    [
      "face?.facial_detail_profile === 'portrait_cranial_v3'",
      "face?.facial_detail_profile === 'portrait_soft_tissue_v4'",
    ],
    [
      "built.facialLandmarks?.profile === 'portrait-cranial-v3'",
      "built.facialLandmarks?.profile === 'portrait-soft-tissue-v4'",
    ],
    [
      "['environmentLightProfile', 'analytic_three_point_v1']",
      "['environmentLightProfile', 'directional_reflection_probe_v1']",
    ],
    [
      "environmentLight?.profile === 'analytic_three_point_v1'",
      "environmentLight?.profile === 'directional_reflection_probe_v1'",
    ],
    [
      "built.environmentLight?.receipt?.profile === 'analytic-three-point-v1'",
      "built.environmentLight?.receipt?.profile === 'directional-reflection-probe-v1' &&\n" +
        "        built.environmentLight?.receipt?.schemaVersion === 'holoscript.character-environment-light.v2' &&\n" +
        "        built.environmentLight?.receipt?.responseProfile === 'three-lobe-diffuse-specular-probe-v1'",
    ],
    ['analyticThreePointEnvironmentReceipted', 'directionalReflectionProbeReceipted'],
    ['padding: 1.08,', 'padding: 1.62,'],
    [
      '<p>Indexed cranium / live expression normals</p>',
      '<p>Four-panel fieldcoat / connected facial tissue</p>',
    ],
    [
      'Awaiting close-up GPU counterfactuals',
      'Awaiting constructed-profile GPU witness',
    ],
    [
      '<h1>Faces that hold up<br>when you move closer.</h1>',
      '<h1>Characters built<br>past the silhouette.</h1>',
    ],
    [
      `<p class="lede">Four source-authored residents, rendered through the HoloScript
      character compiler and browser WebGPU path. A 44x30 cranial surface meets
      the V7 neck through an indexed stitch; expression-adjacent normals update
      deterministically while 24x16 remains an authored distance tier.</p>`,
      `<p class="lede">Four source-authored residents, rendered through the HoloScript
      character compiler and browser WebGPU path. Separately indexed fieldcoat
      panels, connected lip and lid topology, contained groom cards, and a bounded
      directional probe now meet in one deterministic portrait witness.</p>`,
    ],
    [
      '44x30 vs 24x16 / recomputed vs static normals / no RTX timing claim',
      '4 panels / connected lips + lids / contained groom / no RTX timing claim',
    ],
  ];
  for (const [before, after] of replacements) {
    assert(source.includes(before), `Base H3X harness anchor drifted: ${before}`);
    source = source.replaceAll(before, after);
  }
  for (const [before, after] of [
    ['H3Y / close-up cranial fidelity', 'H3Y / constructed portrait realism'],
    ['H3Y Cranial Expression Normals', 'H3Y Constructed Soft Tissue Probe'],
    ['H3Y cranial expression normals', 'H3Y constructed soft tissue probe'],
    ['H3Y close-up witness', 'H3Y constructed portrait witness'],
  ]) {
    source = source.replaceAll(before, after);
  }
  const recordAnchor = 'facialLandmarks: canonical(built.facialLandmarks),';
  assert(source.includes(recordAnchor), 'Base compiler-record anchor drifted');
  source = source.replace(
    recordAnchor,
    [
      recordAnchor,
      '      face: canonical(built.face),',
      '      garment: canonical(built.garment),',
      '      groom: canonical(built.groom),',
    ].join('\n')
  );
  return source;
}

export function validateH3YCompilerRecords(records) {
  const errors = [];
  for (const record of records || []) {
    const label = record.displayLabel || 'unknown resident';
    if (
      record.face?.orbitalProfile !== 'anatomical-lid-fold-v2' ||
      record.face?.facialDetailProfile !== 'portrait-soft-tissue-v4'
    ) {
      errors.push(`${label}: H3Y face profiles drifted`);
    }
    if (
      record.facialLandmarks?.schemaVersion !==
        'holoscript.agent-avatar-facial-landmarks.v4' ||
      record.facialLandmarks?.lipTopology !== 'connected-cupid-bow-ribbon-v1' ||
      record.facialLandmarks?.lipSurfaceTriangleCount <= 0
    ) {
      errors.push(`${label}: connected lip receipt drifted`);
    }
    if (
      record.garment?.schemaVersion !== 'holoscript.agent-avatar-garment-geometry.v2' ||
      record.garment?.constructionProfile !== 'four-panel-fieldcoat-v1' ||
      record.garment?.constructedPanelCount !== 4 ||
      record.garment?.constructionSeamCount !== 8 ||
      record.garment?.shoulderYokeCount !== 2
    ) {
      errors.push(`${label}: constructed fieldcoat receipt drifted`);
    }
    if (
      record.groom?.schemaVersion !== 'holoscript.agent-avatar-groom-geometry.v2' ||
      record.groom?.profile !== 'scalp-flow-containment-v2' ||
      record.groom?.containmentProfile !== 'ellipsoidal-scalp-exterior-v1' ||
      record.groom?.scalpPenetrationVertexCount !== 0
    ) {
      errors.push(`${label}: groom containment receipt drifted`);
    }
    if (
      record.environmentLight?.schemaVersion !== 'holoscript.character-environment-light.v2' ||
      record.environmentLight?.profile !== 'directional-reflection-probe-v1' ||
      record.environmentLight?.responseProfile !== 'three-lobe-diffuse-specular-probe-v1'
    ) {
      errors.push(`${label}: directional reflection probe receipt drifted`);
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

export function validateH3YManifest(root = ROOT) {
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
  const source = deriveH3YHarnessSource(
    readFileSync(path.join(root, BASE_CHECKER_REL), 'utf8')
  );
  mkdirSync(outputDir, { recursive: true });
  const generatedPath = path.join(outputDir, 'h3y-derived-webgpu-harness.mjs');
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
    if (arg === '--root') options.root = path.resolve(argv[++index]);
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

export async function runCharacterAppearanceH3Y(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const holoScriptRoot = path.resolve(options.holoScriptRoot || DEFAULT_HOLOSCRIPT_ROOT);
  const outputDir = path.resolve(options.outputDir || path.join(root, OUTPUT_REL));
  const pinErrors = validateExtraPins(holoScriptRoot);
  assert(pinErrors.length === 0, pinErrors.join('\n'));
  const harness = await materializeHarness(root, outputDir);
  const result = await harness.runCharacterAppearanceH3Y({
    ...options,
    root,
    holoScriptRoot,
    outputDir,
    skipManifest: true,
  });
  const recordValidation = validateH3YCompilerRecords(result.receipt.compilerAdmission.records);
  assert(recordValidation.status === 'pass', recordValidation.errors.join('\n'));
  for (const resident of result.receipt.browserWebgpuAdmission.residents) {
    assert(
      resident.environmentDifference?.changedPixelCount > 25,
      `${resident.displayLabel}: directional probe counterfactual is not visible`
    );
    resident.h3yCounterfactualPixelDifference =
      resident.environmentDifference.changedPixelCount;
  }
  result.receipt.schema =
    'hololand.model-village.character-appearance-h3y-constructed-soft-tissue-probe-witness.v1';
  result.receipt.milestone =
    'MV_CHARACTER_APPEARANCE_H3Y_CONSTRUCTED_SOFT_TISSUE_PROBE';
  result.receipt.boundaries = {
    ...result.receipt.boundaries,
    constructedFieldcoatReceipted: true,
    connectedSoftTissueTopologyReceipted: true,
    anatomicalLidFoldReceipted: true,
    groomContainmentReceipted: true,
    directionalReflectionProbeReceipted: true,
    directionalProbeMeasured: true,
    photographicHdriClaimed: false,
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
    const manifest = validateH3YManifest(root);
    assert(manifest.status === 'pass', manifest.errors.join('\n'));
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCharacterAppearanceH3Y(parseArgs())
    .then(({ receipt }) => {
      if (process.argv.includes('--json')) console.log(JSON.stringify(receipt, null, 2));
      else {
        console.log(
          `PASS H3Y constructed soft tissue probe: ${receipt.compilerAdmission.residentCount} residents; ` +
            `${receipt.browserWebgpuAdmission.residents.length} Chrome WebGPU witnesses; ` +
            `HDRI=${receipt.boundaries.photographicHdriClaimed}; ` +
            `RTX benchmark=${receipt.boundaries.freshRtxBenchmarkClaimed}`
        );
      }
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}
