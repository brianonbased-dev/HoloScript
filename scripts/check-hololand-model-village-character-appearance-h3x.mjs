#!/usr/bin/env node
/* global WebSocket */

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveHoloScriptRoot } from './lib/model-village-holoscript-root.mjs';
import { validateUpstreamCommitPin } from './lib/model-village-upstream-commit-pin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOLOSCRIPT_ROOT = resolveHoloScriptRoot({
  gate: 'H3X',
  // Kept, not deleted: sibling gates derive their runner source by string-substituting
  // this file and assert on this exact literal, so removing it breaks their anchors.
  // The path does not exist, so the resolver tries it and falls through to a real tree.
  candidates: ['C:/holorepo-worktrees/holoscript-h3x-cranial-expression-normals-proof'],
});
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3x-cranial-expression-normals.holo';
const POLICY_REL =
  'source/proofs/model-village-character-appearance-h3x-cranial-expression-normals-policy.hsplus';
const SEED_REL =
  'source/proofs/model-village-character-appearance-h3x-cranial-expression-normals-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3x-cranial-expression-normals-manifest.holo';
const CHECKER_REL = 'scripts/check-hololand-model-village-character-appearance-h3x.mjs';
const TEST_REL =
  'scripts/__tests__/hololand-model-village-character-appearance-h3x.test.mjs';
const REPORT_REL =
  'docs/reports/model-village-character-appearance-h3x-cranial-expression-normals-2026-07-29.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-appearance-h3x-cranial-expression-normals-2026-07-29.png';
const EVIDENCE_REL =
  'docs/assets/model-village/model-village-character-appearance-h3x-cranial-expression-normals-2026-07-29.json';
const OUTPUT_REL = '.tmp/hololand/model-village/character-appearance-h3x';
const EXPECTED_COMMIT = 'df6ebcd00b5e36fa6bc5fcc8ed8dde36dbd655c2';
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];
const RENDER_SIZE = 512;
const CLEAR = [0.008, 0.031, 0.067, 1];
const LIGHT = [0.72, 0.28, 0.63];
const CAMERA = [0, 1.05, 6];
const HASH_BINDINGS = [
  ['upstreamAvatarMeshPath', 'upstreamAvatarMeshSha256'],
  ['upstreamAvatarMorphPath', 'upstreamAvatarMorphSha256'],
  ['upstreamHostBridgePath', 'upstreamHostBridgeSha256'],
  ['upstreamRendererPath', 'upstreamRendererSha256'],
];

// The HEAD-equality assertion this replaced demanded one exact commit; eighteen gates
// demanded eighteen different ones, so the set could never be satisfied at once. See
// scripts/lib/model-village-upstream-commit-pin.mjs for the full reasoning.
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256(readFileSync(filePath));
}

function sha256PortableFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (['.holo', '.hsplus', '.hs', '.mjs', '.md', '.json'].includes(extension)) {
    return sha256(readFileSync(filePath, 'utf8').replaceAll('\r\n', '\n'));
  }
  return sha256File(filePath);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (ArrayBuffer.isView(value)) return Array.from(value);
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

function properties(node) {
  return Object.fromEntries(
    (node?.properties || []).map((property) => [property.key, property.value])
  );
}

function trait(node, name) {
  return node?.traits?.find((candidate) => candidate.name === name);
}

function gitHead(root) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  return result.status === 0 ? String(result.stdout).trim() : null;
}

function sourcePath(root, relative) {
  return path.join(root, relative).replaceAll('\\', '/');
}

