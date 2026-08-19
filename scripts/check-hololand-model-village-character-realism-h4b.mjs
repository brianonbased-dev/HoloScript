#!/usr/bin/env node

// H4B keeps the admitted H4A native parser/compiler/CDP/WebGPU path and
// transfers a small HoloScript motion overlay onto the inherited resident AST.
// The resulting source reaches CharacterHost, where blink changes real native
// procedural-head vertices. Gaze, breath, and cloth remain sampled-only.

import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  deriveH4AHarnessSource,
  validateH4ACompilerRecords,
} from './check-hololand-model-village-character-appearance-h4a.mjs';
import { deriveH3YHarnessSource } from './check-hololand-model-village-character-appearance-h3y.mjs';
import { deriveH3ZHarnessSource } from './check-hololand-model-village-character-appearance-h3z.mjs';
import { resolveHoloScriptRoot } from './lib/model-village-holoscript-root.mjs';
import { validateUpstreamCommitPin } from './lib/model-village-upstream-commit-pin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOLOSCRIPT_ROOT = resolveHoloScriptRoot({
  gate: 'H4B',
  // Kept, not deleted: sibling gates derive their runner source by string-substituting
  // this file and assert on this exact literal, so removing it breaks their anchors.
  // The path does not exist, so the resolver tries it and falls through to a real tree.
  candidates: ['C:/holorepo-worktrees/holoscript-h4b-character-micro-motion-timing-r3'],
});
const BASE_CHECKER_REL = 'scripts/check-hololand-model-village-character-appearance-h3x.mjs';
const INHERITED_SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h4a-facial-volume-garment-framing.holo';
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-realism-h4b-micro-motion-timing.holo';
const POLICY_REL =
  'source/proofs/model-village-character-realism-h4b-micro-motion-timing-policy.hsplus';
const SEED_REL =
  'source/proofs/model-village-character-realism-h4b-micro-motion-timing-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-realism-h4b-micro-motion-timing-manifest.holo';
const CHECKER_REL = 'scripts/check-hololand-model-village-character-realism-h4b.mjs';
const TEST_REL = 'scripts/__tests__/hololand-model-village-character-realism-h4b.test.mjs';
const REPORT_REL =
  'docs/reports/model-village-character-realism-h4b-micro-motion-timing-2026-07-30.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-realism-h4b-micro-motion-timing-2026-07-30.png';
const EVIDENCE_REL =
  'docs/assets/model-village/model-village-character-realism-h4b-micro-motion-timing-2026-07-30.json';
