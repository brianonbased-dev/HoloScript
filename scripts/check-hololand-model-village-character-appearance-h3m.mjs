#!/usr/bin/env node
/* global process */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  buildH3KPlan,
  proveH3KPoseClearance,
} from './check-hololand-model-village-character-appearance-h3k.mjs';
import { withWgslRaw } from './lib/model-village-wgsl-raw-plugin.mjs';

import { validateUpstreamCommitPin } from './lib/model-village-upstream-commit-pin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3m-anatomical-hands.holo';
const POLICY_REL =
  'source/proofs/model-village-character-appearance-h3m-anatomical-hands-policy.hsplus';
const SEED_REL = 'source/proofs/model-village-character-appearance-h3m-anatomical-hands-seed.hs';
const INHERITED_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3l-upper-limb.holo';
const POSE_POLICY_REL =
  'source/proofs/model-village-character-appearance-h3k-upper-body-occlusion-policy.hsplus';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3m-anatomical-hands-manifest.holo';
const REPORT_REL =
  'docs/reports/model-village-character-appearance-h3m-anatomical-hands-2026-07-28.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-appearance-h3m-anatomical-hands-2026-07-28.png';
const OUTPUT_REL = '.tmp/hololand/model-village/character-appearance-h3m';
const EXPECTED_COMMIT = 'c273682f5a5140b0ff8cde5da89ca7bfb98c63b2';
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];
const EXPECTED_DIGITS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const HASH_BINDINGS = [
  ['inheritedH3LSource', 'inheritedH3LSourceSha256', 'hololand'],
  ['upstreamBodyBuilderPath', 'upstreamBodyBuilderSha256', 'holoscript'],
  ['upstreamGarmentBuilderPath', 'upstreamGarmentBuilderSha256', 'holoscript'],
  ['upstreamCharacterHostPath', 'upstreamCharacterHostSha256', 'holoscript'],
  ['upstreamCompositionBridgePath', 'upstreamCompositionBridgeSha256', 'holoscript'],
  ['upstreamHairBuilderPath', 'upstreamHairBuilderSha256', 'holoscript'],
  ['upstreamCompilerPath', 'upstreamCompilerSha256', 'holoscript'],
];

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256(readFileSync(filePath));
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

function properties(node) {
  return Object.fromEntries(
    (node?.properties || []).map((property) => [property.key, property.value])
  );
}

// Delegates to the shared validator. The private gitHasCommit() this replaced asserted
// "ancestor of HEAD", which accepted a commit that existed only on one laptop and
// rejected a reproducible one whenever a peer left the shared checkout on a branch.
function upstreamPinFailures(holoScriptRoot, metadata) {
  return validateUpstreamCommitPin(
    holoScriptRoot,
    metadata.upstreamHoloScriptCommit,
    HASH_BINDINGS
      .filter(([, , owner]) => owner === 'holoscript')
      .map(([pathKey, hashKey]) => ({
        pathKey,
        relative: metadata[pathKey],
        sha256: metadata[hashKey],
      })),
  ).errors;
}

function sourcePath(root, relative) {
  return path.join(root, relative).replaceAll('\\', '/');
}

async function loadEsbuild(holoScriptRoot) {
  const workspaceRequire = createRequire(path.join(holoScriptRoot, 'package.json'));
  const esbuild = await import(pathToFileURL(workspaceRequire.resolve('esbuild')).href);
  // HoloScript's character-render entry imports its skin shader as
  // `skin-skinning.wgsl?raw`, which esbuild cannot load unaided. H3N and
  // H3O..H3V all take their esbuild from this stack, so wrapping here is the one
  // seam that keeps ten gates able to build the code they witness.
  return withWgslRaw(esbuild);
}

