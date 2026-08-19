#!/usr/bin/env node

// H3Z extends the admitted H3Y browser/WebGPU witness instead of duplicating
// its CDP, PNG, parser, compiler, and readback machinery. The generated
// harness receives exact native-profile substitutions; this wrapper adds
// H3Z-only receipt, source-pin, and immutable-manifest admission.

import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { deriveH3YHarnessSource } from './check-hololand-model-village-character-appearance-h3y.mjs';
import { resolveHoloScriptRoot } from './lib/model-village-holoscript-root.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOLOSCRIPT_ROOT = resolveHoloScriptRoot({
  gate: 'H3Z',
  // Kept, not deleted: sibling gates derive their runner source by string-substituting
  // this file and assert on this exact literal, so removing it breaks their anchors.
  // The path does not exist, so the resolver tries it and falls through to a real tree.
  candidates: ['C:/holorepo-worktrees/holoscript-h3z-material-depth-room-response'],
});
const BASE_CHECKER_REL = 'scripts/check-hololand-model-village-character-appearance-h3x.mjs';
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3z-material-depth-room-response.holo';
const POLICY_REL =
  'source/proofs/model-village-character-appearance-h3z-material-depth-room-response-policy.hsplus';
const SEED_REL =
  'source/proofs/model-village-character-appearance-h3z-material-depth-room-response-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3z-material-depth-room-response-manifest.holo';
const CHECKER_REL = 'scripts/check-hololand-model-village-character-appearance-h3z.mjs';
const TEST_REL = 'scripts/__tests__/hololand-model-village-character-appearance-h3z.test.mjs';
const REPORT_REL =
  'docs/reports/model-village-character-appearance-h3z-material-depth-room-response-2026-07-29.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-appearance-h3z-material-depth-room-response-2026-07-29.png';
const EVIDENCE_REL =
  'docs/assets/model-village/model-village-character-appearance-h3z-material-depth-room-response-2026-07-29.json';
