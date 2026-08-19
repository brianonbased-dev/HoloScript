#!/usr/bin/env node
/* global document, performance, process, requestAnimationFrame, window */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateUpstreamCommitPin } from './lib/model-village-upstream-commit-pin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3k-upper-body-occlusion.holo';
const POLICY_REL =
  'source/proofs/model-village-character-appearance-h3k-upper-body-occlusion-policy.hsplus';
const SEED_REL =
  'source/proofs/model-village-character-appearance-h3k-upper-body-occlusion-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3k-upper-body-occlusion-manifest.holo';
const REPORT_REL =
  'docs/reports/model-village-character-appearance-h3k-upper-body-occlusion-2026-07-28.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-appearance-h3k-upper-body-occlusion-2026-07-28.png';
const OUTPUT_REL = '.tmp/hololand/model-village/character-appearance-h3k';
const EXPECTED_COMMIT = 'c273682f5a5140b0ff8cde5da89ca7bfb98c63b2';
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];
const EXPECTED_POSES = ['civic_rest', 'open_welcome', 'dialogue_reach'];
const HASH_BINDINGS = [
  ['inheritedH3JSource', 'inheritedH3JSourceSha256', 'hololand'],
  ['upstreamBodyBuilderPath', 'upstreamBodyBuilderSha256', 'holoscript'],
  ['upstreamCharacterHostPath', 'upstreamCharacterHostSha256', 'holoscript'],
  ['upstreamCompositionBridgePath', 'upstreamCompositionBridgeSha256', 'holoscript'],
  ['upstreamGarmentBuilderPath', 'upstreamGarmentBuilderSha256', 'holoscript'],
  ['upstreamCharacterMeshBuilderPath', 'upstreamCharacterMeshBuilderSha256', 'holoscript'],
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

async function loadCore(holoScriptRoot) {
  return import(pathToFileURL(path.join(holoScriptRoot, 'packages/core/dist/index.js')).href);
}

function policyChildren(policy) {
  return policy.ast.compositions?.[0]?.children || [];
}

export async function parseH3KStack(root = ROOT, holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT) {
  const core = await loadCore(holoScriptRoot);
  const sourceText = readFileSync(path.join(root, SOURCE_REL), 'utf8');
  const policyText = readFileSync(path.join(root, POLICY_REL), 'utf8');
  const seedText = readFileSync(path.join(root, SEED_REL), 'utf8');
  const source = new core.HoloCompositionParser().parse(sourceText);
  const policy = new core.HoloScriptPlusParser().parse(policyText);
  const seed = new core.HoloScriptCodeParser().parse(seedText);
  for (const [label, parsed] of [
    ['H3K .holo', source],
    ['H3K .hsplus', policy],
    ['H3K .hs', seed],
  ]) {
    if (!parsed.success || parsed.errors.length) {
      throw new Error(`${label} parse failed: ${JSON.stringify(parsed.errors)}`);
    }
  }
  const poseProbes = policyChildren(policy)
    .filter((node) => node.type === 'object' && node.properties?.type === 'upper_body_pose_probe')
    .map((node) => ({ ...node.properties }))
    .sort((a, b) => a.order - b.order);
  return {
    core,
    source,
    policy,
    seed,
    sourceText,
    policyText,
    seedText,
    poseProbes,
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

export function buildH3KPlan(stack) {
  return {
    milestone: stack.contract.metadata.milestone,
    residents: stack.contract.objects
      .filter((object) => object.type === 'named_model_family_resident')
      .map((resident) => {
        const sourceObject = stack.source.ast.objects?.find(
          (candidate) => candidate.name === resident.objectId
        );
        const face = sourceObject?.traits?.find((trait) => trait.name === 'face');
        const hair = sourceObject?.traits?.find((trait) => trait.name === 'hair');
        return {
          objectId: resident.objectId,
          modelFamilyId: resident.modelFamilyId,
          displayLabel: resident.displayLabel,
          civicRole: resident.civicRole,
          heroPose: resident.heroPose,
          wardrobeColor: resident.wardrobeColor,
          accentColor: resident.accentColor,
          skinColor: sourceObject?.traits?.find((trait) => trait.name === 'body')?.config
            ?.skin_tone,
          hairColor: hair?.config?.color,
          irisColor: face?.config?.iris_color,
        };
      }),
    poses: stack.poseProbes,
  };
}

export function validateH3KContract(
  stack,
  root = ROOT,
  holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT
) {
  const errors = [];
  const expect = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const { metadata, state } = stack.contract;
  expect(
    metadata.milestone === 'MV_CHARACTER_APPEARANCE_H3K_UPPER_BODY_OCCLUSION',
    'milestone drifted'
  );
  expect(metadata.artStyle === 'hearthlight_biorealism', 'art style drifted');
  expect(metadata.upstreamHoloScriptCommit === EXPECTED_COMMIT, 'upstream commit pin drifted');
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
    ['nativeCoherentUpperBodyClaimed', true],
    ['nativeUpperBodyReceiptClaimed', true],
    ['nativeOpenCivicGarmentClaimed', true],
    ['nativeGarmentReceiptClaimed', true],
    ['nativePoseClearanceClaimed', true],
    ['nativeTriangleIntersectionProofClaimed', true],
    ['nativeOutwardRayOcclusionProofClaimed', true],
    ['repeatedCompileByteIdentityClaimed', true],
    ['strippedUpperBodyDeltaClaimed', true],
    ['presentationShaderOverrideUsed', false],
    ['presentationMaterialBridgeUsed', true],
    ['presentationWardrobeBridgeUsed', false],
    ['presentationNativeTorsoClipUsed', false],
    ['presentationTaaBridgeUsed', false],
    ['externalSkinTextureUsed', false],
    ['externalHairTextureUsed', false],
    ['externalWardrobeTextureUsed', false],
    ['productionSkinTexturingClaimed', false],
    ['strandHairClaimed', false],
    ['productionGroomClaimed', false],
    ['biometricLikenessClaimed', false],
    ['photorealismClaimed', false],
    ['motionReprojectionClaimed', false],
    ['nativeWebgpuTaaClaimed', false],
    ['questWebxrMeasured', false],
    ['vrPerformanceConvergenceClaimed', false],
    ['fullWorldConvergenceClaimed', false],
  ]) {
    expect(state[key] === expected, `${key} must equal ${expected}`);
  }
  expect(
    JSON.stringify(state.residentNames) === JSON.stringify(EXPECTED_RESIDENTS),
    'resident names drifted'
  );
  const foundation = state.upperBodyFoundation;
  expect(
    foundation?.profile === 'coherent-shoulder-neck-torso-v1' &&
      foundation?.receiptSchema === 'holoscript.agent-avatar-upper-body-geometry.v1' &&
      foundation?.radialSegments === 24 &&
      foundation?.ringCount === 10 &&
      foundation?.garmentStyle === 'stormglass-open-civic-tunic' &&
      foundation?.garmentReceiptSchema ===
        'holoscript.agent-avatar-garment-geometry.v1' &&
      foundation?.garmentFitProfile === 'coherent-upper-body-clearance-v1' &&
      foundation?.garmentTunicIndexCount === 1008 &&
      JSON.stringify(foundation?.poseNames) === JSON.stringify(EXPECTED_POSES) &&
      foundation?.poseCount === 3 &&
      foundation?.expectedPoseResidentPairs === 12 &&
      foundation?.collisionMethod === 'posed_triangle_intersection_v1' &&
      foundation?.occlusionMethod === 'posed_outward_ray_v1' &&
      foundation?.minimumClearanceMeters === 0.015 &&
      foundation?.minimumCoveredRayRatio === 0.95 &&
      foundation?.nativeWardrobeRequired === true &&
      foundation?.presentationWardrobeBridge === false &&
      foundation?.nativeTorsoClip === false,
    'upper-body foundation drifted'
  );
  const admission = state.nativeAdmission;
  expect(
    admission?.compilerTarget === 'character-webgpu' &&
      admission?.outputFormat === 'character-webgpu/drawspec' &&
      admission?.fallbackAllowed === false &&
      admission?.exactFourNativeBundlesRequired === true &&
      admission?.exactFourUpperBodyReceiptsRequired === true &&
      admission?.exactFourGarmentReceiptsRequired === true &&
      admission?.exactTwelvePoseClearanceReceiptsRequired === true &&
      admission?.zeroTriangleIntersectionsRequired === true &&
      admission?.minimumCoveredRayRatioRequired === 0.95 &&
      admission?.strippedUpperBodyDeltaRequired === true &&
      admission?.repeatedCompileByteIdentityRequired === true,
    'native admission drifted'
  );
  const plan = buildH3KPlan(stack);
  expect(
    JSON.stringify(plan.residents.map((resident) => resident.displayLabel)) ===
      JSON.stringify(EXPECTED_RESIDENTS),
    'resident order drifted'
  );
  expect(
    JSON.stringify(plan.poses.map((pose) => pose.poseId)) === JSON.stringify(EXPECTED_POSES),
    'pose order drifted'
  );
  expect(plan.residents.length === 4, 'resident count drifted');
  expect(plan.poses.length === 3, 'pose count drifted');
  for (const resident of plan.residents) {
    const object = stack.source.ast.objects?.find(
      (candidate) => candidate.name === resident.objectId
    );
    const body = object?.traits?.find((trait) => trait.name === 'body');
    const clothing = object?.traits?.find((trait) => trait.name === 'clothing');
    expect(
      body?.config?.upper_body_profile === 'coherent_shoulder_neck_torso_v1' &&
        body?.config?.upper_body_radial_segments === 24,
      `${resident.displayLabel} coherent upper-body source controls drifted`
    );
    expect(
      clothing?.config?.style === 'stormglass_open_civic_tunic' &&
        clothing?.config?.color === resident.wardrobeColor,
      `${resident.displayLabel} native garment controls drifted`
    );
  }
  for (const [pathKey, hashKey, owner] of HASH_BINDINGS) {
    const base = owner === 'hololand' ? root : holoScriptRoot;
    const relative = metadata[pathKey];
    const expectedHash = metadata[hashKey];
    const absolute = path.resolve(base, relative || '');
    expect(Boolean(relative && expectedHash), `${pathKey} binding missing`);
    expect(existsSync(absolute), `${pathKey} file missing`);
    if (existsSync(absolute)) {
      expect(sha256File(absolute) === expectedHash, `${pathKey} hash drifted`);
    }
  }
  for (const failure of upstreamPinFailures(holoScriptRoot, metadata)) expect(false, failure);
  return { status: errors.length ? 'fail' : 'pass', errors, plan };
}

async function exportBundle(core, ast, resident) {
  return new core.ExportManager({
    useCircuitBreaker: false,
    useFallback: false,
    useMemoryMonitoring: false,
  }).export('character-webgpu', ast, {
    compilerOptions: {
      objectId: resident.objectId,
      entityId: `model-village-h3k-${resident.modelFamilyId}`,
      lodLevel: 0,
    },
  });
}

function withoutUpperBodyProfile(ast) {
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

export async function compileH3KBundles(stack, plan) {
  const records = [];
  const baselineAst = withoutUpperBodyProfile(stack.source.ast);
  for (const resident of plan.residents) {
    const authoredResult = await exportBundle(stack.core, stack.source.ast, resident);
    const repeatedResult = await exportBundle(stack.core, stack.source.ast, resident);
    const baselineResult = await exportBundle(stack.core, baselineAst, resident);
    for (const [label, result] of [
      ['authored', authoredResult],
      ['repeated', repeatedResult],
      ['stripped upper-body', baselineResult],
    ]) {
      if (!result.success || result.usedFallback) {
        throw new Error(
          `${resident.displayLabel} ${label} compile failed: ${result.error || result.warnings}`
        );
      }
    }
    if (authoredResult.output !== repeatedResult.output) {
      throw new Error(`${resident.displayLabel} repeated compile was not byte-identical`);
    }
    const bundle = JSON.parse(authoredResult.output);
    const baseline = JSON.parse(baselineResult.output);
    const upperBody = bundle.anatomy?.upperBody;
    if (
      bundle.format !== 'character-webgpu/drawspec' ||
      upperBody?.schemaVersion !== 'holoscript.agent-avatar-upper-body-geometry.v1' ||
      upperBody?.profile !== 'coherent-shoulder-neck-torso-v1' ||
      upperBody?.radialSegments !== 24 ||
      upperBody?.ringCount !== 10 ||
      upperBody?.vertexRange?.vertexCount !== 240 ||
      upperBody?.indexRange?.indexCount !== 1296 ||
      bundle.garment?.schemaVersion !== 'holoscript.agent-avatar-garment-geometry.v1' ||
      bundle.garment?.style !== 'stormglass_open_civic_tunic' ||
      bundle.garment?.faceCoverage !== 'open-v-collar' ||
      bundle.garment?.fitProfile !== 'coherent-upper-body-clearance-v1' ||
      bundle.garment?.tunicIndexRange?.indexStart !== 0 ||
      bundle.garment?.tunicIndexRange?.indexCount !== 1008 ||
      bundle.garment?.clothVertexCount <= 0 ||
      bundle.report?.stubbed?.length !== 0
    ) {
      throw new Error(`${resident.displayLabel} native upper-body receipt contract drifted`);
    }
    const authoredMeshSha = meshSha(bundle);
    const baselineMeshSha = meshSha(baseline);
    if (
      baseline.anatomy?.upperBody !== undefined ||
      baselineMeshSha === authoredMeshSha
    ) {
      throw new Error(`${resident.displayLabel} stripped upper-body causal delta failed`);
    }
    records.push({
      ...resident,
      bundle,
      geometrySha256: authoredMeshSha,
      repeatedCompileSha256: sha256(repeatedResult.output),
      comparisons: {
        strippedUpperBody: {
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

async function loadWorkspaceModules(holoScriptRoot) {
  const workspaceRequire = createRequire(path.join(holoScriptRoot, 'package.json'));
  const importResolved = async (name) => import(pathToFileURL(workspaceRequire.resolve(name)).href);
  const playwrightModule = await importResolved('playwright');
  return {
    esbuild: await importResolved('esbuild'),
    chromium: (playwrightModule.default || playwrightModule).chromium,
  };
}

async function loadSkinningModule(holoScriptRoot, outputDir, esbuild) {
  mkdirSync(outputDir, { recursive: true });
  const outfile = path.join(outputDir, 'h3k-native-skinning.mjs');
  const meshSource = path
    .join(holoScriptRoot, 'packages/engine/src/character-render/AgentAvatarMesh.ts')
    .replaceAll('\\', '/');
  const mathSource = path
    .join(holoScriptRoot, 'packages/engine/src/character-render/skin-math.ts')
    .replaceAll('\\', '/');
  await esbuild.build({
    stdin: {
      contents:
        `export { computeJointPalette } from "${meshSource}";\n` +
        `export { quatFromAxisAngle } from "${mathSource}";\n`,
      resolveDir: holoScriptRoot,
      sourcefile: 'h3k-native-skinning.entry.ts',
      loader: 'ts',
    },
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: ['node20'],
    sourcemap: false,
    logLevel: 'silent',
  });
  return import(`${pathToFileURL(outfile).href}?sha=${sha256File(outfile)}`);
}

function poseMap(probe, skinning) {
  const pose = new Map();
  const rotateZ = (bone, radians) => {
    if (radians) pose.set(bone, skinning.quatFromAxisAngle(0, 0, 1, radians));
  };
  rotateZ('left_upper_arm', probe.leftUpperArmZ);
  rotateZ('right_upper_arm', probe.rightUpperArmZ);
  rotateZ('left_forearm', probe.leftForearmZ);
  rotateZ('right_forearm', probe.rightForearmZ);
  if (probe.spine2Y) {
    pose.set('spine2', skinning.quatFromAxisAngle(0, 1, 0, probe.spine2Y));
  }
  return pose;
}

function skinBundle(bundle, palette) {
  const positions = new Float32Array(bundle.mesh.positions.length);
  const normals = new Float32Array(bundle.mesh.normals.length);
  for (let vertex = 0; vertex < bundle.vertexCount; vertex++) {
    const joint = bundle.mesh.jointIndices[vertex];
    const matrix = joint * 16;
    const offset = vertex * 3;
    const x = bundle.mesh.positions[offset];
    const y = bundle.mesh.positions[offset + 1];
    const z = bundle.mesh.positions[offset + 2];
    positions[offset] =
      palette[matrix] * x +
      palette[matrix + 4] * y +
      palette[matrix + 8] * z +
      palette[matrix + 12];
    positions[offset + 1] =
      palette[matrix + 1] * x +
      palette[matrix + 5] * y +
      palette[matrix + 9] * z +
      palette[matrix + 13];
    positions[offset + 2] =
      palette[matrix + 2] * x +
      palette[matrix + 6] * y +
      palette[matrix + 10] * z +
      palette[matrix + 14];
    const nx = bundle.mesh.normals[offset];
    const ny = bundle.mesh.normals[offset + 1];
    const nz = bundle.mesh.normals[offset + 2];
    const rx = palette[matrix] * nx + palette[matrix + 4] * ny + palette[matrix + 8] * nz;
    const ry =
      palette[matrix + 1] * nx +
      palette[matrix + 5] * ny +
      palette[matrix + 9] * nz;
    const rz =
      palette[matrix + 2] * nx +
      palette[matrix + 6] * ny +
      palette[matrix + 10] * nz;
    const length = Math.hypot(rx, ry, rz) || 1;
    normals[offset] = rx / length;
    normals[offset + 1] = ry / length;
    normals[offset + 2] = rz / length;
  }
  return { positions, normals };
}

function point(positions, vertex) {
  const offset = vertex * 3;
  return [positions[offset], positions[offset + 1], positions[offset + 2]];
}

function sub3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function rayTriangle(origin, direction, a, b, c, maximum = Infinity) {
  const edge1 = sub3(b, a);
  const edge2 = sub3(c, a);
  const h = cross3(direction, edge2);
  const determinant = dot3(edge1, h);
  if (Math.abs(determinant) < 1e-8) return null;
  const inverse = 1 / determinant;
  const s = sub3(origin, a);
  const u = inverse * dot3(s, h);
  if (u < -1e-7 || u > 1 + 1e-7) return null;
  const q = cross3(s, edge1);
  const v = inverse * dot3(direction, q);
  if (v < -1e-7 || u + v > 1 + 1e-7) return null;
  const distance = inverse * dot3(edge2, q);
  return distance > 1e-6 && distance <= maximum ? distance : null;
}

function aabbOfTriangle(a, b, c) {
  return {
    min: [
      Math.min(a[0], b[0], c[0]),
      Math.min(a[1], b[1], c[1]),
      Math.min(a[2], b[2], c[2]),
    ],
    max: [
      Math.max(a[0], b[0], c[0]),
      Math.max(a[1], b[1], c[1]),
      Math.max(a[2], b[2], c[2]),
    ],
  };
}

function aabbOverlap(a, b, epsilon = 1e-5) {
  return [0, 1, 2].every(
    (axis) => a.min[axis] <= b.max[axis] + epsilon && b.min[axis] <= a.max[axis] + epsilon
  );
}

function triangleIntersects(a, b) {
  if (!aabbOverlap(a.aabb, b.aabb)) return false;
  const edgesA = [
    [a.points[0], a.points[1]],
    [a.points[1], a.points[2]],
    [a.points[2], a.points[0]],
  ];
  const edgesB = [
    [b.points[0], b.points[1]],
    [b.points[1], b.points[2]],
    [b.points[2], b.points[0]],
  ];
  for (const [start, end] of edgesA) {
    const segment = sub3(end, start);
    if (rayTriangle(start, segment, ...b.points, 1 + 1e-6) !== null) return true;
  }
  for (const [start, end] of edgesB) {
    const segment = sub3(end, start);
    if (rayTriangle(start, segment, ...a.points, 1 + 1e-6) !== null) return true;
  }
  return false;
}

function trianglesFromRange(indices, positions, indexStart, indexCount) {
  const triangles = [];
  for (let offset = indexStart; offset < indexStart + indexCount; offset += 3) {
    const points = [
      point(positions, indices[offset]),
      point(positions, indices[offset + 1]),
      point(positions, indices[offset + 2]),
    ];
    triangles.push({ points, aabb: aabbOfTriangle(...points) });
  }
  return triangles;
}

function evaluatePoseClearance(record, probe, skinning) {
  const bundle = record.bundle;
  const palette = skinning.computeJointPalette(poseMap(probe, skinning));
  const posed = skinBundle(bundle, palette);
  const upperBody = bundle.anatomy.upperBody;
  const garmentGroup = bundle.materialGroups.find(
    (group) => group.material.shadingModel === 'woven-cloth'
  );
  if (!garmentGroup) throw new Error(`${record.displayLabel} garment group missing`);
  const bodyTriangles = trianglesFromRange(
    bundle.mesh.indices,
    posed.positions,
    upperBody.indexRange.indexStart,
    upperBody.indexRange.indexCount
  );
  const garmentTriangles = trianglesFromRange(
    bundle.mesh.indices,
    posed.positions,
    garmentGroup.indexStart + bundle.garment.tunicIndexRange.indexStart,
    bundle.garment.tunicIndexRange.indexCount
  );
  let triangleIntersectionCount = 0;
  for (const body of bodyTriangles) {
    for (const garment of garmentTriangles) {
      if (triangleIntersects(body, garment)) triangleIntersectionCount++;
    }
  }

  const rayDistances = [];
  let rayCount = 0;
  const radialSegments = upperBody.radialSegments;
  for (let ring = 1; ring <= 5; ring++) {
    for (let segment = 0; segment < radialSegments; segment++) {
      const vertex = upperBody.vertexRange.vertexStart + ring * radialSegments + segment;
      const offset = vertex * 3;
      const origin = point(posed.positions, vertex);
      const direction = [
        posed.normals[offset],
        posed.normals[offset + 1],
        posed.normals[offset + 2],
      ];
      const start = [
        origin[0] + direction[0] * 1e-5,
        origin[1] + direction[1] * 1e-5,
        origin[2] + direction[2] * 1e-5,
      ];
      let nearest = Infinity;
      for (const triangle of garmentTriangles) {
        const distance = rayTriangle(start, direction, ...triangle.points, 0.8);
        if (distance !== null) nearest = Math.min(nearest, distance);
      }
      rayCount++;
      if (Number.isFinite(nearest)) rayDistances.push(nearest);
    }
  }
  const coveredRayRatio = rayDistances.length / rayCount;
  const minimumClearanceMeters = rayDistances.length ? Math.min(...rayDistances) : 0;
  const sorted = [...rayDistances].sort((a, b) => a - b);
  const clearanceP50Meters = sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.5))]
    : 0;
  return {
    schemaVersion: 'hololand.model-village.pose-garment-clearance.v1',
    resident: record.displayLabel,
    poseId: probe.poseId,
    triangleIntersectionCount,
    testedRayCount: rayCount,
    coveredRayCount: rayDistances.length,
    coveredRayRatio,
    minimumClearanceMeters,
    clearanceP50Meters,
    collisionMethod: 'posed_triangle_intersection_v1',
    occlusionMethod: 'posed_outward_ray_v1',
    posed,
    palette,
  };
}

export async function proveH3KPoseClearance(
  compiled,
  plan,
  holoScriptRoot,
  outputDir,
  modules
) {
  const skinning = await loadSkinningModule(holoScriptRoot, outputDir, modules.esbuild);
  const receipts = [];
  const heroMeshes = [];
  for (const record of compiled.records) {
    for (const probe of plan.poses) {
      const receipt = evaluatePoseClearance(record, probe, skinning);
      receipts.push({
        ...receipt,
        posed: undefined,
        palette: undefined,
      });
      if (probe.poseId === record.heroPose) {
        heroMeshes.push({
          record,
          poseId: probe.poseId,
          positions: Array.from(receipt.posed.positions),
          normals: Array.from(receipt.posed.normals),
        });
      }
    }
  }
  const failures = receipts.filter(
    (receipt) =>
      receipt.triangleIntersectionCount !== 0 ||
      receipt.minimumClearanceMeters < 0.015 ||
      receipt.coveredRayRatio < 0.95
  );
  if (failures.length) {
    throw new Error(`pose clearance failed: ${JSON.stringify(failures, null, 2)}`);
  }
  return { receipts, heroMeshes };
}

function h3kBrowserApplication(THREE, RoomEnvironment, payload) {
  const root = document.querySelector('#stage');
  const canvas = document.createElement('canvas');
  canvas.className = 'hero-canvas';
  root.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setSize(1800, 810, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020811);
  scene.fog = new THREE.FogExp2(0x020811, 0.055);
  const environmentScene = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(environmentScene, 0.04).texture;
  environmentScene.dispose();
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(31, 1800 / 810, 0.05, 30);
  camera.position.set(0, 1.42, 5.8);
  camera.lookAt(0, 1.25, 0);
  scene.add(new THREE.HemisphereLight(0x9ddbea, 0x14202c, 1.25));
  const key = new THREE.DirectionalLight(0xffe5cb, 3.5);
  key.position.set(-3.2, 5.5, 4.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -5;
  key.shadow.camera.right = 5;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -1;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x5bc9e8, 4.2);
  rim.position.set(4, 3, -3);
  scene.add(rim);
  const warm = new THREE.PointLight(0xff9c62, 24, 10, 2);
  warm.position.set(-2.5, 1.5, 2.2);
  scene.add(warm);
  const cool = new THREE.PointLight(0x617cff, 22, 10, 2);
  cool.position.set(2.6, 1.8, 2);
  scene.add(cool);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 8),
    new THREE.MeshPhysicalMaterial({
      color: 0x07121b,
      roughness: 0.32,
      metalness: 0.34,
      clearcoat: 0.5,
      clearcoatRoughness: 0.24,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  scene.add(floor);

  const xPositions = [-1.38, -0.46, 0.46, 1.38];
  const materials = [];
  const materialFor = (spec, resident) => {
    const color = new THREE.Color(spec.color ?? resident.skinColor ?? '#B9826F');
    if (spec.shadingModel === 'skin-sss') {
      return new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.46,
        metalness: 0,
        sheen: 0.32,
        sheenColor: new THREE.Color(0xff826b),
        sheenRoughness: 0.7,
        clearcoat: 0.12,
        clearcoatRoughness: 0.55,
      });
    }
    if (spec.shadingModel === 'marschner-hair') {
      return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(resident.hairColor),
        roughness: 0.31,
        metalness: 0,
        anisotropy: 0.78,
        anisotropyRotation: 0.2,
        sheen: 0.45,
        sheenColor: new THREE.Color(resident.accentColor),
        side: THREE.DoubleSide,
      });
    }
    if (spec.shadingModel === 'woven-cloth') {
      return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(resident.wardrobeColor),
        roughness: 0.72,
        metalness: 0.02,
        sheen: 0.75,
        sheenColor: new THREE.Color(resident.accentColor),
        sheenRoughness: 0.66,
        side: THREE.DoubleSide,
      });
    }
    return new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.12,
      metalness: 0,
      transmission: spec.opacity < 1 ? 0.18 : 0,
      ior: spec.ior || 1.376,
      clearcoat: 0.9,
      clearcoatRoughness: 0.08,
    });
  };

  payload.heroMeshes.forEach((hero, index) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(hero.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(hero.normals, 3));
    geometry.setIndex(hero.record.bundle.mesh.indices);
    geometry.clearGroups();
    const residentMaterials = hero.record.bundle.materialGroups.map((group) => {
      const material = materialFor(group.material, hero.record);
      materials.push(material);
      return material;
    });
    hero.record.bundle.materialGroups.forEach((group, materialIndex) => {
      geometry.addGroup(group.indexStart, group.indexCount, materialIndex);
    });
    const mesh = new THREE.Mesh(geometry, residentMaterials);
    mesh.position.x = xPositions[index];
    mesh.scale.setScalar(0.94);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const accent = new THREE.Color(hero.record.accentColor);
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.49, 0.012, 12, 96),
      new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.52,
        blending: THREE.AdditiveBlending,
      })
    );
    halo.position.set(xPositions[index], 1.39, -0.32);
    scene.add(halo);
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.43, 0.51, 0.08, 64),
      new THREE.MeshPhysicalMaterial({
        color: accent.clone().multiplyScalar(0.22),
        roughness: 0.28,
        metalness: 0.52,
        emissive: accent,
        emissiveIntensity: 0.08,
      })
    );
    plinth.position.set(xPositions[index], 0.035, 0);
    plinth.receiveShadow = true;
    scene.add(plinth);
  });

  const context = renderer.getContext();
  const debug = context.getExtension('WEBGL_debug_renderer_info');
  const rendererName = debug
    ? context.getParameter(debug.UNMASKED_RENDERER_WEBGL)
    : context.getParameter(context.RENDERER);
  const frameTimes = [];
  let frame = 0;
  const renderFrame = () => {
    const start = performance.now();
    renderer.render(scene, camera);
    frameTimes.push(performance.now() - start);
    frame++;
    if (frame < 28) {
      requestAnimationFrame(renderFrame);
      return;
    }
    const sorted = [...frameTimes.slice(8)].sort((a, b) => a - b);
    window.__H3K_RESULT__ = {
      gpu: {
        renderer: rendererName,
        vendor: debug
          ? context.getParameter(debug.UNMASKED_VENDOR_WEBGL)
          : context.getParameter(context.VENDOR),
        antialias: context.getContextAttributes().antialias,
        samples: context.getParameter(context.SAMPLES),
      },
      rendererCount: 1,
      residentMeshCount: payload.heroMeshes.length,
      poseLabels: payload.heroMeshes.map((hero) => hero.poseId),
      frameSampleCount: sorted.length,
      renderFrameP95Milliseconds: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
      presentationMaterialBridgeUsed: true,
      presentationWardrobeBridgeUsed: false,
      presentationNativeTorsoClipUsed: false,
      presentationTaaBridgeUsed: false,
      nativeWebgpuTaa: false,
      externalSkinTextureUsed: false,
      externalHairTextureUsed: false,
      externalWardrobeTextureUsed: false,
    };
    window.__H3K_READY__ = true;
  };
  requestAnimationFrame(renderFrame);
}

