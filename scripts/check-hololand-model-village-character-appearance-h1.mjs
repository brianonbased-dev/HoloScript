#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const DEFAULT_HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h1.holo';
const POLICY_REL =
  'source/proofs/model-village-character-appearance-h1-policy.hsplus';
const SEED_REL =
  'source/proofs/model-village-character-appearance-h1-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h1-manifest.holo';
const TEST_REL =
  'scripts/__tests__/hololand-model-village-character-appearance-h1.test.mjs';
const REPORT_REL =
  'docs/reports/HOLOLAND_MODEL_VILLAGE_CHARACTER_APPEARANCE_H1_2026-07-27.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-appearance-h1-hero-2026-07-27.png';
const COMPARISON_REL =
  'docs/assets/model-village/model-village-character-appearance-h1-lods-2026-07-27.png';
const ATLAS_RELS = Object.freeze({
  albedo:
    'assets/model-village/materials/stormglass-character-body-cloth-albedo-2k.png',
  normal:
    'assets/model-village/materials/stormglass-character-body-cloth-normal-2k.png',
  surfaceMask:
    'assets/model-village/materials/stormglass-character-body-cloth-surface-mask-1k.png',
});
const DEFAULT_OUTPUT = path.join(
  ROOT,
  '.tmp',
  'hololand',
  'model-village',
  'character-appearance-h1',
);
const REQUIRED_PROFILES = Object.freeze([
  'village_story_unblinded',
  'research_live_blinded',
  'research_replay_postlock',
  'visitor_player',
]);
const REQUIRED_REGIONS = Object.freeze([
  'woven_teal',
  'woven_charcoal',
  'weathered_leather',
  'aged_bronze',
]);
const REQUIRED_RESET_EVENTS = Object.freeze([
  'camera_cut',
  'lod_change',
  'profile_change',
  'topology_change',
]);
const REGION_RECTS = Object.freeze({
  woven_teal: [0.5, 0.5, 0.5, 0.5],
  woven_charcoal: [0, 0.5, 0.5, 0.5],
  weathered_leather: [0, 0, 0.5, 0.5],
  aged_bronze: [0.5, 0, 0.5, 0.5],
});

function sha256(value) {
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
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonical(value));
}

function properties(node) {
  return Object.fromEntries(
    (node?.properties || []).map((property) => [property.key, property.value]),
  );
}

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * quantile) - 1),
  );
  return sorted[index];
}

function summary(values) {
  return {
    samples: values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    maximum: values.length ? Math.max(...values) : 0,
  };
}

async function loadCore(holoScriptRoot) {
  return import(
    pathToFileURL(path.join(holoScriptRoot, 'packages/core/dist/index.js')).href
  );
}

async function parseStack(root, holoScriptRoot) {
  const core = await loadCore(holoScriptRoot);
  const sourceText = readFileSync(path.join(root, SOURCE_REL), 'utf8');
  const policyText = readFileSync(path.join(root, POLICY_REL), 'utf8');
  const seedText = readFileSync(path.join(root, SEED_REL), 'utf8');
  const source = new core.HoloCompositionParser().parse(sourceText);
  const policy = new core.HoloScriptPlusParser().parse(policyText);
  const seed = new core.HoloScriptCodeParser().parse(seedText);
  if (!source.success || source.errors.length) {
    throw new Error(`H1 .holo parse failed: ${JSON.stringify(source.errors)}`);
  }
  if (!policy.success || policy.errors.length) {
    throw new Error(`H1 .hsplus parse failed: ${JSON.stringify(policy.errors)}`);
  }
  if (!seed.success || seed.errors.length) {
    throw new Error(`H1 .hs parse failed: ${JSON.stringify(seed.errors)}`);
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
        name: object.name,
        ...properties(object),
      })),
    },
  };
}

export function buildAppearancePlan(contract) {
  const surfaceParts = contract.objects
    .filter((object) => object.type === 'stormglass_character_surface_part')
    .map((part) => ({
      name: part.name,
      partId: part.partId,
      geometryProfile: part.geometryProfile,
      position: part.position,
      rotationDegrees: part.rotationDegrees,
      dimensions: part.dimensions,
      materialRegion: part.materialRegion,
      visibleThroughLod: part.visibleThroughLod,
    }));
  return {
    milestone: contract.metadata.milestone,
    presentationProfile: contract.state.presentationProfile,
    appearanceLayers: contract.state.appearanceLayers,
    profiles: contract.state.profiles,
    identityFirewall: contract.state.identityFirewall,
    atlas: contract.state.atlas,
    lod: contract.state.lod,
    benchmark: contract.state.benchmark,
    heroCamera: contract.state.heroCamera,
    lodCamera: contract.state.lodCamera,
    surfaceParts,
  };
}

