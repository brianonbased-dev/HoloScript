#!/usr/bin/env node
/* global atob, console, crypto, document, process, requestAnimationFrame, TextEncoder, window */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  canonicalJson,
  validateCourtyardContract,
} from './check-hololand-model-village-receipt-loom-courtyard.mjs';
import {
  extractBaseBrowserApplication,
  validateMaterialConvergenceContract,
} from './check-hololand-model-village-material-convergence.mjs';
import {
  serializeMaterialSet,
  synthesizeMaterialSet,
} from './lib/model-village-material-synthesis.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const SOURCE_RELATIVE =
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-geometry-convergence.holo';
const BASE_SOURCE_RELATIVE =
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-courtyard.holo';
const BASE_BRIDGE_RELATIVE =
  'scripts/check-hololand-model-village-receipt-loom-courtyard.mjs';
const MATERIAL_SOURCE_RELATIVE =
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-material-convergence.holo';
const MATERIAL_BRIDGE_RELATIVE =
  'scripts/check-hololand-model-village-material-convergence.mjs';
const SYNTHESIS_RELATIVE =
  'scripts/lib/model-village-material-synthesis.mjs';
const CONCEPT_RELATIVE =
  'docs/assets/model-village/model-village-stormglass-commons-concept-2026-07-25.png';
const DEFAULT_OUTPUT_DIR = path.join(
  REPO_ROOT,
  '.tmp',
  'hololand',
  'model-village',
  'geometry-convergence-c',
);
const MATERIAL_SURFACES = Object.freeze([
  'agedTimber',
  'limePlaster',
  'handSplitSlate',
  'wetBasalt',
]);
const KIT_KEYS = Object.freeze([
  'masonryRelief',
  'roofAssembly',
  'windowDepth',
  'timberJoinery',
  'weathering',
]);
const EXPECTED_COUNTS = Object.freeze({
  masonryRelief: 61,
  roofAssembly: 140,
  windowDepth: 50,
  timberJoinery: 25,
  weathering: 14,
});
const EXPECTED_DETAIL_INSTANCES = Object.values(EXPECTED_COUNTS)
  .reduce((sum, count) => sum + count, 0);
const EXPECTED_DETAIL_BATCHES = 15;
const EXPECTED_WINDOW_PROXY_PARTS = 16;
const EXPECTED_FOUNDATION_PROXY_PARTS = 1;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256(readFileSync(filePath));
}