async function loadNativeToolchain(holoScriptRoot, outputDir, esbuild) {
  mkdirSync(outputDir, { recursive: true });
  const parserPath = path.join(outputDir, 'h3m-native-parsers.mjs');
  const compilerDir = path.join(holoScriptRoot, '.tmp', 'h3m-native-toolchain');
  const compilerPath = path.join(compilerDir, 'CharacterWebGPUCompiler.mjs');
  mkdirSync(compilerDir, { recursive: true });
  await esbuild.build({
    stdin: {
      contents: [
        `export { HoloCompositionParser } from "${sourcePath(
          holoScriptRoot,
          'packages/core/src/parser/HoloCompositionParser.ts'
        )}";`,
        `export { HoloScriptPlusParser } from "${sourcePath(
          holoScriptRoot,
          'packages/core/src/parser/HoloScriptPlusParser.ts'
        )}";`,
        `export { HoloScriptCodeParser } from "${sourcePath(
          holoScriptRoot,
          'packages/core/src/HoloScriptCodeParser.ts'
        )}";`,
      ].join('\n'),
      resolveDir: holoScriptRoot,
      sourcefile: 'h3m-native-parsers.entry.ts',
      loader: 'ts',
    },
    outfile: parserPath,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: ['node20'],
    sourcemap: false,
    logLevel: 'silent',
  });
  await esbuild.build({
    entryPoints: [
      path.join(holoScriptRoot, 'packages/core/src/compiler/CharacterWebGPUCompiler.ts'),
    ],
    outfile: compilerPath,
    bundle: true,
    plugins: [
      {
        name: 'h3m-character-render-source-resolution',
        setup(build) {
          build.onResolve({ filter: /^@holoscript\/engine$/ }, () => ({
            path: 'h3m-character-render-source',
            namespace: 'h3m-character-render',
          }));
          build.onLoad({ filter: /.*/, namespace: 'h3m-character-render' }, () => ({
            contents:
              `import { buildCharacterHostFromComposition } from "${sourcePath(
                holoScriptRoot,
                'packages/engine/src/character-render/CharacterHostFromComposition.ts'
              )}";\n` + 'export const CharacterRender = { buildCharacterHostFromComposition };\n',
            loader: 'ts',
            resolveDir: holoScriptRoot,
          }));
        },
      },
    ],
    format: 'esm',
    platform: 'node',
    target: ['node20'],
    sourcemap: false,
    logLevel: 'silent',
  });
  const cacheKey = `${sha256File(parserPath)}-${sha256File(compilerPath)}`;
  const parsers = await import(`${pathToFileURL(parserPath).href}?sha=${cacheKey}`);
  const compiler = await import(`${pathToFileURL(compilerPath).href}?sha=${cacheKey}`);
  return { ...parsers, ...compiler };
}

export async function parseH3MStack(
  root = ROOT,
  holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT,
  outputDir = path.join(root, OUTPUT_REL)
) {
  const esbuild = await loadEsbuild(holoScriptRoot);
  const toolchain = await loadNativeToolchain(holoScriptRoot, outputDir, esbuild);
  const sourceText = readFileSync(path.join(root, SOURCE_REL), 'utf8');
  const policyText = readFileSync(path.join(root, POLICY_REL), 'utf8');
  const seedText = readFileSync(path.join(root, SEED_REL), 'utf8');
  const source = new toolchain.HoloCompositionParser().parse(sourceText);
  const policy = new toolchain.HoloScriptPlusParser().parse(policyText);
  const seed = new toolchain.HoloScriptCodeParser().parse(seedText);
  for (const [label, parsed] of [
    ['H3M .holo', source],
    ['H3M .hsplus', policy],
    ['H3M .hs', seed],
  ]) {
    if (!parsed.success || parsed.errors.length) {
      esbuild.stop?.();
      throw new Error(`${label} parse failed: ${JSON.stringify(parsed.errors)}`);
    }
  }
  const posePolicyText = readFileSync(path.join(root, POSE_POLICY_REL), 'utf8');
  const posePolicy = new toolchain.HoloScriptPlusParser().parse(posePolicyText);
  if (!posePolicy.success || posePolicy.errors.length) {
    esbuild.stop?.();
    throw new Error(`H3K pose policy parse failed: ${JSON.stringify(posePolicy.errors)}`);
  }
  const poseProbes = (posePolicy.ast.compositions?.[0]?.children || [])
    .filter((node) => node.type === 'object' && node.properties?.type === 'upper_body_pose_probe')
    .map((node) => ({ ...node.properties }))
    .sort((a, b) => a.order - b.order);
  return {
    esbuild,
    toolchain,
    source,
    policy,
    seed,
    poseProbes,
    sourceText,
    policyText,
    seedText,
    contract: {
      metadata: source.ast.metadata,
      state: properties(source.ast.state),
      environment: properties(source.ast.environment),
      objects: (source.ast.objects || []).map((object) => ({
        objectId: object.name,
        ...properties(object),
      })),
    },
  };
}