export function validateAppearanceContract(contract, root = ROOT) {
  const errors = [];
  const state = contract.state;
  const metadata = contract.metadata;
  const expect = (condition, message) => {
    if (!condition) errors.push(message);
  };
  expect(
    metadata.milestone === 'MV_CHARACTER_APPEARANCE_H0_H1',
    'milestone must be MV_CHARACTER_APPEARANCE_H0_H1',
  );
  expect(
    metadata.artStyle === 'hearthlight_biorealism',
    'art style must remain hearthlight_biorealism',
  );
  expect(
    state.presentationProfile === 'village_story_unblinded',
    'surface witness must use village_story_unblinded',
  );
  for (const [key, expected] of [
    ['familyIdentityVisible', false],
    ['liveResearchJoinAllowed', false],
    ['canonicalWritesAllowed', false],
    ['residentObservationWritesAllowed', false],
    ['modelCallsAllowed', false],
    ['networkFetchesAllowed', false],
    ['inheritedBodyImmutable', true],
    ['inheritedPerformanceImmutable', true],
    ['nativeRigPreserved', true],
    ['mantleSocketPreserved', true],
    ['clothSimulationClaimed', false],
    ['motionRetargetingClaimed', false],
    ['hairStyleGeometryClaimed', false],
    ['facsMorphTargetsClaimed', false],
    ['productionBodyCompleteClaimed', false],
    ['observerPromotionClaimed', false],
    ['fullWorldConvergenceClaimed', false],
  ]) {
    expect(state[key] === expected, `${key} must equal ${expected}`);
  }
  expect(
    state.researchSeatBinding === 'absent',
    'researchSeatBinding must remain absent',
  );
  expect(
    canonicalJson(state.inheritedSemanticClips) ===
      canonicalJson(['idle', 'listen', 'propose', 'settle']),
    'inherited semantic clips drifted',
  );
  expect(state.inheritedLiveJointCount === 55, 'inherited joint count must be 55');
  const layerIds = (state.appearanceLayers || []).map((layer) => layer.id);
  expect(
    canonicalJson(layerIds) ===
      canonicalJson(['dermal_profile', 'outfit_skin', 'presentation_appearance']),
    'appearance layers must be dermal/outfit/presentation in order',
  );
  expect(
    state.appearanceLayers?.[0]?.mayEncodeFamilyIdentity === false &&
      state.appearanceLayers?.[1]?.mayEncodeFamilyIdentity === false,
    'dermal and outfit layers may not encode family identity',
  );
  expect(
    canonicalJson((state.profiles || []).map((profile) => profile.id)) ===
      canonicalJson(REQUIRED_PROFILES),
    'profile matrix drifted',
  );
  expect(
    state.profiles?.find((profile) => profile.id === 'research_live_blinded')
      ?.familyIdentityAdmission === 'absent',
    'live research profile must admit no family identity',
  );
  expect(
    canonicalJson(state.identityFirewall?.allowedPublicFamilyChannels) ===
      canonicalJson(['detachable_mantle', 'glyph', 'caption']),
    'allowed family identity channels drifted',
  );
  expect(
    state.identityFirewall?.biometricPersistenceAllowed === false,
    'biometric persistence must remain disabled',
  );
  expect(
    canonicalJson(state.atlas?.regions) === canonicalJson(REQUIRED_REGIONS),
    'atlas regions drifted',
  );
  expect(
    canonicalJson(state.atlas?.externalUris) === '[]',
    'atlas must have no external URIs',
  );
  expect(
    canonicalJson(state.lod?.levels) === canonicalJson([0, 1, 2]) &&
      canonicalJson(state.lod?.maximumTriangles) ===
        canonicalJson([15000, 6000, 2000]),
    'LOD levels or budgets drifted',
  );
  expect(state.lod?.maximumMaterialGroups === 2, 'material-group budget must be 2');
  expect(
    state.benchmark?.warmupFrames === 300 &&
      state.benchmark?.measuredFrames === 600,
    'benchmark protocol must be 300 warm-up plus 600 measured frames',
  );
  const parts = contract.objects.filter(
    (object) => object.type === 'stormglass_character_surface_part',
  );
  expect(parts.length === 25, `expected 25 authored surface parts, found ${parts.length}`);
  expect(
    new Set(parts.map((part) => part.partId)).size === parts.length,
    'surface part IDs must be unique',
  );
  for (const part of parts) {
    expect(
      Array.isArray(part.position) &&
        part.position.length === 3 &&
        part.position.every(Number.isFinite),
      `${part.partId} position must be a finite vec3`,
    );
    expect(
      Array.isArray(part.rotationDegrees) &&
        part.rotationDegrees.length === 3 &&
        part.rotationDegrees.every(Number.isFinite),
      `${part.partId} rotationDegrees must be a finite vec3`,
    );
    expect(
      Array.isArray(part.dimensions) &&
        part.dimensions.length === 3 &&
        part.dimensions.every((value) => Number.isFinite(value) && value > 0),
      `${part.partId} dimensions must be positive`,
    );
    expect(
      [...REQUIRED_REGIONS, 'stormglass_visor'].includes(part.materialRegion),
      `${part.partId} has unsupported material region`,
    );
    expect(
      [0, 1, 2].includes(part.visibleThroughLod),
      `${part.partId} visibleThroughLod must be 0, 1, or 2`,
    );
  }
  for (const [pathKey, hashKey] of [
    ['appearancePlan', 'appearancePlanSha256'],
    ['artDirectionSource', 'artDirectionSourceSha256'],
    ['inheritedBodySource', 'inheritedBodySourceSha256'],
    ['inheritedBodyManifest', 'inheritedBodyManifestSha256'],
    ['inheritedBodyReport', 'inheritedBodyReportSha256'],
    ['inheritedPerformanceManifest', 'inheritedPerformanceManifestSha256'],
  ]) {
    const relative = metadata[pathKey];
    const expectedHash = metadata[hashKey];
    const absolute = path.resolve(root, relative || '');
    expect(Boolean(relative && expectedHash && existsSync(absolute)), `${pathKey} is missing`);
    if (relative && expectedHash && existsSync(absolute)) {
      expect(sha256File(absolute) === expectedHash, `${pathKey} hash drifted`);
    }
  }
  return { status: errors.length ? 'fail' : 'pass', errors };
}

function regionAt(x, y, size) {
  const left = x < size / 2;
  const top = y < size / 2;
  if (left && top) return 'woven_charcoal';
  if (!left && top) return 'woven_teal';
  if (left) return 'weathered_leather';
  return 'aged_bronze';
}

function noise2d(x, y, seed) {
  let value =
    Math.imul((x + seed) | 0, 374761393) ^
    Math.imul((y - seed) | 0, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function materialSample(region, x, y, seed) {
  const n = noise2d(x, y, seed);
  const n2 = noise2d(Math.floor(x / 5), Math.floor(y / 7), seed + 19);
  if (region === 'woven_teal' || region === 'woven_charcoal') {
    const teal = region === 'woven_teal';
    const warp = Math.sin(x * 1.19) * 0.5;
    const weft = Math.sin(y * 1.31) * 0.5;
    const broad = Math.sin(x * 0.011 + y * 0.007) * 0.5;
    const fiber = warp * 0.14 + weft * 0.12 + broad * 0.06 + (n - 0.5) * 0.08;
    const base = teal ? [46, 91, 104] : [29, 40, 50];
    return {
      rgb: base.map((value) =>
        Math.max(0, Math.min(255, Math.round(value + fiber * (teal ? 25 : 18)))),
      ),
      height: fiber * 0.28,
      roughness: teal ? 0.76 + n * 0.08 : 0.80 + n * 0.07,
      metalness: 0,
      ao: 0.88 + n * 0.08,
    };
  }
  if (region === 'weathered_leather') {
    const grain = Math.sin((x + Math.sin(y * 0.03) * 10) * 0.055) * 0.5;
    const scratch = n > 0.994 ? 30 : 0;
    return {
      rgb: [
        Math.round(82 + grain * 18 + n2 * 11 + scratch),
        Math.round(53 + grain * 10 + n2 * 7 + scratch * 0.55),
        Math.round(36 + grain * 7 + n2 * 5 + scratch * 0.25),
      ],
      height: grain * 0.28 + (n - 0.5) * 0.18,
      roughness: 0.58 + n * 0.22,
      metalness: 0,
      ao: 0.78 + n * 0.16,
    };
  }
  const patina = n > 0.965 ? 1 : 0;
  const brushed = Math.sin(y * 0.17 + Math.sin(x * 0.013) * 2) * 0.5;
  return {
    rgb: patina
      ? [45 + Math.round(n2 * 20), 112 + Math.round(n2 * 32), 105 + Math.round(n2 * 25)]
      : [
          136 + Math.round(brushed * 24 + n2 * 10),
          82 + Math.round(brushed * 14 + n2 * 8),
          35 + Math.round(brushed * 8 + n2 * 5),
        ],
    height: brushed * 0.18 + (n - 0.5) * 0.12,
    roughness: 0.28 + n * 0.22,
    metalness: 0.82 + n * 0.12,
    ao: 0.76 + n * 0.18,
  };
}

function writePixel(data, index, red, green, blue, alpha = 255) {
  data[index] = Math.max(0, Math.min(255, red));
  data[index + 1] = Math.max(0, Math.min(255, green));
  data[index + 2] = Math.max(0, Math.min(255, blue));
  data[index + 3] = alpha;
}

export function generateAtlasBuffers(PNG, atlas) {
  const seed = atlas.seed;
  const build = (width, height, kind) => {
    const image = new PNG({ width, height });
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const region = regionAt(x, y, width);
        const sample = materialSample(region, x, y, seed);
        const index = (y * width + x) * 4;
        if (kind === 'albedo') {
          writePixel(image.data, index, ...sample.rgb);
        } else if (kind === 'normal') {
          const right = materialSample(region, x + 1, y, seed).height;
          const down = materialSample(region, x, y + 1, seed).height;
          const nx = sample.height - right;
          const ny = sample.height - down;
          const nz = 1.65;
          const length = Math.hypot(nx, ny, nz) || 1;
          writePixel(
            image.data,
            index,
            Math.round((nx / length * 0.5 + 0.5) * 255),
            Math.round((ny / length * 0.5 + 0.5) * 255),
            Math.round((nz / length * 0.5 + 0.5) * 255),
          );
        } else {
          writePixel(
            image.data,
            index,
            Math.round(sample.ao * 255),
            Math.round(sample.roughness * 255),
            Math.round(sample.metalness * 255),
          );
        }
      }
    }
    return PNG.sync.write(image, {
      colorType: 6,
      inputColorType: 6,
      bitDepth: 8,
      deflateLevel: 9,
      deflateStrategy: 3,
    });
  };
  return {
    albedo: build(atlas.albedoSize[0], atlas.albedoSize[1], 'albedo'),
    normal: build(atlas.normalSize[0], atlas.normalSize[1], 'normal'),
    surfaceMask: build(
      atlas.surfaceMaskSize[0],
      atlas.surfaceMaskSize[1],
      'surfaceMask',
    ),
  };
}