async function loadH3XToolchain(holoScriptRoot, outputDir) {
  const workspaceRequire = createRequire(path.join(holoScriptRoot, 'package.json'));
  const esbuild = await import(pathToFileURL(workspaceRequire.resolve('esbuild')).href);
  mkdirSync(outputDir, { recursive: true });
  const parserPath = path.join(outputDir, 'h3x-native-parsers.mjs');
  const compilerPath = path.join(outputDir, 'h3x-character-webgpu-compiler.mjs');
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
      sourcefile: 'h3x-native-parsers.entry.ts',
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
    format: 'esm',
    platform: 'node',
    target: ['node20'],
    sourcemap: false,
    logLevel: 'silent',
    loader: { '.wgsl': 'text' },
    plugins: [
      {
        name: 'h3x-character-render-source-resolution',
        setup(build) {
          build.onResolve({ filter: /^@holoscript\/engine$/ }, () => ({
            path: 'h3x-character-render-source',
            namespace: 'h3x-character-render',
          }));
          build.onLoad({ filter: /.*/, namespace: 'h3x-character-render' }, () => ({
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
      wgslRawPlugin(),
    ],
  });
  const cacheKey = `${sha256File(parserPath)}-${sha256File(compilerPath)}`;
  const parsers = await import(`${pathToFileURL(parserPath).href}?sha=${cacheKey}`);
  const compiler = await import(`${pathToFileURL(compilerPath).href}?sha=${cacheKey}`);
  return { esbuild, toolchain: { ...parsers, ...compiler } };
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    root: ROOT,
    holoScriptRoot: DEFAULT_HOLOSCRIPT_ROOT,
    browser: null,
    outputDir: path.join(ROOT, OUTPUT_REL),
    writeArtifacts: false,
    skipManifest: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') options.root = path.resolve(argv[++index]);
    else if (arg === '--holoscript-root') options.holoScriptRoot = path.resolve(argv[++index]);
    else if (arg === '--browser') options.browser = argv[++index];
    else if (arg === '--output-dir') options.outputDir = path.resolve(argv[++index]);
    else if (arg === '--write-artifacts') options.writeArtifacts = true;
    else if (arg === '--skip-manifest') options.skipManifest = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node ${CHECKER_REL} [options]

Options:
  --holoscript-root <path>  Pinned, built HoloScript checkout
  --browser <path>          Chrome or Edge executable
  --output-dir <path>       Runtime and temporary screenshot directory
  --write-artifacts         Refresh the durable PNG and JSON witness
  --skip-manifest           Bootstrap before the immutable manifest exists
  --json                    Emit the complete receipt`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

export async function parseH3XStack(
  root = ROOT,
  holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT,
  outputDir = path.join(root, OUTPUT_REL)
) {
  const stack = await loadH3XToolchain(holoScriptRoot, outputDir);
  const sourceText = readFileSync(path.join(root, SOURCE_REL), 'utf8');
  const policyText = readFileSync(path.join(root, POLICY_REL), 'utf8');
  const seedText = readFileSync(path.join(root, SEED_REL), 'utf8');
  const manifestPath = path.join(root, MANIFEST_REL);
  const manifestText = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : null;
  const source = new stack.toolchain.HoloCompositionParser().parse(sourceText);
  const policy = new stack.toolchain.HoloScriptPlusParser().parse(policyText);
  const seed = new stack.toolchain.HoloScriptCodeParser().parse(seedText);
  for (const [label, parsed] of [
    ['H3X .holo', source],
    ['H3X .hsplus', policy],
    ['H3X .hs', seed],
  ]) {
    if (!parsed.success || parsed.errors.length) {
      stack.esbuild.stop?.();
      throw new Error(`${label} parse failed: ${JSON.stringify(parsed.errors)}`);
    }
  }
  const manifest = manifestText
    ? new stack.toolchain.HoloCompositionParser().parse(manifestText)
    : null;
  if (manifest && (!manifest.success || manifest.errors.length)) {
    stack.esbuild.stop?.();
    throw new Error(`H3X manifest parse failed: ${JSON.stringify(manifest.errors)}`);
  }
  const objects = (source.ast.objects || []).map((object) => ({
    objectId: object.name,
    ...properties(object),
    height: trait(object, 'body')?.config?.height,
  }));
  return {
    ...stack,
    h3xSource: source,
    h3xPolicy: policy,
    h3xSeed: seed,
    h3xManifest: manifest,
    h3xContract: {
      metadata: source.ast.metadata,
      state: properties(source.ast.state),
      objects,
    },
  };
}

export function validateH3XContract(
  stack,
  root = ROOT,
  holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT
) {
  const errors = [];
  const expect = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const { metadata, state, objects } = stack.h3xContract;
  expect(
    metadata.milestone === 'MV_CHARACTER_APPEARANCE_H3X_CRANIAL_EXPRESSION_NORMALS',
    'milestone drifted'
  );
  expect(metadata.artStyle === 'hearthlight_biorealism', 'art style drifted');
  expect(metadata.upstreamHoloScriptCommit === EXPECTED_COMMIT, 'commit pin drifted');
  for (const failure of upstreamPinFailures(holoScriptRoot, metadata)) expect(false, failure);
  for (const [pathKey, hashKey] of HASH_BINDINGS) {
    const absolute = path.join(holoScriptRoot, metadata[pathKey] || '');
    expect(existsSync(absolute), `${pathKey} does not exist`);
    if (existsSync(absolute)) {
      expect(sha256File(absolute) === metadata[hashKey], `${hashKey} drifted`);
    }
  }
  for (const [key, expected] of [
    ['residentCount', 4],
    ['providerModelBinding', 'absent'],
    ['adapterFamilyBinding', 'absent'],
    ['canonicalWritesAllowed', false],
    ['modelCallsAllowed', false],
    ['networkFetchesAllowed', false],
    ['sourceCompilerEntrypoint', 'CharacterWebGPUCompiler.compile'],
    ['browserRendererEntrypoint', 'renderCharacter'],
    ['browserRendererBackend', 'webgpu'],
    ['expressiveAnatomyProfile', 'coherent_expressive_anatomy_v7'],
    ['jointDeformationProfile', 'expressive_cranial_neck_volume_v4'],
    ['portraitCranialProfile', 'portrait_cranial_v3'],
    ['cranialNeckProfile', 'indexed_neck_cranium_stitch_v1'],
    ['expectedCranialBridgeTriangleCount', 68],
    ['maximumCranialSeamSampleGapM', 0.03],
    ['cranialNeckContinuityProfile', 'dual_influence_neck_head_stitch_v1'],
    ['expressionNormalPolicy', 'recompute_affected_v1'],
    ['expressionNormalReceiptSchema', 'holoscript.native-facial-morph.v3'],
    ['expressionNormalCounterfactualRequired', true],
    ['closeupLodLevel', 0],
    ['closeupFaceRadialSegments', 44],
    ['closeupFaceVerticalSegments', 30],
    ['distanceLodLevel', 2],
    ['distanceFaceRadialSegments', 24],
    ['distanceFaceVerticalSegments', 16],
    ['closeupLodCounterfactualRequired', true],
    ['neckBlendRingCount', 4],
    ['expectedNeckInfluencedVertexCount', 96],
    ['poseName', 'civic_conversation'],
    ['poseBoneCount', 5],
    ['expressionTraitRequired', true],
    ['minimumExpressionTargetCount', 5],
    ['asymmetricBlinkRequired', true],
    ['asymmetricBrowRequired', true],
    ['environmentLightProfile', 'analytic_three_point_v1'],
    ['environmentLightReceiptRequired', true],
    ['environmentCounterfactualRequired', true],
    ['fixedLightSkinCalibrationRequired', true],
    ['analyticPoreMicrodetailRequired', true],
    ['browserWebgpuMeasured', true],
    ['browserAdapterRequired', true],
    ['browserDeviceRequired', true],
    ['sourcePoseApplied', true],
    ['gpuTimestampMeasured', false],
    ['freshRtxBenchmarkClaimed', false],
    ['questHeadsetMeasured', false],
    ['browserWebxrMeasured', false],
    ['photorealismClaimed', false],
    ['physicallyCalibratedCameraClaimed', false],
    ['fullWorldPerformanceClaimed', false],
  ]) {
    expect(state[key] === expected, `${key} must equal ${expected}`);
  }
  expect(
    JSON.stringify(state.residentNames) === JSON.stringify(EXPECTED_RESIDENTS),
    'resident names drifted'
  );
  expect(
    JSON.stringify(state.neckInfluenceWeights) === JSON.stringify([0.08, 0.22, 0.45, 0.2]),
    'neck influence weights drifted'
  );
  expect(objects.length === 4, 'exactly four residents are required');
  const residentTemplate = (stack.h3xSource.ast.templates || []).find(
    (template) => template.name === 'StormglassH3XNamedModelResident'
  );
  const lodLevels = trait(residentTemplate, 'lod')?.config?.levels;
  expect(Array.isArray(lodLevels) && lodLevels.length === 3, 'three authored LOD tiers required');
  expect(
    lodLevels?.[0]?.face_radial_segments === 44 &&
      lodLevels?.[0]?.face_vertical_segments === 30 &&
      lodLevels?.[2]?.face_radial_segments === 24 &&
      lodLevels?.[2]?.face_vertical_segments === 16,
    'authored close-up and distance face budgets drifted'
  );
  for (const [index, object] of (stack.h3xSource.ast.objects || []).entries()) {
    const values = properties(object);
    const body = trait(object, 'body')?.config;
    const face = trait(object, 'face')?.config;
    const skin = trait(object, 'subsurface_scattering')?.config;
    const expression = trait(object, 'expression')?.config;
    const environmentLight = trait(object, 'environment_light')?.config;
    const pose = trait(object, 'pose')?.config;
    expect(values.displayLabel === EXPECTED_RESIDENTS[index], `resident ${index} label drifted`);
    expect(
      body?.upper_body_profile === 'coherent_expressive_anatomy_v7',
      `${values.displayLabel} expressive body profile drifted`
    );
    expect(
      [
        body?.left_scapular_elevation,
        body?.right_scapular_elevation,
        body?.left_scapular_protraction,
        body?.right_scapular_protraction,
      ].every(Number.isFinite) &&
        body.left_scapular_elevation !== body.right_scapular_elevation &&
        body.left_scapular_protraction !== body.right_scapular_protraction,
      `${values.displayLabel} asymmetric scapular controls drifted`
    );
    expect(
      face?.topology === 'neutral_anatomical_v2' &&
        face?.facial_detail_profile === 'portrait_cranial_v3' &&
        face?.expression_normal_policy === 'recompute_affected_v1',
      `${values.displayLabel} portrait face profile drifted`
    );
    expect(
      Number.isFinite(face?.cheekbone_scale) &&
        Number.isFinite(face?.chin_projection) &&
        Number.isFinite(face?.temple_width),
      `${values.displayLabel} silhouette controls are missing`
    );
    expect(
      skin?.material_calibration_profile === 'fixed_light_human_v1' &&
        skin?.microdetail_profile === 'analytic_pore_v1' &&
        skin?.surface_response_profile === 'calibrated_skin_surface_v1',
      `${values.displayLabel} calibrated skin contract drifted`
    );
    expect(
      pose?.name === 'civic_conversation' &&
        Object.keys(pose?.bones || {}).sort().join(',') ===
          'left_shoulder,left_upper_arm,neck,right_shoulder,right_upper_arm',
      `${values.displayLabel} source pose drifted`
    );
    expect(
      [
        expression?.blink_left,
        expression?.blink_right,
        expression?.brow_raise_left,
        expression?.brow_raise_right,
        expression?.smile,
        expression?.jaw_open,
      ].every(Number.isFinite) &&
        expression.blink_left !== expression.blink_right &&
        expression.brow_raise_left !== expression.brow_raise_right,
      `${values.displayLabel} source expression drifted`
    );
    expect(
      environmentLight?.profile === 'analytic_three_point_v1' &&
        Number.isFinite(environmentLight.key_intensity) &&
        Number.isFinite(environmentLight.fill_intensity) &&
        Number.isFinite(environmentLight.rim_intensity) &&
        Number.isFinite(environmentLight.exposure),
      `${values.displayLabel} environment light drifted`
    );
  }
  return {
    status: errors.length ? 'fail' : 'pass',
    errors,
    plan: objects,
  };
}

function typedArray(value) {
  return value ? Array.from(value) : null;
}

function serializeSpec(spec) {
  return {
    jointCount: spec.jointCount,
    mesh: {
      vertexCount: spec.mesh.vertexCount,
      positions: typedArray(spec.mesh.positions),
      normals: typedArray(spec.mesh.normals),
      tangents: typedArray(spec.mesh.tangents),
      indices: typedArray(spec.mesh.indices),
      jointIndices: typedArray(spec.mesh.jointIndices),
      jointWeights: typedArray(spec.mesh.jointWeights),
      secondaryJointIndices: typedArray(spec.mesh.secondaryJointIndices),
      secondaryJointWeights: typedArray(spec.mesh.secondaryJointWeights),
      uvs: typedArray(spec.mesh.uvs),
    },
    jointMatrices: typedArray(spec.jointMatrices),
    modelMatrix: typedArray(spec.modelMatrix),
    materialGroups: spec.materialGroups,
  };
}

function wgslRawPlugin() {
  return {
    name: 'h3x-wgsl-raw',
    setup(build) {
      build.onResolve({ filter: /\.wgsl/ }, (args) => ({
        path: path.resolve(args.resolveDir, args.path.replace(/\?raw$/u, '')),
        namespace: 'h3x-wgsl-raw',
      }));
      build.onLoad({ filter: /.*/, namespace: 'h3x-wgsl-raw' }, (args) => ({
        contents: readFileSync(args.path, 'utf8'),
        loader: 'text',
      }));
    },
  };
}

async function buildNodeHostRuntime(stack, holoScriptRoot, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  const outfile = path.join(outputDir, 'h3x-host-runtime.mjs');
  await stack.esbuild.build({
    stdin: {
      contents: `
        export {
          buildCharacterHostFromComposition,
        } from './packages/engine/src/character-render/CharacterHostFromComposition.ts';
        export {
          deriveCharacterDetailFrame,
        } from './packages/engine/src/character-render/character-render.ts';
      `,
      resolveDir: holoScriptRoot,
      sourcefile: 'h3x-host-runtime.entry.ts',
      loader: 'ts',
    },
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: ['node20'],
    loader: { '.wgsl': 'text' },
    sourcemap: false,
    logLevel: 'silent',
    plugins: [wgslRawPlugin()],
  });
  return import(`${pathToFileURL(outfile).href}?sha=${sha256File(outfile)}`);
}

async function bundleBrowserRuntime(stack, holoScriptRoot) {
  const result = await stack.esbuild.build({
    stdin: {
      contents: `
        import {
          renderCharacter,
        } from './packages/engine/src/character-render/character-render.ts';
        window.__H3X_RUNTIME__ = { renderCharacter };
      `,
      resolveDir: holoScriptRoot,
      sourcefile: 'h3x-browser-runtime.entry.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome120'],
    loader: { '.wgsl': 'text' },
    write: false,
    legalComments: 'none',
    minify: true,
    logLevel: 'silent',
    plugins: [wgslRawPlugin()],
  });
  assert(result.outputFiles?.length === 1, 'browser runtime bundle was not emitted');
  return result.outputFiles[0].text;
}

function expressionNormalCounterfactualAst(ast, objectId) {
  const clone = structuredClone(ast);
  const object = (clone.objects || []).find((candidate) => candidate.name === objectId);
  const face = trait(object, 'face');
  assert(face, `${objectId} face trait is missing`);
  face.config.expression_normal_policy = 'legacy_static_v1';
  return clone;
}

function typedArraySha256(value) {
  return sha256(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
}

async function buildCompiledPayload(stack, plan, holoScriptRoot, outputDir) {
  const hostRuntime = await buildNodeHostRuntime(stack, holoScriptRoot, outputDir);
  const residents = [];
  const compilerRecords = [];
  for (const resident of plan) {
    const compile = () =>
      new stack.toolchain.CharacterWebGPUCompiler({
        objectId: resident.objectId,
        entityId: `model-village-h3x-${resident.modelFamilyId}`,
        lodLevel: 0,
      }).compile(stack.h3xSource.ast);
    const first = await compile();
    const second = await compile();
    assert(first === second, `${resident.displayLabel} compile drifted`);
    const bundle = JSON.parse(first);
    assert(bundle.format === 'character-webgpu/drawspec', 'compiler output format drifted');
    assert(bundle.report?.stubbed?.length === 0, `${resident.displayLabel} compiler stubbed`);
    const built = hostRuntime.buildCharacterHostFromComposition(stack.h3xSource.ast, {
      objectId: resident.objectId,
      entityId: `model-village-h3x-${resident.modelFamilyId}-host`,
      lodLevel: 0,
    });
    assert(
      built.ok && built.host && built.report?.stubbed?.length === 0,
      `${resident.displayLabel} host bridge failed`
    );
    const staticNormalBuilt = hostRuntime.buildCharacterHostFromComposition(
      expressionNormalCounterfactualAst(stack.h3xSource.ast, resident.objectId),
      {
        objectId: resident.objectId,
        entityId: `model-village-h3x-${resident.modelFamilyId}-static-normals`,
        lodLevel: 0,
      }
    );
    const distanceBuilt = hostRuntime.buildCharacterHostFromComposition(stack.h3xSource.ast, {
      objectId: resident.objectId,
      entityId: `model-village-h3x-${resident.modelFamilyId}-distance`,
      lodLevel: 2,
    });
    assert(
      staticNormalBuilt.ok &&
        staticNormalBuilt.host &&
        staticNormalBuilt.report?.stubbed?.length === 0,
      `${resident.displayLabel} static-normal counterfactual failed`
    );
    assert(
      distanceBuilt.ok && distanceBuilt.host && distanceBuilt.report?.stubbed?.length === 0,
      `${resident.displayLabel} distance-LOD counterfactual failed`
    );
    assert(
      built.anatomy?.upperBody?.profile === 'expressive-anatomy-v7',
      `${resident.displayLabel} upper-body receipt drifted`
    );
    assert(
      built.jointDeformation?.profile === 'expressive-cranial-neck-volume-v4' &&
        built.jointDeformation?.regionVertexCounts?.neck === 96 &&
        built.jointDeformation?.regionVertexCounts?.cranialNeck === 68 &&
        built.jointDeformation?.expressiveAsymmetry?.neckBlendRingCount === 4 &&
        JSON.stringify(built.jointDeformation.expressiveAsymmetry.neckInfluenceWeights) ===
          JSON.stringify([0.08, 0.22, 0.45, 0.2]) &&
        built.jointDeformation?.cranialNeckContinuity?.profile ===
          'dual-influence-neck-head-stitch-v1',
      `${resident.displayLabel} expressive cranial/neck receipt drifted`
    );
    assert(
      built.facialLandmarks?.profile === 'portrait-cranial-v3' &&
        built.facialLandmarks?.radialSegments === 44 &&
        built.facialLandmarks?.verticalSegments === 30,
      `${resident.displayLabel} portrait-cranial receipt drifted`
    );
    assert(
        built.anatomy?.cranialNeck?.profile === 'indexed-neck-cranium-stitch-v1' &&
        built.anatomy?.cranialNeck?.bridgeTriangleCount === 68 &&
        built.anatomy?.cranialNeck?.maxSeamGap <= 0.03,
      `${resident.displayLabel} indexed cranial-neck stitch drifted`
    );
    assert(
      built.lod?.faceRadialSegments === 44 &&
        built.lod?.faceVerticalSegments === 30 &&
        distanceBuilt.lod?.faceRadialSegments === 24 &&
        distanceBuilt.lod?.faceVerticalSegments === 16,
      `${resident.displayLabel} authored facial LOD selection drifted`
    );
    assert(
      built.pose?.name === 'civic_conversation' && built.pose?.boneCount === 5,
      `${resident.displayLabel} source pose was not applied`
    );
    assert(
      built.expression?.schemaVersion === 'holoscript.native-facial-morph.v3' &&
        built.expression?.normalPolicy === 'recompute-affected-v1' &&
        built.expression?.normalsRecomputed === true &&
        built.expression?.normalAffectedVertexCount > 0 &&
        built.expression?.normalChangedVertexCount > 0 &&
        built.expression?.normalTriangleCount > 0 &&
        typeof built.expression?.normalDigest === 'string' &&
        built.expression.appliedTargets?.length >= 5 &&
        built.expression.appliedTargets.some((entry) => entry.target === 'blink_left') &&
        built.expression.appliedTargets.some((entry) => entry.target === 'blink_right') &&
        built.expression.appliedTargets.some((entry) => entry.target === 'brow_raise_left') &&
        built.expression.appliedTargets.some((entry) => entry.target === 'brow_raise_right'),
      `${resident.displayLabel} source expression receipt drifted`
    );
    assert(
      staticNormalBuilt.expression?.normalsRecomputed === false &&
        staticNormalBuilt.expression?.schemaVersion === 'holoscript.native-facial-morph.v2' &&
        staticNormalBuilt.expression?.positionDigest === built.expression?.positionDigest,
      `${resident.displayLabel} expression-normal counterfactual is not isolated`
    );
    assert(
      built.environmentLight?.receipt?.profile === 'analytic-three-point-v1' &&
        built.environmentLight.receipt.key.intensity > 0 &&
        built.environmentLight.receipt.fill.intensity > 0 &&
        built.environmentLight.receipt.rim.intensity > 0,
      `${resident.displayLabel} environment light receipt drifted`
    );
    assert(
      built.host.getSkinMaterialReceipt()?.calibrationProfile === 'fixed-light-human-v1',
      `${resident.displayLabel} fixed-light skin receipt drifted`
    );
    built.host.applyWorldState({
      position: { x: 0, y: 0, z: 0 },
      rotationY: -0.08,
    });
    staticNormalBuilt.host.applyWorldState({
      position: { x: 0, y: 0, z: 0 },
      rotationY: -0.08,
    });
    distanceBuilt.host.applyWorldState({
      position: { x: 0, y: 0, z: 0 },
      rotationY: -0.08,
    });
    const spec = built.host.getDrawSpec();
    const staticNormalSpec = staticNormalBuilt.host.getDrawSpec();
    const distanceLodSpec = distanceBuilt.host.getDrawSpec();
    assert(
      typedArraySha256(spec.mesh.positions) === typedArraySha256(staticNormalSpec.mesh.positions),
      `${resident.displayLabel} normal counterfactual changed positions`
    );
    assert(
      typedArraySha256(spec.mesh.normals) !== typedArraySha256(staticNormalSpec.mesh.normals),
      `${resident.displayLabel} expression normal buffer did not change`
    );
    assert(
      spec.mesh.vertexCount > distanceLodSpec.mesh.vertexCount,
      `${resident.displayLabel} close-up LOD did not increase vertex count`
    );
    assert(
      spec.mesh.secondaryJointIndices?.length === spec.mesh.vertexCount &&
        spec.mesh.secondaryJointWeights?.length === spec.mesh.vertexCount,
      `${resident.displayLabel} secondary deformation channels are missing`
    );
    const frameRanges = [
      built.anatomy.cranialNeck.cranialVertexRange,
      built.facialLandmarks.vertexRange,
    ];
    const frame = hostRuntime.deriveCharacterDetailFrame(spec.mesh, frameRanges, {
      padding: 1.08,
      minHalfExtent: 0.18,
    });
    residents.push({
      objectId: resident.objectId,
      displayLabel: resident.displayLabel,
      modelFamilyId: resident.modelFamilyId,
      accentColor: resident.accentColor,
      heightScale: resident.height / 1.82,
      spec: serializeSpec(spec),
      staticNormalSpec: serializeSpec(staticNormalSpec),
      distanceLodSpec: serializeSpec(distanceLodSpec),
      viewProj: typedArray(frame.matrix),
      environmentLight: canonical(built.environmentLight.options),
    });
    compilerRecords.push({
      objectId: resident.objectId,
      displayLabel: resident.displayLabel,
      modelFamilyId: resident.modelFamilyId,
      outputSha256: sha256(first),
      byteLength: Buffer.byteLength(first),
      repeatedCompileByteIdentity: true,
      vertexCount: spec.mesh.vertexCount,
      indexCount: spec.mesh.indices.length,
      materialGroupCount: spec.materialGroups.length,
      upperBodyProfile: built.anatomy.upperBody.profile,
      closeupLod: canonical(built.lod),
      distanceLod: canonical(distanceBuilt.lod),
      cranialNeck: canonical(built.anatomy.cranialNeck),
      jointDeformation: canonical(built.jointDeformation),
      facialLandmarks: canonical(built.facialLandmarks),
      expression: canonical(built.expression),
      staticNormalExpression: canonical(staticNormalBuilt.expression),
      closeupVertexCount: spec.mesh.vertexCount,
      distanceVertexCount: distanceLodSpec.mesh.vertexCount,
      positionCounterfactualByteIdentity:
        typedArraySha256(spec.mesh.positions) === typedArraySha256(staticNormalSpec.mesh.positions),
      environmentLight: canonical(built.environmentLight.receipt),
      pose: canonical(built.pose),
      skinMaterial: canonical(built.host.getSkinMaterialReceipt()),
    });
  }
  return {
    payload: {
      schema: 'hololand.model-village.character-appearance-h3x-browser-payload.v1',
      renderSize: RENDER_SIZE,
      clear: CLEAR,
      light: LIGHT,
      camera: CAMERA,
      residents,
    },
    compilerRecords,
  };
}

function safeInlineJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
}

function browserApplication() {
  return String.raw`
(() => {
  const payload = window.__H3X_PAYLOAD__;
  const runtime = window.__H3X_RUNTIME__;
  const state = {
    schema: 'hololand.model-village.character-appearance-h3x-browser-state.v1',
    ready: false,
    status: 'booting',
    gpu: null,
    residents: [],
    errors: [],
  };
  window.__H3X__ = state;

  const hydrateSpec = (value) => ({
    jointCount: value.jointCount,
    mesh: {
      vertexCount: value.mesh.vertexCount,
      positions: new Float32Array(value.mesh.positions),
      normals: new Float32Array(value.mesh.normals),
      tangents: new Float32Array(value.mesh.tangents),
      indices: new Uint32Array(value.mesh.indices),
      jointIndices: new Uint32Array(value.mesh.jointIndices),
      jointWeights: new Float32Array(value.mesh.jointWeights),
      secondaryJointIndices: value.mesh.secondaryJointIndices
        ? new Uint32Array(value.mesh.secondaryJointIndices)
        : undefined,
      secondaryJointWeights: value.mesh.secondaryJointWeights
        ? new Float32Array(value.mesh.secondaryJointWeights)
        : undefined,
      uvs: new Float32Array(value.mesh.uvs),
    },
    jointMatrices: new Float32Array(value.jointMatrices),
    modelMatrix: new Float32Array(value.modelMatrix),
    materialGroups: value.materialGroups,
  });

  const gridSha256 = async (grid) => {
    const bytes = new Uint8Array(grid.data.buffer, grid.data.byteOffset, grid.data.byteLength);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  };

  const imageMetrics = (grid) => {
    const clear = payload.clear.slice(0, 3).map((value) => Math.round(value * 255));
    let nonBackgroundPixelCount = 0;
    let minimumLuminance = 255;
    let maximumLuminance = 0;
    let luminanceSum = 0;
    for (let index = 0; index < grid.data.length; index += 4) {
      const red = grid.data[index];
      const green = grid.data[index + 1];
      const blue = grid.data[index + 2];
      const distance =
        Math.abs(red - clear[0]) + Math.abs(green - clear[1]) + Math.abs(blue - clear[2]);
      if (distance <= 12) continue;
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      nonBackgroundPixelCount += 1;
      luminanceSum += luminance;
      minimumLuminance = Math.min(minimumLuminance, luminance);
      maximumLuminance = Math.max(maximumLuminance, luminance);
    }
    return {
      nonBackgroundPixelCount,
      minimumLuminance,
      maximumLuminance,
      luminanceRange: maximumLuminance - minimumLuminance,
      meanLuminance: nonBackgroundPixelCount ? luminanceSum / nonBackgroundPixelCount : 0,
    };
  };

  const imageDifference = (before, after) => {
    let changedPixelCount = 0;
    let absoluteChannelDifference = 0;
    for (let index = 0; index < after.data.length; index += 4) {
      const red = Math.abs(after.data[index] - before.data[index]);
      const green = Math.abs(after.data[index + 1] - before.data[index + 1]);
      const blue = Math.abs(after.data[index + 2] - before.data[index + 2]);
      const pixelDifference = red + green + blue;
      absoluteChannelDifference += pixelDifference;
      if (pixelDifference > 3) changedPixelCount += 1;
    }
    return { changedPixelCount, absoluteChannelDifference };
  };

  const drawGrid = (canvas, grid) => {
    canvas.width = grid.width;
    canvas.height = grid.height;
    canvas.getContext('2d').putImageData(
      new ImageData(new Uint8ClampedArray(grid.data), grid.width, grid.height),
      0,
      0
    );
  };

  async function boot() {
    if (!navigator.gpu) throw new Error('navigator.gpu is unavailable');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('navigator.gpu.requestAdapter returned null');
    const device = await adapter.requestDevice();
    const info = adapter.info || {};
    state.gpu = {
      navigatorGpu: true,
      adapterAcquired: true,
      deviceCreated: true,
      vendor: info.vendor || '',
      architecture: info.architecture || '',
      device: info.device || '',
      description: info.description || '',
      verifiedDeviceMethods: [
        'createShaderModule',
        'createRenderPipeline',
        'createTexture',
        'createBuffer',
        'createCommandEncoder',
      ].filter((name) => typeof device[name] === 'function'),
    };
    for (const resident of payload.residents) {
      const hydrated = hydrateSpec(resident.spec);
      const staticNormalHydrated = hydrateSpec(resident.staticNormalSpec);
      const distanceLodHydrated = hydrateSpec(resident.distanceLodSpec);
      const legacyGrid = await runtime.renderCharacter(device, hydrated, {
        size: payload.renderSize,
        viewProj: new Float32Array(resident.viewProj),
        lightDir: payload.light,
        cameraPos: payload.camera,
        clear: payload.clear,
        heightScale: resident.heightScale,
      });
      const grid = await runtime.renderCharacter(device, hydrated, {
        size: payload.renderSize,
        viewProj: new Float32Array(resident.viewProj),
        cameraPos: payload.camera,
        clear: payload.clear,
        heightScale: resident.heightScale,
        environmentLight: resident.environmentLight,
      });
      const staticNormalGrid = await runtime.renderCharacter(device, staticNormalHydrated, {
        size: payload.renderSize,
        viewProj: new Float32Array(resident.viewProj),
        cameraPos: payload.camera,
        clear: payload.clear,
        heightScale: resident.heightScale,
        environmentLight: resident.environmentLight,
      });
      const distanceLodGrid = await runtime.renderCharacter(device, distanceLodHydrated, {
        size: payload.renderSize,
        viewProj: new Float32Array(resident.viewProj),
        cameraPos: payload.camera,
        clear: payload.clear,
        heightScale: resident.heightScale,
        environmentLight: resident.environmentLight,
      });
      const metrics = imageMetrics(grid);
      const environmentDifference = imageDifference(legacyGrid, grid);
      const expressionNormalDifference = imageDifference(staticNormalGrid, grid);
      const closeupLodDifference = imageDifference(distanceLodGrid, grid);
      if (metrics.nonBackgroundPixelCount < 5000) {
        throw new Error(resident.displayLabel + ' portrait coverage is too small');
      }
      if (metrics.luminanceRange < 35) {
        throw new Error(resident.displayLabel + ' material response is too flat');
      }
      if (environmentDifference.changedPixelCount <= 25) {
        throw new Error(resident.displayLabel + ' environment counterfactual is too small');
      }
      if (expressionNormalDifference.changedPixelCount <= 25) {
        throw new Error(resident.displayLabel + ' expression-normal counterfactual is too small');
      }
      if (closeupLodDifference.changedPixelCount <= 25) {
        throw new Error(resident.displayLabel + ' close-up LOD counterfactual is too small');
      }
      drawGrid(
        document.querySelector('[data-resident="' + resident.displayLabel + '"]'),
        grid
      );
      const metricsNode = document.querySelector(
        '[data-metrics="' + resident.displayLabel + '"]'
      );
      metricsNode.textContent =
        '44x30 | ' +
        expressionNormalDifference.changedPixelCount.toLocaleString() + ' normal delta px | ' +
        closeupLodDifference.changedPixelCount.toLocaleString() + ' LOD delta px';
      state.residents.push({
        displayLabel: resident.displayLabel,
        pixelSha256: await gridSha256(grid),
        renderSize: grid.width,
        metrics,
        environmentDifference,
        expressionNormalDifference,
        closeupLodDifference,
        secondaryJointWeightsConsumed: true,
      });
    }
    state.status = 'pass';
    state.ready = true;
    document.body.dataset.ready = 'true';
    document.querySelector('[data-status]').textContent =
      'Native Chrome WebGPU H3X close-up witness complete';
    device.destroy?.();
  }

  boot().catch((error) => {
    state.status = 'error';
    state.ready = true;
    state.errors.push(error.stack || error.message);
    document.body.dataset.ready = 'error';
    document.querySelector('[data-status]').textContent = error.message;
    console.error(error);
  });
})();
`;
}

function residentCards() {
  return EXPECTED_RESIDENTS.map(
    (name, index) => `
      <article class="resident resident-${index + 1}">
        <canvas data-resident="${name}" width="${RENDER_SIZE}" height="${RENDER_SIZE}"></canvas>
        <div class="copy">
          <span>0${index + 1} / symbolic model-family resident</span>
          <h2>${name}</h2>
          <p>Indexed cranium / live expression normals</p>
          <small data-metrics="${name}">Awaiting close-up GPU counterfactuals</small>
        </div>
      </article>`
  ).join('');
}

function buildHtml(payload, browserBundle) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stormglass H3X Cranial Expression Normals</title>
<style>
  :root { color-scheme:dark; --ink:#f3f5ef; --muted:#97aaa6; --line:#28413f; }
  * { box-sizing:border-box; }
  body { margin:0; width:1400px; height:900px; overflow:hidden; color:var(--ink);
    background:
      radial-gradient(circle at 14% 4%,rgba(64,154,137,.20),transparent 34%),
      radial-gradient(circle at 87% 18%,rgba(80,92,167,.18),transparent 31%),
      linear-gradient(145deg,#02070d 0%,#07151a 52%,#03080e 100%);
    font-family:Inter,Segoe UI,sans-serif; }
  body::before { content:""; position:fixed; inset:0; pointer-events:none; opacity:.22;
    background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),
      linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);
    background-size:46px 46px; }
  .shell { width:1400px; height:900px; padding:34px 48px 28px; position:relative; }
  header { display:grid; grid-template-columns:1fr 470px; align-items:end; gap:50px;
    border-bottom:1px solid var(--line); padding-bottom:18px; }
  .kicker { color:#78dcc8; text-transform:uppercase; letter-spacing:.22em;
    font:600 11px/1.2 ui-monospace,monospace; }
  h1 { margin:8px 0 0; font:500 47px/1.02 Georgia,serif; letter-spacing:-.035em; }
  .lede { color:var(--muted); font-size:14px; line-height:1.55; margin:0; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:18px; }
  .resident { height:295px; position:relative; display:grid; grid-template-columns:330px 1fr;
    background:linear-gradient(135deg,rgba(14,30,35,.95),rgba(5,14,20,.9));
    border:1px solid var(--line); border-radius:18px; overflow:hidden;
    box-shadow:0 24px 70px rgba(0,0,0,.22); }
  .resident canvas { width:295px; height:295px; margin-left:18px;
    background:radial-gradient(circle at 50% 30%,#18333a,#030912 72%); }
  .resident-1 { --accent:#62d9c0; }.resident-2 { --accent:#e3a16f; }
  .resident-3 { --accent:#829bff; }.resident-4 { --accent:#65d8e7; }
  .resident::after { content:""; position:absolute; inset:0; pointer-events:none;
    box-shadow:inset 4px 0 0 var(--accent); opacity:.9; }
  .copy { padding:72px 20px 16px; }
  .copy span { color:var(--accent); text-transform:uppercase; letter-spacing:.12em;
    font:600 8px/1.3 ui-monospace,monospace; }
  .copy h2 { margin:10px 0 7px; font:500 32px/1 Georgia,serif; }
  .copy p { color:#c4ceca; font-size:11px; margin:0 0 14px; }
  .copy small { display:block; color:var(--muted); font:9px/1.4 ui-monospace,monospace; }
  footer { margin-top:15px; display:flex; justify-content:space-between; align-items:center;
    color:var(--muted); font:11px/1.4 ui-monospace,monospace; }
  [data-status] { color:#9de3d4; }
</style>
</head>
<body>
<main class="shell">
  <header>
    <div>
      <div class="kicker">HoloScript H3X / close-up cranial fidelity</div>
      <h1>Faces that hold up<br>when you move closer.</h1>
    </div>
    <p class="lede">Four source-authored residents, rendered through the HoloScript
      character compiler and browser WebGPU path. A 44x30 cranial surface meets
      the V7 neck through an indexed stitch; expression-adjacent normals update
      deterministically while 24x16 remains an authored distance tier.</p>
  </header>
  <section class="grid">${residentCards()}</section>
  <footer>
    <span data-status>Acquiring browser GPU...</span>
    <span>44x30 vs 24x16 / recomputed vs static normals / no RTX timing claim</span>
  </footer>
</main>
<script>window.__H3X_PAYLOAD__=${safeInlineJson(payload)};</script>
<script>${browserBundle}</script>
<script>${browserApplication()}</script>
</body>
</html>`;
}

function candidateBrowsers(explicitPath) {
  if (explicitPath) return [explicitPath];
  const local = process.env.LOCALAPPDATA || '';
  const program = process.env.PROGRAMFILES || '';
  const programX86 = process.env['PROGRAMFILES(X86)'] || '';
  return [
    path.join(program, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(program, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(programX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    'chrome.exe',
    'msedge.exe',
  ].filter(Boolean);
}

function resolveBrowser(explicitPath) {
  for (const candidate of candidateBrowsers(explicitPath)) {
    if (candidate.includes(path.sep) || candidate.includes('/')) {
      if (existsSync(candidate)) return candidate;
      continue;
    }
    const probe = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [candidate], {
      stdio: 'ignore',
      windowsHide: true,
    });
    if (probe.status === 0) return candidate;
  }
  throw new Error('No Chrome or Edge executable was found');
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchJson(url, timeoutMs = 2_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForDebuggerTarget(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
      const target = targets.find(
        (candidate) => candidate.type === 'page' && candidate.webSocketDebuggerUrl
      );
      if (target) return target;
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for Chrome CDP: ${lastError?.message || 'none'}`);
}

function waitForEvent(client, method, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${method}`));
    }, timeoutMs);
    const cleanup = client.onEvent((message) => {
      if (message.method === method) {
        clearTimeout(timeout);
        cleanup();
        resolve(message.params || {});
      }
    });
  });
}

async function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  const handlers = new Set();
  let nextId = 1;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out opening CDP socket')), 10_000);
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timeout);
        reject(new Error('CDP socket error'));
      },
      { once: true }
    );
  });
  socket.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(item.timeout);
      if (message.error) item.reject(new Error(`${item.method}: ${message.error.message}`));
      else item.resolve(message.result || {});
      return;
    }
    for (const handler of handlers) handler(message);
  });
  return {
    send(method, params = {}, timeoutMs = 30_000) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method} timed out after ${timeoutMs} ms`));
        }, timeoutMs);
        pending.set(id, { method, resolve, reject, timeout });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    onEvent(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close() {
      if (socket.readyState === WebSocket.OPEN) socket.close();
    },
  };
}

async function evaluate(client, expression, timeoutMs = 30_000) {
  const result = await client.send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    timeoutMs
  );
  if (result.exceptionDetails) {
    const description =
      result.exceptionDetails.exception?.description || result.exceptionDetails.text;
    throw new Error(`Browser evaluation failed: ${description}`);
  }
  return result.result?.value;
}

async function waitForReady(client, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await evaluate(client, 'window.__H3X__?.ready === true', 5_000).catch(
      () => false
    );
    if (ready) return;
    await delay(250);
  }
  throw new Error('Timed out waiting for the H3X browser witness');
}

async function runBrowserWitness({ browserPath, html, outputDir }) {
  mkdirSync(outputDir, { recursive: true });
  const loopbackRequests = [];
  const server = createServer((request, response) => {
    loopbackRequests.push(request.url || '/');
    if (request.url === '/' || request.url?.startsWith('/index.html')) {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(html);
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address === 'object', 'loopback server did not bind');
  const profileDir = path.join(os.tmpdir(), `hololand-h3x-${process.pid}-${Date.now()}`);
  mkdirSync(profileDir, { recursive: true });
  const debuggerPort = 21_000 + Math.floor(Math.random() * 20_000);
  const launchFlags = [
    '--headless=new',
    '--use-angle=d3d11',
    '--ignore-gpu-blocklist',
    '--enable-gpu',
    '--enable-unsafe-webgpu',
    `--remote-debugging-port=${debuggerPort}`,
    `--user-data-dir=${profileDir}`,
    '--window-size=1400,900',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-dev-shm-usage',
    '--disable-features=Translate,MediaRouter',
    'about:blank',
  ];
  const browser = spawn(browserPath, launchFlags, {
    stdio: 'ignore',
    windowsHide: true,
  });
  let client;
  const exceptions = [];
  const requestedUrls = [];
  try {
    const target = await waitForDebuggerTarget(debuggerPort, 25_000);
    client = await createCdpClient(target.webSocketDebuggerUrl);
    client.onEvent((message) => {
      if (message.method === 'Runtime.exceptionThrown') {
        exceptions.push({
          text: message.params.exceptionDetails?.text || '',
          description: message.params.exceptionDetails?.exception?.description || '',
        });
      }
      if (message.method === 'Network.requestWillBeSent') {
        requestedUrls.push(message.params.request?.url || '');
      }
    });
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('Network.enable');
    const version = await client.send('Browser.getVersion');
    const loaded = waitForEvent(client, 'Page.loadEventFired', 60_000);
    await client.send('Page.navigate', {
      url: `http://127.0.0.1:${address.port}/index.html`,
    });
    await loaded;
    await waitForReady(client, 180_000);
    const state = await evaluate(client, 'JSON.parse(JSON.stringify(window.__H3X__))', 60_000);
    assert(state.status === 'pass', `browser witness failed: ${state.errors?.join('\n')}`);
    assert(state.gpu?.navigatorGpu === true, 'navigator.gpu was not observed');
    assert(state.gpu?.adapterAcquired === true, 'browser adapter was not acquired');
    assert(state.gpu?.deviceCreated === true, 'browser device was not created');
    assert(state.residents.length === 4, 'four browser residents were not witnessed');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1400,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: 1400,
      screenHeight: 900,
    });
    await evaluate(client, 'window.scrollTo(0, 0); window.scrollY', 5_000);
    await delay(100);
    const screenshot = await client.send(
      'Page.captureScreenshot',
      {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
        clip: { x: 0, y: 0, width: 1400, height: 900, scale: 1 },
      },
      60_000
    );
    const png = Buffer.from(screenshot.data, 'base64');
    const screenshotPath = path.join(outputDir, 'h3x-cranial-expression-normals.png');
    writeFileSync(screenshotPath, png);
    const externalUrls = requestedUrls.filter(
      (url) =>
        url &&
        !url.startsWith('http://127.0.0.1:') &&
        !url.startsWith('data:') &&
        url !== 'about:blank'
    );
    assert(externalUrls.length === 0, `browser made external requests: ${externalUrls.join(', ')}`);
    assert(exceptions.length === 0, `browser exceptions: ${JSON.stringify(exceptions)}`);
    return {
      state,
      screenshot: {
        path: screenshotPath,
        width: 1400,
        height: 900,
        bytes: png.length,
        sha256: sha256(png),
        png,
      },
      browser: {
        executable: browserPath,
        product: version.product || '',
        userAgent: version.userAgent || '',
        jsVersion: version.jsVersion || '',
        launchFlags,
      },
      network: {
        loopbackRequestCount: loopbackRequests.length,
        observedRequestCount: requestedUrls.length,
        externalRequestCount: externalUrls.length,
      },
      exceptions,
    };
  } finally {
    client?.close();
    if (process.platform === 'win32' && browser.pid) {
      spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
        timeout: 15_000,
      });
    } else {
      browser.kill();
    }
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 2_000);
      browser.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    server.close();
    try {
      rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Disposable browser-profile locks do not replace the render result.
    }
  }
}