export function validateH3MContract(stack, root = ROOT, holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT) {
  const errors = [];
  const expect = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const { metadata, state, objects } = stack.contract;
  expect(
    metadata.milestone === 'MV_CHARACTER_APPEARANCE_H3M_ANATOMICAL_HANDS',
    'milestone drifted'
  );
  expect(metadata.artStyle === 'hearthlight_biorealism', 'art style drifted');
  expect(metadata.upstreamHoloScriptCommit === EXPECTED_COMMIT, 'upstream commit pin drifted');
  for (const failure of upstreamPinFailures(holoScriptRoot, metadata)) expect(false, failure);
  for (const [pathKey, hashKey, owner] of HASH_BINDINGS) {
    const base = owner === 'holoscript' ? holoScriptRoot : root;
    const absolute = path.join(base, metadata[pathKey] || '');
    expect(existsSync(absolute), `${pathKey} does not exist`);
    if (existsSync(absolute)) {
      expect(sha256File(absolute) === metadata[hashKey], `${hashKey} drifted`);
    }
  }
  for (const [key, expected] of [
    ['residentCount', 4],
    ['providerModelBinding', 'absent'],
    ['adapterFamilyBinding', 'absent'],
    ['researchSeatBinding', 'absent'],
    ['liveResearchJoinAllowed', false],
    ['canonicalWritesAllowed', false],
    ['residentObservationWritesAllowed', false],
    ['modelCallsAllowed', false],
    ['networkFetchesAllowed', false],
    ['biometricPersistenceAllowed', false],
    ['nativeCharacterCompilerClaimed', true],
    ['nativeAnatomicalUpperBodyClaimed', true],
    ['nativeDeltoidReceiptClaimed', true],
    ['nativeDigitReceiptClaimed', true],
    ['nativeTailoredGarmentReceiptClaimed', true],
    ['legacyBoxDigitsSuppressedClaimed', true],
    ['repeatedCompileByteIdentityClaimed', true],
    ['strippedAnatomyDeltaClaimed', true],
    ['nativePoseClearanceClaimed', true],
    ['torsoToLimbSharedTopologyClaimed', false],
    ['palmToDigitSharedTopologyClaimed', false],
    ['freshRtxBenchmarkClaimed', false],
    ['historicalRtxEvidenceMayBeReusedAsCurrent', false],
    ['sceneWebgpuRenderingClaimed', false],
    ['nativeWebgpuTaaClaimed', false],
    ['gpuTimestampFrameTimeClaimed', false],
    ['questWebxrMeasured', false],
    ['productionSkinTexturingClaimed', false],
    ['productionGroomClaimed', false],
    ['biometricLikenessClaimed', false],
    ['photorealismClaimed', false],
    ['fullWorldConvergenceClaimed', false],
  ]) {
    expect(state[key] === expected, `${key} must equal ${expected}`);
  }
  expect(
    JSON.stringify(state.residentNames) === JSON.stringify(EXPECTED_RESIDENTS),
    'resident names drifted'
  );
  const anatomy = state.anatomyFoundation;
  expect(
    anatomy?.authoredProfile === 'coherent-anatomical-limbs-v2' &&
      anatomy?.upperBodyProfile === 'anatomical-shoulder-neck-torso-v2' &&
      anatomy?.upperBodyRadialSegments === 24 &&
      anatomy?.upperBodyRingCount === 12 &&
      anatomy?.limbProfile === 'anatomical-deltoid-hand-v2' &&
      anatomy?.limbCountPerResident === 2 &&
      anatomy?.limbRingCount === 9 &&
      anatomy?.limbVertexCountPerSide === 217 &&
      anatomy?.limbIndexCountPerSide === 1224 &&
      anatomy?.deltoidBlendRingCount === 3 &&
      anatomy?.digitProfile === 'articulated-three-phalanx-v1' &&
      JSON.stringify(anatomy?.digitNames) === JSON.stringify(EXPECTED_DIGITS) &&
      anatomy?.digitCountPerResident === 10 &&
      anatomy?.digitRadialSegments === 8 &&
      anatomy?.digitRingCount === 5 &&
      anatomy?.digitVertexCount === 41 &&
      anatomy?.digitIndexCount === 216 &&
      anatomy?.digitUniqueJointCountMinimum === 3 &&
      anatomy?.digitPalmAttachmentToleranceMeters === 0.04 &&
      anatomy?.connectedSurfaceCountPerLimb === 6,
    'anatomy foundation drifted'
  );
  expect(objects.length === 4, 'exactly four resident objects are required');
  const plan = buildH3KPlan(stack);
  expect(
    JSON.stringify(plan.residents.map((resident) => resident.displayLabel)) ===
      JSON.stringify(EXPECTED_RESIDENTS),
    'resident order drifted'
  );
  expect(plan.poses.length === 3, 'pose probe count drifted');
  for (const resident of plan.residents) {
    const object = stack.source.ast.objects?.find(
      (candidate) => candidate.name === resident.objectId
    );
    const body = object?.traits?.find((trait) => trait.name === 'body');
    const clothing = object?.traits?.find((trait) => trait.name === 'clothing');
    expect(
      body?.config?.upper_body_profile === 'coherent_anatomical_limbs_v2' &&
        body?.config?.upper_body_radial_segments === 24,
      `${resident.displayLabel} anatomical source controls drifted`
    );
    expect(
      clothing?.config?.style === 'stormglass_open_civic_tunic' &&
        clothing?.config?.color === resident.wardrobeColor,
      `${resident.displayLabel} native garment controls drifted`
    );
  }
  return { status: errors.length ? 'fail' : 'pass', errors, plan };
}