function characterSurfaceBrowserApplication(
  THREE,
  RoundedBoxGeometry,
  RoomEnvironment,
  mergeGeometries,
  PAYLOAD,
) {
  const root = document.getElementById('app');
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(1);
  renderer.setSize(PAYLOAD.benchmark.renderWidth, PAYLOAD.benchmark.renderHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#06101d');
  scene.fog = new THREE.FogExp2('#071321', 0.047);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(
    PAYLOAD.heroCamera.fov,
    PAYLOAD.benchmark.renderWidth / PAYLOAD.benchmark.renderHeight,
    PAYLOAD.heroCamera.near,
    PAYLOAD.heroCamera.far,
  );
  const setCamera = (profile) => {
    camera.position.fromArray(profile.position);
    camera.lookAt(...profile.target);
    camera.fov = profile.fov;
    camera.near = profile.near;
    camera.far = profile.far;
    camera.updateProjectionMatrix();
  };
  setCamera(PAYLOAD.heroCamera);

  scene.add(new THREE.HemisphereLight('#93b9d0', '#07101a', 1.35));
  const key = new THREE.DirectionalLight('#ffd7a4', 5.6);
  key.position.set(3.5, 5.5, 4.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -3;
  key.shadow.camera.right = 3;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -1;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#61bde0', 4.4);
  rim.position.set(-4, 3.5, -2.6);
  scene.add(rim);
  const faceFill = new THREE.PointLight('#6ad6df', 15, 5, 2);
  faceFill.position.set(0, 2.1, 2.1);
  scene.add(faceFill);

  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(2.05, 2.18, 0.18, 64),
    new THREE.MeshStandardMaterial({
      color: '#172532',
      roughness: 0.42,
      metalness: 0.32,
      envMapIntensity: 0.8,
    }),
  );
  ground.position.y = -0.1;
  ground.receiveShadow = true;
  scene.add(ground);
  const inlay = new THREE.Mesh(
    new THREE.TorusGeometry(1.68, 0.018, 10, 128),
    new THREE.MeshStandardMaterial({
      color: '#b46c37',
      emissive: '#7b351d',
      emissiveIntensity: 0.45,
      metalness: 0.82,
      roughness: 0.26,
    }),
  );
  inlay.rotation.x = Math.PI / 2;
  inlay.position.y = 0.005;
  scene.add(inlay);
  for (let index = 0; index < 3; index += 1) {
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(2.5 + index * 0.28, 0.018, 8, 96, Math.PI),
      new THREE.MeshBasicMaterial({
        color: index === 0 ? '#2c6072' : '#173545',
        transparent: true,
        opacity: 0.46 - index * 0.08,
      }),
    );
    arch.position.set(0, 0.12, -1.85 - index * 0.2);
    arch.rotation.z = Math.PI;
    scene.add(arch);
  }

  const textureLoader = new THREE.TextureLoader();
  const loadTexture = (url, colorSpace = THREE.NoColorSpace) =>
    new Promise((resolve, reject) => {
      textureLoader.load(
        url,
        (texture) => {
          texture.colorSpace = colorSpace;
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
          resolve(texture);
        },
        undefined,
        reject,
      );
    });

  let activeCharacter = null;
  let activeLod = 0;
  let characterSummary = null;

  function applyUvRegion(geometry, regionName) {
    const rect = PAYLOAD.atlasRegions[regionName];
    const uv = geometry.getAttribute('uv');
    if (!uv || !rect) return;
    for (let index = 0; index < uv.count; index += 1) {
      uv.setXY(
        index,
        rect[0] + uv.getX(index) * rect[2],
        rect[1] + uv.getY(index) * rect[3],
      );
    }
    uv.needsUpdate = true;
  }

  function partGeometry(part, lod) {
    const radial = PAYLOAD.lod.radialSegments[lod];
    const caps = PAYLOAD.lod.capSegments[lod];
    const rounded = PAYLOAD.lod.roundedBoxSegments[lod];
    const [a, b, c] = part.dimensions;
    let geometry;
    if (part.geometryProfile === 'rounded_box') {
      geometry = new RoundedBoxGeometry(a, b, c, rounded, Math.min(a, b, c) * 0.18);
    } else if (part.geometryProfile === 'tailored_skirt') {
      geometry = new THREE.CylinderGeometry(b, a, c, radial, 2, false);
    } else if (part.geometryProfile === 'hood_shell') {
      geometry = new THREE.SphereGeometry(1, radial, Math.max(6, caps * 2));
      geometry.scale(a, b, c);
    } else if (part.geometryProfile === 'stormglass_visor') {
      geometry = new THREE.SphereGeometry(1, radial, Math.max(6, caps * 2));
      geometry.scale(a, b, c);
    } else if (part.geometryProfile === 'hood_brow') {
      geometry = new THREE.BoxGeometry(
        a * 1.8,
        b * 1.7,
        c * 1.8,
      );
    } else if (part.geometryProfile === 'shoulder_panel') {
      geometry = new RoundedBoxGeometry(
        a * 1.75,
        b * 1.45,
        c * 1.4,
        rounded,
        Math.min(a, b, c) * 0.55,
      );
    } else if (part.geometryProfile === 'tapered_capsule') {
      const radius = a * 0.88;
      geometry = new THREE.CapsuleGeometry(
        radius,
        Math.max(0.06, b * 1.45 - radius * 2),
        Math.max(3, caps),
        radial,
      );
      geometry.scale(1, 1, c / Math.max(a, 0.001));
    } else if (part.geometryProfile === 'cuff') {
      geometry = new THREE.CylinderGeometry(a, a * 0.9, b, radial, 1, false);
      geometry.scale(1, 1, c / Math.max(a, 0.001));
    } else if (part.geometryProfile === 'gloved_hand') {
      const radius = Math.min(a, c) * 0.55;
      geometry = new THREE.CapsuleGeometry(
        radius,
        Math.max(0.04, b - radius * 2),
        Math.max(3, caps),
        radial,
      );
      geometry.scale(a / Math.max(radius * 2, 0.001), 1, c / Math.max(radius * 2, 0.001));
    } else if (part.geometryProfile === 'boot') {
      geometry = new RoundedBoxGeometry(a, b, c, rounded, Math.min(a, b, c) * 0.24);
    } else if (part.geometryProfile === 'belt') {
      geometry = new THREE.CylinderGeometry(a, a, b, radial, 1, false);
      geometry.scale(1, 1, c / Math.max(a, 0.001));
    } else if (
      part.geometryProfile === 'buckle' ||
      part.geometryProfile === 'clasp'
    ) {
      geometry = new THREE.TorusGeometry(a, b, Math.max(4, caps), radial);
      geometry.scale(1, 1, c / Math.max(a, 0.001));
    } else if (part.geometryProfile === 'vertical_seam') {
      geometry = new THREE.CylinderGeometry(a, a, b, Math.max(6, radial), 1);
      geometry.scale(1, 1, c / Math.max(a, 0.001));
    } else if (part.geometryProfile === 'hem_ring') {
      geometry = new THREE.TorusGeometry(a, b, Math.max(4, caps), radial);
      geometry.scale(1, 1, c / Math.max(a, 0.001));
    } else {
      throw new Error(`Unsupported H1 geometry profile ${part.geometryProfile}`);
    }
    if (geometry.index) geometry = geometry.toNonIndexed();
    geometry.computeVertexNormals();
    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(part.rotationDegrees[0]),
      THREE.MathUtils.degToRad(part.rotationDegrees[1]),
      THREE.MathUtils.degToRad(part.rotationDegrees[2]),
      'XYZ',
    );
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...part.position),
      new THREE.Quaternion().setFromEuler(euler),
      new THREE.Vector3(1, 1, 1),
    );
    geometry.applyMatrix4(matrix);
    if (part.materialRegion !== 'stormglass_visor') {
      applyUvRegion(geometry, part.materialRegion);
    }
    return geometry;
  }

  function buildCharacter(lod, textures) {
    const admitted = PAYLOAD.surfaceParts.filter(
      (part) => part.visibleThroughLod >= lod,
    );
    const opaqueParts = admitted.filter(
      (part) => part.materialRegion !== 'stormglass_visor',
    );
    const visorPart = admitted.find(
      (part) => part.materialRegion === 'stormglass_visor',
    );
    const opaqueGeometries = opaqueParts.map((part) => partGeometry(part, lod));
    const opaqueGeometry = mergeGeometries(opaqueGeometries, false);
    opaqueGeometry.computeBoundingBox();
    opaqueGeometry.computeBoundingSphere();
    const atlasMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: textures.albedo,
      normalMap: textures.normal,
      normalScale: new THREE.Vector2(0.72, 0.72),
      roughness: 1,
      roughnessMap: textures.surfaceMask,
      metalness: 1,
      metalnessMap: textures.surfaceMask,
      envMapIntensity: 1.08,
    });
    const opaqueMesh = new THREE.Mesh(opaqueGeometry, atlasMaterial);
    opaqueMesh.castShadow = opaqueMesh.receiveShadow = true;
    const group = new THREE.Group();
    group.add(opaqueMesh);
    let visorTriangles = 0;
    let visorVertexCount = 0;
    if (visorPart) {
      const visorGeometry = partGeometry(visorPart, lod);
      const visorMaterial = new THREE.MeshPhysicalMaterial({
        color: '#245a69',
        emissive: '#0c3849',
        emissiveIntensity: 0.65,
        metalness: 0.08,
        roughness: 0.1,
        transmission: 0.32,
        thickness: 0.22,
        ior: 1.72,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        envMapIntensity: 1.5,
      });
      const visorMesh = new THREE.Mesh(visorGeometry, visorMaterial);
      visorMesh.castShadow = true;
      group.add(visorMesh);
      visorTriangles = visorGeometry.index
        ? visorGeometry.index.count / 3
        : visorGeometry.getAttribute('position').count / 3;
      visorVertexCount = visorGeometry.getAttribute('position').count;
    }
    const opaqueTriangles = opaqueGeometry.index
      ? opaqueGeometry.index.count / 3
      : opaqueGeometry.getAttribute('position').count / 3;
    group.rotation.y = -0.18;
    return {
      group,
      summary: {
        lod,
        admittedPartCount: admitted.length,
        opaquePartCount: opaqueParts.length,
        triangleCount: Math.round(opaqueTriangles + visorTriangles),
        vertexCount:
          opaqueGeometry.getAttribute('position').count +
          visorVertexCount,
        materialGroupCount: 2,
      },
    };
  }

  function disposeCharacter(character) {
    if (!character) return;
    character.traverse((node) => {
      node.geometry?.dispose?.();
      if (Array.isArray(node.material)) node.material.forEach((item) => item.dispose());
      else node.material?.dispose?.();
    });
    scene.remove(character);
  }

  async function main() {
    const textures = {
      albedo: await loadTexture(PAYLOAD.atlasDataUrls.albedo, THREE.SRGBColorSpace),
      normal: await loadTexture(PAYLOAD.atlasDataUrls.normal),
      surfaceMask: await loadTexture(PAYLOAD.atlasDataUrls.surfaceMask),
    };
    const lodSummaries = [];
    for (let lod = 0; lod < 3; lod += 1) {
      const built = buildCharacter(lod, textures);
      lodSummaries.push(built.summary);
      disposeCharacter(built.group);
    }
    const setLod = async (lod, cameraProfile = PAYLOAD.lodCamera) => {
      disposeCharacter(activeCharacter);
      const built = buildCharacter(lod, textures);
      activeCharacter = built.group;
      activeLod = lod;
      characterSummary = built.summary;
      scene.add(activeCharacter);
      setCamera(cameraProfile);
      renderer.render(scene, camera);
      await new Promise(requestAnimationFrame);
      renderer.render(scene, camera);
      document.getElementById('lod-label').textContent =
        `LOD${lod} · ${built.summary.triangleCount.toLocaleString()} tris · ` +
        `${built.summary.admittedPartCount} source parts`;
      return built.summary;
    };
    await setLod(0, PAYLOAD.heroCamera);

    const intervals = [];
    const submit = [];
    let previous = performance.now();
    const total = PAYLOAD.benchmark.warmupFrames + PAYLOAD.benchmark.measuredFrames;
    for (let frame = 0; frame < total; frame += 1) {
      await new Promise(requestAnimationFrame);
      const now = performance.now();
      const interval = now - previous;
      previous = now;
      const start = performance.now();
      renderer.render(scene, camera);
      const elapsed = performance.now() - start;
      if (frame >= PAYLOAD.benchmark.warmupFrames) {
        intervals.push(interval);
        submit.push(elapsed);
      }
    }
    const gl = renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererName = debug
      ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    const benchmark = {
      raf: PAYLOAD.summarize(intervals),
      renderSubmit: PAYLOAD.summarize(submit),
      droppedFrames: intervals.filter(
        (value) => value > PAYLOAD.benchmark.droppedFrameThresholdMilliseconds,
      ).length,
      droppedFrameRatio:
        intervals.filter(
          (value) => value > PAYLOAD.benchmark.droppedFrameThresholdMilliseconds,
        ).length / intervals.length,
    };
    document.getElementById('perf-label').textContent =
      `rAF p95 ${benchmark.raf.p95.toFixed(2)} ms · submit p95 ` +
      `${benchmark.renderSubmit.p95.toFixed(2)} ms`;
    window.__h1SetLod = setLod;
    window.__H1 = {
      renderer: {
        unmaskedRenderer: rendererName,
        version: gl.getParameter(gl.VERSION),
        backend: rendererName.includes('D3D11') ? 'D3D11' : 'unknown',
        software: /SwiftShader|llvmpipe|software/i.test(rendererName),
      },
      benchmark,
      lodSummaries,
      activeLod,
      characterSummary,
      resetEvents: PAYLOAD.resetEvents,
      materialGroupCount: 2,
      externalAssets: [],
    };
    window.__H1_READY__ = true;
  }
  main().catch((error) => {
    window.__H1_ERROR__ = error?.stack || String(error);
    console.error(error);
  });
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    root: ROOT,
    holoScriptRoot: DEFAULT_HOLOSCRIPT_ROOT,
    outputDir: DEFAULT_OUTPUT,
    writeArtifacts: false,
    skipManifest: false,
    heroOutput: null,
    comparisonOutput: null,
    reportOutput: null,
    browser: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    timeoutMs: 180000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') options.root = path.resolve(argv[++index]);
    else if (arg === '--holoscript-root') {
      options.holoScriptRoot = path.resolve(argv[++index]);
    } else if (arg === '--output') options.outputDir = path.resolve(argv[++index]);
    else if (arg === '--write-artifacts') options.writeArtifacts = true;
    else if (arg === '--skip-manifest') options.skipManifest = true;
    else if (arg === '--hero-output') options.heroOutput = path.resolve(argv[++index]);
    else if (arg === '--comparison-output') {
      options.comparisonOutput = path.resolve(argv[++index]);
    } else if (arg === '--report-output') {
      options.reportOutput = path.resolve(argv[++index]);
    } else if (arg === '--browser') options.browser = path.resolve(argv[++index]);
    else if (arg === '--timeout-ms') options.timeoutMs = Number(argv[++index]);
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/check-hololand-model-village-character-appearance-h1.mjs [options]

  --root <path>                HoloLand repository root
  --holoscript-root <path>     Built HoloScript checkout
  --output <path>              Ephemeral witness directory
  --write-artifacts            Write deterministic atlases to durable paths
  --hero-output <path>         Optional durable 1600x900 hero PNG
  --comparison-output <path>   Optional durable 2400x600 LOD comparison PNG
  --report-output <path>       Optional durable Markdown report
  --skip-manifest              Bootstrap before immutable manifest exists
  --browser <path>             Chrome executable
  --timeout-ms <number>        Browser timeout`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

async function loadWorkspaceModules(holoScriptRoot) {
  const workspaceRequire = createRequire(path.join(holoScriptRoot, 'package.json'));
  const importResolved = async (name) =>
    import(pathToFileURL(workspaceRequire.resolve(name)).href);
  const png = await importResolved('pngjs');
  const sharpModule = await importResolved('sharp');
  const playwrightModule = await importResolved('playwright');
  return {
    PNG: png.PNG || png.default?.PNG,
    sharp: sharpModule.default || sharpModule,
    esbuild: await importResolved('esbuild'),
    playwright: playwrightModule.chromium
      ? playwrightModule
      : playwrightModule.default,
  };
}

function writeAtlasOutputs(buffers, destinations) {
  for (const [kind, destination] of Object.entries(destinations)) {
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, buffers[kind]);
  }
}

async function buildBrowserSurface(
  stack,
  plan,
  atlasBuffers,
  options,
  modules,
) {
  const outputDir = options.outputDir;
  mkdirSync(outputDir, { recursive: true });
  const bundlePath = path.join(outputDir, 'character-appearance-h1.bundle.js');
  const htmlPath = path.join(outputDir, 'index.html');
  const payload = {
    benchmark: plan.benchmark,
    heroCamera: plan.heroCamera,
    lodCamera: plan.lodCamera,
    lod: plan.lod,
    surfaceParts: plan.surfaceParts,
    atlasRegions: REGION_RECTS,
    atlasDataUrls: Object.fromEntries(
      Object.entries(atlasBuffers).map(([key, buffer]) => [
        key,
        `data:image/png;base64,${buffer.toString('base64')}`,
      ]),
    ),
    resetEvents: REQUIRED_RESET_EVENTS,
    summarize: summary,
  };
  const appSource = [
    "import * as THREE from 'three';",
    "import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';",
    "import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';",
    "import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';",
    `const PAYLOAD = ${JSON.stringify(payload)};`,
    `PAYLOAD.summarize = (values) => ({
      samples: values.length,
      p50: values.length ? [...values].sort((a,b)=>a-b)[Math.max(0, Math.ceil(values.length*0.50)-1)] : 0,
      p95: values.length ? [...values].sort((a,b)=>a-b)[Math.max(0, Math.ceil(values.length*0.95)-1)] : 0,
      p99: values.length ? [...values].sort((a,b)=>a-b)[Math.max(0, Math.ceil(values.length*0.99)-1)] : 0,
      maximum: values.length ? Math.max(...values) : 0,
    });`,
    `(${characterSurfaceBrowserApplication.toString()})(THREE, RoundedBoxGeometry, RoomEnvironment, mergeGeometries, PAYLOAD);`,
  ].join('\n');
  try {
    await modules.esbuild.build({
      stdin: {
        contents: appSource,
        resolveDir: options.holoScriptRoot,
        sourcefile: 'character-appearance-h1.entry.js',
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
  <title>Stormglass Character Appearance H1</title>
  <style>
    html,body,#app{margin:0;width:100%;height:100%;overflow:hidden;background:#06101d}
    canvas{display:block}
    .hud{position:fixed;inset:0;pointer-events:none;color:#eaf7fb;font-family:Inter,Segoe UI,sans-serif}
    .eyebrow{position:absolute;left:42px;top:34px;color:#79d4e2;font:700 12px/1.2 ui-monospace,monospace;letter-spacing:.22em}
    h1{position:absolute;left:40px;top:48px;margin:0;font:600 42px/1.05 Georgia,serif;text-shadow:0 2px 18px #000}
    .sub{position:absolute;left:42px;top:102px;color:#a9c3cf;font:500 13px/1.5 ui-monospace,monospace}
    .card{position:absolute;right:34px;top:30px;width:300px;padding:18px 20px;border:1px solid #355464;border-radius:14px;background:rgba(5,14,24,.82);box-shadow:0 18px 60px #0009}
    .label{color:#6ed0df;font:700 10px/1.4 ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase}
    .value{margin-top:7px;color:#edf7fa;font:600 14px/1.5 ui-monospace,monospace}
    .rule{height:1px;background:#27414e;margin:13px 0}
    .foot{position:absolute;left:42px;bottom:30px;color:#8da8b5;font:600 10px/1.4 ui-monospace,monospace;letter-spacing:.12em}
    .truth{position:absolute;right:34px;bottom:30px;color:#8fb3bf;font:600 10px/1.4 ui-monospace,monospace;text-align:right}
  </style>
</head>
<body>
  <div id="app"></div>
  <div class="hud">
    <div class="eyebrow">STORMGLASS COMMONS // CHARACTER APPEARANCE H1</div>
    <h1>The Craftfolk Surface</h1>
    <div class="sub">HoloScript-authored hood · visor · hands · tailoring · two material groups</div>
    <div class="card">
      <div class="label">Source-authored topology</div>
      <div class="value" id="lod-label">Preparing LOD witness…</div>
      <div class="rule"></div>
      <div class="label">Local RTX profile</div>
      <div class="value" id="perf-label">Measuring 300 + 600 frames…</div>
      <div class="rule"></div>
      <div class="label">Identity boundary</div>
      <div class="value">Neutral shared body<br>Family mantle absent<br>Research seat absent</div>
    </div>
    <div class="foot">DETERMINISTIC 2K ATLAS · OFFLINE LOAD · ACES / SRGB · READ-ONLY SHADOW WITNESS</div>
    <div class="truth">NO MODEL CALLS · NO CANONICAL WRITES<br>PRODUCTION BODY COMPLETION NOT CLAIMED</div>
  </div>
  <script src="./character-appearance-h1.bundle.js"></script>
</body>
</html>`;
  writeFileSync(htmlPath, html, 'utf8');
  return {
    htmlPath,
    bundlePath,
    appSourceHash: sha256(appSource),
    bundleHash: sha256File(bundlePath),
    htmlHash: sha256(html),
  };
}