function readNvidiaSmi() {
  const command = [
    '--query-gpu=name,driver_version,memory.total',
    '--format=csv,noheader,nounits',
  ];
  const result = spawnSync('nvidia-smi', command, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15_000,
  });
  return {
    command: `nvidia-smi ${command.join(' ')}`,
    status: result.status === 0 ? 'pass' : 'unavailable',
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function manifestBindings() {
  return [
    [SOURCE_REL, /sourceSha256:\s*"([0-9a-f]{64})"/u],
    [POLICY_REL, /policySha256:\s*"([0-9a-f]{64})"/u],
    [SEED_REL, /seedSha256:\s*"([0-9a-f]{64})"/u],
    [CHECKER_REL, /checkerSha256:\s*"([0-9a-f]{64})"/u],
    [TEST_REL, /testSha256:\s*"([0-9a-f]{64})"/u],
    [REPORT_REL, /reportSha256:\s*"([0-9a-f]{64})"/u],
    [HERO_REL, /heroSha256:\s*"([0-9a-f]{64})"/u],
    [EVIDENCE_REL, /evidenceSha256:\s*"([0-9a-f]{64})"/u],
  ];
}

function validateManifest(root) {
  const filePath = path.join(root, MANIFEST_REL);
  if (!existsSync(filePath)) return { status: 'missing', errors: ['manifest missing'] };
  const text = readFileSync(filePath, 'utf8');
  const errors = [];
  for (const [relativePath, pattern] of manifestBindings()) {
    const match = text.match(pattern);
    if (!match) {
      errors.push(`${relativePath} hash binding missing`);
      continue;
    }
    const absolute = path.join(root, relativePath);
    if (!existsSync(absolute)) errors.push(`${relativePath} missing`);
    else if (sha256PortableFile(absolute) !== match[1]) {
      errors.push(`${relativePath} hash drifted`);
    }
  }
  return { status: errors.length ? 'fail' : 'pass', errors };
}

export async function runCharacterAppearanceH3X(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const holoScriptRoot = path.resolve(options.holoScriptRoot || DEFAULT_HOLOSCRIPT_ROOT);
  const outputDir = path.resolve(options.outputDir || path.join(root, OUTPUT_REL));
  const stack = await parseH3XStack(root, holoScriptRoot, outputDir);
  try {
    const validation = validateH3XContract(stack, root, holoScriptRoot);
    assert(validation.status === 'pass', validation.errors.join('\n'));
    const { payload, compilerRecords } = await buildCompiledPayload(
      stack,
      validation.plan,
      holoScriptRoot,
      outputDir
    );
    const browserBundle = await bundleBrowserRuntime(stack, holoScriptRoot);
    const html = buildHtml(payload, browserBundle);
    const browserWitness = await runBrowserWitness({
      browserPath: resolveBrowser(options.browser),
      html,
      outputDir,
    });
    const receipt = {
      schema: 'hololand.model-village.character-appearance-h3x-witness.v1',
      capturedAt: new Date().toISOString(),
      status: 'pass',
      milestone: 'MV_CHARACTER_APPEARANCE_H3X_CRANIAL_EXPRESSION_NORMALS',
      sourceAdmission: {
        holoScriptCommit: gitHead(holoScriptRoot),
        sourceSha256: sha256PortableFile(path.join(root, SOURCE_REL)),
        policySha256: sha256PortableFile(path.join(root, POLICY_REL)),
        seedSha256: sha256PortableFile(path.join(root, SEED_REL)),
        residentNames: EXPECTED_RESIDENTS,
      },
      compilerAdmission: {
        target: 'character-webgpu',
        residentCount: compilerRecords.length,
        repeatedCompileByteIdentity: true,
        secondaryJointWeightsSerialized: true,
        records: compilerRecords,
      },
      browserWebgpuAdmission: {
        runtime: {
          renderer: 'HoloScript CharacterRender.renderCharacter',
          backend: 'browser_native_webgpu',
          browserUsed: true,
          threeJsUsed: false,
          r3fUsed: false,
        },
        browser: browserWitness.browser,
        gpu: browserWitness.state.gpu,
        residents: browserWitness.state.residents,
        network: browserWitness.network,
        screenshot: {
          width: browserWitness.screenshot.width,
          height: browserWitness.screenshot.height,
          bytes: browserWitness.screenshot.bytes,
          sha256: browserWitness.screenshot.sha256,
        },
      },
      hostHardwareReadback: readNvidiaSmi(),
      boundaries: {
        browserWebgpuMeasured: true,
        browserAdapterAndDeviceMeasured: true,
        sourcePoseApplied: true,
        expressiveCranialNeckVolumeReceipted: true,
        sourceExpressionApplied: true,
        portraitCranialGeometryReceipted: true,
        indexedCranialNeckStitchReceipted: true,
        expressionNormalsRecomputed: true,
        expressionNormalCounterfactualRendered: true,
        closeupLodCounterfactualRendered: true,
        faceLodBudgetsSourceAuthored: true,
        analyticThreePointEnvironmentReceipted: true,
        environmentCounterfactualRendered: true,
        gpuTimestampMeasured: false,
        freshRtxBenchmarkClaimed: false,
        questHeadsetMeasured: false,
        browserWebxrMeasured: false,
        physicallyCalibratedCameraClaimed: false,
        photorealismClaimed: false,
        fullWorldPerformanceClaimed: false,
      },
    };
    receipt.integrity = {
      canonicalSha256: sha256(canonicalJson(receipt)),
    };
    if (options.writeArtifacts) {
      writeFileSync(path.join(root, HERO_REL), browserWitness.screenshot.png);
      writeFileSync(path.join(root, EVIDENCE_REL), `${JSON.stringify(receipt, null, 2)}\n`);
    }
    if (!options.skipManifest) {
      const manifest = validateManifest(root);
      assert(manifest.status === 'pass', manifest.errors.join('\n'));
    }
    return {
      receipt,
      screenshotPath: browserWitness.screenshot.path,
      browserHtmlSha256: sha256(html),
    };
  } finally {
    stack.esbuild.stop?.();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCharacterAppearanceH3X(parseArgs())
    .then(({ receipt }) => {
      if (process.argv.includes('--json')) console.log(JSON.stringify(receipt, null, 2));
      else {
        console.log(
          `PASS H3X cranial expression normals: ${receipt.compilerAdmission.residentCount} residents; ` +
            `${receipt.browserWebgpuAdmission.residents.length} browser witnesses; ` +
            `GPU timestamp=${receipt.boundaries.gpuTimestampMeasured}; ` +
            `RTX benchmark=${receipt.boundaries.freshRtxBenchmarkClaimed}`
        );
      }
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}