function withoutAnatomicalProfile(ast) {
  const copy = structuredClone(ast);
  for (const object of copy.objects || []) {
    const body = object.traits?.find((trait) => trait.name === 'body');
    if (!body) continue;
    delete body.config.upper_body_profile;
    delete body.config.upper_body_radial_segments;
  }
  return copy;
}

function meshSha(bundle) {
  return sha256(JSON.stringify(canonical(bundle.mesh)));
}

function proveConnectedRange(indices, receipt, label) {
  const start = receipt.vertexRange.vertexStart;
  const end = start + receipt.vertexRange.vertexCount;
  const adjacency = new Map();
  const connect = (a, b) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a).add(b);
    adjacency.get(b).add(a);
  };
  const indexEnd = receipt.indexRange.indexStart + receipt.indexRange.indexCount;
  for (let offset = receipt.indexRange.indexStart; offset < indexEnd; offset += 3) {
    const triangle = [indices[offset], indices[offset + 1], indices[offset + 2]];
    if (triangle.some((vertex) => vertex < start || vertex >= end)) {
      throw new Error(`${label} index escaped its declared vertex range`);
    }
    connect(triangle[0], triangle[1]);
    connect(triangle[1], triangle[2]);
    connect(triangle[2], triangle[0]);
  }
  const visited = new Set();
  const queue = [start];
  while (queue.length) {
    const vertex = queue.shift();
    if (visited.has(vertex)) continue;
    visited.add(vertex);
    for (const neighbor of adjacency.get(vertex) || []) queue.push(neighbor);
  }
  if (visited.size !== receipt.vertexRange.vertexCount) {
    throw new Error(`${label} is not one connected surface`);
  }
  return {
    connectedVertexCount: visited.size,
    expectedVertexCount: receipt.vertexRange.vertexCount,
  };
}

