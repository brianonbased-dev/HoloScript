#!/usr/bin/env node
/* global document, performance, process, requestAnimationFrame, window */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  buildH3BPlan,
  compileH3BNativeBundles,
  sha256,
} from './check-hololand-model-village-character-appearance-h3b.mjs';

import { validateUpstreamCommitPin } from './lib/model-village-upstream-commit-pin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT ||
  'C:/Users/josep/Documents/GitHub/HoloScript';
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3c-face-foundation.holo';
const POLICY_REL =
  'source/proofs/model-village-character-appearance-h3c-face-foundation-policy.hsplus';
const SEED_REL =
  'source/proofs/model-village-character-appearance-h3c-face-foundation-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3c-face-foundation-manifest.holo';
const HERO_REL =
  'docs/assets/model-village/model-village-character-appearance-h3c-native-face-portraits-2026-07-28.png';
const OUTPUT_REL =
  '.tmp/hololand/model-village/character-appearance-h3c';
const EXPECTED_PERSONAS = [
  'hearth_keeper',
  'path_tender',
  'record_steward',
];
const HASH_BINDINGS = [
  ['inheritedH3BSource', 'inheritedH3BSourceSha256', 'hololand'],
  ['upstreamFaceBuilderPath', 'upstreamFaceBuilderSha256', 'holoscript'],
  ['upstreamEyeBuilderPath', 'upstreamEyeBuilderSha256', 'holoscript'],
  [
    'upstreamCompositionBridgePath',
    'upstreamCompositionBridgeSha256',
    'holoscript',
  ],
  ['upstreamMorphBuilderPath', 'upstreamMorphBuilderSha256', 'holoscript'],
  // CharacterHost decides whether the authored orbital lid range reaches the morph
  // builder at all, and is therefore the file that selects morph v1 vs v2. It was
  // unpinned when this gate was first witnessed, so the v1 -> v2 blink change landed
  // behind every pin H3C held. Pinning it is what makes that class of drift visible.
  ['upstreamMorphHostPath', 'upstreamMorphHostSha256', 'holoscript'],
  ['upstreamCompilerPath', 'upstreamCompilerSha256', 'holoscript'],
];
const ADMITTED_MORPH_SCHEMA_VERSION = 'holoscript.native-facial-morph.v2';
const REFUSED_MORPH_SCHEMA_VERSION = 'holoscript.native-facial-morph.v3';

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function properties(node) {
  return Object.fromEntries(
    (node?.properties || []).map((property) => [
      property.key,
      property.value,
    ]),
  );
}

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return 0;
  return sorted[
    Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(sorted.length * quantile) - 1),
    )
  ];
}

async function loadCore(holoScriptRoot) {
  return import(
    pathToFileURL(
      path.join(holoScriptRoot, 'packages/core/dist/index.js'),
    ).href
  );
}