function pngDimensions(buffer) {
  if (
    buffer.length < 24
    || buffer.toString('ascii', 1, 4) !== 'PNG'
    || buffer.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    throw new Error('Screenshot is not a valid PNG');
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function stateProperties(node) {
  return Object.fromEntries(
    (node?.properties || []).map((property) => [property.key, property.value]),
  );
}

function flatten(node, result = []) {
  result.push(node);
  for (const child of node?.children || []) flatten(child, result);
  return result;
}

function resolveHoloScriptRoot(root, explicitRoot) {
  const candidates = [
    explicitRoot,
    process.env.HOLOSCRIPT_ROOT,
    path.resolve(root, '..', 'HoloScript'),
    'C:/Users/josep/Documents/GitHub/HoloScript',
  ].filter(Boolean).map((candidate) => path.resolve(candidate));
  for (const candidate of candidates) {
    if (
      existsSync(path.join(candidate, 'packages', 'core', 'dist', 'index.js'))
      && existsSync(path.join(candidate, 'node_modules', 'three', 'build', 'three.module.js'))
      && existsSync(path.join(candidate, 'node_modules', 'esbuild', 'lib', 'main.js'))
      && existsSync(path.join(candidate, 'node_modules', 'playwright', 'index.mjs'))
    ) {
      return candidate;
    }
  }
  throw new Error(`Built HoloScript toolchain not found: ${candidates.join(', ')}`);
}

function resolveBrowser(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Chrome/Edge executable not found: ${candidates.join(', ')}`);
  return path.resolve(found);
}

function round(value) {
  return Number(value.toFixed(6));
}

function rotateZ(position, angle) {
  const [x, y, z] = position;
  return [
    round(x * Math.cos(angle) - y * Math.sin(angle)),
    round(x * Math.sin(angle) + y * Math.cos(angle)),
    round(z),
  ];
}

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

function placement(
  batch,
  primitive,
  material,
  position,
  rotation,
  scale,
  castShadow = true,
  receiveShadow = true,
) {
  return {
    batch,
    primitive,
    material,
    position: position.map(round),
    rotation: rotation.map(round),
    scale: scale.map(round),
    castShadow,
    receiveShadow,
  };
}

export function buildGeometryPlan(state) {
  const kits = state.geometryKits;
  const plan = [];

  const masonry = kits.masonryRelief;
  const masonryRandom = seeded(masonry.seed);
  plan.push(placement(
    'masonry_backing',
    'box',
    'masonry_mortar',
    [0, 0.45, 0],
    [0, 0, 0],
    [6.6, 0.9, 5.0],
  ));
  masonry.frontCourseBlocks.forEach((count, course) => {
    const span = 6.18;
    const step = span / count;
    for (let index = 0; index < count; index += 1) {
      const width = step * (0.84 + masonryRandom() * 0.1);
      const height = 0.175 + masonryRandom() * 0.025;
      const x = -span / 2 + step * (index + 0.5)
        + (masonryRandom() - 0.5) * masonry.mortarGap;
      plan.push(placement(
        'masonry_front',
        masonry.primitive,
        masonry.material,
        [x, 0.13 + course * 0.215, 2.56 + masonryRandom() * 0.025],
        [
          (masonryRandom() - 0.5) * 0.025,
          (masonryRandom() - 0.5) * 0.02,
          (masonryRandom() - 0.5) * 0.018,
        ],
        [width, height, masonry.reliefDepth],
      ));
    }
  });
  masonry.eastCourseBlocks.forEach((count, course) => {
    const span = 4.58;
    const step = span / count;
    for (let index = 0; index < count; index += 1) {
      const width = step * (0.84 + masonryRandom() * 0.1);
      const height = 0.175 + masonryRandom() * 0.025;
      const z = -span / 2 + step * (index + 0.5)
        + (masonryRandom() - 0.5) * masonry.mortarGap;
      plan.push(placement(
        'masonry_east',
        masonry.primitive,
        masonry.material,
        [3.36 + masonryRandom() * 0.025, 0.13 + course * 0.215, z],
        [
          (masonryRandom() - 0.5) * 0.025,
          Math.PI / 2 + (masonryRandom() - 0.5) * 0.02,
          (masonryRandom() - 0.5) * 0.018,
        ],
        [width, height, masonry.reliefDepth],
      ));
    }
  });

  const roof = kits.roofAssembly;
  const roofRandom = seeded(roof.seed);
  const roofSides = [
    { batch: 'roof_west', center: [-1.48, 5.45, 0], angle: -0.59 },
    { batch: 'roof_east', center: [1.48, 5.45, 0], angle: 0.59 },
  ];
  for (const side of roofSides) {
    for (let row = 0; row < roof.tileRows; row += 1) {
      for (let column = 0; column < roof.tilesPerRow; column += 1) {
        const local = rotateZ([
          -1.5 + column * 0.5,
          0.175 + (row % 2) * 0.012,
          -2.28 + row * 0.57,
        ], side.angle);
        plan.push(placement(
          side.batch,
          roof.primitive,
          roof.material,
          [
            side.center[0] + local[0],
            side.center[1] + local[1],
            side.center[2] + local[2],
          ],
          [
            0,
            (roofRandom() - 0.5) * 0.018,
            side.angle + (roofRandom() - 0.5) * 0.012,
          ],
          [0.535, roof.tileThickness, 0.61],
        ));
      }
    }
  }
  for (let index = 0; index < roof.ridgeCaps; index += 1) {
    plan.push(placement(
      'roof_ridge_caps',
      roof.primitive,
      roof.material,
      [0, 6.58 + (index % 2) * 0.018, -2.38 + index * 0.53],
      [0, (roofRandom() - 0.5) * 0.045, (roofRandom() - 0.5) * 0.025],
      [0.48, 0.19, 0.57],
    ));
  }
  for (const side of roofSides) {
    const eave = rotateZ([-1.83, 0.08, 0], side.angle);
    plan.push(placement(
      'roof_fascia',
      roof.primitive,
      'old_timber',
      [side.center[0] + eave[0], side.center[1] + eave[1], 0],
      [0, 0, side.angle],
      [0.2, 0.25, 5.48],
    ));
    plan.push(placement(
      'roof_fascia',
      roof.primitive,
      'old_timber',
      [side.center[0], side.center[1] + 0.12, 2.67],
      [0, 0, side.angle],
      [3.9, 0.16, 0.18],
    ));
  }

  const windows = kits.windowDepth;
  const windowPositions = [
    [-1.7, 2.2],
    [1.7, 2.2],
    [-1.7, 3.75],
    [1.7, 3.75],
    [0, 5.15],
  ];
  for (const [x, y] of windowPositions) {
    plan.push(placement(
      'window_reveals',
      windows.primitive,
      'window_reveal',
      [x, y, 2.31],
      [0, 0, 0],
      [1.18, 1.2, 0.075],
      false,
      true,
    ));
    plan.push(placement(
      'window_glass',
      windows.primitive,
      'window_hearthlight',
      [x, y, 2.365],
      [0, 0, 0],
      [0.78, 0.82, 0.045],
      false,
      false,
    ));
    const trim = [
      [[x - 0.52, y, 2.46], [0.14, 1.18, 0.17]],
      [[x + 0.52, y, 2.46], [0.14, 1.18, 0.17]],
      [[x, y + 0.53, 2.46], [1.18, 0.14, 0.17]],
      [[x, y - 0.53, 2.46], [1.18, 0.14, 0.17]],
      [[x, y, 2.505], [0.07, 0.86, 0.08]],
      [[x, y, 2.505], [0.82, 0.07, 0.08]],
      [[x, y - 0.66, 2.5], [1.32, 0.15, 0.34]],
      [[x, y + 0.68, 2.49], [1.28, 0.17, 0.25]],
    ];
    for (const [positionValue, scaleValue] of trim) {
      plan.push(placement(
        'window_trim',
        windows.primitive,
        'old_timber',
        positionValue,
        [0, 0, 0],
        scaleValue,
      ));
    }
  }

  const joinery = kits.timberJoinery;
  const pegPositions = [];
  for (const x of [-3.08, 0, 3.08]) {
    for (const y of [1.15, 3.25, 4.35]) pegPositions.push([x, y]);
  }
  pegPositions.push([-3, 1.3], [3, 1.3], [-1.5, 2.225], [1.5, 2.225]);
  for (const [x, y] of pegPositions) {
    plan.push(placement(
      'joinery_pegs',
      joinery.pegPrimitive,
      joinery.material,
      [x, y, 2.555],
      [Math.PI / 2, 0, 0],
      [0.12, 0.16, 0.12],
    ));
  }
  for (const [x, y, angle] of [
    [-3.08, 3.25, 0], [0, 3.25, 0], [3.08, 3.25, 0],
    [-3.08, 4.35, 0], [0, 4.35, 0], [3.08, 4.35, 0],
  ]) {
    plan.push(placement(
      'joinery_repair_plates',
      joinery.platePrimitive,
      joinery.material,
      [x, y, 2.535],
      [0, 0, angle],
      [0.38, 0.13, 0.055],
    ));
  }
  for (const [x, y, angle] of [
    [-3.08, 2.0, 0.22], [-3.08, 3.85, -0.22],
    [0, 2.0, -0.22], [0, 3.85, 0.22],
    [3.08, 2.0, 0.22], [3.08, 3.85, -0.22],
  ]) {
    plan.push(placement(
      'joinery_scarf_keys',
      joinery.platePrimitive,
      'timber_cut',
      [x, y, 2.525],
      [0, 0, angle],
      [0.19, 0.36, 0.07],
    ));
  }

  const weathering = kits.weathering;
  const weatherRandom = seeded(weathering.seed);
  for (let index = 0; index < weathering.stainCount; index += 1) {
    plan.push(placement(
      'weather_stains',
      weathering.stainPrimitive,
      'masonry_weathering',
      [
        -2.7 + index * 0.77 + (weatherRandom() - 0.5) * 0.16,
        0.93 + weatherRandom() * 0.48,
        2.281,
      ],
      [0, 0, (weatherRandom() - 0.5) * 0.12],
      [0.34 + weatherRandom() * 0.22, 0.52 + weatherRandom() * 0.48, 1],
      false,
      false,
    ));
  }
  for (let index = 0; index < weathering.mossLedgeCount; index += 1) {
    plan.push(placement(
      'weather_moss',
      weathering.mossPrimitive,
      'moss',
      [
        -2.75 + index * 1.08 + (weatherRandom() - 0.5) * 0.18,
        0.91 + weatherRandom() * 0.08,
        2.59 + weatherRandom() * 0.035,
      ],
      [weatherRandom() * Math.PI, weatherRandom() * Math.PI, weatherRandom() * Math.PI],
      [0.24 + weatherRandom() * 0.13, 0.08 + weatherRandom() * 0.06, 0.13],
      true,
      true,
    ));
  }

  return plan;
}

export function validateGeometryConvergenceContract(contract, root = REPO_ROOT) {
  const errors = [];
  const { metadata, state, nodes } = contract;
  if (metadata.worldName !== 'Stormglass Commons') {
    errors.push('worldName must be Stormglass Commons');
  }
  if (metadata.artStyle !== 'hearthlight_biorealism') {
    errors.push('artStyle must be hearthlight_biorealism');
  }
  if (metadata.milestone !== 'MV_V1_GEOMETRY_CONVERGENCE_C') {
    errors.push('milestone must be MV_V1_GEOMETRY_CONVERGENCE_C');
  }
  if (metadata.projectionRole !== 'read_only_architectural_development') {
    errors.push('projectionRole must be read_only_architectural_development');
  }
  if (metadata.inheritedSourcesImmutable !== true) {
    errors.push('inheritedSourcesImmutable must be true');
  }
  if (metadata.bridgeMayOwnPresentationOnly !== true) {
    errors.push('bridgeMayOwnPresentationOnly must be true');
  }
  if (metadata.externalAssetsRequired !== false) {
    errors.push('externalAssetsRequired must remain false');
  }
  for (const [relativePath, expectedHash, label] of [
    [metadata.baseScene, metadata.baseSceneSha256, 'base scene'],
    [metadata.baseBridge, metadata.baseBridgeSha256, 'base bridge'],
    [metadata.baseManifest, metadata.baseManifestSha256, 'base manifest'],
    [metadata.materialSource, metadata.materialSourceSha256, 'material source'],
    [metadata.materialBridge, metadata.materialBridgeSha256, 'material bridge'],
    [metadata.materialSynthesis, metadata.materialSynthesisSha256, 'material synthesis'],
    [metadata.materialManifest, metadata.materialManifestSha256, 'material manifest'],
    [metadata.materialHero, metadata.materialHeroSha256, 'material hero'],
    [metadata.referenceConcept, metadata.referenceConceptSha256, 'reference concept'],
  ]) {
    const filePath = path.resolve(root, relativePath || '');
    if (!existsSync(filePath)) {
      errors.push(`${label} file is missing: ${relativePath}`);
    } else if (!SHA256_PATTERN.test(expectedHash || '')) {
      errors.push(`${label} hash must be lowercase sha256`);
    } else if (sha256File(filePath) !== expectedHash) {
      errors.push(`${label} hash does not match ${relativePath}`);
    }
  }
  if (state.authority !== 'read_only') errors.push('authority must be read_only');
  if (state.canonicalWritesAllowed !== false) {
    errors.push('canonicalWritesAllowed must remain false');
  }
  if (state.modelCallsAllowed !== false) errors.push('modelCallsAllowed must remain false');
  if (state.networkFetchesAllowed !== false) {
    errors.push('networkFetchesAllowed must remain false');
  }
  if (state.researchLiveBlindedCompatible !== true) {
    errors.push('geometry convergence must remain live-blinded compatible');
  }
  if (
    state.publicFamilyIdentityPresented !== false
    || state.exactModelIdentityPresented !== false
  ) {
    errors.push('geometry convergence must not expose public or exact model identity');
  }
  for (const [key, expected] of [
    ['productionResidentClaimed', false],
    ['fullWorldConvergenceClaimed', false],
    ['gameplayPhysicsClaimed', false],
    ['scannedAssetClaimed', false],
  ]) {
    if (state[key] !== expected) errors.push(`${key} must remain ${expected}`);
  }
  if (state.sourceGeometryAuthority !== 'holoscript') {
    errors.push('sourceGeometryAuthority must be holoscript');
  }
  if (state.geometryMaterializationBridge !== 'deterministic_local_presentation_only') {
    errors.push('geometryMaterializationBridge must be deterministic_local_presentation_only');
  }
  if (state.detailKitCount !== KIT_KEYS.length) {
    errors.push(`detailKitCount must be ${KIT_KEYS.length}`);
  }
  if (state.detailInstanceCount !== EXPECTED_DETAIL_INSTANCES) {
    errors.push(`detailInstanceCount must be ${EXPECTED_DETAIL_INSTANCES}`);
  }
  if (state.detailBatchCount !== EXPECTED_DETAIL_BATCHES) {
    errors.push(`detailBatchCount must be ${EXPECTED_DETAIL_BATCHES}`);
  }
  if (state.inheritedWindowProxyPartCount !== EXPECTED_WINDOW_PROXY_PARTS) {
    errors.push(`inheritedWindowProxyPartCount must be ${EXPECTED_WINDOW_PROXY_PARTS}`);
  }
  if (state.inheritedFoundationProxyPartCount !== EXPECTED_FOUNDATION_PROXY_PARTS) {
    errors.push(
      `inheritedFoundationProxyPartCount must be ${EXPECTED_FOUNDATION_PROXY_PARTS}`,
    );
  }
  if (
    !Array.isArray(state.inspectionCamera?.position)
    || state.inspectionCamera.position.length !== 3
    || !Array.isArray(state.inspectionCamera?.target)
    || state.inspectionCamera.target.length !== 3
    || state.inspectionCamera.fov < 30
    || state.inspectionCamera.fov > 55
  ) {
    errors.push('inspectionCamera must carry a bounded position, target, and 30-55 degree fov');
  }
  const kits = state.geometryKits || {};
  for (const kitKey of KIT_KEYS) {
    if (!kits[kitKey]) {
      errors.push(`missing geometry kit ${kitKey}`);
      continue;
    }
    if (kits[kitKey].totalInstances !== EXPECTED_COUNTS[kitKey]
      && kits[kitKey].totalBlocks !== EXPECTED_COUNTS[kitKey]) {
      errors.push(`${kitKey} must declare ${EXPECTED_COUNTS[kitKey]} instances`);
    }
  }
  if (Object.keys(kits).sort().join(',') !== [...KIT_KEYS].sort().join(',')) {
    errors.push('geometryKits must contain exactly the five accepted kits');
  }
  const kitNodes = nodes.filter(
    (node) => node.props?.properties?.presentationKit
      === 'deterministic_architectural_detail',
  );
  const nodeKeys = kitNodes.map((node) => node.props.properties.kitKey).sort();
  if (canonicalJson(nodeKeys) !== canonicalJson([...KIT_KEYS].sort())) {
    errors.push('the HoloScript scene must carry one authority node per geometry kit');
  }
  if (kitNodes.some((node) => node.props?.visible !== false)) {
    errors.push('geometry authority nodes must remain invisible');
  }
  let plan = [];
  try {
    plan = buildGeometryPlan(state);
  } catch (error) {
    errors.push(`geometry plan failed: ${error.message}`);
  }
  const batchCount = new Set(plan.map((entry) => entry.batch)).size;
  if (plan.length !== EXPECTED_DETAIL_INSTANCES) {
    errors.push(`geometry plan must materialize ${EXPECTED_DETAIL_INSTANCES} instances`);
  }
  if (batchCount !== EXPECTED_DETAIL_BATCHES) {
    errors.push(`geometry plan must materialize ${EXPECTED_DETAIL_BATCHES} batches`);
  }
  for (const kitKey of KIT_KEYS) {
    const expected = EXPECTED_COUNTS[kitKey];
    const prefixes = {
      masonryRelief: ['masonry_'],
      roofAssembly: ['roof_'],
      windowDepth: ['window_'],
      timberJoinery: ['joinery_'],
      weathering: ['weather_'],
    }[kitKey];
    const count = plan.filter(
      (entry) => prefixes.some((prefix) => entry.batch.startsWith(prefix)),
    ).length;
    if (count !== expected) errors.push(`${kitKey} plan count must be ${expected}`);
  }
  return {
    schema: 'hololand.model-village.geometry-convergence-contract.v1',
    status: errors.length === 0 ? 'pass' : 'fail',
    errors,
    counts: {
      kits: Object.keys(kits).length,
      instances: plan.length,
      batches: batchCount,
      authorityNodes: kitNodes.length,
    },
    plan,
  };
}

async function parseComposition(core, sourcePath) {
  const sourceText = readFileSync(sourcePath, 'utf8');
  const parsed = new core.HoloCompositionParser().parse(sourceText);
  if (!parsed.success) {
    throw new Error(
      `${path.basename(sourcePath)} HoloCompositionParser failed: ${canonicalJson(parsed.errors)}`,
    );
  }
  const sceneIr = new core.SceneIRCompiler({ defaultLighting: false })
    .compileComposition(parsed.ast);
  return {
    sourcePath,
    sourceText,
    sourceHash: sha256(sourceText),
    sceneIr,
    sceneIrHash: sha256(canonicalJson(sceneIr)),
    contract: {
      metadata: parsed.ast.metadata,
      state: stateProperties(parsed.ast.state),
      environment: stateProperties(parsed.ast.environment),
      nodes: flatten(sceneIr)
        .filter((node) => node.type !== 'group')
        .map((node) => ({ id: node.id || null, type: node.type, props: node.props || {} })),
    },
  };
}

async function compileGeometryConvergence(root, holoScriptRoot) {
  const corePath = path.join(holoScriptRoot, 'packages', 'core', 'dist', 'index.js');
  const core = await import(pathToFileURL(corePath).href);
  const geometry = await parseComposition(core, path.resolve(root, SOURCE_RELATIVE));
  const material = await parseComposition(core, path.resolve(root, MATERIAL_SOURCE_RELATIVE));
  const base = await parseComposition(core, path.resolve(root, BASE_SOURCE_RELATIVE));
  const baseBridgePath = path.resolve(root, BASE_BRIDGE_RELATIVE);
  const baseBridgeText = readFileSync(baseBridgePath, 'utf8');
  const geometryValidation = validateGeometryConvergenceContract(geometry.contract, root);
  const materialValidation = validateMaterialConvergenceContract(material.contract, root);
  const baseValidation = validateCourtyardContract(base.contract, root);
  for (const [label, validation] of [
    ['geometry', geometryValidation],
    ['material', materialValidation],
    ['base courtyard', baseValidation],
  ]) {
    if (validation.status !== 'pass') {
      throw new Error(`${label} source contract failed: ${validation.errors.join('; ')}`);
    }
  }
  if (sha256(baseBridgeText) !== geometry.contract.metadata.baseBridgeSha256) {
    throw new Error('Base bridge changed after Geometry Convergence C was authored');
  }
  const materialSets = Object.fromEntries(
    MATERIAL_SURFACES.map((surfaceKey) => [
      surfaceKey,
      serializeMaterialSet(synthesizeMaterialSet(
        material.contract.state.materialSurfaces[surfaceKey],
      )),
    ]),
  );
  const plan = geometryValidation.plan;
  const planCanonical = canonicalJson(plan);
  return {
    geometry: {
      ...geometry,
      validation: geometryValidation,
      plan,
      planCanonical,
      planHash: sha256(planCanonical),
    },
    material: {
      ...material,
      validation: materialValidation,
      sets: materialSets,
    },
    base: {
      ...base,
      validation: baseValidation,
      bridgePath: baseBridgePath,
      bridgeHash: sha256(baseBridgeText),
      browserApplication: extractBaseBrowserApplication(baseBridgeText),
    },
    corePath,
    coreHash: sha256File(corePath),
  };
}

async function geometryConvergenceBrowserApplication(
  THREE,
  RoomEnvironment,
  payload,
  baseApplication,
) {
  const convergence = {
    schema: 'hololand.model-village.geometry-convergence-browser.v1',
    ready: false,
    status: 'booting',
    error: null,
  };
  window.__MV_GEOMETRY_CONVERGENCE__ = convergence;
  try {
    const channelNames = ['albedo', 'normal', 'roughness', 'clearcoat'];
    const decodedSets = {};
    for (const [surfaceKey, materialSet] of Object.entries(payload.material.sets)) {
      decodedSets[surfaceKey] = {
        ...materialSet,
        channels: Object.fromEntries(channelNames.map((channel) => {
          const binary = atob(materialSet.channels[channel]);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
          }
          return [channel, bytes];
        })),
      };
    }

    const textures = {};
    const appliedMaterials = [];
    const materialsByName = {};
    const makeTexture = (surfaceKey, channel) => {
      const cacheKey = `${surfaceKey}:${channel}`;
      if (textures[cacheKey]) return textures[cacheKey];
      const materialSet = decodedSets[surfaceKey];
      const texture = new THREE.DataTexture(
        materialSet.channels[channel],
        materialSet.resolution,
        materialSet.resolution,
        THREE.RGBAFormat,
        THREE.UnsignedByteType,
      );
      texture.name = `mv:${surfaceKey}:${channel}`;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(...materialSet.repeat);
      texture.colorSpace = channel === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      textures[cacheKey] = texture;
      return texture;
    };

    class ConvergedPhysicalMaterial extends THREE.MeshPhysicalMaterial {
      constructor(parameters = {}) {
        super(parameters);
        const surfaceKey = payload.material.bindings[parameters.name];
        if (surfaceKey) {
          const materialSet = decodedSets[surfaceKey];
          this.map = makeTexture(surfaceKey, 'albedo');
          this.normalMap = makeTexture(surfaceKey, 'normal');
          this.roughnessMap = makeTexture(surfaceKey, 'roughness');
          this.clearcoatMap = makeTexture(surfaceKey, 'clearcoat');
          this.color.set('#ffffff');
          this.normalScale = new THREE.Vector2(
            materialSet.normalScale,
            materialSet.normalScale,
          );
          if (parameters.name === 'wet_basalt') {
            this.clearcoat = 0.48;
            this.clearcoatRoughness = 0.24;
          } else if (parameters.name === 'dry_basalt') {
            this.clearcoat = 0.12;
            this.clearcoatRoughness = 0.46;
          } else if (parameters.name === 'slate_roof') {
            this.clearcoat = 0.31;
            this.clearcoatRoughness = 0.34;
          } else if (
            parameters.name === 'old_timber'
            || parameters.name === 'timber_cut'
          ) {
            this.clearcoat = 0.08;
            this.clearcoatRoughness = 0.58;
          }
          this.needsUpdate = true;
          appliedMaterials.push({
            material: parameters.name,
            surfaceKey,
            channels: [...channelNames],
          });
        }
        if (parameters.name) materialsByName[parameters.name] = this;
      }
    }

    let capturedRenderer = null;
    let capturedScene = null;
    let capturedCamera = null;
    class CapturingRenderer extends THREE.WebGLRenderer {
      constructor(parameters) {
        super(parameters);
        capturedRenderer = this;
      }
    }
    class CapturingScene extends THREE.Scene {
      constructor() {
        super();
        capturedScene = this;
      }
    }
    class CapturingCamera extends THREE.PerspectiveCamera {
      constructor(...args) {
        super(...args);
        capturedCamera = this;
      }
    }

    const patchedThree = {
      ...THREE,
      MeshPhysicalMaterial: ConvergedPhysicalMaterial,
      WebGLRenderer: CapturingRenderer,
      Scene: CapturingScene,
      PerspectiveCamera: CapturingCamera,
    };
    await baseApplication(patchedThree, RoomEnvironment, payload.base);
    const baseWitness = window.__MV_COURTYARD_WITNESS__;
    if (baseWitness?.status !== 'pass') {
      throw new Error(`Inherited courtyard application failed: ${baseWitness?.error || 'unknown'}`);
    }
    if (!capturedRenderer || !capturedScene || !capturedCamera) {
      throw new Error('Geometry bridge did not capture renderer, scene, and camera');
    }
    const cottage = capturedScene.getObjectByName('TimberBasaltCottage');
    const loom = capturedScene.getObjectByName('ReceiptLoom');
    if (!cottage || !loom) throw new Error('Accepted cottage or Receipt Loom is missing');

    const hiddenNames = new Set(payload.geometry.inheritedWindowProxyNames);
    let inheritedWindowProxyPartsHidden = 0;
    let inheritedFoundationProxyPartsHidden = 0;
    cottage.traverse((object) => {
      if (hiddenNames.has(object.name)) {
        object.visible = false;
        inheritedWindowProxyPartsHidden += 1;
      }
      if (object.name === 'BasaltFoundation') {
        object.visible = false;
        inheritedFoundationProxyPartsHidden += 1;
      }
    });

    const detailMaterials = {
      ...materialsByName,
    };
    detailMaterials.dry_basalt_detail = materialsByName.dry_basalt.clone();
    detailMaterials.dry_basalt_detail.name = 'dry_basalt_detail';
    detailMaterials.dry_basalt_detail.color.set('#566166');
    detailMaterials.dry_basalt_detail.roughness = 0.96;
    detailMaterials.dry_basalt_detail.clearcoat = 0;
    detailMaterials.dry_basalt_detail.clearcoatMap = null;
    detailMaterials.dry_basalt_detail.normalMap = null;
    detailMaterials.dry_basalt_detail.envMapIntensity = 0.18;
    detailMaterials.window_reveal = new THREE.MeshPhysicalMaterial({
      name: 'window_reveal',
      color: '#070a0d',
      roughness: 0.93,
      metalness: 0,
    });
    detailMaterials.masonry_mortar = new THREE.MeshPhysicalMaterial({
      name: 'masonry_mortar',
      color: '#11191d',
      roughness: 0.97,
      metalness: 0,
      envMapIntensity: 0.12,
    });
    detailMaterials.masonry_weathering = new THREE.MeshPhysicalMaterial({
      name: 'masonry_weathering',
      color: '#263029',
      roughness: 0.98,
      metalness: 0,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });

    const bevelShape = new THREE.Shape();
    bevelShape.moveTo(-0.5, -0.5);
    bevelShape.lineTo(0.5, -0.5);
    bevelShape.lineTo(0.5, 0.5);
    bevelShape.lineTo(-0.5, 0.5);
    bevelShape.closePath();
    const beveledBox = new THREE.ExtrudeGeometry(bevelShape, {
      depth: 1,
      steps: 1,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.015,
      bevelThickness: 0.015,
    });
    beveledBox.translate(0, 0, -0.5);
    beveledBox.computeVertexNormals();
    const geometries = {
      beveled_box: beveledBox,
      box: new THREE.BoxGeometry(1, 1, 1),
      cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
      circle: new THREE.CircleGeometry(0.5, 18),
      icosahedron: new THREE.IcosahedronGeometry(0.5, 1),
    };
    const batches = new Map();
    for (const item of payload.geometry.plan) {
      if (!batches.has(item.batch)) batches.set(item.batch, []);
      batches.get(item.batch).push(item);
    }
    const matrix = new THREE.Matrix4();
    const positionValue = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scaleValue = new THREE.Vector3();
    const detailMeshes = [];
    for (const [batchName, items] of batches) {
      const first = items[0];
      const geometry = geometries[first.primitive];
      const material = detailMaterials[first.material];
      if (!geometry || !material) {
        throw new Error(`Missing geometry or material for ${batchName}`);
      }
      const mesh = new THREE.InstancedMesh(geometry, material, items.length);
      mesh.name = `GeometryConvergence:${batchName}`;
      mesh.castShadow = items.some((item) => item.castShadow);
      mesh.receiveShadow = items.some((item) => item.receiveShadow);
      mesh.frustumCulled = false;
      items.forEach((item, index) => {
        positionValue.fromArray(item.position);
        euler.set(...item.rotation);
        quaternion.setFromEuler(euler);
        scaleValue.fromArray(item.scale);
        matrix.compose(positionValue, quaternion, scaleValue);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      cottage.add(mesh);
      detailMeshes.push(mesh);
    }

    capturedCamera.position.fromArray(payload.geometry.camera.position);
    capturedCamera.fov = payload.geometry.camera.fov;
    capturedCamera.near = payload.geometry.camera.near;
    capturedCamera.far = payload.geometry.camera.far;
    capturedCamera.lookAt(...payload.geometry.camera.target);
    capturedCamera.updateProjectionMatrix();
    capturedRenderer.shadowMap.needsUpdate = true;
    capturedRenderer.render(capturedScene, capturedCamera);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    capturedRenderer.render(capturedScene, capturedCamera);

    const browserHashes = {};
    for (const [surfaceKey, materialSet] of Object.entries(decodedSets)) {
      browserHashes[surfaceKey] = {};
      for (const channel of channelNames) {
        const digest = await crypto.subtle.digest(
          'SHA-256',
          materialSet.channels[channel],
        );
        browserHashes[surfaceKey][channel] = [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
      }
    }
    const planDigest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(payload.geometry.planCanonical),
    );
    const browserPlanHash = [...new Uint8Array(planDigest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');

    const uniqueMaterials = new Set();
    let shadowCasterBatches = 0;
    capturedScene.traverse((object) => {
      if (object.material) {
        const objectMaterials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of objectMaterials) uniqueMaterials.add(material.uuid);
      }
      if (object.name?.startsWith('GeometryConvergence:') && object.castShadow) {
        shadowCasterBatches += 1;
      }
    });
    const projectBox = (object) => {
      const bounds = new THREE.Box3().setFromObject(object);
      const points = [];
      for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
          for (const z of [bounds.min.z, bounds.max.z]) {
            const projected = new THREE.Vector3(x, y, z).project(capturedCamera);
            points.push({
              x: (projected.x * 0.5 + 0.5) * payload.geometry.width,
              y: (-projected.y * 0.5 + 0.5) * payload.geometry.height,
            });
          }
        }
      }
      const left = Math.max(0, Math.min(...points.map((point) => point.x)));
      const right = Math.min(
        payload.geometry.width,
        Math.max(...points.map((point) => point.x)),
      );
      const top = Math.max(0, Math.min(...points.map((point) => point.y)));
      const bottom = Math.min(
        payload.geometry.height,
        Math.max(...points.map((point) => point.y)),
      );
      return {
        left,
        right,
        top,
        bottom,
        width: right - left,
        height: bottom - top,
        widthRatio: (right - left) / payload.geometry.width,
        heightRatio: (bottom - top) / payload.geometry.height,
      };
    };
    const rendererInfo = {
      calls: capturedRenderer.info.render.calls,
      triangles: capturedRenderer.info.render.triangles,
      points: capturedRenderer.info.render.points,
      lines: capturedRenderer.info.render.lines,
      geometries: capturedRenderer.info.memory.geometries,
      textures: capturedRenderer.info.memory.textures,
      materialCount: uniqueMaterials.size,
    };

    document.title = 'Receipt Loom Courtyard — Geometry Convergence C';
    const eyebrow = document.querySelector('.eyebrow');
    if (eyebrow) eyebrow.textContent = 'STORMGLASS COMMONS // GEOMETRY CONVERGENCE C';
    const subtitle = document.querySelector('header p');
    if (subtitle) {
      subtitle.textContent =
        'Hearthlight Biorealism · HoloScript-authored architectural relief · local GPU WebGL2';
    }
    const truthLabels = document.querySelectorAll('.truth span');
    if (truthLabels.length >= 3) {
      truthLabels[0].textContent = 'READ-ONLY GEOMETRY TRACER';
      truthLabels[1].textContent = `${payload.geometry.plan.length} AUTHORED DETAILS`;
      truthLabels[2].textContent = `${batches.size} BATCHED ASSEMBLIES`;
    }

    convergence.ready = true;
    convergence.status = 'pass';
    convergence.sourceHash = payload.geometry.sourceHash;
    convergence.sceneIrHash = payload.geometry.sceneIrHash;
    convergence.planHash = browserPlanHash;
    convergence.materialSourceHash = payload.material.sourceHash;
    convergence.baseBridgeHash = payload.baseBridgeHash;
    convergence.browserMaterialHashes = browserHashes;
    convergence.appliedMaterials = appliedMaterials;
    convergence.detail = {
      kitCount: payload.geometry.kitCount,
      instanceCount: payload.geometry.plan.length,
      batchCount: batches.size,
      shadowCasterBatches,
      inheritedWindowProxyPartsHidden,
      inheritedFoundationProxyPartsHidden,
      rendererInfo,
      compositionMetrics: {
        cottage: projectBox(cottage),
        loom: projectBox(loom),
      },
    };
    convergence.presentation = {
      publicFamilyIdentityPresented: false,
      exactModelIdentityPresented: false,
      productionResidentClaimed: false,
      canonicalWritesAllowed: false,
      modelCalls: 0,
    };
    baseWitness.geometryConvergence = convergence;
    window.__MV_GEOMETRY_CONVERGENCE_SNAPSHOT__ = () => ({
      base: baseWitness,
      convergence,
    });
  } catch (error) {
    convergence.ready = true;
    convergence.status = 'fail';
    convergence.error = error?.stack || error?.message || String(error);
  }
}

async function buildSurface(outputDir, holoScriptRoot, compiled) {
  const esbuildPath = path.join(holoScriptRoot, 'node_modules', 'esbuild', 'lib', 'main.js');
  const esbuild = await import(pathToFileURL(esbuildPath).href);
  const bundlePath = path.join(outputDir, 'geometry-convergence-c.bundle.js');
  const htmlPath = path.join(outputDir, 'geometry-convergence-c.html');
  const budget = compiled.geometry.contract.state.qualityBudget;
  const payload = {
    schema: 'hololand.model-village.geometry-convergence-render-payload.v1',
    baseBridgeHash: compiled.base.bridgeHash,
    material: {
      sourceHash: compiled.material.sourceHash,
      bindings: compiled.material.contract.state.surfaceBindings,
      sets: compiled.material.sets,
    },
    geometry: {
      sourceHash: compiled.geometry.sourceHash,
      sceneIrHash: compiled.geometry.sceneIrHash,
      planHash: compiled.geometry.planHash,
      planCanonical: compiled.geometry.planCanonical,
      plan: compiled.geometry.plan,
      kitCount: compiled.geometry.contract.state.detailKitCount,
      inheritedWindowProxyNames:
        compiled.geometry.contract.state.geometryKits.windowDepth.inheritedProxyNames,
      camera: compiled.geometry.contract.state.inspectionCamera,
      width: budget.renderWidth,
      height: budget.renderHeight,
    },
    base: {
      schema: 'hololand.model-village.receipt-loom-courtyard-render-payload.v1',
      metadata: compiled.base.contract.metadata,
      state: compiled.base.contract.state,
      environment: compiled.base.contract.environment,
      nodes: compiled.base.contract.nodes,
      sourceHash: compiled.base.sourceHash,
      sceneIrHash: compiled.base.sceneIrHash,
    },
  };
  const appSource = [
    "import * as THREE from 'three';",
    "import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';",
    `const PAYLOAD = ${JSON.stringify(payload)};`,
    `const BASE_APPLICATION = ${compiled.base.browserApplication};`,
    `(${geometryConvergenceBrowserApplication.toString()})(`,
    '  THREE, RoomEnvironment, PAYLOAD, BASE_APPLICATION,',
    ');',
  ].join('\n');
  await esbuild.build({
    stdin: {
      contents: appSource,
      resolveDir: holoScriptRoot,
      sourcefile: 'geometry-convergence-c.entry.js',
      loader: 'js',
    },
    outfile: bundlePath,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome120'],
    minify: false,
    sourcemap: false,
    nodePaths: [path.join(holoScriptRoot, 'node_modules')],
    logLevel: 'silent',
  });
  writeFileSync(
    htmlPath,
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Receipt Loom Courtyard — Geometry Convergence C</title>
</head>
<body>
  <script src="./geometry-convergence-c.bundle.js"></script>
</body>
</html>
`,
    'utf8',
  );
  return {
    htmlPath,
    htmlHash: sha256File(htmlPath),
    bundlePath,
    bundleHash: sha256File(bundlePath),
    appSourceHash: sha256(appSource),
    baseBrowserApplicationHash: sha256(compiled.base.browserApplication),
    esbuildPath,
    esbuildHash: sha256File(esbuildPath),
  };
}

function rendererIsSoftware(gl) {
  return [
    gl?.maskedRenderer,
    gl?.unmaskedRenderer,
    gl?.maskedVendor,
    gl?.unmaskedVendor,
  ].join(' ').toLowerCase().match(
    /swiftshader|llvmpipe|software rasterizer|lavapipe/,
  );
}

async function captureBrowser({
  browserPath,
  holoScriptRoot,
  htmlPath,
  heroPath,
  timeoutMs,
}) {
  const playwrightPath = path.join(holoScriptRoot, 'node_modules', 'playwright', 'index.mjs');
  const { chromium } = await import(pathToFileURL(playwrightPath).href);
  const externalRequests = [];
  const consoleMessages = [];
  const pageErrors = [];
  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: [
      '--use-angle=d3d11',
      '--ignore-gpu-blocklist',
      '--enable-gpu',
      '--disable-background-networking',
      '--disable-dev-shm-usage',
      '--disable-features=Translate,MediaRouter',
    ],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1,
    });
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith('file:') && !url.startsWith('data:')) externalRequests.push(url);
    });
    page.on('console', (message) => {
      consoleMessages.push({ type: message.type(), text: message.text() });
    });
    page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));
    await page.goto(pathToFileURL(htmlPath).href, {
      waitUntil: 'load',
      timeout: timeoutMs,
    });
    await page.waitForFunction(
      () => window.__MV_GEOMETRY_CONVERGENCE__?.ready === true,
      undefined,
      { timeout: timeoutMs },
    );
    const state = await page.evaluate(
      () => window.__MV_GEOMETRY_CONVERGENCE_SNAPSHOT__?.()
        || { convergence: window.__MV_GEOMETRY_CONVERGENCE__ },
    );
    if (state.convergence?.status !== 'pass') {
      throw new Error(
        `Browser geometry witness failed: ${
          state.convergence?.error || state.convergence?.status
        }`,
      );
    }
    await page.screenshot({ path: heroPath, type: 'png' });
    return {
      browserVersion: await browser.version(),
      state,
      externalRequests,
      consoleMessages,
      pageErrors,
    };
  } finally {
    await browser.close();
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    root: REPO_ROOT,
    outputDir: DEFAULT_OUTPUT_DIR,
    heroOutput: null,
    holoScriptRoot: null,
    browser: null,
    timeoutMs: 60_000,
    clean: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') options.root = path.resolve(argv[++index]);
    else if (arg === '--output') options.outputDir = path.resolve(argv[++index]);
    else if (arg === '--hero-output') options.heroOutput = path.resolve(argv[++index]);
    else if (arg === '--holoscript-root') options.holoScriptRoot = path.resolve(argv[++index]);
    else if (arg === '--browser') options.browser = path.resolve(argv[++index]);
    else if (arg === '--timeout-ms') options.timeoutMs = Number(argv[++index]);
    else if (arg === '--no-clean') options.clean = false;
    else if (arg === '--help') {
      console.log(`Usage: node scripts/check-hololand-model-village-geometry-convergence.mjs [options]
  --root <path>             HoloLand repository root
  --output <path>           Witness output directory
  --hero-output <path>      Optional durable 1600x900 PNG path
  --holoscript-root <path>  Built HoloScript checkout
  --browser <path>          Chrome or Edge executable
  --timeout-ms <number>     Browser timeout (default 60000)
  --no-clean                Preserve prior output directory contents`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

export async function runGeometryConvergenceCheck(options = {}) {
  const root = path.resolve(options.root || REPO_ROOT);
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT_DIR);
  const holoScriptRoot = resolveHoloScriptRoot(root, options.holoScriptRoot);
  const browserPath = resolveBrowser(options.browser);
  if (options.clean !== false && existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true });
  }
  mkdirSync(outputDir, { recursive: true });

  const compiled = await compileGeometryConvergence(root, holoScriptRoot);
  const surface = await buildSurface(outputDir, holoScriptRoot, compiled);
  const heroPath = path.resolve(
    options.heroOutput || path.join(outputDir, 'geometry-convergence-c-1600x900.png'),
  );
  mkdirSync(path.dirname(heroPath), { recursive: true });
  const browser = await captureBrowser({
    browserPath,
    holoScriptRoot,
    htmlPath: surface.htmlPath,
    heroPath,
    timeoutMs: options.timeoutMs || 60_000,
  });
  const heroBuffer = readFileSync(heroPath);
  const state = browser.state;
  const convergence = state.convergence;
  const base = state.base;
  const budget = compiled.geometry.contract.state.qualityBudget;
  const expectedMaterialHashes = Object.fromEntries(MATERIAL_SURFACES.map((surfaceKey) => [
    surfaceKey,
    compiled.material.sets[surfaceKey].hashes,
  ]));
  const rendererInfo = convergence.detail.rendererInfo;
  const checks = {
    geometryContractPass: compiled.geometry.validation.status === 'pass',
    materialContractPass: compiled.material.validation.status === 'pass',
    baseContractPass: compiled.base.validation.status === 'pass',
    sourceHashReachedBrowser:
      convergence.sourceHash === compiled.geometry.sourceHash,
    sceneIrHashReachedBrowser:
      convergence.sceneIrHash === compiled.geometry.sceneIrHash,
    geometryPlanHashReachedBrowser:
      convergence.planHash === compiled.geometry.planHash,
    immutableMaterialSourceReachedBrowser:
      convergence.materialSourceHash === compiled.material.sourceHash,
    immutableBaseBridgeReachedBrowser:
      convergence.baseBridgeHash === compiled.base.bridgeHash,
    materialBytesReachedBrowser:
      canonicalJson(convergence.browserMaterialHashes)
        === canonicalJson(expectedMaterialHashes),
    detailCounts:
      convergence.detail.kitCount === KIT_KEYS.length
      && convergence.detail.instanceCount === EXPECTED_DETAIL_INSTANCES
      && convergence.detail.batchCount === EXPECTED_DETAIL_BATCHES,
    inheritedWindowProxyReplaced:
      convergence.detail.inheritedWindowProxyPartsHidden
        === EXPECTED_WINDOW_PROXY_PARTS,
    inheritedFoundationProxyReplaced:
      convergence.detail.inheritedFoundationProxyPartsHidden
        === EXPECTED_FOUNDATION_PROXY_PARTS,
    detailCastsShadows: convergence.detail.shadowCasterBatches >= 10,
    webgl2: base.gl?.webgl2 === true,
    hardwareRenderer: !rendererIsSoftware(base.gl),
    d3d11Backend: /direct3d11|d3d11/i.test(base.gl?.unmaskedRenderer || ''),
    noExternalRequests: browser.externalRequests.length === 0,
    noPageErrors: browser.pageErrors.length === 0,
    drawCallBudget: rendererInfo.calls <= budget.maxDrawCalls,
    triangleBudget: rendererInfo.triangles <= budget.maxTriangles,
    materialBudget: rendererInfo.materialCount <= budget.maxMaterials,
    textureBudget: rendererInfo.textures <= budget.maxTextures,
    detailBatchBudget: convergence.detail.batchCount <= budget.maxDetailBatches,
    lockedResolution:
      pngDimensions(heroBuffer).width === budget.renderWidth
      && pngDimensions(heroBuffer).height === budget.renderHeight,
    cottageInspectionComposition:
      convergence.detail.compositionMetrics.cottage.widthRatio >= 0.34
      && convergence.detail.compositionMetrics.cottage.heightRatio >= 0.48,
    neutralResidentBoundary:
      base.presentation?.neutralCraftfolkCount === 2
      && convergence.presentation?.publicFamilyIdentityPresented === false
      && convergence.presentation?.exactModelIdentityPresented === false
      && convergence.presentation?.productionResidentClaimed === false,
    readOnlyBoundary:
      convergence.presentation?.canonicalWritesAllowed === false
      && convergence.presentation?.modelCalls === 0,
  };
  const failures = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const receiptCore = {
    schema: 'hololand.model-village.geometry-convergence-witness.v1',
    status: failures.length === 0 ? 'pass' : 'fail',
    claim: {
      verified:
        'Five HoloScript-owned architectural detail kits materialized as 290 deterministic instances in 15 batches, inherited the immutable A and B witnesses, and rendered on the local D3D11 GPU path.',
      bounded:
        'Geometry Convergence C adds masonry relief, slate thickness, recessed-window staging, timber joinery, and restrained weathering to one Receipt Loom cottage. It does not claim production resident assets, scanned architecture, full-world convergence, gameplay physics, atmosphere convergence, or measured real-time performance.',
    },
    sources: {
      geometryOverlay: {
        path: SOURCE_RELATIVE,
        sha256: compiled.geometry.sourceHash,
        sceneIrSha256: compiled.geometry.sceneIrHash,
        planSha256: compiled.geometry.planHash,
      },
      materialOverlay: {
        path: MATERIAL_SOURCE_RELATIVE,
        sha256: compiled.material.sourceHash,
        sceneIrSha256: compiled.material.sceneIrHash,
      },
      baseCourtyard: {
        path: BASE_SOURCE_RELATIVE,
        sha256: compiled.base.sourceHash,
        sceneIrSha256: compiled.base.sceneIrHash,
      },
      inheritedBridge: {
        path: BASE_BRIDGE_RELATIVE,
        sha256: compiled.base.bridgeHash,
        browserApplicationSha256: surface.baseBrowserApplicationHash,
      },
      materialBridge: {
        path: MATERIAL_BRIDGE_RELATIVE,
        sha256: sha256File(path.resolve(root, MATERIAL_BRIDGE_RELATIVE)),
      },
      materialSynthesis: {
        path: SYNTHESIS_RELATIVE,
        sha256: sha256File(path.resolve(root, SYNTHESIS_RELATIVE)),
      },
      concept: {
        path: CONCEPT_RELATIVE,
        sha256: sha256File(path.resolve(root, CONCEPT_RELATIVE)),
      },
      checker: {
        path: path.relative(root, SCRIPT_PATH).replaceAll('\\', '/'),
        sha256: sha256File(SCRIPT_PATH),
      },
      holoScriptCore: {
        path: compiled.corePath,
        sha256: compiled.coreHash,
      },
    },
    geometry: {
      kits: Object.fromEntries(KIT_KEYS.map((kitKey) => [
        kitKey,
        {
          instances: EXPECTED_COUNTS[kitKey],
          seed: compiled.geometry.contract.state.geometryKits[kitKey].seed,
          physicalReading:
            compiled.geometry.contract.state.geometryKits[kitKey].physicalReading,
        },
      ])),
      instanceCount: convergence.detail.instanceCount,
      batchCount: convergence.detail.batchCount,
      shadowCasterBatches: convergence.detail.shadowCasterBatches,
      inheritedWindowProxyPartsHidden:
        convergence.detail.inheritedWindowProxyPartsHidden,
      inheritedFoundationProxyPartsHidden:
        convergence.detail.inheritedFoundationProxyPartsHidden,
      inspectionCamera: compiled.geometry.contract.state.inspectionCamera,
    },
    bridge: {
      route:
        'HoloScript geometry overlay -> deterministic placement plan -> immutable A application with immutable B material binding -> batched Three/WebGL2 presentation',
      appSourceSha256: surface.appSourceHash,
      bundleSha256: surface.bundleHash,
      htmlSha256: surface.htmlHash,
      esbuildSha256: surface.esbuildHash,
      inheritedSourcesImmutable: true,
      externalAssets: [],
    },
    render: {
      hero: {
        path: path.relative(root, heroPath).replaceAll('\\', '/'),
        sha256: sha256(heroBuffer),
        bytes: heroBuffer.length,
        ...pngDimensions(heroBuffer),
      },
      gl: base.gl,
      renderer: base.renderer,
      rendererInfo,
      compositionMetrics: convergence.detail.compositionMetrics,
      browserVersion: browser.browserVersion,
      externalRequests: browser.externalRequests,
      consoleMessages: browser.consoleMessages,
      pageErrors: browser.pageErrors,
    },
    boundaries: {
      authority: 'read_only',
      canonicalWritesAllowed: false,
      modelCalls: 0,
      externalNetworkRequests: browser.externalRequests.length,
      publicFamilyIdentityPresented: false,
      exactModelIdentityPresented: false,
      neutralCraftfolkCount: base.presentation?.neutralCraftfolkCount,
      productionResidentClaimed: false,
      fullWorldConvergenceClaimed: false,
      gameplayPhysicsClaimed: false,
      scannedAssetClaimed: false,
      atmosphereConvergenceClaimed: false,
      measuredRealTimePerformanceClaimed: false,
    },
    checks,
    failures,
    residue: [
      'ship Atmosphere Convergence D with sealed weather, vegetation, water, smoke, and lighting evidence before claiming environmental convergence',
      'replace the two neutral Craftfolk staging forms with receipted production resident assets before claiming resident convergence',
      'expand the authored modular building kit beyond this single cottage before claiming full-world architecture convergence',
      'measure a production frame-time distribution before claiming performance convergence',
      'keep live research identity-blinded while public model-family embodiments remain a separate admitted presentation projection',
    ],
  };
  const receipt = {
    ...receiptCore,
    receipt: {
      algorithm: 'sha256-canonical-json',
      receiptHash: sha256(canonicalJson(receiptCore)),
    },
  };
  const receiptPath = path.join(outputDir, 'geometry-convergence-c-witness.json');
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  if (failures.length > 0) {
    throw new Error(
      `Geometry convergence witness failed: ${failures.join(', ')}. Receipt: ${receiptPath}`,
    );
  }
  return { receipt, receiptPath, heroPath };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH;
if (isMain) {
  runGeometryConvergenceCheck(parseArgs())
    .then(({ receipt, receiptPath, heroPath }) => {
      console.log(JSON.stringify({
        status: receipt.status,
        receiptPath,
        receiptHash: receipt.receipt.receiptHash,
        heroPath,
        heroHash: receipt.render.hero.sha256,
        gl: receipt.render.gl,
        rendererInfo: receipt.render.rendererInfo,
        geometry: receipt.geometry,
      }, null, 2));
    })
    .catch((error) => {
      console.error(error?.stack || error);
      process.exitCode = 1;
    });
}