/**
 * Nearest-surface gap, in emitted metres, between a digit and the arm/palm
 * surface it is supposed to grow out of.
 *
 * The digits are deliberately NOT topologically joined to the palm - the
 * contract disclaims that with `palmToDigitSharedTopologyClaimed: false` - so
 * connectivity alone cannot tell an anatomical hand from five tubes floating in
 * space. Measured 2026-08-17 at HoloScript 747c2227: every one of the 40 digits
 * sits within 16.9mm of its parent limb, so the authored 40mm tolerance carries
 * roughly 2.4x headroom over real geometry while still rejecting a detached hand.
 */
function proveDigitAttachment(positions, limb, digit) {
  const limbStart = limb.vertexRange.vertexStart;
  const limbEnd = limbStart + limb.vertexRange.vertexCount;
  const digitStart = digit.vertexRange.vertexStart;
  const digitEnd = digitStart + digit.vertexRange.vertexCount;
  let nearestSquared = Infinity;
  for (let digitVertex = digitStart; digitVertex < digitEnd; digitVertex++) {
    const digitOffset = digitVertex * 3;
    for (let limbVertex = limbStart; limbVertex < limbEnd; limbVertex++) {
      const limbOffset = limbVertex * 3;
      const dx = positions[digitOffset] - positions[limbOffset];
      const dy = positions[digitOffset + 1] - positions[limbOffset + 1];
      const dz = positions[digitOffset + 2] - positions[limbOffset + 2];
      const squared = dx * dx + dy * dy + dz * dz;
      if (squared < nearestSquared) nearestSquared = squared;
    }
  }
  return Math.sqrt(nearestSquared);
}

async function compileOne(toolchain, ast, resident) {
  return new toolchain.CharacterWebGPUCompiler({
    objectId: resident.objectId,
    entityId: `model-village-h3m-${resident.modelFamilyId}`,
    lodLevel: 0,
  }).compile(ast);
}

