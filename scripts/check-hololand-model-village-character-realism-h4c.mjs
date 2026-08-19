#!/usr/bin/env node

// H4C preserves the admitted H4A appearance world and H4B absolute-time
// presence profile while moving gaze and breath from sampled-only channels to
// native ocular-globe and upper-chest geometry. Three independently compiled
// Chrome/WebGPU frames make that temporal change inspectable without claiming
// production TAA, motion vectors, GPU timing, or native cloth.

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
import {
  deriveH4BHarnessSource,
  measureStaticTaaConvergence,
} from './check-hololand-model-village-character-realism-h4b.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOLOSCRIPT_ROOT = resolveHoloScriptRoot({
  gate: 'H4C',
  // Kept, not deleted: sibling gates derive their runner source by string-substituting
  // this file and assert on this exact literal, so removing it breaks their anchors.
  // The path does not exist, so the resolver tries it and falls through to a real tree.
  candidates: ['C:/Users/josep/Documents/GitHub/.holorepo-worktrees/h4c-native-gaze-breathing-r2'],
});
const BASE_CHECKER_REL = 'scripts/check-hololand-model-village-character-appearance-h3x.mjs';
const INHERITED_SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h4a-facial-volume-garment-framing.holo';
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-realism-h4c-native-gaze-breathing.holo';
const POLICY_REL =
  'source/proofs/model-village-character-realism-h4c-native-gaze-breathing-policy.hsplus';
const SEED_REL =
  'source/proofs/model-village-character-realism-h4c-native-gaze-breathing-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-realism-h4c-native-gaze-breathing-manifest.holo';
const CHECKER_REL = 'scripts/check-hololand-model-village-character-realism-h4c.mjs';
const TEST_REL = 'scripts/__tests__/hololand-model-village-character-realism-h4c.test.mjs';
const REPORT_REL =
  'docs/reports/model-village-character-realism-h4c-native-gaze-breathing-2026-07-30.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-realism-h4c-native-gaze-breathing-2026-07-30.png';
const EVIDENCE_REL =
  'docs/assets/model-village/model-village-character-realism-h4c-native-gaze-breathing-2026-07-30.json';