export async function parseH3CStack(
  root = ROOT,
  holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT,
) {
  const core = await loadCore(holoScriptRoot);
  const sourceText = readFileSync(path.join(root, SOURCE_REL), 'utf8');
  const policyText = readFileSync(path.join(root, POLICY_REL), 'utf8');
  const seedText = readFileSync(path.join(root, SEED_REL), 'utf8');
  const source = new core.HoloCompositionParser().parse(sourceText);
  const policy = new core.HoloScriptPlusParser().parse(policyText);
  const seed = new core.HoloScriptCodeParser().parse(seedText);
  for (const [label, parsed] of [
    ['H3C .holo', source],
    ['H3C .hsplus', policy],
    ['H3C .hs', seed],
  ]) {
    if (!parsed.success || parsed.errors.length) {
      throw new Error(
        `${label} parse failed: ${JSON.stringify(parsed.errors)}`,
      );
    }
  }
  return {
    core,
    source,
    policy,
    seed,
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

export function validateH3CContract(
  stack,
  root = ROOT,
  holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT,
) {
  const errors = [];
  const expect = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const { metadata, state } = stack.contract;
  expect(
    metadata.milestone === 'MV_CHARACTER_APPEARANCE_H3C_FACE_FOUNDATION',
    'milestone drifted',
  );
  expect(
    metadata.artStyle === 'hearthlight_biorealism',
    'art style drifted',
  );
  for (const [key, expected] of [
    ['nativeNeutralAnatomicalFaceClaimed', true],
    ['nativeEyeGeometryClaimed', true],
    ['nativeEyelidTearlineRimTopologyClaimed', true],
    ['productionFaceCompleteClaimed', false],
    ['productionTearFilmClaimed', false],
    ['normalsRecomputedAfterMorphClaimed', false],
    ['motionReprojectionClaimed', false],
    ['photorealismClaimed', false],
    ['familyIdentityVisible', false],
    ['adapterFamilyBinding', 'absent'],
    ['researchSeatBinding', 'absent'],
    ['liveResearchJoinAllowed', false],
    ['canonicalWritesAllowed', false],
    ['residentObservationWritesAllowed', false],
    ['modelCallsAllowed', false],
    ['networkFetchesAllowed', false],
    ['biometricPersistenceAllowed', false],
  ]) {
    expect(state[key] === expected, `${key} must equal ${expected}`);
  }
  expect(
    state.faceFoundation?.topology === 'neutral-anatomical-v2' &&
      state.faceFoundation?.radialSegments === 22 &&
      state.faceFoundation?.verticalSegments === 16 &&
      state.faceFoundation?.tearlineRimTopology === true &&
      state.faceFoundation?.orbitalLidBlinkOperative === true &&
      state.faceFoundation?.smoothSkullNormals === true &&
      state.faceFoundation?.wetTearFilm === false &&
      state.faceFoundation?.productionBlendshapeRig === false &&
      state.faceFoundation?.scanDerived === false &&
      state.faceFoundation
        ?.sourceDrivenProceduralIrisPresentation === true &&
      state.faceFoundation?.nativeIrisMaterialSerialized === false,
    'face-foundation truth boundary drifted',
  );
  expect(
    state.nativeAdmission?.compilerTarget === 'character-webgpu' &&
      state.nativeAdmission?.fallbackAllowed === false &&
      state.nativeAdmission?.morphTopology ===
        'neutral-anatomical-v2' &&
      state.nativeAdmission?.normalsRecomputedAfterMorph === false,
    'native admission drifted',
  );
  // The v2 orbital-lid blink is admitted BY NAME here. The gate accepts exactly the
  // schema this source authorises, and keeps refusing v3 expression-normal
  // recomputation, which no HoloLand surface has authored or witnessed.
  expect(
    state.nativeAdmission?.morphSchemaVersion ===
      ADMITTED_MORPH_SCHEMA_VERSION &&
      state.nativeAdmission?.blinkClosesAuthoredOrbitalLid === true &&
      state.nativeAdmission?.orbitalLidClosureMustCoverWholeAuthoredRim ===
        true &&
      state.nativeAdmission?.expressionNormalRecomputationAdmitted === false,
    'admitted native facial morph semantics drifted',
  );
  expect(
    state.benchmark?.visualHairLod === 2 &&
      state.benchmark?.visualHairLodReason ===
        'facial_landmark_readability',
    'visual hair-LOD truth boundary drifted',
  );
  const plan = buildH3BPlan(stack.contract);
  expect(
    JSON.stringify(plan.personas.map((persona) => persona.personaId)) ===
      JSON.stringify(EXPECTED_PERSONAS),
    'persona order drifted',
  );
  const template = stack.source.ast.templates?.find(
    (candidate) => candidate.name === 'StormglassNativeFacePersona',
  );
  const faceTrait = template?.traits?.find((trait) => trait.name === 'face');
  expect(
    faceTrait?.config?.topology === 'neutral_anatomical_v2' &&
      faceTrait?.config?.radial_segments === 22 &&
      faceTrait?.config?.vertical_segments === 16 &&
      faceTrait?.config?.tearline === true,
    'source-authored @face topology drifted',
  );
  for (const [pathKey, hashKey, owner] of HASH_BINDINGS) {
    const base = owner === 'hololand' ? root : holoScriptRoot;
    const relative = metadata[pathKey];
    const expectedHash = metadata[hashKey];
    const absolute = path.resolve(base, relative || '');
    expect(Boolean(relative && expectedHash), `${pathKey} binding missing`);
    expect(existsSync(absolute), `${pathKey} file missing`);
    if (existsSync(absolute)) {
      expect(
        sha256File(absolute) === expectedHash,
        `${pathKey} hash drifted`,
      );
    }
  }
  for (const failure of upstreamPinFailures(holoScriptRoot, metadata)) expect(false, failure);
  return {
    status: errors.length ? 'fail' : 'pass',
    errors,
    plan,
  };
}

async function exportBundle(core, ast, objectId, lodLevel) {
  return new core.ExportManager({
    useCircuitBreaker: false,
    useFallback: false,
    useMemoryMonitoring: false,
  }).export('character-webgpu', ast, {
    compilerOptions: {
      objectId,
      entityId: `model-village-h3c-${objectId.toLowerCase()}`,
      lodLevel,
    },
  });
}

/**
 * Recompile one persona with the authored tearline rim withheld.
 *
 * This is the falsifiable half of the v2 admission: the rim's vertex cost and the rim's blink
 * motion are both MEASURED here, so neither number is hand-asserted. If upstream ever stops
 * closing the authored lid, the two measurements stop agreeing and this gate goes red.
 */
async function measureOrbitalLidBlink(stack, plan) {
  const persona = plan.personas[1];
  const blink = { blink: 1 };
  const build = async (withTearline) => {
    const ast = structuredClone(stack.source.ast);
    const template = ast.templates?.find(
      (candidate) => candidate.name === 'StormglassNativeFacePersona',
    );
    const face = template?.traits?.find((trait) => trait.name === 'face');
    if (!face) throw new Error('source-authored @face trait missing');
    face.config = { ...face.config, tearline: withTearline };
    const object = ast.objects.find(
      (candidate) => candidate.name === persona.objectId,
    );
    const morph = object?.traits?.find((trait) => trait.name === 'morph');
    if (!morph) throw new Error(`native morph trait missing for ${persona.objectId}`);
    morph.config = { ...(morph.config || {}), targets: { ...blink } };
    const result = await exportBundle(stack.core, ast, persona.objectId, 0);
    if (!result.success || result.usedFallback) {
      throw new Error(
        `orbital lid blink probe compile failed (tearline=${withTearline})`,
      );
    }
    return JSON.parse(result.output);
  };

  const rimmed = await build(true);
  const unrimmed = await build(false);
  const authoredRimVertexCount = rimmed.vertexCount - unrimmed.vertexCount;
  const blinkChangedVertexDelta =
    rimmed.morph.changedVertexCount - unrimmed.morph.changedVertexCount;

  if (unrimmed.morph?.schemaVersion !== 'holoscript.native-facial-morph.v1') {
    throw new Error(
      `withholding the authored tearline must fall back to native-facial-morph.v1, got ${unrimmed.morph?.schemaVersion}`,
    );
  }
  if (rimmed.morph?.schemaVersion !== ADMITTED_MORPH_SCHEMA_VERSION) {
    throw new Error(
      `authored tearline must produce ${ADMITTED_MORPH_SCHEMA_VERSION}, got ${rimmed.morph?.schemaVersion}`,
    );
  }
  if (authoredRimVertexCount <= 0) {
    throw new Error(
      `authored tearline rim contributed no geometry: ${authoredRimVertexCount}`,
    );
  }
  if (blinkChangedVertexDelta !== authoredRimVertexCount) {
    throw new Error(
      'v2 blink must close the whole authored orbital rim: ' +
        `${blinkChangedVertexDelta} of ${authoredRimVertexCount} rim vertices moved`,
    );
  }
  if (rimmed.morph.normalsRecomputed !== false) {
    throw new Error('orbital lid blink recomputed normals; v3 is not admitted here');
  }
  return {
    personaId: persona.personaId,
    weights: blink,
    authoredRimVertexCount,
    blinkChangedVertexDelta,
    rimmedChangedVertexCount: rimmed.morph.changedVertexCount,
    unrimmedChangedVertexCount: unrimmed.morph.changedVertexCount,
    rimmedSchemaVersion: rimmed.morph.schemaVersion,
    unrimmedSchemaVersion: unrimmed.morph.schemaVersion,
    rimmedPositionDigest: rimmed.morph.positionDigest,
    unrimmedPositionDigest: unrimmed.morph.positionDigest,
  };
}

export async function compileH3CFaceBundles(stack, plan) {
  const admittedMorphSchemaVersion =
    stack.contract.state.nativeAdmission?.morphSchemaVersion;
  const native = await compileH3BNativeBundles(
    stack.core,
    stack.source.ast,
    plan,
    { morphSchemaVersion: admittedMorphSchemaVersion },
  );
  const tiers = native.records.flatMap((record) => record.tiers);
  for (const tier of tiers) {
    const bundle = tier.bundle;
    if (
      bundle.face?.topology !== 'neutral-anatomical-v2' ||
      bundle.face?.radialSegments !== 22 ||
      bundle.face?.verticalSegments !== 16 ||
      bundle.face?.tearline !== true ||
      bundle.morph?.topology !== 'neutral-anatomical-v2' ||
      bundle.morph?.schemaVersion !== admittedMorphSchemaVersion ||
      bundle.morph?.schemaVersion === REFUSED_MORPH_SCHEMA_VERSION ||
      bundle.morph?.normalsRecomputed !== false ||
      bundle.morph?.ignoredTargets?.length !== 0 ||
      !bundle.report?.mapped?.includes(
        '@face(topology=neutral-anatomical-v2)',
      ) ||
      bundle.report?.stubbed?.length !== 0
    ) {
      throw new Error(
        `${tier.bundle.entityId || 'persona'} LOD${tier.level} face contract drifted`,
      );
    }
  }
  const orbitalLidBlink = await measureOrbitalLidBlink(stack, plan);

  const legacyAst = structuredClone(stack.source.ast);
  const template = legacyAst.templates?.find(
    (candidate) => candidate.name === 'StormglassNativeFacePersona',
  );
  template.traits = template.traits.filter((trait) => trait.name !== 'face');
  const legacy = await exportBundle(
    stack.core,
    legacyAst,
    plan.personas[0].objectId,
    0,
  );
  if (!legacy.success || legacy.usedFallback) {
    throw new Error('legacy face comparison compile failed');
  }
  const legacyBundle = JSON.parse(legacy.output);
  const nativeVertexCount = native.records[0].tiers[0].vertexCount;
  const topologyVertexDelta =
    nativeVertexCount - legacyBundle.vertexCount;
  if (topologyVertexDelta < 250) {
    throw new Error(
      `neutral anatomical topology delta too small: ${topologyVertexDelta}`,
    );
  }
  return {
    native,
    topologyVertexDelta,
    legacyVertexCount: legacyBundle.vertexCount,
    morphSchemaVersion: admittedMorphSchemaVersion,
    orbitalLidBlink,
  };
}

function browserBundle(bundle) {
  return {
    vertexCount: bundle.vertexCount,
    mesh: bundle.mesh,
    jointMatrices: bundle.jointMatrices,
    materialGroups: bundle.materialGroups,
    face: bundle.face,
    morph: bundle.morph,
  };
}

function h3cBrowserApplication(THREE, RoomEnvironment, payload) {
  const host = document.getElementById('portraits');
  const renderers = [];
  const gpu = {};

  function geometryFromBundle(bundle) {
    const positions = new Float32Array(bundle.mesh.positions);
    const normals = new Float32Array(bundle.mesh.normals);
    for (let vertex = 0; vertex < bundle.vertexCount; vertex += 1) {
      const joint = bundle.mesh.jointIndices[vertex];
      const weight = bundle.mesh.jointWeights[vertex];
      const offset = joint * 16;
      const position = vertex * 3;
      const x = positions[position];
      const y = positions[position + 1];
      const z = positions[position + 2];
      positions[position] =
        (bundle.jointMatrices[offset] * x +
          bundle.jointMatrices[offset + 4] * y +
          bundle.jointMatrices[offset + 8] * z +
          bundle.jointMatrices[offset + 12]) *
        weight;
      positions[position + 1] =
        (bundle.jointMatrices[offset + 1] * x +
          bundle.jointMatrices[offset + 5] * y +
          bundle.jointMatrices[offset + 9] * z +
          bundle.jointMatrices[offset + 13]) *
        weight;
      positions[position + 2] =
        (bundle.jointMatrices[offset + 2] * x +
          bundle.jointMatrices[offset + 6] * y +
          bundle.jointMatrices[offset + 10] * z +
          bundle.jointMatrices[offset + 14]) *
        weight;
      const nx = normals[position];
      const ny = normals[position + 1];
      const nz = normals[position + 2];
      const tx =
        bundle.jointMatrices[offset] * nx +
        bundle.jointMatrices[offset + 4] * ny +
        bundle.jointMatrices[offset + 8] * nz;
      const ty =
        bundle.jointMatrices[offset + 1] * nx +
        bundle.jointMatrices[offset + 5] * ny +
        bundle.jointMatrices[offset + 9] * nz;
      const tz =
        bundle.jointMatrices[offset + 2] * nx +
        bundle.jointMatrices[offset + 6] * ny +
        bundle.jointMatrices[offset + 10] * nz;
      const length = Math.hypot(tx, ty, tz) || 1;
      normals[position] = tx / length;
      normals[position + 1] = ty / length;
      normals[position + 2] = tz / length;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      'normal',
      new THREE.BufferAttribute(normals, 3),
    );
    geometry.setIndex(
      new THREE.BufferAttribute(
        new Uint32Array(bundle.mesh.indices),
        1,
      ),
    );
    bundle.materialGroups.forEach((group, index) => {
      geometry.addGroup(group.indexStart, group.indexCount, index);
    });
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  function materialFor(group, persona) {
    const model = group.material.shadingModel;
    if (model === 'marschner-hair') {
      return new THREE.MeshStandardMaterial({
        color: persona.hairColor,
        roughness: 0.68,
        metalness: 0,
        side: THREE.DoubleSide,
        envMapIntensity: 0.58,
      });
    }
    if (model === 'refractive-eye') {
      const eye = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.24,
        metalness: 0,
        clearcoat: 0.48,
        clearcoatRoughness: 0.12,
        ior: 1.376,
        envMapIntensity: 0.72,
      });
      const iris = new THREE.Color(persona.irisColor);
      eye.onBeforeCompile = (shader) => {
        shader.uniforms.h3cIrisColor = { value: iris };
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            '#include <common>\nuniform vec3 h3cIrisColor;',
          )
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            float h3cFacing = clamp(abs(normalize(vNormal).z), 0.0, 1.0);
            float h3cRadial = sqrt(max(0.0, 1.0 - h3cFacing * h3cFacing));
            float h3cIrisMask = 1.0 - smoothstep(0.43, 0.6, h3cRadial);
            float h3cPupilMask = 1.0 - smoothstep(0.16, 0.235, h3cRadial);
            vec3 h3cSclera = vec3(0.88, 0.9, 0.87);
            vec3 h3cEyeColor = mix(h3cSclera, h3cIrisColor, h3cIrisMask);
            diffuseColor.rgb = mix(h3cEyeColor, vec3(0.012, 0.016, 0.02), h3cPupilMask);`,
          );
      };
      eye.customProgramCacheKey = () =>
        `h3c-source-iris-${persona.irisColor}`;
      return eye;
    }
    return new THREE.MeshPhysicalMaterial({
      color: group.material.color,
      roughness: 0.58,
      metalness: 0,
      clearcoat: 0.04,
      clearcoatRoughness: 0.42,
      sheen: 0.08,
      sheenColor: 0xffd7c4,
      envMapIntensity: 0.62,
    });
  }

  function buildPortrait(record) {
    const card = document.createElement('section');
    card.className = 'portrait';
    const canvas = document.createElement('canvas');
    const label = document.createElement('div');
    label.className = 'portrait-label';
    label.innerHTML = `<strong>${record.displayLabel}</strong><span>${record.civicRole} · ${record.nativeHairStyleId}</span>`;
    card.append(canvas, label);
    host.append(card);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setSize(560, 560, false);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.enabled = true;

    if (!gpu.renderer) {
      const gl = renderer.getContext();
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      gpu.renderer = debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);
      gpu.vendor = debug
        ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)
        : gl.getParameter(gl.VENDOR);
      gpu.version = gl.getParameter(gl.VERSION);
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06101a);
    scene.fog = new THREE.FogExp2(0x06101a, 0.42);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(
      new RoomEnvironment(),
      0.04,
    ).texture;
    scene.add(new THREE.HemisphereLight(0x9bc9da, 0x17100d, 1.35));
    const key = new THREE.DirectionalLight(0xffd9c5, 4.2);
    key.position.set(1.7, 2.4, 2.2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x5bbbd0, 2.1);
    fill.position.set(-2.1, 1.7, 1.1);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffa56b, 2.8);
    rim.position.set(0.4, 2.2, -2);
    scene.add(rim);

    // This is a face-foundation witness. Use the source-authored LOD2 hair
    // topology so the inherited card guides frame rather than occlude the
    // landmarks; all nine LOD0/1/2 bundles remain compiled and receipted.
    const bundle = record.tiers[2].bundle;
    const geometry = geometryFromBundle(bundle);
    const materials = bundle.materialGroups.map((group) =>
      materialFor(group, record),
    );
    const mesh = new THREE.Mesh(geometry, materials);
    scene.add(mesh);
    const positionAttribute = geometry.getAttribute('position');
    const eyeGroup = bundle.materialGroups.find(
      (group) =>
        group.material.shadingModel === 'refractive-eye',
    );
    let eyeY = geometry.boundingBox.max.y * 0.82;
    if (eyeGroup) {
      let eyeYSum = 0;
      let eyeSamples = 0;
      for (
        let offset = eyeGroup.indexStart;
        offset < eyeGroup.indexStart + eyeGroup.indexCount;
        offset += 1
      ) {
        eyeYSum += positionAttribute.getY(
          bundle.mesh.indices[offset],
        );
        eyeSamples += 1;
      }
      eyeY = eyeYSum / Math.max(1, eyeSamples);
    }
    const camera = new THREE.PerspectiveCamera(31, 1, 0.05, 20);
    camera.position.set(0, eyeY - 0.018, 0.7);
    camera.lookAt(0, eyeY - 0.032, 0.01);
    renderer.render(scene, camera);
    renderers.push({ renderer, scene, camera });
  }

  async function run() {
    payload.records.forEach(buildPortrait);
    const frameTimes = [];
    let last = performance.now();
    for (let frame = 0; frame < 90; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const start = performance.now();
      renderers.forEach(({ renderer, scene, camera }) =>
        renderer.render(scene, camera),
      );
      const now = performance.now();
      if (frame >= 15) frameTimes.push(now - last);
      last = now;
      window.__H3C_RENDER_SUBMIT_MS__ =
        (window.__H3C_RENDER_SUBMIT_MS__ || []).concat(now - start);
    }
    window.__H3C_RESULT__ = {
      gpu,
      frameP95Milliseconds: payload.percentile(frameTimes, 0.95),
      renderSubmitP95Milliseconds: payload.percentile(
        window.__H3C_RENDER_SUBMIT_MS__,
        0.95,
      ),
      rendererCount: renderers.length,
      topology: payload.records[0].tiers[2].bundle.face.topology,
      visualHairLod: 2,
      sourceCommit: payload.sourceCommit,
    };
    window.__H3C_READY__ = true;
  }

  run().catch((error) => {
    window.__H3C_ERROR__ =
      error?.stack || error?.message || String(error);
  });
}

async function loadWorkspaceModules(holoScriptRoot) {
  const workspaceRequire = createRequire(
    path.join(holoScriptRoot, 'package.json'),
  );
  const importResolved = async (name) =>
    import(
      pathToFileURL(workspaceRequire.resolve(name)).href
    );
  const playwrightModule = await importResolved('playwright');
  return {
    esbuild: await importResolved('esbuild'),
    chromium: (playwrightModule.default || playwrightModule)
      .chromium,
  };
}

async function buildBrowserSurface(compiled, options, modules) {
  mkdirSync(options.outputDir, { recursive: true });
  const bundlePath = path.join(options.outputDir, 'h3c-face.bundle.js');
  const htmlPath = path.join(options.outputDir, 'h3c-face.html');
  const payload = {
    sourceCommit:
      compiled.stack.contract.metadata.upstreamHoloScriptCommit,
    records: compiled.face.native.records.map((record) => ({
      ...record,
      tiers: record.tiers.map((tier) => ({
        ...tier,
        bundle: browserBundle(tier.bundle),
      })),
    })),
  };
  const appSource = [
    "import * as THREE from 'three';",
    "import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';",
    `const PAYLOAD = ${JSON.stringify(payload)};`,
    `PAYLOAD.percentile = (values, quantile) => {
      const sorted = [...values].sort((a,b)=>a-b);
      return sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))] : 0;
    };`,
    `(${h3cBrowserApplication.toString()})(THREE, RoomEnvironment, PAYLOAD);`,
  ].join('\n');
  try {
    await modules.esbuild.build({
      stdin: {
        contents: appSource,
        resolveDir: options.holoScriptRoot,
        sourcefile: 'h3c-face.entry.js',
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
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:,">
  <title>Stormglass Character Appearance H3C</title>
  <style>
    *{box-sizing:border-box}
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:radial-gradient(circle at 50% -10%,#173545 0,#06101a 42%,#02070d 100%);color:#eef8fa;font-family:Inter,Segoe UI,sans-serif}
    header{height:112px;padding:24px 42px 12px;border-bottom:1px solid rgba(126,207,220,.18)}
    .eyebrow{color:#76cfdd;font:700 11px/1.2 ui-monospace,monospace;letter-spacing:.22em}
    h1{margin:8px 0 0;font:500 34px/1 Georgia,serif}
    .sub{position:absolute;right:42px;top:28px;color:#93aeb8;font:600 11px/1.6 ui-monospace,monospace;text-align:right}
    #portraits{display:flex;gap:20px;padding:18px 40px 0;justify-content:center}
    .portrait{position:relative;width:560px;height:572px;overflow:hidden;border:1px solid rgba(116,197,211,.2);border-radius:18px;background:rgba(5,15,24,.76);box-shadow:0 26px 65px rgba(0,0,0,.42)}
    canvas{display:block;width:560px;height:560px}
    .portrait-label{position:absolute;left:20px;right:20px;bottom:16px;padding:13px 15px;border:1px solid rgba(125,205,219,.2);border-radius:11px;background:rgba(3,10,16,.82);backdrop-filter:blur(8px)}
    .portrait-label strong{display:block;font:600 19px/1.15 Georgia,serif}
    .portrait-label span{display:block;margin-top:5px;color:#8cb2be;font:700 10px/1.2 ui-monospace,monospace;letter-spacing:.13em;text-transform:uppercase}
    footer{position:absolute;left:42px;right:42px;bottom:12px;display:flex;justify-content:space-between;color:#74929d;font:600 9px/1.4 ui-monospace,monospace;letter-spacing:.09em}
    .truth{color:#e7a56d;text-align:right}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">STORMGLASS COMMONS // NATIVE CHARACTER H3C</div>
    <h1>Neutral Anatomical Face Foundation</h1>
    <div class="sub">@face(neutral_anatomical_v2)<br>smooth skull · jaw taper · nose · eyelid rims · lip seam</div>
  </header>
  <main id="portraits"></main>
  <footer>
    <div>HEARTHLIGHT BIOREALISM · CHARACTER-WEBGPU SOURCE BUNDLES</div>
    <div class="truth">PROCEDURAL FOUNDATION · NO SCAN · NO BIOMETRIC LIKENESS · NOT PRODUCTION FACE</div>
  </footer>
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
      const pathname = decodeURIComponent(
        new URL(request.url, 'http://127.0.0.1').pathname,
      );
      const absolute = path.resolve(
        root,
        pathname.replace(/^\/+/, ''),
      );
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
  await new Promise((resolve) =>
    server.listen(0, '127.0.0.1', resolve),
  );
  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
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
      viewport: { width: 1800, height: 720 },
      deviceScaleFactor: 1,
    });
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    page.on('request', (request) => {
      const requestUrl = new URL(request.url());
      if (requestUrl.hostname !== '127.0.0.1') {
        externalRequests.push(request.url());
      }
    });
    await page.goto(`${url}/${path.basename(surface.htmlPath)}`, {
      waitUntil: 'load',
      timeout: 60_000,
    });
    await page.waitForFunction(
      () => window.__H3C_READY__ || window.__H3C_ERROR__,
      null,
      { timeout: 60_000 },
    );
    const browserError = await page.evaluate(
      () => window.__H3C_ERROR__ || null,
    );
    if (browserError) throw new Error(browserError);
    const result = await page.evaluate(() => window.__H3C_RESULT__);
    if (
      !/NVIDIA/i.test(result.gpu.renderer) ||
      !/(Direct3D11|D3D11)/i.test(result.gpu.renderer)
    ) {
      throw new Error(
        `hardware D3D11 renderer required, received ${result.gpu.renderer}`,
      );
    }
    if (externalRequests.length || pageErrors.length) {
      throw new Error(
        `browser purity failure: external=${externalRequests.length} pageErrors=${pageErrors.length}`,
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
        height: 720,
      },
    };
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
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
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--compile-only') options.compileOnly = true;
    else if (arg === '--require-manifest') options.requireManifest = true;
    else if (arg === '--browser') options.browser = argv[++index];
    else if (arg === '--output-dir') {
      options.outputDir = path.resolve(argv[++index]);
    } else if (arg === '--hero-output') {
      options.heroOutput = path.resolve(argv[++index]);
    }
  }
  return options;
}

/**
 * Compare every compiled bundle against the digests the manifest witnesses.
 *
 * Before this existed the nine persona digests and the expression digests lived only in an
 * ephemeral .tmp receipt that nothing ever read back, so "re-witnessed" was an unverifiable
 * claim. These are the gate's goldens: geometry (vertex counts, position digests, changed-vertex
 * counts) and the morph semantics that produced them — not bundle byte hashes, which would red on
 * any unrelated upstream serialization change and teach nobody anything.
 */
function validateBundleGoldens(stack, face, root) {
  const manifestPath = path.join(root, MANIFEST_REL);
  if (!existsSync(manifestPath)) {
    throw new Error('H3C manifest missing; native bundle goldens cannot be verified');
  }
  const parsed = new stack.core.HoloCompositionParser().parse(
    readFileSync(manifestPath, 'utf8'),
  );
  if (!parsed.success || parsed.errors.length) {
    throw new Error(
      `H3C manifest parse failed: ${JSON.stringify(parsed.errors)}`,
    );
  }
  const state = properties(parsed.ast.state);
  const witnessed = state.bundleDigests;
  if (!witnessed || !Array.isArray(witnessed.personas) || !Array.isArray(witnessed.expressions)) {
    throw new Error('H3C manifest carries no witnessed native bundle digests');
  }
  const observedPersonas = face.native.records.flatMap((record) =>
    record.tiers.map((tier) => ({
      personaId: record.personaId,
      level: tier.level,
      vertexCount: tier.vertexCount,
      schemaVersion: tier.bundle.morph.schemaVersion,
      positionDigest: tier.bundle.morph.positionDigest,
    })),
  );
  const observedExpressions = face.native.expressionBundles.map((expression) => ({
    expressionId: expression.expressionId,
    changedVertexCount: expression.morph.changedVertexCount,
    schemaVersion: expression.morph.schemaVersion,
    positionDigest: expression.morph.positionDigest,
  }));
  const normalize = (rows, keys) =>
    JSON.stringify(
      rows.map((row) => Object.fromEntries(keys.map((key) => [key, row[key]]))),
    );
  const personaKeys = ['personaId', 'level', 'vertexCount', 'schemaVersion', 'positionDigest'];
  const expressionKeys = ['expressionId', 'changedVertexCount', 'schemaVersion', 'positionDigest'];
  if (
    normalize(witnessed.personas, personaKeys) !== normalize(observedPersonas, personaKeys)
  ) {
    throw new Error(
      'witnessed native persona bundle digests drifted\n' +
        `  manifest: ${normalize(witnessed.personas, personaKeys)}\n` +
        `  compiled: ${normalize(observedPersonas, personaKeys)}`,
    );
  }
  if (
    normalize(witnessed.expressions, expressionKeys) !==
    normalize(observedExpressions, expressionKeys)
  ) {
    throw new Error(
      'witnessed native expression bundle digests drifted\n' +
        `  manifest: ${normalize(witnessed.expressions, expressionKeys)}\n` +
        `  compiled: ${normalize(observedExpressions, expressionKeys)}`,
    );
  }
  return { personas: observedPersonas, expressions: observedExpressions };
}

function validateManifest(root) {
  const manifestPath = path.join(root, MANIFEST_REL);
  if (!existsSync(manifestPath)) {
    return { status: 'missing', errors: ['manifest missing'] };
  }
  const text = readFileSync(manifestPath, 'utf8');
  // The manifest has always RECORDED a test and report hash; until now it verified
  // neither, so both could drift while the manifest still claimed to pin them.
  const bindings = [
    [SOURCE_REL, /sourceSha256:\s*"([0-9a-f]{64})"/],
    [POLICY_REL, /policySha256:\s*"([0-9a-f]{64})"/],
    [SEED_REL, /seedSha256:\s*"([0-9a-f]{64})"/],
    [
      'scripts/check-hololand-model-village-character-appearance-h3c.mjs',
      /checkerSha256:\s*"([0-9a-f]{64})"/,
    ],
    [
      'scripts/__tests__/hololand-model-village-character-appearance-h3c.test.mjs',
      /testSha256:\s*"([0-9a-f]{64})"/,
    ],
    [
      'docs/reports/HOLOLAND_MODEL_VILLAGE_CHARACTER_APPEARANCE_H3C_2026-07-28.md',
      /reportSha256:\s*"([0-9a-f]{64})"/,
    ],
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

export async function runCharacterAppearanceH3C(
  options = parseArgs([]),
) {
  const stack = await parseH3CStack(
    options.root,
    options.holoScriptRoot,
  );
  const validation = validateH3CContract(
    stack,
    options.root,
    options.holoScriptRoot,
  );
  if (validation.status !== 'pass') {
    throw new Error(validation.errors.join('\n'));
  }
  const face = await compileH3CFaceBundles(
    stack,
    validation.plan,
  );
  const goldens = validateBundleGoldens(stack, face, options.root);
  let visual = null;
  let surface = null;
  if (!options.compileOnly) {
    const modules = await loadWorkspaceModules(
      options.holoScriptRoot,
    );
    surface = await buildBrowserSurface(
      { stack, face },
      options,
      modules,
    );
    visual = await captureBrowser(surface, options, modules);
  }
  const manifest = options.requireManifest
    ? validateManifest(options.root)
    : { status: 'not-required', errors: [] };
  if (manifest.status === 'fail' || manifest.status === 'missing') {
    throw new Error(manifest.errors.join('\n'));
  }
  const receipt = {
    // v2 of the receipt schema: the evidence below is witnessed under the admitted
    // native-facial-morph.v2 orbital-lid blink, not the v1 eye-globe-only blink the
    // .v1 receipts recorded. A reader must not compare the two as like for like.
    schema: 'hololand.model-village.character-appearance-h3c-witness.v2',
    status: 'pass',
    generatedAt: new Date().toISOString(),
    source: {
      path: SOURCE_REL,
      sha256: sha256(stack.sourceText),
      upstreamHoloScriptCommit:
        stack.contract.metadata.upstreamHoloScriptCommit,
    },
    policy: { path: POLICY_REL, sha256: sha256(stack.policyText) },
    seed: { path: SEED_REL, sha256: sha256(stack.seedText) },
    native: {
      bundleCount: face.native.records.flatMap(
        (record) => record.tiers,
      ).length,
      expressionReceiptCount:
        face.native.expressionBundles.length,
      topology: 'neutral-anatomical-v2',
      morphSchemaVersion: face.morphSchemaVersion,
      orbitalLidBlink: face.orbitalLidBlink,
      visualHairLod: 2,
      topologyVertexDelta: face.topologyVertexDelta,
      legacyVertexCount: face.legacyVertexCount,
      bundles: face.native.records.map((record) => ({
        personaId: record.personaId,
        tiers: record.tiers.map(({ bundle, ...tier }) => tier),
      })),
      goldens,
    },
    visual,
    surface,
    manifest,
    boundaries: {
      productionFaceCompleteClaimed: false,
      productionTearFilmClaimed: false,
      admittedMorphSchemaVersion: ADMITTED_MORPH_SCHEMA_VERSION,
      refusedMorphSchemaVersion: REFUSED_MORPH_SCHEMA_VERSION,
      normalsRecomputedAfterMorphClaimed: false,
      // Measured, not asserted: how many compiled bundles actually reported
      // recomputed normals. A non-zero count here means v3 reached this gate.
      measuredNormalsRecomputedBundleCount: [
        ...face.native.records.flatMap((record) => record.tiers),
        ...face.native.expressionBundles,
      ].filter((entry) => entry.bundle?.morph?.normalsRecomputed === true)
        .length,
      photorealismClaimed: false,
      biometricLikenessClaimed: false,
      canonicalWrites: 0,
      residentObservationWrites: 0,
      modelCalls: 0,
      externalNetworkRequests: visual?.externalRequests.length || 0,
    },
  };
  receipt.receiptSha256 = sha256(
    JSON.stringify(canonical(receipt)),
  );
  mkdirSync(options.outputDir, { recursive: true });
  const receiptPath = path.join(
    options.outputDir,
    'character-appearance-h3c-witness.json',
  );
  writeFileSync(
    receiptPath,
    `${JSON.stringify(receipt, null, 2)}\n`,
    'utf8',
  );
  return { receipt, receiptPath };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCharacterAppearanceH3C(parseArgs())
    .then(({ receipt, receiptPath }) => {
      console.error(`[H3C] PASS ${receipt.receiptSha256}`);
      console.error(`[H3C] receipt ${receiptPath}`);
    })
    .catch((error) => {
      console.error(`[H3C] FAIL ${error?.stack || error}`);
      process.exitCode = 1;
    });
}