const OUTPUT_REL = '.tmp/hololand/model-village/character-realism-h4b';
const EXPECTED_COMMIT = '1f295ee62e255883dc95394f5249700023bb39df';
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];
const HASH_BINDINGS = [
  [
    'packages/engine/src/character-render/AgentAvatarMicroMotion.ts',
    '5d61761599659fa4ee159bb41ffe671f096b5b55a78e4b1671f9af9e29748696',
  ],
  [
    'packages/engine/src/character-render/CharacterHost.ts',
    'eb0f40bacb1745ce2e3464b08f0470f7d6227274d6502841f95499e9978bafdf',
  ],
  [
    'packages/engine/src/character-render/CharacterHostFromComposition.ts',
    'c7af37118977dccd585f6c4c616a3d8144e0b8a07c9ceb8c5e32c350d8bedfe9',
  ],
  [
    'packages/core/src/compiler/CharacterWebGPUCompiler.ts',
    '58c13464c5dd79ecddb889fd982376c567738f243a3b02c369f05b402b8e41ea',
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

// The HEAD-equality assertion this replaced demanded one exact commit; eighteen gates
// demanded eighteen different ones, so the set could never be satisfied at once. See
// scripts/lib/model-village-upstream-commit-pin.mjs for the full reasoning.
function upstreamPinFailures(holoScriptRoot) {
  return validateUpstreamCommitPin(
    holoScriptRoot,
    EXPECTED_COMMIT,
    HASH_BINDINGS.map(([relative, sha256]) => ({ pathKey: relative, relative, sha256 })),
  ).errors;
}

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

function gitHead(root) {
  const gitPath = path.join(root, '.git');
  const require = createRequire(import.meta.url);
  const { execFileSync } = require('node:child_process');
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

export function mergeH4BMotionSource(inheritedSource, overlaySource) {
  let merged = inheritedSource.replaceAll('\r\n', '\n');
  const pinReplacements = [
    [
      '0e5b0a3b7745f4113ee8b9dd62f70be9fc63d8d2',
      '1f295ee62e255883dc95394f5249700023bb39df',
    ],
    [
      '76e29a0e6714e5ffb67efd2d74415a8eaa25d3b6a752276e43e3a06d51ad544c',
      'eb0f40bacb1745ce2e3464b08f0470f7d6227274d6502841f95499e9978bafdf',
    ],
    [
      'cab04d35e897b7952b270e5d136c4f8b2984753e6f98dd135c4efda45179f1d8',
      'c7af37118977dccd585f6c4c616a3d8144e0b8a07c9ceb8c5e32c350d8bedfe9',
    ],
  ];
  for (const [before, after] of pinReplacements) {
    assert(merged.includes(before), `inherited H4A pin is missing: ${before}`);
    merged = merged.replaceAll(before, after);
  }
  const overlays = [
    ...overlaySource
      .replaceAll('\r\n', '\n')
      .matchAll(
        /object\s+"([^"]+Motion)"\s*\{\s*(@micro_motion\([^\n]+\))[\s\S]*?targetObjectId:\s*"([^"]+)"/g
      ),
  ].map(([, overlayObjectId, traitSource, targetObjectId]) => ({
    overlayObjectId,
    traitSource,
    targetObjectId,
  }));
  assert(overlays.length === 4, 'exactly four H4B motion overlays are required');
  for (const overlay of overlays) {
    const escaped = overlay.targetObjectId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const objectAnchor = new RegExp(
      `(object\\s+"${escaped}"\\s+using\\s+"[^"]+"\\s*\\{\\n)`
    );
    assert(objectAnchor.test(merged), `${overlay.targetObjectId} is missing from inherited H4A`);
    merged = merged.replace(objectAnchor, `$1    ${overlay.traitSource}\n`);
  }
  return merged;
}

export function deriveH4BHarnessSource(h4aHarnessSource) {
  let source = h4aHarnessSource
    .replaceAll(
      'C:/holorepo-worktrees/holoscript-h4a-facial-volume-garment-framing',
      'C:/holorepo-worktrees/holoscript-h4b-character-micro-motion-timing-r3'
    )
    .replaceAll('0e5b0a3b7745f4113ee8b9dd62f70be9fc63d8d2', EXPECTED_COMMIT);

  const sourceConstant =
    "const SOURCE_REL =\n  'source/layers/vr/frontier/model-village/model-village-character-appearance-h4a-facial-volume-garment-framing.holo';";
  assert(source.includes(sourceConstant), 'H4A source constant drifted');
  source = source.replace(
    sourceConstant,
    `const INHERITED_H4A_SOURCE_REL =
  '${INHERITED_SOURCE_REL}';
const SOURCE_REL =
  '${SOURCE_REL}';`
  );
  source = source.replace(
    "const POLICY_REL =\n  'source/proofs/model-village-character-appearance-h4a-facial-volume-garment-framing-policy.hsplus';",
    `const POLICY_REL =
  '${POLICY_REL}';`
  );
  source = source.replace(
    "const SEED_REL =\n  'source/proofs/model-village-character-appearance-h4a-facial-volume-garment-framing-seed.hs';",
    `const SEED_REL =
  '${SEED_REL}';`
  );

  const parseAnchor = "const sourceText = readFileSync(path.join(root, SOURCE_REL), 'utf8');";
  assert(source.includes(parseAnchor), 'H4A source-read anchor drifted');
  source = source.replace(
    parseAnchor,
    `const sourceText = mergeH4BMotionSource(
    readFileSync(path.join(root, INHERITED_H4A_SOURCE_REL), 'utf8'),
    readFileSync(path.join(root, SOURCE_REL), 'utf8')
  );`
  );
  const functionAnchor = 'export async function parseH4AStack(';
  assert(source.includes(functionAnchor), 'H4A parser function anchor drifted');
  source = source.replace(
    functionAnchor,
    `${mergeH4BMotionSource.toString()}\n\n${functionAnchor}`
  );

  const residentAnchor = 'environmentLight: canonical(built.environmentLight.options),';
  assert(source.includes(residentAnchor), 'H4A resident payload anchor drifted');
  source = source.replace(
    residentAnchor,
    `${residentAnchor}
      microMotion: canonical(built.microMotion),`
  );
  const compilerAnchor =
    'skinMaterial: canonical(built.host.getSkinMaterialReceipt()),';
  assert(source.includes(compilerAnchor), 'H4A compiler-record anchor drifted');
  source = source.replace(
    compilerAnchor,
    `${compilerAnchor}
      microMotion: canonical(built.microMotion),
      bundleMicroMotion: canonical(bundle.microMotion),`
  );
  const gpuAnchor = 'verifiedDeviceMethods: [';
  assert(source.includes(gpuAnchor), 'H4A browser GPU anchor drifted');
  source = source.replace(
    gpuAnchor,
    `adapterFeatures: Array.from(adapter.features || []).sort(),
      timestampQuerySupported: adapter.features?.has?.('timestamp-query') === true,
      ${gpuAnchor}`
  );
  source = source
    .replaceAll(
      'Stormglass Character Appearance H4A - Facial Volume Garment Framing',
      'Stormglass Character Realism H4B - Micro Motion Timing'
    )
    .replaceAll(
      'Native Chrome WebGPU H4A facial-volume and fieldcoat witness complete',
      'Native Chrome WebGPU H4B native-blink and temporal witness complete'
    )
    .replaceAll(
      'Native Chrome WebGPU H4A dual-frame portrait witness complete',
      'Native Chrome WebGPU H4B native-blink portrait witness complete'
    )
    .replaceAll(
      'Stormglass H4A Facial Volume Garment Framing',
      'Stormglass H4B Micro Motion Timing'
    )
    .replaceAll(
      'HoloScript H4A / facial volume and garment framing',
      'HoloScript H4B / native micro-motion and timing'
    )
    .replaceAll(
      'Characters built<br>past the silhouette.',
      'Presence lives<br>between frames.'
    )
    .replaceAll(
      'Four source-authored residents, rendered through the HoloScript\n      character compiler and browser WebGPU path. Raised fieldcoat facings, groom breakup, blended lid topology, a lower-eye\n      wetline, and a source-authored room basis meet in one deterministic witness.',
      'Four source-authored residents, rendered through the HoloScript character compiler and native browser WebGPU path. Staggered blink phases now deform real eyelid vertices while gaze, breath, and cloth remain honest sampled channels.'
    )
    .replaceAll(
      'Face volume / 7-closure full fieldcoat / blended lids / wetline / 12 flyaways',
      'Native blink / absolute-time replay / sampled gaze, breath + cloth'
    )
    .replaceAll(
      'Awaiting material-depth GPU witness',
      'Awaiting native-blink GPU witness'
    )
    .replaceAll(
      'face volume + full coat / contained breakup / authored room / no RTX timing claim',
      'native blink / static TAA reference / timestamp support observed / no GPU timing claim'
    );
  const metricAnchor =
    "'44x30 | ' +\n        expressionNormalDifference.changedPixelCount.toLocaleString() + ' normal delta px | ' +";
  assert(source.includes(metricAnchor), 'H4A visual metric anchor drifted');
  source = source.replace(
    metricAnchor,
    "'blink ' + resident.microMotion.sample.blink.weight.toFixed(2) + ' | 44x30 | ' +\n        expressionNormalDifference.changedPixelCount.toLocaleString() + ' normal delta px | ' +"
  );
  return source;
}

export function validateH4BCompilerRecords(records) {
  const errors = [];
  for (const record of records || []) {
    const label = record.displayLabel || 'unknown resident';
    const motion = record.microMotion;
    if (
      motion?.config?.schemaVersion !==
        'holoscript.character-micro-motion-config.v1' ||
      motion?.config?.profile !== 'human-presence-v1' ||
      motion?.sample?.schemaVersion !==
        'holoscript.character-micro-motion-sample.v1' ||
      motion?.sample?.absoluteTime !== true
    ) {
      errors.push(`${label}: micro-motion config/sample receipt drifted`);
      continue;
    }
    if (
      motion.application?.nativeBlinkApplied !== true ||
      motion.application?.blinkWeight < 0.18 ||
      motion.application?.changedVertexCount <= 0 ||
      motion.bindings?.blink !== 'native-procedural-head-morph'
    ) {
      errors.push(`${label}: native blink receipt drifted`);
    }
    if (
      motion.sample?.gaze?.nativeTransformApplied !== false ||
      motion.sample?.breath?.nativeTransformApplied !== false ||
      motion.sample?.cloth?.nativeSimulationApplied !== false ||
      motion.bindings?.gaze !== 'sampled-channel-only' ||
      motion.bindings?.breath !== 'sampled-channel-only' ||
      motion.bindings?.cloth !== 'sampled-channel-only'
    ) {
      errors.push(`${label}: sampled-only channel boundary drifted`);
    }
    if (
      record.bundleMicroMotion?.sample?.sampleDigest !==
        motion.sample.sampleDigest ||
      record.bundleMicroMotion?.application?.positionDigest !==
        motion.application.positionDigest
    ) {
      errors.push(`${label}: compiler and host micro-motion receipts diverged`);
    }
  }
  if ((records || []).length !== 4) errors.push('exactly four compiler records are required');
  return { status: errors.length ? 'fail' : 'pass', errors };
}

function readPixels(raw, width, height, x, y, channel) {
  const clampedX = Math.max(0, Math.min(width - 1, x));
  const clampedY = Math.max(0, Math.min(height - 1, y));
  return raw[(clampedY * width + clampedX) * 4 + channel];
}

export function measureStaticTaaConvergence(raw, width, height) {
  const jitter = [
    [0, 0],
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
  ];
  const sum = new Float64Array(raw.length);
  let previous = null;
  const historyMeanAbsoluteDeltas = [];
  let firstSample = null;
  let final = null;
  for (let sampleIndex = 0; sampleIndex < jitter.length; sampleIndex += 1) {
    const [offsetX, offsetY] = jitter[sampleIndex];
    const current = Buffer.alloc(raw.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        for (let channel = 0; channel < 4; channel += 1) {
          const value = readPixels(raw, width, height, x + offsetX, y + offsetY, channel);
          sum[index + channel] += value;
          current[index + channel] = Math.round(sum[index + channel] / (sampleIndex + 1));
        }
      }
    }
    if (!firstSample) firstSample = Buffer.from(current);
    if (previous) {
      let absolute = 0;
      for (let index = 0; index < current.length; index += 1) {
        absolute += Math.abs(current[index] - previous[index]);
      }
      historyMeanAbsoluteDeltas.push(absolute / current.length);
    }
    previous = current;
    final = current;
  }
  let changedPixelCount = 0;
  let absoluteChannelDifference = 0;
  for (let index = 0; index < final.length; index += 4) {
    const difference =
      Math.abs(final[index] - firstSample[index]) +
      Math.abs(final[index + 1] - firstSample[index + 1]) +
      Math.abs(final[index + 2] - firstSample[index + 2]);
    absoluteChannelDifference += difference;
    if (difference > 3) changedPixelCount += 1;
  }
  const firstHistoryDelta = historyMeanAbsoluteDeltas[0];
  const terminalHistoryDelta =
    historyMeanAbsoluteDeltas[historyMeanAbsoluteDeltas.length - 1];
  return {
    schema: 'hololand.static-presentation-taa-convergence.v1',
    mode: 'deterministic_image_space_jitter_history_reference',
    sampleCount: jitter.length,
    jitterPixels: jitter,
    firstHistoryMeanAbsoluteDelta: firstHistoryDelta,
    terminalHistoryMeanAbsoluteDelta: terminalHistoryDelta,
    terminalToFirstDeltaRatio: terminalHistoryDelta / firstHistoryDelta,
    finalVsFirstChangedPixelCount: changedPixelCount,
    finalVsFirstAbsoluteChannelDifference: absoluteChannelDifference,
    historySettled:
      changedPixelCount > 0 &&
      firstHistoryDelta > 0 &&
      terminalHistoryDelta < firstHistoryDelta * 0.5,
    productionRendererIntegrated: false,
    motionVectorsIntegrated: false,
    final,
  };
}

async function loadSharp(holoScriptRoot) {
  const require = createRequire(path.join(holoScriptRoot, 'package.json'));
  const resolved = require.resolve('sharp');
  const module = await import(pathToFileURL(resolved).href);
  return module.default || module;
}

function validatePins(holoScriptRoot) {
  const errors = [];
  errors.push(...upstreamPinFailures(holoScriptRoot));
  for (const [relativePath, expected] of HASH_BINDINGS) {
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

export function validateH4BManifest(root = ROOT) {
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
  const h4aSource = deriveH4AHarnessSource(h3zSource);
  const source = deriveH4BHarnessSource(h4aSource);
  mkdirSync(outputDir, { recursive: true });
  const generatedPath = path.join(outputDir, 'h4b-derived-webgpu-harness.mjs');
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

export async function runCharacterRealismH4B(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const holoScriptRoot = path.resolve(options.holoScriptRoot || DEFAULT_HOLOSCRIPT_ROOT);
  const outputDir = path.resolve(options.outputDir || path.join(root, OUTPUT_REL));
  const pinErrors = validatePins(holoScriptRoot);
  assert(pinErrors.length === 0, pinErrors.join('\n'));
  const harness = await materializeHarness(root, outputDir);
  const result = await harness.runCharacterAppearanceH4A({
    ...options,
    root,
    holoScriptRoot,
    outputDir,
    writeArtifacts: false,
    skipManifest: true,
  });
  const h4aValidation = validateH4ACompilerRecords(
    result.receipt.compilerAdmission.records
  );
  assert(h4aValidation.status === 'pass', h4aValidation.errors.join('\n'));
  const h4bValidation = validateH4BCompilerRecords(
    result.receipt.compilerAdmission.records
  );
  assert(h4bValidation.status === 'pass', h4bValidation.errors.join('\n'));

  const screenshot = readFileSync(result.screenshotPath);
  const sharp = await loadSharp(holoScriptRoot);
  const decoded = await sharp(screenshot)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const taa = measureStaticTaaConvergence(
    decoded.data,
    decoded.info.width,
    decoded.info.height
  );
  assert(taa.historySettled, 'static presentation TAA reference did not converge');
  const gpu = result.receipt.browserWebgpuAdmission.gpu;
  const compilerRecords = result.receipt.compilerAdmission.records;
  const receipt = {
    schema: 'hololand.model-village.character-realism-h4b-micro-motion-timing-witness.v1',
    capturedAt: new Date().toISOString(),
    status: 'pass',
    milestone: 'MV_CHARACTER_REALISM_H4B_MICRO_MOTION_TIMING',
    sourceAdmission: {
      holoScriptCommit: EXPECTED_COMMIT,
      inheritedH4ASourceSha256: portableSha256(path.join(root, INHERITED_SOURCE_REL)),
      sourceSha256: portableSha256(path.join(root, SOURCE_REL)),
      policySha256: portableSha256(path.join(root, POLICY_REL)),
      seedSha256: portableSha256(path.join(root, SEED_REL)),
      residentNames: EXPECTED_RESIDENTS,
    },
    compilerAdmission: {
      ...result.receipt.compilerAdmission,
      profile: 'human-presence-v1',
      absoluteTimeSampling: true,
      deterministicReplayCount: compilerRecords.length,
      nativeBlinkReceiptCount: compilerRecords.filter(
        (record) => record.microMotion?.application?.nativeBlinkApplied === true
      ).length,
      sampledOnlyGazeReceiptCount: compilerRecords.filter(
        (record) => record.microMotion?.sample?.gaze?.nativeTransformApplied === false
      ).length,
      sampledOnlyBreathReceiptCount: compilerRecords.filter(
        (record) => record.microMotion?.sample?.breath?.nativeTransformApplied === false
      ).length,
      sampledOnlyClothReceiptCount: compilerRecords.filter(
        (record) => record.microMotion?.sample?.cloth?.nativeSimulationApplied === false
      ).length,
    },
    browserWebgpuAdmission: result.receipt.browserWebgpuAdmission,
    staticTaaConvergence: {
      ...taa,
      final: undefined,
    },
    gpuTimingAdmission: {
      timestampQuerySupported: gpu.timestampQuerySupported === true,
      adapterFeatures: gpu.adapterFeatures || [],
      gpuTimestampMeasured: false,
      wallClockUsedAsGpuTime: false,
      reason: 'timestamp queries are not integrated into this character witness',
    },
    hostHardwareReadback: result.receipt.hostHardwareReadback,
    boundaries: {
      inheritedH4AAppearanceAdmissionPreserved: true,
      browserNativeWebgpuMeasured: true,
      sourceAuthoredMicroMotionCompiled: true,
      absoluteTimeSamplingMeasured: true,
      deterministicRepeatedCompileMeasured: true,
      nativeBlinkApplied: true,
      nativeGazeTransformApplied: false,
      nativeBreathTransformApplied: false,
      nativeClothSimulationApplied: false,
      staticTaaConvergenceMeasured: true,
      staticTaaMode: taa.mode,
      productionTaaIntegrated: false,
      motionVectorsIntegrated: false,
      gpuTimestampMeasured: false,
      wallClockUsedAsGpuTime: false,
      freshRtxBenchmarkClaimed: false,
      questHeadsetMeasured: false,
      browserWebxrMeasured: false,
      photorealismClaimed: false,
      fullWorldPerformanceClaimed: false,
    },
  };
  receipt.integrity = { canonicalSha256: sha256(canonicalJson(receipt)) };
  if (options.writeArtifacts) {
    writeFileSync(path.join(root, HERO_REL), screenshot);
    writeFileSync(path.join(root, EVIDENCE_REL), `${JSON.stringify(receipt, null, 2)}\n`);
  }
  if (!options.skipManifest) {
    const manifest = validateH4BManifest(root);
    assert(manifest.status === 'pass', manifest.errors.join('\n'));
  }
  return {
    receipt,
    screenshotPath: result.screenshotPath,
    browserHtmlSha256: result.browserHtmlSha256,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCharacterRealismH4B(parseArgs())
    .then(({ receipt }) => {
      if (process.argv.includes('--json')) console.log(JSON.stringify(receipt, null, 2));
      else {
        console.log(
          `PASS H4B micro motion: ${receipt.compilerAdmission.residentCount} residents; ` +
            `${receipt.compilerAdmission.nativeBlinkReceiptCount} native blink receipts; ` +
            `static TAA=${receipt.staticTaaConvergence.historySettled}; ` +
            `GPU timestamp=${receipt.gpuTimingAdmission.gpuTimestampMeasured}`
        );
      }
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}