const OUTPUT_REL = '.tmp/hololand/model-village/character-realism-h4c';
const EXPECTED_COMMIT = 'c96c6bf7314be5d8849c6da256e92464f461b846';
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];
const FRAME_OFFSETS_SECONDS = [0, 0.84, 1.68];
const HASH_BINDINGS = [
  [
    'packages/engine/src/character-render/AgentAvatarMicroMotion.ts',
    '9547a8a51e33fd7a8e41cfc1fb8332de7721cb7aef19c0a873b3852cea472fc6',
  ],
  [
    'packages/engine/src/character-render/CharacterHost.ts',
    '4b2d315429a6b816c21afcbdf8589593b6ce9a15b58f31aab08bf2e900df7bd7',
  ],
  [
    'packages/engine/src/character-render/CharacterHostFromComposition.ts',
    '47e272029606fe34db37eba253d7f9a95d4e33867a6508aa5b7d3f247dce9ccc',
  ],
  [
    'packages/core/src/compiler/CharacterWebGPUCompiler.ts',
    '58c13464c5dd79ecddb889fd982376c567738f243a3b02c369f05b402b8e41ea',
  ],
];
const RESIDENT_REGIONS = [
  { displayLabel: 'OpenAI', x: 49, y: 188, width: 313, height: 294 },
  { displayLabel: 'Claude', x: 707, y: 188, width: 313, height: 294 },
  { displayLabel: 'Gemini', x: 49, y: 498, width: 313, height: 292 },
  { displayLabel: 'Grok', x: 707, y: 498, width: 313, height: 292 },
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
  const require = createRequire(import.meta.url);
  const { execFileSync } = require('node:child_process');
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

export function offsetH4CMotionSource(source, timeOffsetSeconds) {
  if (!Number.isFinite(timeOffsetSeconds) || timeOffsetSeconds < 0) {
    throw new Error('H4C time offset must be a finite non-negative number');
  }
  const restamped = source
    .replaceAll(
      'eb0f40bacb1745ce2e3464b08f0470f7d6227274d6502841f95499e9978bafdf',
      '4b2d315429a6b816c21afcbdf8589593b6ce9a15b58f31aab08bf2e900df7bd7'
    )
    .replaceAll(
      'c7af37118977dccd585f6c4c616a3d8144e0b8a07c9ceb8c5e32c350d8bedfe9',
      '47e272029606fe34db37eba253d7f9a95d4e33867a6508aa5b7d3f247dce9ccc'
    );
  let count = 0;
  const shifted = restamped.replace(
    /source_time_seconds:\s*([0-9]+(?:\.[0-9]+)?)/g,
    (_match, value) => {
      count++;
      return `source_time_seconds: ${(Number(value) + timeOffsetSeconds).toFixed(6)}`;
    }
  );
  if (count !== 4) throw new Error('exactly four H4C source times must be shifted');
  return shifted;
}

export function deriveH4CHarnessSource(h4bHarnessSource, timeOffsetSeconds = 0) {
  let source = h4bHarnessSource
    .replaceAll(
      'C:/holorepo-worktrees/holoscript-h4b-character-micro-motion-timing-r3',
      'C:/Users/josep/Documents/GitHub/.holorepo-worktrees/h4c-native-gaze-breathing-r2'
    )
    .replaceAll('1f295ee62e255883dc95394f5249700023bb39df', EXPECTED_COMMIT)
    .replaceAll(
      'source/layers/vr/frontier/model-village/model-village-character-realism-h4b-micro-motion-timing.holo',
      SOURCE_REL
    )
    .replaceAll(
      'source/proofs/model-village-character-realism-h4b-micro-motion-timing-policy.hsplus',
      POLICY_REL
    )
    .replaceAll(
      'source/proofs/model-village-character-realism-h4b-micro-motion-timing-seed.hs',
      SEED_REL
    )
    .replaceAll(
      'Stormglass Character Realism H4B - Micro Motion Timing',
      'Stormglass Character Realism H4C - Native Gaze and Breathing'
    )
    .replaceAll(
      'Native Chrome WebGPU H4B native-blink and temporal witness complete',
      'Native Chrome WebGPU H4C gaze and breathing frame complete'
    )
    .replaceAll(
      'Native Chrome WebGPU H4B native-blink portrait witness complete',
      'Native Chrome WebGPU H4C native-presence portrait frame complete'
    )
    .replaceAll(
      'Stormglass H4B Micro Motion Timing',
      'Stormglass H4C Native Gaze and Breathing'
    )
    .replaceAll(
      'HoloScript H4B / native micro-motion and timing',
      'HoloScript H4C / native gaze and upper-chest breathing'
    )
    .replaceAll(
      'Presence lives<br>between frames.',
      'Presence moves<br>through the frame.'
    )
    .replaceAll(
      'Four source-authored residents, rendered through the HoloScript character compiler and native browser WebGPU path. Staggered blink phases now deform real eyelid vertices while gaze, breath, and cloth remain honest sampled channels.',
      'Four source-authored residents, rendered through the HoloScript character compiler and native browser WebGPU path. Eyelids, ocular globes, and upper-chest geometry now move from absolute-time source while cloth remains an honest sampled channel.'
    )
    .replaceAll(
      'Native blink / absolute-time replay / sampled gaze, breath + cloth',
      'Native blink + ocular rotation + upper-chest breath / cloth sampled-only'
    )
    .replaceAll(
      'native blink / static TAA reference / timestamp support observed / no GPU timing claim',
      'native eyes + chest / measured WebGPU frame / no GPU timing claim'
    );

  const sourceReadAnchor = `const sourceText = mergeH4BMotionSource(
    readFileSync(path.join(root, INHERITED_H4A_SOURCE_REL), 'utf8'),
    readFileSync(path.join(root, SOURCE_REL), 'utf8')
  );`;
  assert(source.includes(sourceReadAnchor), 'H4B source-read anchor drifted');
  source = source.replace(
    sourceReadAnchor,
    `const sourceText = offsetH4CMotionSource(
    mergeH4BMotionSource(
      readFileSync(path.join(root, INHERITED_H4A_SOURCE_REL), 'utf8'),
      readFileSync(path.join(root, SOURCE_REL), 'utf8')
    ),
    ${Number(timeOffsetSeconds).toFixed(6)}
  );`
  );
  const parserAnchor = '\nexport async function parseH4AStack(\n  root =';
  assert(source.includes(parserAnchor), 'H4B parser function anchor drifted');
  source = source.replace(
    parserAnchor,
    `\n${offsetH4CMotionSource.toString()}\n${parserAnchor}`
  );
  return source;
}

export function validateH4CCompilerRecords(records) {
  const errors = [];
  for (const record of records || []) {
    const label = record.displayLabel || 'unknown resident';
    const motion = record.microMotion;
    const application = motion?.application;
    if (
      motion?.config?.schemaVersion !== 'holoscript.character-micro-motion-config.v1' ||
      motion?.config?.profile !== 'human-presence-v1' ||
      motion?.sample?.schemaVersion !== 'holoscript.character-micro-motion-sample.v1' ||
      motion?.sample?.absoluteTime !== true ||
      record.repeatedCompileByteIdentity !== true
    ) {
      errors.push(`${label}: deterministic micro-motion receipt drifted`);
      continue;
    }
    if (
      application?.schemaVersion !== 'holoscript.character-micro-motion-application.v2' ||
      application?.nativeBlinkApplied !== true ||
      application?.nativeGazeApplied !== true ||
      application?.nativeBreathApplied !== true ||
      application?.facialChangedVertexCount <= 0 ||
      application?.gazeChangedVertexCount <= 0 ||
      application?.breathChangedVertexCount <= 0 ||
      application?.changedVertexCount <= 0
    ) {
      errors.push(`${label}: native blink/gaze/breath application receipt drifted`);
    }
    if (
      motion.sample?.gaze?.nativeTransformApplied !== false ||
      motion.sample?.breath?.nativeTransformApplied !== false ||
      motion.sample?.cloth?.nativeSimulationApplied !== false ||
      motion.bindings?.blink !== 'native-procedural-head-morph' ||
      motion.bindings?.gaze !== 'native-ocular-globe-rotation' ||
      motion.bindings?.breath !== 'native-upper-chest-deformation' ||
      motion.bindings?.cloth !== 'sampled-channel-only'
    ) {
      errors.push(`${label}: native binding or sampled-cloth boundary drifted`);
    }
    if (
      record.bundleMicroMotion?.sample?.sampleDigest !== motion.sample.sampleDigest ||
      record.bundleMicroMotion?.application?.positionDigest !== application.positionDigest ||
      record.bundleMicroMotion?.application?.normalDigest !== application.normalDigest
    ) {
      errors.push(`${label}: compiler and host micro-motion receipts diverged`);
    }
  }
  if ((records || []).length !== 4) errors.push('exactly four compiler records are required');
  return { status: errors.length ? 'fail' : 'pass', errors };
}

function parseManifestEntries(source) {
  return [...source.matchAll(/path:\s*"([^"]+)"\s+sha256:\s*"([a-f0-9]{64})"/g)].map(
    ([, filePath, digest]) => ({ path: filePath, sha256: digest })
  );
}