export async function compileH3MBundles(stack, plan) {
  const records = [];
  const baselineAst = withoutAnatomicalProfile(stack.source.ast);
  for (const resident of plan.residents) {
    const authoredOutput = await compileOne(stack.toolchain, stack.source.ast, resident);
    const repeatedOutput = await compileOne(stack.toolchain, stack.source.ast, resident);
    const baselineOutput = await compileOne(stack.toolchain, baselineAst, resident);
    if (authoredOutput !== repeatedOutput) {
      throw new Error(`${resident.displayLabel} repeated compile was not byte-identical`);
    }
    const bundle = JSON.parse(authoredOutput);
    const baseline = JSON.parse(baselineOutput);
    const upperBody = bundle.anatomy?.upperBody;
    if (
      bundle.format !== 'character-webgpu/drawspec' ||
      bundle.report?.stubbed?.length !== 0 ||
      upperBody?.schemaVersion !== 'holoscript.agent-avatar-upper-body-geometry.v1' ||
      upperBody?.profile !== 'anatomical-shoulder-neck-torso-v2' ||
      upperBody?.radialSegments !== 24 ||
      upperBody?.ringCount !== 12 ||
      upperBody?.vertexRange?.vertexCount !== 288 ||
      upperBody?.indexRange?.indexCount !== 1584 ||
      bundle.garment?.schemaVersion !== 'holoscript.agent-avatar-garment-geometry.v1' ||
      bundle.garment?.style !== 'stormglass_open_civic_tunic' ||
      bundle.garment?.fitProfile !== 'coherent-upper-body-clearance-v1'
    ) {
      throw new Error(`${resident.displayLabel} native anatomical receipt contract drifted`);
    }
    if (!Array.isArray(upperBody.upperLimbs) || upperBody.upperLimbs.length !== 2) {
      throw new Error(`${resident.displayLabel} did not emit two anatomical limbs`);
    }
    const limbTopology = [];
    const digitTopology = [];
    for (const [sideIndex, limb] of upperBody.upperLimbs.entries()) {
      const expectedSide = sideIndex === 0 ? 'left' : 'right';
      if (
        limb.profile !== 'anatomical-deltoid-hand-v2' ||
        limb.side !== expectedSide ||
        limb.radialSegments !== 24 ||
        limb.ringCount !== 9 ||
        limb.deltoidBlendRingCount !== 3 ||
        !(limb.shoulderOverlapDepth > 0.02) ||
        limb.connectedSurfaceCount !== 6 ||
        limb.vertexRange?.vertexCount !== 217 ||
        limb.indexRange?.indexCount !== 1224 ||
        JSON.stringify(limb.digits?.map((digit) => digit.digit)) !== JSON.stringify(EXPECTED_DIGITS)
      ) {
        throw new Error(`${resident.displayLabel} ${expectedSide} limb receipt drifted`);
      }
      limbTopology.push({
        side: expectedSide,
        ...proveConnectedRange(
          bundle.mesh.indices,
          limb,
          `${resident.displayLabel} ${expectedSide} limb`
        ),
      });
      for (const digit of limb.digits) {
        if (
          digit.profile !== 'articulated-three-phalanx-v1' ||
          digit.radialSegments !== 8 ||
          digit.ringCount !== 5 ||
          digit.phalanxSegmentCount !== 3 ||
          digit.vertexRange?.vertexCount !== 41 ||
          digit.indexRange?.indexCount !== 216 ||
          !(digit.tipRadius < digit.baseRadius)
        ) {
          throw new Error(
            `${resident.displayLabel} ${expectedSide} ${digit.digit} receipt drifted`
          );
        }
        const topology = proveConnectedRange(
          bundle.mesh.indices,
          digit,
          `${resident.displayLabel} ${expectedSide} ${digit.digit}`
        );
        const jointIndices = bundle.mesh.jointIndices.slice(
          digit.vertexRange.vertexStart,
          digit.vertexRange.vertexStart + digit.vertexRange.vertexCount
        );
        if (jointIndices.some((joint) => joint < 0 || joint >= bundle.jointCount)) {
          throw new Error(
            `${resident.displayLabel} ${expectedSide} ${digit.digit} joint escaped rig`
          );
        }
        digitTopology.push({
          side: expectedSide,
          digit: digit.digit,
          ...topology,
          uniqueJointCount: new Set(jointIndices).size,
          palmAttachmentMeters: proveDigitAttachment(bundle.mesh.positions, limb, digit),
        });
      }
    }
    const authoredMeshSha = meshSha(bundle);
    const baselineMeshSha = meshSha(baseline);
    if (baseline.anatomy?.upperBody !== undefined || baselineMeshSha === authoredMeshSha) {
      throw new Error(`${resident.displayLabel} stripped anatomy causal delta failed`);
    }
    records.push({
      ...resident,
      bundle,
      geometrySha256: authoredMeshSha,
      repeatedCompileSha256: sha256(repeatedOutput),
      limbTopology,
      digitTopology,
      comparisons: {
        strippedAnatomy: {
          baselineReceiptAbsent: baseline.anatomy?.upperBody === undefined,
          geometryChanged: baselineMeshSha !== authoredMeshSha,
          vertexDelta: bundle.vertexCount - baseline.vertexCount,
          baselineGeometrySha256: baselineMeshSha,
        },
      },
    });
  }
  return { records };
}