async function serveDirectory(directory) {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const absolute = path.resolve(directory, relative);
    if (!absolute.startsWith(path.resolve(directory)) || !existsSync(absolute)) {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': absolute.endsWith('.js')
        ? 'text/javascript'
        : absolute.endsWith('.html')
          ? 'text/html'
          : 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(readFileSync(absolute));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}/`,
  };
}

async function composeComparison(sharp, captures, summaries, destination) {
  const width = 800;
  const imageHeight = 450;
  const footerHeight = 150;
  const panels = [];
  for (let index = 0; index < captures.length; index += 1) {
    const screenshot = await sharp(captures[index])
      .resize(width, imageHeight, { fit: 'fill' })
      .png()
      .toBuffer();
    const detail = summaries[index];
    const label = Buffer.from(`<svg width="${width}" height="${footerHeight}">
      <rect width="100%" height="100%" fill="#06101d"/>
      <text x="24" y="45" fill="#f3f7f8" font-family="Segoe UI, sans-serif" font-size="26" font-weight="700">LOD${detail.lod}</text>
      <text x="24" y="78" fill="#71cfdf" font-family="Consolas, monospace" font-size="16">${detail.triangleCount.toLocaleString()} triangles · ${detail.admittedPartCount} source parts</text>
      <text x="24" y="109" fill="#9ab4c0" font-family="Consolas, monospace" font-size="14">2 material groups · identity-neutral shared body</text>
    </svg>`);
    panels.push(
      await sharp({
        create: {
          width,
          height: imageHeight + footerHeight,
          channels: 4,
          background: '#06101d',
        },
      })
        .composite([
          { input: screenshot, left: 0, top: 0 },
          { input: label, left: 0, top: imageHeight },
        ])
        .png()
        .toBuffer(),
    );
  }
  const composite = await sharp({
    create: {
      width: width * panels.length,
      height: imageHeight + footerHeight,
      channels: 4,
      background: '#06101d',
    },
  })
    .composite(
      panels.map((input, index) => ({
        input,
        left: index * width,
        top: 0,
      })),
    )
    .png()
    .toBuffer();
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, composite);
  return composite;
}

async function runBrowser(surface, plan, options, modules) {
  const served = await serveDirectory(options.outputDir);
  const requests = [];
  const pageErrors = [];
  const consoleErrors = [];
  const browser = await modules.playwright.chromium.launch({
    headless: true,
    executablePath: options.browser,
    timeout: options.timeoutMs,
    args: [
      '--use-angle=d3d11',
      '--ignore-gpu-blocklist',
      '--enable-gpu',
      '--disable-background-networking',
      '--disable-dev-shm-usage',
      '--disable-features=Translate,MediaRouter',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });
  try {
    const page = await browser.newPage({
      viewport: {
        width: plan.benchmark.renderWidth,
        height: plan.benchmark.renderHeight,
      },
      deviceScaleFactor: 1,
    });
    page.on('request', (request) => requests.push(request.url()));
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.goto(served.url, { waitUntil: 'load', timeout: options.timeoutMs });
    await page.waitForFunction(
      () => window.__H1_READY__ === true || Boolean(window.__H1_ERROR__),
      null,
      { timeout: options.timeoutMs },
    );
    const browserError = await page.evaluate(() => window.__H1_ERROR__ || null);
    if (browserError) throw new Error(browserError);
    const witness = await page.evaluate(() => window.__H1);
    const heroBuffer = await page.screenshot({ type: 'png' });
    const captures = [];
    const summaries = [];
    for (let lod = 0; lod < 3; lod += 1) {
      const lodSummary = await page.evaluate(
        async (level) => window.__h1SetLod(level),
        lod,
      );
      await page.waitForTimeout(100);
      captures.push(await page.screenshot({ type: 'png' }));
      summaries.push(lodSummary);
    }
    const heroPath =
      options.heroOutput || path.join(options.outputDir, 'character-appearance-h1-hero.png');
    const comparisonPath =
      options.comparisonOutput ||
      path.join(options.outputDir, 'character-appearance-h1-lods.png');
    mkdirSync(path.dirname(heroPath), { recursive: true });
    writeFileSync(heroPath, heroBuffer);
    const comparisonBuffer = await composeComparison(
      modules.sharp,
      captures,
      summaries,
      comparisonPath,
    );
    return {
      witness,
      heroBuffer,
      comparisonBuffer,
      heroPath,
      comparisonPath,
      browserVersion: await browser.version(),
      requests,
      pageErrors,
      consoleErrors,
    };
  } finally {
    await browser.close();
    await new Promise((resolve) => served.server.close(resolve));
  }
}

async function validateManifest(root, holoScriptRoot) {
  const manifestPath = path.join(root, MANIFEST_REL);
  if (!existsSync(manifestPath)) {
    return { status: 'fail', errors: [`missing ${MANIFEST_REL}`] };
  }
  const core = await loadCore(holoScriptRoot);
  const parsed = new core.HoloCompositionParser().parse(
    readFileSync(manifestPath, 'utf8'),
  );
  const errors = [];
  if (!parsed.success || parsed.errors.length) {
    errors.push(...parsed.errors.map((error) => JSON.stringify(error)));
    return { status: 'fail', errors };
  }
  const state = properties(parsed.ast.state);
  if (
    parsed.ast.metadata.milestone !== 'MV_CHARACTER_APPEARANCE_H0_H1' ||
    parsed.ast.metadata.status !== 'pass' ||
    parsed.ast.metadata.authority !== 'read_only_witness'
  ) {
    errors.push('manifest metadata drifted');
  }
  for (const binding of [
    state.source,
    state.policy,
    state.seed,
    state.checker,
    state.test,
    state.report,
    state.albedoAtlas,
    state.normalAtlas,
    state.surfaceMaskAtlas,
    state.hero,
    state.comparison,
  ]) {
    if (!binding?.path || !binding?.sha256) {
      errors.push('manifest durable binding incomplete');
      continue;
    }
    const absolute = path.resolve(root, binding.path);
    if (!existsSync(absolute) || sha256File(absolute) !== binding.sha256) {
      errors.push(`manifest binding drifted: ${binding.path}`);
    }
  }
  if (
    state.boundaries?.familyIdentityVisible !== false ||
    state.boundaries?.liveResearchJoinAllowed !== false ||
    state.boundaries?.canonicalWritesAllowed !== false ||
    state.boundaries?.productionBodyCompleteClaimed !== false
  ) {
    errors.push('manifest identity or truth boundary drifted');
  }
  return {
    status: errors.length ? 'fail' : 'pass',
    errors,
    sourceHash: sha256File(manifestPath),
  };
}

function reportMarkdown(receipt) {
  const perf = receipt.performance;
  const lodRows = receipt.lod.summaries
    .map(
      (lod) =>
        `| LOD${lod.lod} | ${lod.admittedPartCount} | ${lod.vertexCount} | ${lod.triangleCount} | ${lod.materialGroupCount} |`,
    )
    .join('\n');
  return `# HoloLand Model Village Character Appearance H0/H1

**Date:** 2026-07-27

**Status:** ${receipt.status.toUpperCase()}

**Receipt:** \`${receipt.receiptHash}\`

H0 now separates dermal profile, outfit skin, and presentation appearance in
the HoloScript format stack. H1 promotes one identity-neutral faceless
Stormglass Craftfolk surface shell with authored hood, visor, hands, shoulders,
tailoring, seams, fasteners, boots, three LOD visibility sets, and a
deterministic local material atlas.

## Visual result

![H1 Craftfolk hero](../assets/model-village/model-village-character-appearance-h1-hero-2026-07-27.png)

![H1 LOD comparison](../assets/model-village/model-village-character-appearance-h1-lods-2026-07-27.png)

The prior MV-V3 frame read as a dark procedural robe with separated cylinder
arms, ambiguous hands, and little material separation. This slice adds a
coherent hood/visor silhouette, connected shoulder mass, tapered sleeves,
gloved hands, tunic structure, leather belt/cuffs/boots, bronze seams and
fasteners, and wet-woven material breakup under the Hearthlight lighting
language.

## Source-authored LOD

| Tier | Parts | Vertices | Triangles | Material groups |
|---|---:|---:|---:|---:|
${lodRows}

Budgets are 15,000 / 6,000 / 2,000 triangles. The topology reduction comes
from lower radial/cap/rounding segments plus source-authored removal of small
seams and fasteners.

## Deterministic atlas custody

- 2K albedo: \`${receipt.atlases.albedo.sha256}\`
- 2K normal: \`${receipt.atlases.normal.sha256}\`
- 1K AO/roughness/metalness mask: \`${receipt.atlases.surfaceMask.sha256}\`
- Regions: woven teal, woven charcoal, weathered leather, aged bronze
- Repeated generation: byte-identical
- External asset requests: 0

The visible character uses two material groups: one atlas-driven opaque PBR
surface and one stormglass visor.

## Measured local browser profile

| Metric | p50 | p95 | p99 | Maximum |
|---|---:|---:|---:|---:|
| rAF cadence (ms) | ${perf.raf.p50.toFixed(3)} | ${perf.raf.p95.toFixed(3)} | ${perf.raf.p99.toFixed(3)} | ${perf.raf.maximum.toFixed(3)} |
| CPU render submit (ms) | ${perf.renderSubmit.p50.toFixed(3)} | ${perf.renderSubmit.p95.toFixed(3)} | ${perf.renderSubmit.p99.toFixed(3)} | ${perf.renderSubmit.maximum.toFixed(3)} |

- Protocol: 300 warm-up + 600 measured frames
- Dropped frames above 25 ms: ${perf.droppedFrames} (${(perf.droppedFrameRatio * 100).toFixed(3)}%)
- Browser: ${receipt.render.browser}
- GPU: ${receipt.render.renderer.unmaskedRenderer}

## Inherited capability preservation

The immutable MV-V3 body, 55-joint palette, four semantic clips, mantle socket,
and Performance G manifest remain hash-identical. This surface witness is a
read-only shadow consumer and does not replace the complete observer.

## Truth boundary

This is a production-art direction and operative browser surface slice, not a
complete production character. It does not claim cloth simulation, motion
retargeting, family-coded faces or bodies, authored hair-style geometry,
FACS/morph targets, observer promotion, photorealism, live research
participation, or full-world convergence. It performs no model calls,
canonical writes, resident-observation writes, network fetches, family-seat
joins, or wallet identity mutation.
`;
}