async function buildBrowserSurface(compiled, clearance, options, modules) {
  mkdirSync(options.outputDir, { recursive: true });
  const bundlePath = path.join(options.outputDir, 'h3k-upper-body-occlusion.bundle.js');
  const htmlPath = path.join(options.outputDir, 'h3k-upper-body-occlusion.html');
  const heroMeshes = clearance.heroMeshes.map((hero) => ({
    ...hero,
    record: {
      ...hero.record,
      bundle: {
        ...hero.record.bundle,
        mesh: {
          ...hero.record.bundle.mesh,
          positions: undefined,
          normals: undefined,
          tangents: undefined,
          uvs: undefined,
          jointIndices: undefined,
          jointWeights: undefined,
        },
      },
    },
  }));
  const payload = { heroMeshes };
  const appSource = [
    "import * as THREE from 'three';",
    "import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';",
    `const PAYLOAD = ${JSON.stringify(payload)};`,
    `(${h3kBrowserApplication.toString()})(THREE, RoomEnvironment, PAYLOAD);`,
  ].join('\n');
  try {
    await modules.esbuild.build({
      stdin: {
        contents: appSource,
        resolveDir: options.holoScriptRoot,
        sourcefile: 'h3k-upper-body-occlusion.entry.js',
        loader: 'js',
      },
      outfile: bundlePath,
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: ['chrome120'],
      minify: false,
      sourcemap: false,
      nodePaths: [path.join(options.holoScriptRoot, 'node_modules')],
      logLevel: 'silent',
    });
  } finally {
    modules.esbuild.stop?.();
  }
  const labels = clearance.heroMeshes
    .map(
      (hero) =>
        `<article><strong>${hero.record.displayLabel}</strong>` +
        `<span>${hero.record.civicRole.replaceAll('_', ' ')}</span>` +
        `<b>${hero.poseId.replaceAll('_', ' ')}</b></article>`
    )
    .join('');
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:,">
  <title>Stormglass H3K Coherent Upper Body</title>
  <style>
    *{box-sizing:border-box}
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#020811;color:#f0f8fa;font-family:Inter,Segoe UI,sans-serif}
    header{height:90px;padding:18px 42px 10px;border-bottom:1px solid rgba(113,208,224,.18);background:linear-gradient(90deg,rgba(6,24,34,.96),rgba(3,10,18,.9))}
    .eyebrow{color:#73d7e6;font:700 10px/1 ui-monospace,monospace;letter-spacing:.24em}
    h1{margin:8px 0 0;font:500 31px/1 Georgia,serif}
    .truth{position:absolute;right:42px;top:20px;text-align:right;color:#91aeb7;font:600 10px/1.65 ui-monospace,monospace;letter-spacing:.08em}
    #stage{position:relative;width:1800px;height:810px}
    .hero-canvas{display:block;width:1800px;height:810px}
    #labels{position:absolute;left:0;right:0;bottom:18px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:0 40px;pointer-events:none}
    article{padding:12px 16px;border:1px solid rgba(120,211,226,.2);border-radius:12px;background:rgba(2,10,17,.78);backdrop-filter:blur(10px);box-shadow:0 12px 32px rgba(0,0,0,.3)}
    strong{display:block;font:600 19px/1 Georgia,serif}
    span{display:block;margin-top:5px;color:#8eb2bc;font:700 8px/1.2 ui-monospace,monospace;letter-spacing:.13em;text-transform:uppercase}
    b{float:right;margin-top:-25px;color:#73d7e6;font:700 8px/1 ui-monospace,monospace;letter-spacing:.09em;text-transform:uppercase}
    footer{position:absolute;left:42px;right:42px;bottom:5px;display:flex;justify-content:space-between;color:#6d8b94;font:600 8px/1 ui-monospace,monospace;letter-spacing:.08em}
    footer em{color:#e5a06c;font-style:normal}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">HOLOLAND MODEL VILLAGE // NATIVE CHARACTER H3K</div>
    <h1>Coherent Upper-Body Convergence</h1>
    <div class="truth">@body(coherent_shoulder_neck_torso_v1) + @clothing(open_civic)<br>4 NAMED RESIDENTS · 12 POSE-CLEARANCE RECEIPTS · ZERO EXTERNAL TEXTURES</div>
  </header>
  <main id="stage"><section id="labels">${labels}</section></main>
  <footer><div>HEARTHLIGHT BIOREALISM · HOLOSCRIPT-COMPILED BODY / GARMENT GEOMETRY</div><em>SYMBOLIC APPEARANCE ONLY · MATERIAL BRIDGE · NOT PHOTOREAL · NO NATIVE TAA CLAIM</em></footer>
  <script src="${path.basename(bundlePath)}"></script>
</body>
</html>`;
  writeFileSync(htmlPath, html, 'utf8');
  return {
    bundlePath,
    htmlPath,
    bundleSha256: sha256File(bundlePath),
    htmlSha256: sha256(html),
  };
}

async function startServer(root) {
  const server = createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const absolute = path.resolve(root, pathname.replace(/^\/+/, ''));
      if (!absolute.startsWith(path.resolve(root)) || !existsSync(absolute)) {
        response.writeHead(404).end();
        return;
      }
      const content = readFileSync(absolute);
      response.writeHead(200, {
        'Content-Type': absolute.endsWith('.html')
          ? 'text/html; charset=utf-8'
          : 'text/javascript; charset=utf-8',
        'Content-Length': content.length,
      });
      response.end(content);
    } catch (error) {
      response.writeHead(500).end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function captureBrowser(surface, options, modules) {
  const { server, url } = await startServer(options.outputDir);
  const externalRequests = [];
  const pageErrors = [];
  let browser;
  try {
    browser = await modules.chromium.launch({
      executablePath: options.browser,
      headless: true,
      args: [
        '--use-angle=d3d11',
        '--ignore-gpu-blocklist',
        '--enable-gpu',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });
    const page = await browser.newPage({
      viewport: { width: 1800, height: 900 },
      deviceScaleFactor: 1,
    });
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    page.on('request', (request) => {
      const requestUrl = new URL(request.url());
      if (requestUrl.hostname !== '127.0.0.1') externalRequests.push(request.url());
    });
    await page.goto(`${url}/${path.basename(surface.htmlPath)}`, {
      waitUntil: 'load',
      timeout: 60_000,
    });
    await page.waitForFunction(() => window.__H3K_READY__ || window.__H3K_ERROR__, null, {
      timeout: 60_000,
    });
    const browserError = await page.evaluate(() => window.__H3K_ERROR__ || null);
    if (browserError) throw new Error(browserError);
    const result = await page.evaluate(() => window.__H3K_RESULT__);
    if (
      !/NVIDIA/i.test(result.gpu.renderer) ||
      !/(Direct3D11|D3D11)/i.test(result.gpu.renderer) ||
      result.gpu.antialias !== true ||
      result.gpu.samples < 2 ||
      result.rendererCount !== 1 ||
      result.residentMeshCount !== 4 ||
      JSON.stringify(result.poseLabels) !==
        JSON.stringify(['open_welcome', 'dialogue_reach', 'civic_rest', 'open_welcome']) ||
      result.frameSampleCount < 20 ||
      result.presentationMaterialBridgeUsed !== true ||
      result.presentationWardrobeBridgeUsed !== false ||
      result.presentationNativeTorsoClipUsed !== false ||
      result.presentationTaaBridgeUsed !== false ||
      result.nativeWebgpuTaa !== false ||
      result.externalSkinTextureUsed !== false ||
      result.externalHairTextureUsed !== false ||
      result.externalWardrobeTextureUsed !== false
    ) {
      throw new Error(`browser upper-body contract drifted: ${JSON.stringify(result)}`);
    }
    if (externalRequests.length || pageErrors.length) {
      throw new Error(
        `browser purity failure: external=${externalRequests.length} pageErrors=${pageErrors.length}`
      );
    }
    mkdirSync(path.dirname(options.heroOutput), { recursive: true });
    await page.screenshot({
      path: options.heroOutput,
      type: 'png',
      fullPage: false,
    });
    return {
      ...result,
      browserVersion: browser.version(),
      externalRequests,
      pageErrors,
      screenshot: {
        path: path.relative(options.root, options.heroOutput).replaceAll('\\', '/'),
        sha256: sha256File(options.heroOutput),
        bytes: statSync(options.heroOutput).size,
        width: 1800,
        height: 900,
      },
    };
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
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
      'scripts/check-hololand-model-village-character-appearance-h3k.mjs',
      /checkerSha256:\s*"([0-9a-f]{64})"/,
    ],
    [
      'scripts/__tests__/hololand-model-village-character-appearance-h3k.test.mjs',
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
    heroOutput: path.join(ROOT, HERO_REL),
    browser: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    compileOnly: false,
    requireManifest: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--compile-only') options.compileOnly = true;
    else if (arg === '--require-manifest') options.requireManifest = true;
    else if (arg === '--browser') options.browser = argv[++index];
    else if (arg === '--output-dir') options.outputDir = path.resolve(argv[++index]);
    else if (arg === '--hero-output') options.heroOutput = path.resolve(argv[++index]);
  }
  return options;
}

export async function runCharacterAppearanceH3K(options = parseArgs([])) {
  const stack = await parseH3KStack(options.root, options.holoScriptRoot);
  const validation = validateH3KContract(stack, options.root, options.holoScriptRoot);
  if (validation.status !== 'pass') throw new Error(validation.errors.join('\n'));
  const compiled = await compileH3KBundles(stack, validation.plan);
  const modules = await loadWorkspaceModules(options.holoScriptRoot);
  const clearance = await proveH3KPoseClearance(
    compiled,
    validation.plan,
    options.holoScriptRoot,
    options.outputDir,
    modules
  );
  let surface = null;
  let visual = null;
  if (!options.compileOnly) {
    surface = await buildBrowserSurface(compiled, clearance, options, modules);
    visual = await captureBrowser(surface, options, modules);
  } else {
    modules.esbuild.stop?.();
  }
  const manifest = options.requireManifest
    ? validateManifest(options.root)
    : { status: 'not-required', errors: [] };
  if (manifest.status === 'fail' || manifest.status === 'missing') {
    throw new Error(manifest.errors.join('\n'));
  }
  const receipt = {
    schema: 'hololand.model-village.character-appearance-h3k-witness.v1',
    status: 'pass',
    generatedAt: new Date().toISOString(),
    source: {
      path: SOURCE_REL,
      sha256: sha256(stack.sourceText),
      upstreamHoloScriptCommit: stack.contract.metadata.upstreamHoloScriptCommit,
    },
    policy: { path: POLICY_REL, sha256: sha256(stack.policyText) },
    seed: { path: SEED_REL, sha256: sha256(stack.seedText) },
    admission: {
      compilerTarget: 'character-webgpu',
      nativeBundleCount: compiled.records.length,
      fallbackUsed: false,
      stubCount: compiled.records.reduce(
        (sum, record) => sum + record.bundle.report.stubbed.length,
        0
      ),
      upperBodyReceiptCount: compiled.records.filter(
        (record) =>
          record.bundle.anatomy?.upperBody?.schemaVersion ===
          'holoscript.agent-avatar-upper-body-geometry.v1'
      ).length,
      garmentReceiptCount: compiled.records.filter(
        (record) =>
          record.bundle.garment?.schemaVersion ===
          'holoscript.agent-avatar-garment-geometry.v1'
      ).length,
      poseClearanceReceiptCount: clearance.receipts.length,
      triangleIntersectionCount: clearance.receipts.reduce(
        (sum, item) => sum + item.triangleIntersectionCount,
        0
      ),
      minimumClearanceMeters: Math.min(
        ...clearance.receipts.map((item) => item.minimumClearanceMeters)
      ),
      minimumCoveredRayRatio: Math.min(
        ...clearance.receipts.map((item) => item.coveredRayRatio)
      ),
      repeatedCompileByteIdentity: true,
      strippedUpperBodyDelta: compiled.records.every(
        (record) => record.comparisons.strippedUpperBody.geometryChanged
      ),
    },
    records: compiled.records.map((record) => ({
      objectId: record.objectId,
      modelFamilyId: record.modelFamilyId,
      displayLabel: record.displayLabel,
      civicRole: record.civicRole,
      heroPose: record.heroPose,
      vertexCount: record.bundle.vertexCount,
      geometrySha256: record.geometrySha256,
      repeatedCompileSha256: record.repeatedCompileSha256,
      upperBody: record.bundle.anatomy.upperBody,
      garment: record.bundle.garment,
      comparisons: record.comparisons,
    })),
    poseClearance: clearance.receipts,
    visual,
    surface,
    manifest,
    boundaries: {
      providerModelBinding: 'absent',
      presentationMaterialBridgeUsed: true,
      presentationWardrobeBridgeUsed: false,
      presentationNativeTorsoClipUsed: false,
      presentationTaaBridgeUsed: false,
      nativeWebgpuTaaClaimed: false,
      questWebxrMeasured: false,
      productionSkinTexturingClaimed: false,
      productionGroomClaimed: false,
      photorealismClaimed: false,
      biometricLikenessClaimed: false,
      externalNetworkRequests: visual?.externalRequests.length ?? 0,
    },
  };
  const receiptSha256 = sha256(JSON.stringify(canonical(receipt)));
  const finalReceipt = { ...receipt, receiptSha256 };
  const receiptDir = path.join(options.outputDir, 'final');
  mkdirSync(receiptDir, { recursive: true });
  const receiptPath = path.join(receiptDir, 'character-appearance-h3k-witness.json');
  writeFileSync(receiptPath, `${JSON.stringify(finalReceipt, null, 2)}\n`, 'utf8');
  return { receipt: finalReceipt, receiptPath };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCharacterAppearanceH3K(parseArgs())
    .then(({ receipt, receiptPath }) => {
      console.log(
        JSON.stringify(
          {
            status: receipt.status,
            receiptSha256: receipt.receiptSha256,
            receiptPath,
            nativeBundleCount: receipt.admission.nativeBundleCount,
            poseClearanceReceiptCount: receipt.admission.poseClearanceReceiptCount,
            triangleIntersectionCount: receipt.admission.triangleIntersectionCount,
            minimumClearanceMeters: receipt.admission.minimumClearanceMeters,
            minimumCoveredRayRatio: receipt.admission.minimumCoveredRayRatio,
            hero: receipt.visual?.screenshot ?? null,
            gpu: receipt.visual
              ? {
                  renderer: receipt.visual.gpu.renderer,
                  renderFrameP95Milliseconds: receipt.visual.renderFrameP95Milliseconds,
                }
              : null,
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