const OUTPUT_REL = '.tmp/hololand/model-village/character-appearance-h3z';
const EXPECTED_COMMIT = '3987bb2ba5e70a62c6c9b1aa65d4d55ad3fef989';
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];
const EXPECTED_SHELL_THICKNESS_BY_LABEL = new Map([
  ['OpenAI', 0.008902],
  ['Claude', 0.008928],
  ['Gemini', 0.00851],
  ['Grok', 0.009282],
]);
const EXTRA_HASH_BINDINGS = [
  [
    'packages/engine/src/character-render/AgentAvatarGarment.ts',
    '01d57d21acb59d7d6b78b5f3f0ebcd17528bb14056b9e770dc37d843caa7abe5',
  ],
  [
    'packages/engine/src/character-render/AgentAvatarHair.ts',
    'c61bbcdee87be668d5804ec38062dc7a3933bf0657b849753372476813240af7',
  ],
  [
    'packages/engine/src/character-render/CharacterHost.ts',
    '4f117f2794504e2fca4615f152874b0b95f2bc01811186477d8b130aeeb70ca9',
  ],
  [
    'packages/engine/src/rendering/webgpu/shaders/skin-skinning.wgsl',
    '20826651e615fc6042ab370db745a88dac4bb86fbfbdb72830f7885d5562010d',
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

export function deriveH3ZHarnessSource(h3yHarnessSource) {
  let source = h3yHarnessSource
    .replaceAll('\r\n', '\n')
    .replaceAll('H3Y', 'H3Z')
    .replaceAll('h3y', 'h3z');
  const replacements = [
    [
      'C:/holorepo-worktrees/holoscript-h3z-constructed-soft-tissue-probe',
      'C:/holorepo-worktrees/holoscript-h3z-material-depth-room-response',
    ],
    [
      'model-village-character-appearance-h3z-constructed-soft-tissue-probe',
      'model-village-character-appearance-h3z-material-depth-room-response',
    ],
    [
      'h3z-constructed-soft-tissue-probe.png',
      'h3z-material-depth-room-response.png',
    ],
    [
      'MV_CHARACTER_APPEARANCE_H3Z_CONSTRUCTED_SOFT_TISSUE_PROBE',
      'MV_CHARACTER_APPEARANCE_H3Z_MATERIAL_DEPTH_ROOM_RESPONSE',
    ],
    ['293bd5f8e1b6bd4a4e4e8d9c970bbee545b0c898', EXPECTED_COMMIT],
    ['stormglass_tailored_fieldcoat', 'stormglass_structured_fieldcoat'],
    ['four-panel-fieldcoat-v1', 'structured-fieldcoat-shell-v2'],
    ['scalp_flow_containment_v2', 'scalp_flow_breakup_v3'],
    ['scalp-flow-containment-v2', 'scalp-flow-breakup-v3'],
    ['anatomical_lid_fold_v2', 'anatomical_lid_blend_v3'],
    ['anatomical-lid-fold-v2', 'anatomical-lid-blend-v3'],
    ['layered_ocular_v1', 'layered_ocular_tearfilm_v2'],
    ['layered-ocular-v1', 'layered-ocular-tearfilm-v2'],
    ['directional_reflection_probe_v1', 'stormglass_room_basis_v2'],
    ['directional-reflection-probe-v1', 'stormglass-room-basis-v2'],
    ['three_lobe_diffuse_specular_probe_v1', 'source_authored_room_basis_v2'],
    ['three-lobe-diffuse-specular-probe-v1', 'source-authored-room-basis-v2'],
    ['holoscript.character-environment-light.v2', 'holoscript.character-environment-light.v3'],
    ['H3Z Constructed Soft Tissue Probe', 'H3Z Material Depth Room Response'],
    ['H3Z constructed soft tissue probe', 'H3Z material depth room response'],
    ['constructed-profile GPU witness', 'material-depth GPU witness'],
    ['constructed portrait realism', 'material depth and room response'],
    [
      'Native Chrome WebGPU H3Z constructed portrait witness complete',
      'Native Chrome WebGPU H3Z material-depth witness complete',
    ],
    [
      'Four-panel fieldcoat / connected facial tissue',
      'Shell / 5 closures / blended lids / wetline / 12 flyaways',
    ],
    [
      'Separately indexed fieldcoat\n      panels, connected lip and lid topology, contained groom cards, and a bounded\n      directional probe now meet in one deterministic portrait witness.',
      'Raised fieldcoat facings, groom breakup, blended lid topology, a lower-eye\n      wetline, and a source-authored room basis meet in one deterministic witness.',
    ],
    ['4 panels / connected lips + lids / contained groom / no RTX timing claim',
      'shell depth + wetline / contained breakup / authored room / no RTX timing claim'],
  ];
  const requiredAnchors = new Set([
    'C:/holorepo-worktrees/holoscript-h3z-constructed-soft-tissue-probe',
    'model-village-character-appearance-h3z-constructed-soft-tissue-probe',
    'MV_CHARACTER_APPEARANCE_H3Z_CONSTRUCTED_SOFT_TISSUE_PROBE',
    '293bd5f8e1b6bd4a4e4e8d9c970bbee545b0c898',
  ]);
  for (const [before, after] of replacements) {
    if (requiredAnchors.has(before)) {
      assert(source.includes(before), `H3Y harness anchor drifted: ${before}`);
    }
    source = source.replaceAll(before, after);
  }
  const recordAnchor = 'groom: canonical(built.groom),';
  assert(source.includes(recordAnchor), 'H3Y compiler-record anchor drifted');
  source = source.replace(
    recordAnchor,
    [recordAnchor, '      ocular: canonical(built.ocular),'].join('\n')
  );
  return source;
}

export function validateH3ZCompilerRecords(records) {
  const errors = [];
  for (const record of records || []) {
    const label = record.displayLabel || 'unknown resident';
    if (
      record.face?.orbitalProfile !== 'anatomical-lid-blend-v3' ||
      record.face?.ocularProfile !== 'layered-ocular-tearfilm-v2' ||
      record.face?.facialDetailProfile !== 'portrait-soft-tissue-v4'
    ) {
      errors.push(`${label}: H3Z face/ocular profiles drifted`);
    }
    if (
      record.garment?.schemaVersion !== 'holoscript.agent-avatar-garment-geometry.v3' ||
      record.garment?.style !== 'stormglass_structured_fieldcoat' ||
      record.garment?.constructionProfile !== 'structured-fieldcoat-shell-v2' ||
      record.garment?.constructedPanelCount !== 4 ||
      record.garment?.shellThickness !== EXPECTED_SHELL_THICKNESS_BY_LABEL.get(label) ||
      record.garment?.closureCount !== 5 ||
      record.garment?.cuffBandCount !== 2 ||
      record.garment?.fabricSurfaceProfile !== 'stormglass-crossweave-normal-v1'
    ) {
      errors.push(`${label}: structured fieldcoat receipt drifted`);
    }
    if (
      record.groom?.schemaVersion !== 'holoscript.agent-avatar-groom-geometry.v3' ||
      record.groom?.profile !== 'scalp-flow-breakup-v3' ||
      record.groom?.containmentProfile !== 'ellipsoidal-scalp-exterior-v1' ||
      record.groom?.breakupProfile !== 'contained-flyaway-breakup-v1' ||
      record.groom?.flyawayGuideCount !== 12 ||
      record.groom?.flyawayCardCount !== 12 ||
      record.groom?.scalpPenetrationVertexCount !== 0
    ) {
      errors.push(`${label}: groom breakup receipt drifted`);
    }
    if (
      record.ocular?.schemaVersion !== 'holoscript.agent-avatar-ocular-geometry.v2' ||
      record.ocular?.profile !== 'layered-ocular-tearfilm-v2' ||
      record.ocular?.tearMeniscusProfile !== 'lower-cornea-meniscus-v1' ||
      record.ocular?.tearMeniscusIndexCount !== 192
    ) {
      errors.push(`${label}: ocular tear-film receipt drifted`);
    }
    if (
      record.environmentLight?.schemaVersion !== 'holoscript.character-environment-light.v3' ||
      record.environmentLight?.profile !== 'stormglass-room-basis-v2' ||
      record.environmentLight?.responseProfile !== 'source-authored-room-basis-v2' ||
      record.environmentLight?.photographicHdri !== false
    ) {
      errors.push(`${label}: source-authored room receipt drifted`);
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

export function validateH3ZManifest(root = ROOT) {
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
  const source = deriveH3ZHarnessSource(h3ySource);
  mkdirSync(outputDir, { recursive: true });
  const generatedPath = path.join(outputDir, 'h3z-derived-webgpu-harness.mjs');
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

export async function runCharacterAppearanceH3Z(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const holoScriptRoot = path.resolve(options.holoScriptRoot || DEFAULT_HOLOSCRIPT_ROOT);
  const outputDir = path.resolve(options.outputDir || path.join(root, OUTPUT_REL));
  const pinErrors = validateExtraPins(holoScriptRoot);
  assert(pinErrors.length === 0, pinErrors.join('\n'));
  const harness = await materializeHarness(root, outputDir);
  const result = await harness.runCharacterAppearanceH3Z({
    ...options,
    root,
    holoScriptRoot,
    outputDir,
    skipManifest: true,
  });
  const recordValidation = validateH3ZCompilerRecords(result.receipt.compilerAdmission.records);
  assert(recordValidation.status === 'pass', recordValidation.errors.join('\n'));
  for (const resident of result.receipt.browserWebgpuAdmission.residents) {
    assert(
      resident.environmentDifference?.changedPixelCount > 25,
      `${resident.displayLabel}: room-basis counterfactual is not visible`
    );
    resident.roomCounterfactualPixelDifference =
      resident.environmentDifference.changedPixelCount;
  }
  result.receipt.schema =
    'hololand.model-village.character-appearance-h3z-material-depth-room-response-witness.v1';
  result.receipt.milestone =
    'MV_CHARACTER_APPEARANCE_H3Z_MATERIAL_DEPTH_ROOM_RESPONSE';
  result.receipt.boundaries = {
    ...result.receipt.boundaries,
    structuredFieldcoatReceipted: true,
    clothCrossweaveNormalTileReceipted: true,
    groomBreakupReceipted: true,
    orbitalBlendProfileReceipted: true,
    ocularTearMeniscusReceipted: true,
    sourceAuthoredRoomBasisReceipted: true,
    roomCounterfactualMeasured: true,
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
    const manifest = validateH3ZManifest(root);
    assert(manifest.status === 'pass', manifest.errors.join('\n'));
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCharacterAppearanceH3Z(parseArgs())
    .then(({ receipt }) => {
      if (process.argv.includes('--json')) console.log(JSON.stringify(receipt, null, 2));
      else {
        console.log(
          `PASS H3Z material depth and room response: ${receipt.compilerAdmission.residentCount} residents; ` +
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