export async function runCharacterAppearanceH1(options = parseArgs([])) {
  const root = options.root || ROOT;
  const holoScriptRoot = options.holoScriptRoot || DEFAULT_HOLOSCRIPT_ROOT;
  if (options.outputDir === DEFAULT_OUTPUT && existsSync(options.outputDir)) {
    rmSync(options.outputDir, { recursive: true, force: true });
  }
  mkdirSync(options.outputDir, { recursive: true });
  const stack = await parseStack(root, holoScriptRoot);
  const validation = validateAppearanceContract(stack.contract, root);
  const plan = buildAppearancePlan(stack.contract);
  const modules = await loadWorkspaceModules(holoScriptRoot);
  const firstAtlases = generateAtlasBuffers(modules.PNG, plan.atlas);
  const secondAtlases = generateAtlasBuffers(modules.PNG, plan.atlas);
  const repeatedAtlasIdentity = Object.keys(firstAtlases).every(
    (key) => firstAtlases[key].equals(secondAtlases[key]),
  );
  const ephemeralAtlasPaths = Object.fromEntries(
    Object.keys(firstAtlases).map((kind) => [
      kind,
      path.join(options.outputDir, path.basename(ATLAS_RELS[kind])),
    ]),
  );
  writeAtlasOutputs(firstAtlases, ephemeralAtlasPaths);
  if (options.writeArtifacts) {
    writeAtlasOutputs(
      firstAtlases,
      Object.fromEntries(
        Object.entries(ATLAS_RELS).map(([kind, relative]) => [
          kind,
          path.join(root, relative),
        ]),
      ),
    );
  }
  const surface = await buildBrowserSurface(
    stack,
    plan,
    firstAtlases,
    options,
    modules,
  );
  const browser = await runBrowser(surface, plan, options, modules);
  const manifest = options.skipManifest
    ? { status: 'skipped', errors: [], reason: 'bootstrap_skip_requested' }
    : await validateManifest(root, holoScriptRoot);
  const lodSummaries = browser.witness.lodSummaries;
  const externalRequests = browser.requests.filter(
    (url) => !url.startsWith('http://127.0.0.1:'),
  );
  const checks = {
    formatStackPass:
      stack.source.success && stack.policy.success && stack.seed.success,
    appearanceContractPass: validation.status === 'pass',
    manifestPass: ['pass', 'skipped'].includes(manifest.status),
    repeatedAtlasByteIdentity: repeatedAtlasIdentity,
    exactAtlasSizes:
      plan.atlas.albedoSize[0] === 2048 &&
      plan.atlas.normalSize[0] === 2048 &&
      plan.atlas.surfaceMaskSize[0] === 1024,
    exactThreeLodWitnesses: lodSummaries.length === 3,
    lodTriangleBudgets: lodSummaries.every(
      (lod, index) => lod.triangleCount <= plan.lod.maximumTriangles[index],
    ),
    monotonicLodTopology:
      lodSummaries[0].triangleCount > lodSummaries[1].triangleCount &&
      lodSummaries[1].triangleCount > lodSummaries[2].triangleCount,
    exactTwoMaterialGroups: lodSummaries.every(
      (lod) => lod.materialGroupCount === 2,
    ),
    sourceAuthoredPartReduction:
      lodSummaries[0].admittedPartCount > lodSummaries[1].admittedPartCount &&
      lodSummaries[1].admittedPartCount > lodSummaries[2].admittedPartCount,
    exactFrameProtocol:
      browser.witness.benchmark.raf.samples === plan.benchmark.measuredFrames &&
      browser.witness.benchmark.renderSubmit.samples ===
        plan.benchmark.measuredFrames,
    rafP95Budget:
      browser.witness.benchmark.raf.p95 <=
      plan.benchmark.maximumRafP95Milliseconds,
    renderSubmitP95Budget:
      browser.witness.benchmark.renderSubmit.p95 <=
      plan.benchmark.maximumRenderSubmitP95Milliseconds,
    droppedFrameBudget:
      browser.witness.benchmark.droppedFrameRatio <=
      plan.benchmark.maximumDroppedFrameRatio,
    hardwareRenderer:
      browser.witness.renderer.software === false &&
      /NVIDIA|GeForce|RTX/i.test(browser.witness.renderer.unmaskedRenderer),
    d3d11Backend: browser.witness.renderer.backend === 'D3D11',
    noExternalRequests: externalRequests.length === 0,
    noPageErrors: browser.pageErrors.length === 0,
    noConsoleErrors: browser.consoleErrors.length === 0,
    exactHistoryResetContract:
      canonicalJson(browser.witness.resetEvents) ===
      canonicalJson(REQUIRED_RESET_EVENTS),
    inheritedBodyImmutable:
      sha256File(path.join(root, stack.contract.metadata.inheritedBodySource)) ===
      stack.contract.metadata.inheritedBodySourceSha256,
    inheritedPerformanceImmutable:
      sha256File(
        path.join(root, stack.contract.metadata.inheritedPerformanceManifest),
      ) === stack.contract.metadata.inheritedPerformanceManifestSha256,
    identityNeutral:
      stack.contract.state.familyIdentityVisible === false &&
      stack.contract.state.researchSeatBinding === 'absent',
    readOnlyBoundary:
      stack.contract.state.canonicalWritesAllowed === false &&
      stack.contract.state.residentObservationWritesAllowed === false &&
      stack.contract.state.modelCallsAllowed === false,
    boundedClaims:
      stack.contract.state.productionBodyCompleteClaimed === false &&
      stack.contract.state.clothSimulationClaimed === false &&
      stack.contract.state.hairStyleGeometryClaimed === false &&
      stack.contract.state.facsMorphTargetsClaimed === false,
  };
  const failures = Object.entries(checks)
    .filter(([, value]) => value !== true)
    .map(([name]) => name);
  const receiptCore = {
    schema: 'hololand.model-village.character-appearance-h1-witness.v1',
    status: failures.length ? 'fail' : 'pass',
    claim: {
      verified:
        'HoloScript owns an H0 appearance taxonomy and one H1 identity-neutral faceless Craftfolk surface slice with deterministic local PBR atlases, source-authored LOD visibility, two material groups, and a measured hardware browser witness.',
      bounded:
        'The slice preserves immutable MV-V3 and G but does not claim a complete production character, cloth simulation, motion retargeting, hair-style geometry, morph/FACS, observer promotion, live research participation, photorealism, or full-world convergence.',
    },
    sources: {
      source: { path: SOURCE_REL, sha256: sha256(stack.sourceText) },
      policy: { path: POLICY_REL, sha256: sha256(stack.policyText) },
      seed: { path: SEED_REL, sha256: sha256(stack.seedText) },
      checker: {
        path: path.relative(root, SCRIPT_PATH).replaceAll('\\', '/'),
        sha256: sha256File(SCRIPT_PATH),
      },
      inheritedBody: {
        path: stack.contract.metadata.inheritedBodySource,
        sha256: stack.contract.metadata.inheritedBodySourceSha256,
        immutable: true,
      },
      inheritedPerformance: {
        path: stack.contract.metadata.inheritedPerformanceManifest,
        sha256: stack.contract.metadata.inheritedPerformanceManifestSha256,
        immutable: true,
      },
    },
    plan,
    atlases: Object.fromEntries(
      Object.entries(firstAtlases).map(([kind, buffer]) => [
        kind,
        {
          path: ATLAS_RELS[kind],
          sha256: sha256(buffer),
          bytes: buffer.length,
          dimensions:
            kind === 'surfaceMask'
              ? plan.atlas.surfaceMaskSize
              : plan.atlas[`${kind}Size`],
        },
      ]),
    ),
    lod: { summaries: lodSummaries },
    performance: browser.witness.benchmark,
    render: {
      hero: {
        path: path.relative(root, browser.heroPath).replaceAll('\\', '/'),
        sha256: sha256(browser.heroBuffer),
        bytes: browser.heroBuffer.length,
        dimensions: [1600, 900],
      },
      comparison: {
        path: path.relative(root, browser.comparisonPath).replaceAll('\\', '/'),
        sha256: sha256(browser.comparisonBuffer),
        bytes: browser.comparisonBuffer.length,
        dimensions: [2400, 600],
      },
      browser: browser.browserVersion,
      renderer: browser.witness.renderer,
      externalRequests,
      pageErrors: browser.pageErrors,
      consoleErrors: browser.consoleErrors,
    },
    bridge: {
      route:
        'HoloScript H0/H1 .holo/.hsplus/.hs -> deterministic atlas generator -> source-authored surface materializer -> Three/WebGL2 D3D11 read-only shadow witness',
      appSourceSha256: surface.appSourceHash,
      bundleSha256: surface.bundleHash,
      htmlSha256: surface.htmlHash,
      externalAssets: [],
    },
    boundaries: {
      presentationProfile: stack.contract.state.presentationProfile,
      familyIdentityVisible: false,
      researchSeatBinding: 'absent',
      liveResearchJoinAllowed: false,
      canonicalWritesAllowed: false,
      residentObservationWritesAllowed: false,
      modelCalls: 0,
      networkFetches: 0,
      productionBodyCompleteClaimed: false,
      clothSimulationClaimed: false,
      motionRetargetingClaimed: false,
      hairStyleGeometryClaimed: false,
      facsMorphTargetsClaimed: false,
      observerPromotionClaimed: false,
      photorealismClaimed: false,
      fullWorldConvergenceClaimed: false,
    },
    manifest,
    checks,
    failures,
  };
  const receiptHash = sha256(canonicalJson(receiptCore));
  const receipt = { ...receiptCore, receiptHash };
  const receiptPath = path.join(
    options.outputDir,
    'character-appearance-h1-witness.json',
  );
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  if (options.reportOutput) {
    mkdirSync(path.dirname(options.reportOutput), { recursive: true });
    writeFileSync(options.reportOutput, reportMarkdown(receipt), 'utf8');
  }
  return {
    receipt,
    receiptPath,
    heroPath: browser.heroPath,
    comparisonPath: browser.comparisonPath,
    reportPath: options.reportOutput,
  };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  runCharacterAppearanceH1(parseArgs())
    .then(({ receipt, receiptPath, heroPath, comparisonPath, reportPath }) => {
      console.log(
        JSON.stringify(
          {
            status: receipt.status,
            receiptHash: receipt.receiptHash,
            receiptPath,
            heroPath,
            comparisonPath,
            reportPath,
            renderer: receipt.render.renderer.unmaskedRenderer,
            rafP95Milliseconds: receipt.performance.raf.p95,
            renderSubmitP95Milliseconds: receipt.performance.renderSubmit.p95,
            droppedFrameRatio: receipt.performance.droppedFrameRatio,
            lodTriangles: receipt.lod.summaries.map((lod) => lod.triangleCount),
            lodParts: receipt.lod.summaries.map((lod) => lod.admittedPartCount),
            failures: receipt.failures,
          },
          null,
          2,
        ),
      );
      if (receipt.status !== 'pass') process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error?.stack || error);
      process.exitCode = 1;
    });
}