function validateManifest(root) {
  const manifestPath = path.join(root, MANIFEST_REL);
  if (!existsSync(manifestPath)) return { status: 'missing', errors: ['manifest missing'] };
  const text = readFileSync(manifestPath, 'utf8');
  const bindings = [
    [SOURCE_REL, /sourceSha256:\s*"([0-9a-f]{64})"/],
    [POLICY_REL, /policySha256:\s*"([0-9a-f]{64})"/],
    [SEED_REL, /seedSha256:\s*"([0-9a-f]{64})"/],
    [
      'scripts/check-hololand-model-village-character-appearance-h3m.mjs',
      /checkerSha256:\s*"([0-9a-f]{64})"/,
    ],
    [
      'scripts/__tests__/hololand-model-village-character-appearance-h3m.test.mjs',
      /testSha256:\s*"([0-9a-f]{64})"/,
    ],
    [REPORT_REL, /reportSha256:\s*"([0-9a-f]{64})"/],
    [HERO_REL, /heroSha256:\s*"([0-9a-f]{64})"/],
  ];
  const errors = [];
  for (const [relative, pattern] of bindings) {
    const match = text.match(pattern);
    const absolute = path.join(root, relative);
    if (!match || !existsSync(absolute) || match[1] !== sha256File(absolute)) {
      errors.push(`${relative} manifest binding drifted`);
    }
  }
  return { status: errors.length ? 'fail' : 'pass', errors };
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    root: ROOT,
    holoScriptRoot: DEFAULT_HOLOSCRIPT_ROOT,
    outputDir: path.join(ROOT, OUTPUT_REL),
    requireManifest: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--require-manifest') options.requireManifest = true;
    else if (arg === '--output-dir') options.outputDir = path.resolve(argv[++index]);
  }
  return options;
}