export function validateH4CManifest(root = ROOT) {
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

async function materializeHarness(root, outputDir, timeOffsetSeconds) {
  const h3ySource = deriveH3YHarnessSource(
    readFileSync(path.join(root, BASE_CHECKER_REL), 'utf8')
  );
  const h3zSource = deriveH3ZHarnessSource(h3ySource);
  const h4aSource = deriveH4AHarnessSource(h3zSource);
  const h4bSource = deriveH4BHarnessSource(h4aSource);
  const source = deriveH4CHarnessSource(h4bSource, timeOffsetSeconds);
  mkdirSync(outputDir, { recursive: true });
  const generatedPath = path.join(
    outputDir,
    `h4c-derived-webgpu-harness-${String(timeOffsetSeconds).replace('.', '-')}.mjs`
  );
  writeFileSync(generatedPath, source);
  return import(`${pathToFileURL(generatedPath).href}?sha=${sha256(source)}`);
}

function summarizeMotionRecord(record) {
  return {
    objectId: record.objectId,
    displayLabel: record.displayLabel,
    outputSha256: record.outputSha256,
    repeatedCompileByteIdentity: record.repeatedCompileByteIdentity,
    sourceTimeSeconds: record.microMotion.sourceTimeSeconds,
    configDigest: record.microMotion.config.configDigest,
    sampleDigest: record.microMotion.sample.sampleDigest,
    gaze: {
      eventIndex: record.microMotion.sample.gaze.eventIndex,
      settle01: record.microMotion.sample.gaze.settle01,
      yawRadians: record.microMotion.sample.gaze.yawRadians,
      pitchRadians: record.microMotion.sample.gaze.pitchRadians,
    },
    breath: {
      phase01: record.microMotion.sample.breath.phase01,
      scale: record.microMotion.sample.breath.scale,
    },
    cloth: {
      phase01: record.microMotion.sample.cloth.phase01,
      nativeSimulationApplied: record.microMotion.sample.cloth.nativeSimulationApplied,
    },
    application: record.microMotion.application,
    bindings: record.microMotion.bindings,
  };
}

function measureRegionDifference(first, second, width, height, region) {
  assert(first.length === second.length, 'frame byte lengths diverged');
  let changedPixelCount = 0;
  let absoluteChannelDifference = 0;
  let maximumPixelDifference = 0;
  for (let y = region.y; y < Math.min(height, region.y + region.height); y += 1) {
    for (let x = region.x; x < Math.min(width, region.x + region.width); x += 1) {
      const index = (y * width + x) * 4;
      const difference =
        Math.abs(first[index] - second[index]) +
        Math.abs(first[index + 1] - second[index + 1]) +
        Math.abs(first[index + 2] - second[index + 2]);
      absoluteChannelDifference += difference;
      maximumPixelDifference = Math.max(maximumPixelDifference, difference);
      if (difference > 9) changedPixelCount++;
    }
  }
  return {
    displayLabel: region.displayLabel,
    region: {
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
    },
    changedPixelCount,
    absoluteChannelDifference,
    maximumPixelDifference,
  };
}

export function measureH4CFramePair(
  first,
  second,
  width,
  height,
  fromFrameIndex,
  toFrameIndex
) {
  return {
    schema: 'hololand.character-presence-frame-pair-difference.v1',
    fromFrameIndex,
    toFrameIndex,
    residentRegions: RESIDENT_REGIONS.map((region) =>
      measureRegionDifference(first, second, width, height, region)
    ),
  };
}

async function composeContactSheet(sharp, frameBuffers, frameOffsetsSeconds) {
  const panelWidth = 800;
  const panelHeight = 514;
  const headerHeight = 76;
  const footerHeight = 34;
  const width = panelWidth * frameBuffers.length;
  const height = headerHeight + panelHeight + footerHeight;
  const panels = await Promise.all(
    frameBuffers.map((buffer) =>
      sharp(buffer).resize(panelWidth, panelHeight, { fit: 'fill' }).png().toBuffer()
    )
  );
  const labels = ['A', 'B', 'C'];
  const composites = panels.map((input, index) => ({
    input,
    left: index * panelWidth,
    top: headerHeight,
  }));
  for (let index = 0; index < panels.length; index += 1) {
    const svg = Buffer.from(`<svg width="${panelWidth}" height="${headerHeight}">
      <rect width="${panelWidth}" height="${headerHeight}" fill="#0b151d"/>
      <rect y="${headerHeight - 2}" width="${panelWidth}" height="2" fill="#d68a55"/>
      <text x="32" y="47" fill="#f4dfc6" font-size="34" font-family="Segoe UI, sans-serif" font-weight="700">${labels[index]}</text>
      <text x="92" y="45" fill="#afc7cf" font-size="22" font-family="Segoe UI, sans-serif">source time + ${frameOffsetsSeconds[index].toFixed(2)} s</text>
      <text x="${panelWidth - 32}" y="45" text-anchor="end" fill="#78939c" font-size="17" font-family="Segoe UI, sans-serif">native gaze + chest breath</text>
    </svg>`);
    composites.push({ input: svg, left: index * panelWidth, top: 0 });
  }
  const footer = Buffer.from(`<svg width="${width}" height="${footerHeight}">
    <rect width="${width}" height="${footerHeight}" fill="#081016"/>
    <text x="${width / 2}" y="23" text-anchor="middle" fill="#708790" font-size="15" font-family="Segoe UI, sans-serif">Chrome WebGPU multi-frame witness • cloth sampled-only • no production TAA or GPU timing claim</text>
  </svg>`);
  composites.push({ input: footer, left: 0, top: headerHeight + panelHeight });
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 8, g: 16, b: 22, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
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

export async function runCharacterRealismH4C(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const holoScriptRoot = path.resolve(options.holoScriptRoot || DEFAULT_HOLOSCRIPT_ROOT);
  const outputDir = path.resolve(options.outputDir || path.join(root, OUTPUT_REL));
  const pinErrors = validatePins(holoScriptRoot);
  assert(pinErrors.length === 0, pinErrors.join('\n'));
  const sharp = await loadSharp(holoScriptRoot);
  const measuredFrames = [];
  const decodedFrames = [];
  const screenshotBuffers = [];

  for (let frameIndex = 0; frameIndex < FRAME_OFFSETS_SECONDS.length; frameIndex += 1) {
    const timeOffsetSeconds = FRAME_OFFSETS_SECONDS[frameIndex];
    const frameOutputDir = path.join(outputDir, `frame-${frameIndex}`);
    const harness = await materializeHarness(root, frameOutputDir, timeOffsetSeconds);
    const result = await harness.runCharacterAppearanceH4A({
      ...options,
      root,
      holoScriptRoot,
      outputDir: frameOutputDir,
      writeArtifacts: false,
      skipManifest: true,
    });
    const records = result.receipt.compilerAdmission.records;
    const h4aValidation = validateH4ACompilerRecords(records);
    assert(h4aValidation.status === 'pass', h4aValidation.errors.join('\n'));
    const h4cValidation = validateH4CCompilerRecords(records);
    assert(h4cValidation.status === 'pass', h4cValidation.errors.join('\n'));
    assert(
      result.receipt.browserWebgpuAdmission.network.externalRequestCount === 0,
      `frame ${frameIndex} made an external network request`
    );
    const screenshot = readFileSync(result.screenshotPath);
    const decoded = await sharp(screenshot)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    screenshotBuffers.push(screenshot);
    decodedFrames.push(decoded);
    measuredFrames.push({
      frameIndex,
      timeOffsetSeconds,
      screenshotSha256: sha256(screenshot),
      screenshotBytes: screenshot.length,
      browserHtmlSha256: result.browserHtmlSha256,
      browser: result.receipt.browserWebgpuAdmission.browser,
      gpu: result.receipt.browserWebgpuAdmission.gpu,
      network: result.receipt.browserWebgpuAdmission.network,
      compilerAdmission: {
        residentCount: records.length,
        nativeBlinkReceiptCount: records.filter(
          (record) => record.microMotion?.application?.nativeBlinkApplied === true
        ).length,
        nativeGazeReceiptCount: records.filter(
          (record) => record.microMotion?.application?.nativeGazeApplied === true
        ).length,
        nativeBreathReceiptCount: records.filter(
          (record) => record.microMotion?.application?.nativeBreathApplied === true
        ).length,
        sampledOnlyClothReceiptCount: records.filter(
          (record) => record.microMotion?.sample?.cloth?.nativeSimulationApplied === false
        ).length,
        records: records.map(summarizeMotionRecord),
      },
      hostHardwareReadback: result.receipt.hostHardwareReadback,
    });
  }

  const width = decodedFrames[0].info.width;
  const height = decodedFrames[0].info.height;
  for (const frame of decodedFrames) {
    assert(
      frame.info.width === width && frame.info.height === height,
      'H4C frame dimensions diverged'
    );
  }
  const framePairDifferences = [
    measureH4CFramePair(decodedFrames[0].data, decodedFrames[1].data, width, height, 0, 1),
    measureH4CFramePair(decodedFrames[1].data, decodedFrames[2].data, width, height, 1, 2),
  ];
  for (const pair of framePairDifferences) {
    for (const resident of pair.residentRegions) {
      assert(
        resident.changedPixelCount > 25 && resident.absoluteChannelDifference > 0,
        `${resident.displayLabel} did not visibly change between frames ${pair.fromFrameIndex} and ${pair.toFrameIndex}`
      );
    }
  }
  for (const residentName of EXPECTED_RESIDENTS) {
    const records = measuredFrames.map((frame) =>
      frame.compilerAdmission.records.find((record) => record.displayLabel === residentName)
    );
    assert(records.every(Boolean), `${residentName} is missing from a measured frame`);
    assert(
      new Set(records.map((record) => record.sampleDigest)).size === records.length,
      `${residentName} sample digest did not advance across frames`
    );
    assert(
      new Set(records.map((record) => record.application.positionDigest)).size === records.length,
      `${residentName} native geometry digest did not advance across frames`
    );
    assert(
      new Set(records.map((record) => record.gaze.eventIndex)).size >= 2,
      `${residentName} native gaze event did not advance across frames`
    );
  }

  const taa = measureStaticTaaConvergence(decodedFrames[1].data, width, height);
  assert(taa.historySettled, 'static presentation TAA reference did not converge');
  const hero = await composeContactSheet(sharp, screenshotBuffers, FRAME_OFFSETS_SECONDS);
  const firstFrame = measuredFrames[0];
  const receipt = {
    schema: 'hololand.model-village.character-realism-h4c-native-gaze-breathing-witness.v1',
    capturedAt: new Date().toISOString(),
    status: 'pass',
    milestone: 'MV_CHARACTER_REALISM_H4C_NATIVE_GAZE_BREATHING',
    sourceAdmission: {
      holoScriptCommit: EXPECTED_COMMIT,
      inheritedH4ASourceSha256: portableSha256(path.join(root, INHERITED_SOURCE_REL)),
      sourceSha256: portableSha256(path.join(root, SOURCE_REL)),
      policySha256: portableSha256(path.join(root, POLICY_REL)),
      seedSha256: portableSha256(path.join(root, SEED_REL)),
      residentNames: EXPECTED_RESIDENTS,
      measuredFrameOffsetsSeconds: FRAME_OFFSETS_SECONDS,
    },
    compilerAdmission: {
      profile: 'human-presence-v1',
      absoluteTimeSampling: true,
      measuredFrameCount: measuredFrames.length,
      sourceCompiledResidentCount: measuredFrames.reduce(
        (sum, frame) => sum + frame.compilerAdmission.residentCount,
        0
      ),
      deterministicReplayCount: measuredFrames.reduce(
        (sum, frame) =>
          sum +
          frame.compilerAdmission.records.filter(
            (record) => record.repeatedCompileByteIdentity === true
          ).length,
        0
      ),
      nativeBlinkReceiptCount: measuredFrames.reduce(
        (sum, frame) => sum + frame.compilerAdmission.nativeBlinkReceiptCount,
        0
      ),
      nativeGazeReceiptCount: measuredFrames.reduce(
        (sum, frame) => sum + frame.compilerAdmission.nativeGazeReceiptCount,
        0
      ),
      nativeBreathReceiptCount: measuredFrames.reduce(
        (sum, frame) => sum + frame.compilerAdmission.nativeBreathReceiptCount,
        0
      ),
      sampledOnlyClothReceiptCount: measuredFrames.reduce(
        (sum, frame) => sum + frame.compilerAdmission.sampledOnlyClothReceiptCount,
        0
      ),
    },
    frames: measuredFrames,
    temporalPixelAdmission: {
      framePairDifferences,
      residentRegionMotionReceiptCount: framePairDifferences.reduce(
        (sum, pair) => sum + pair.residentRegions.length,
        0
      ),
      everyResidentChangedAcrossEveryPair: true,
      contactSheet: {
        width: 2400,
        height: 624,
        bytes: hero.length,
        sha256: sha256(hero),
      },
    },
    browserWebgpuAdmission: {
      runtime: {
        renderer: 'HoloScript CharacterRender.renderCharacter',
        backend: 'browser_native_webgpu',
        browserUsed: true,
        threeJsUsed: false,
        r3fUsed: false,
      },
      measuredFrameCount: measuredFrames.length,
      browser: firstFrame.browser,
      gpu: firstFrame.gpu,
      externalNetworkRequestCount: measuredFrames.reduce(
        (sum, frame) => sum + frame.network.externalRequestCount,
        0
      ),
    },
    staticTaaConvergence: {
      ...taa,
      final: undefined,
    },
    gpuTimingAdmission: {
      timestampQuerySupported: firstFrame.gpu.timestampQuerySupported === true,
      adapterFeatures: firstFrame.gpu.adapterFeatures || [],
      gpuTimestampMeasured: false,
      wallClockUsedAsGpuTime: false,
      reason: 'timestamp queries are not integrated into this character witness',
    },
    hostHardwareReadback: firstFrame.hostHardwareReadback,
    boundaries: {
      inheritedH4AAppearanceAdmissionPreserved: true,
      browserNativeWebgpuMeasured: true,
      sourceAuthoredMicroMotionCompiled: true,
      absoluteTimeSamplingMeasured: true,
      deterministicRepeatedCompileMeasured: true,
      nativeBlinkApplied: true,
      nativeGazeTransformApplied: true,
      nativeBreathTransformApplied: true,
      nativeClothSimulationApplied: false,
      multiFrameBrowserWitnessMeasured: true,
      residentRegionPixelMotionMeasured: true,
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
    writeFileSync(path.join(root, HERO_REL), hero);
    writeFileSync(path.join(root, EVIDENCE_REL), `${JSON.stringify(receipt, null, 2)}\n`);
  }
  if (!options.skipManifest) {
    const manifest = validateH4CManifest(root);
    assert(manifest.status === 'pass', manifest.errors.join('\n'));
  }
  return {
    receipt,
    hero,
    frameScreenshotPaths: FRAME_OFFSETS_SECONDS.map((_, frameIndex) =>
      path.join(outputDir, `frame-${frameIndex}`, 'h4a-facial-volume-garment-framing.png')
    ),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCharacterRealismH4C(parseArgs())
    .then(({ receipt }) => {
      if (process.argv.includes('--json')) console.log(JSON.stringify(receipt, null, 2));
      else {
        console.log(
          `PASS H4C native presence: ${receipt.compilerAdmission.measuredFrameCount} WebGPU frames; ` +
            `${receipt.compilerAdmission.nativeGazeReceiptCount} native gaze receipts; ` +
            `${receipt.compilerAdmission.nativeBreathReceiptCount} native breath receipts; ` +
            `GPU timestamp=${receipt.gpuTimingAdmission.gpuTimestampMeasured}`
        );
      }
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}