export async function runCharacterAppearanceH3M(options = parseArgs([])) {
  const stack = await parseH3MStack(options.root, options.holoScriptRoot, options.outputDir);
  try {
    const validation = validateH3MContract(stack, options.root, options.holoScriptRoot);
    if (validation.status !== 'pass') throw new Error(validation.errors.join('\n'));
    const compiled = await compileH3MBundles(stack, validation.plan);
    // Enforce the two authored hand floors. Both were computed and discarded
    // before 2026-08-17: a de-articulated digit (every ring bound to the palm
    // bone) and a hand translated 0.75m off the wrist both produced a green
    // receipt, because nothing read the numbers back. The floors live in the
    // .holo so they are authored evidence rather than checker constants.
    const authoredAnatomy = stack.contract.state.anatomyFoundation;
    const digitTopologies = compiled.records.flatMap((record) => record.digitTopology);
    const minimumDigitUniqueJointCount = Math.min(
      ...digitTopologies.map((digit) => digit.uniqueJointCount)
    );
    const maximumDigitPalmAttachmentMeters = Math.max(
      ...digitTopologies.map((digit) => digit.palmAttachmentMeters)
    );
    if (minimumDigitUniqueJointCount < authoredAnatomy.digitUniqueJointCountMinimum) {
      throw new Error(
        `digit articulation collapsed: a digit binds ${minimumDigitUniqueJointCount} distinct ` +
          `joints, below the authored floor of ${authoredAnatomy.digitUniqueJointCountMinimum}`
      );
    }
    if (maximumDigitPalmAttachmentMeters > authoredAnatomy.digitPalmAttachmentToleranceMeters) {
      throw new Error(
        `digit detached from palm: nearest-surface gap of ` +
          `${maximumDigitPalmAttachmentMeters.toFixed(4)}m exceeds the authored tolerance of ` +
          `${authoredAnatomy.digitPalmAttachmentToleranceMeters}m`
      );
    }
    const clearance = await proveH3KPoseClearance(
      compiled,
      validation.plan,
      options.holoScriptRoot,
      options.outputDir,
      { esbuild: stack.esbuild }
    );
    const manifest = options.requireManifest
      ? validateManifest(options.root)
      : { status: 'not-required', errors: [] };
    if (manifest.status === 'fail' || manifest.status === 'missing') {
      throw new Error(manifest.errors.join('\n'));
    }
    const receipt = {
      schema: 'hololand.model-village.character-appearance-h3m-witness.v1',
      status: 'pass',
      generatedAt: new Date().toISOString(),
      source: {
        path: SOURCE_REL,
        sha256: sha256(stack.sourceText),
        inheritedPath: INHERITED_REL,
        inheritedSha256: sha256File(path.join(options.root, INHERITED_REL)),
        upstreamHoloScriptCommit: stack.contract.metadata.upstreamHoloScriptCommit,
      },
      policy: { path: POLICY_REL, sha256: sha256(stack.policyText) },
      seed: { path: SEED_REL, sha256: sha256(stack.seedText) },
      admission: {
        compilerTarget: 'character-webgpu',
        compilerEntrypoint: 'CharacterWebGPUCompiler.compile',
        nativeBundleCount: compiled.records.length,
        upperBodyReceiptCount: compiled.records.length,
        limbReceiptCount: compiled.records.reduce(
          (sum, record) => sum + record.bundle.anatomy.upperBody.upperLimbs.length,
          0
        ),
        digitReceiptCount: compiled.records.reduce(
          (sum, record) => sum + record.digitTopology.length,
          0
        ),
        connectedSurfaceCount: compiled.records.reduce(
          (sum, record) =>
            sum +
            record.bundle.anatomy.upperBody.upperLimbs.reduce(
              (limbSum, limb) => limbSum + limb.connectedSurfaceCount,
              0
            ),
          0
        ),
        tailoredGarmentReceiptCount: compiled.records.filter(
          (record) => record.bundle.garment?.fitProfile === 'coherent-upper-body-clearance-v1'
        ).length,
        poseClearanceReceiptCount: clearance.receipts.length,
        triangleIntersectionCount: clearance.receipts.reduce(
          (sum, item) => sum + item.triangleIntersectionCount,
          0
        ),
        minimumClearanceMeters: Math.min(
          ...clearance.receipts.map((item) => item.minimumClearanceMeters)
        ),
        minimumCoveredRayRatio: Math.min(...clearance.receipts.map((item) => item.coveredRayRatio)),
        minimumDigitUniqueJointCount,
        maximumDigitPalmAttachmentMeters,
        repeatedCompileByteIdentity: true,
        strippedAnatomyDelta: compiled.records.every(
          (record) => record.comparisons.strippedAnatomy.geometryChanged
        ),
      },
      records: compiled.records.map((record) => ({
        objectId: record.objectId,
        displayLabel: record.displayLabel,
        modelFamilyId: record.modelFamilyId,
        geometrySha256: record.geometrySha256,
        upperBody: record.bundle.anatomy.upperBody,
        limbTopology: record.limbTopology,
        digitTopology: record.digitTopology,
        garment: record.bundle.garment,
      })),
      poseClearance: clearance.receipts,
      manifest,
      boundaries: {
        providerModelBinding: 'absent',
        palmToDigitSharedTopologyClaimed: false,
        freshRtxBenchmarkClaimed: false,
        historicalRtxEvidenceCountsAsCurrent: false,
        sceneWebgpuRenderingClaimed: false,
        nativeWebgpuTaaClaimed: false,
        gpuTimestampFrameTimeClaimed: false,
        questWebxrMeasured: false,
        productionSkinTexturingClaimed: false,
        productionGroomClaimed: false,
        photorealismClaimed: false,
      },
    };
    const finalReceipt = {
      ...receipt,
      receiptSha256: sha256(JSON.stringify(canonical(receipt))),
    };
    const receiptDir = path.join(options.outputDir, 'final');
    mkdirSync(receiptDir, { recursive: true });
    const receiptPath = path.join(receiptDir, 'character-appearance-h3m-witness.json');
    writeFileSync(receiptPath, `${JSON.stringify(finalReceipt, null, 2)}\n`, 'utf8');
    return { receipt: finalReceipt, receiptPath, compiled, clearance };
  } finally {
    stack.esbuild.stop?.();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCharacterAppearanceH3M(parseArgs())
    .then(({ receipt, receiptPath }) => {
      console.log(
        JSON.stringify(
          {
            status: receipt.status,
            receiptSha256: receipt.receiptSha256,
            receiptPath,
            ...receipt.admission,
          },
          null,
          2
        )
      );
    })
    .catch((error) => {
      console.error(error?.stack || error?.message || String(error));
      process.exitCode = 1;
    });
}
