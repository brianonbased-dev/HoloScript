#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
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
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h2-family-mantles.holo';
const POLICY_REL =
  'source/proofs/model-village-character-appearance-h2-family-mantles-policy.hsplus';
const SEED_REL =
  'source/proofs/model-village-character-appearance-h2-family-mantles-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h2-family-mantles-manifest.holo';
const TEST_REL =
  'scripts/__tests__/hololand-model-village-character-appearance-h2.test.mjs';
const REPORT_REL =
  'docs/reports/HOLOLAND_MODEL_VILLAGE_CHARACTER_APPEARANCE_H2_2026-07-27.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-appearance-h2-family-lineup-2026-07-27.png';
const LOD_REL =
  'docs/assets/model-village/model-village-character-appearance-h2-lods-2026-07-27.png';
const WEATHER_REL =
  'docs/assets/model-village/model-village-character-appearance-h2-wet-dry-2026-07-27.png';
const ACCESSIBILITY_REL =
  'docs/assets/model-village/model-village-character-appearance-h2-accessibility-2026-07-27.png';
const ATLAS_RELS = Object.freeze({
  albedo:
    'assets/model-village/materials/stormglass-six-family-mantles-albedo-2k.png',
  normal:
    'assets/model-village/materials/stormglass-six-family-mantles-normal-2k.png',
  surfaceMask:
    'assets/model-village/materials/stormglass-six-family-mantles-surface-mask-1k.png',
});
const BODY_ATLAS_RELS = Object.freeze({
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
  'character-appearance-h2',
);
const DISPLAY_NAMES = Object.freeze([
  'Claude',
  'OpenAI',
  'Gemini',
  'Grok',
  'GLM',
  'Brittney',
]);
const FAMILY_IDS = Object.freeze([
  'anthropic',
  'openai',
  'google',
  'xai',
  'ollama',
  'sovereign',
]);
const NON_COLOR_CUES = Object.freeze([
  'quiet_nested_open_arcs',
  'recursive_interlock',
  'paired_prism_panels',
  'off_axis_signal_bands',
  'modular_phase_lattice',
  'sovereign_locality_mesh',
]);
const RESET_EVENTS = Object.freeze([
  'camera_cut',
  'lod_change',
  'weather_state_change',
  'profile_change',
]);
const BODY_REGION_RECTS = Object.freeze({
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
  return sorted[
    Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))
  ];
}

function summarize(values) {
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

function contractFromParsed(parsed) {
  return {
    metadata: parsed.ast.metadata,
    state: properties(parsed.ast.state),
    environment: properties(parsed.ast.environment),
    objects: (parsed.ast.objects || []).map((object) => ({
      name: object.name,
      ...properties(object),
    })),
  };
}

async function parseStack(root, holoScriptRoot) {
  const core = await loadCore(holoScriptRoot);
  const sourceText = readFileSync(path.join(root, SOURCE_REL), 'utf8');
  const policyText = readFileSync(path.join(root, POLICY_REL), 'utf8');
  const seedText = readFileSync(path.join(root, SEED_REL), 'utf8');
  const source = new core.HoloCompositionParser().parse(sourceText);
  const policy = new core.HoloScriptPlusParser().parse(policyText);
  const seed = new core.HoloScriptCodeParser().parse(seedText);
  for (const [label, parsed] of [
    ['H2 .holo', source],
    ['H2 .hsplus', policy],
    ['H2 .hs', seed],
  ]) {
    if (!parsed.success || parsed.errors.length) {
      throw new Error(`${label} parse failed: ${JSON.stringify(parsed.errors)}`);
    }
  }
  const h1Path = path.join(root, source.ast.metadata.inheritedH1Source);
  const h1Text = readFileSync(h1Path, 'utf8');
  const h1 = new core.HoloCompositionParser().parse(h1Text);
  if (!h1.success || h1.errors.length) {
    throw new Error(`Inherited H1 parse failed: ${JSON.stringify(h1.errors)}`);
  }
  return {
    core,
    source,
    policy,
    seed,
    sourceText,
    policyText,
    seedText,
    contract: contractFromParsed(source),
    bodyContract: contractFromParsed(h1),
  };
}

export function buildH2Plan(contract, bodyContract) {
  const kits = contract.objects
    .filter((object) => object.type === 'production_family_mantle_kit')
    .map((kit) => ({
      name: kit.publicDisplayName,
      familyId: kit.familyId,
      mantleId: kit.mantleId,
      primaryNonColorCue: kit.primaryNonColorCue,
      silhouetteProfile: kit.silhouetteProfile,
      glyphId: kit.glyphId,
      atlasCell: kit.atlasCell,
      baseColor: kit.baseColor,
      accentColor: kit.accentColor,
      fastening: kit.fastening,
      edgeTreatment: kit.edgeTreatment,
      wearMaskSeed: kit.wearMaskSeed,
      dryRoughness: kit.dryRoughness,
      wetRoughness: kit.wetRoughness,
      detachedState: kit.detachedState,
      surfaceParts: kit.surfaceParts,
    }));
  const bodyParts = bodyContract.objects
    .filter((object) => object.type === 'stormglass_character_surface_part')
    .map((part) => ({
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
    identityFirewall: contract.state.identityFirewall,
    atlas: contract.state.atlas,
    lod: contract.state.lod,
    benchmark: contract.state.benchmark,
    goldenTargets: contract.state.goldenTargets,
    kits,
    body: {
      atlas: bodyContract.state.atlas,
      lod: bodyContract.state.lod,
      parts: bodyParts,
    },
  };
}

export function validateH2Contract(contract, bodyContract, root = ROOT) {
  const errors = [];
  const expect = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const { metadata, state } = contract;
  expect(
    metadata.milestone === 'MV_CHARACTER_APPEARANCE_H2',
    'milestone must be MV_CHARACTER_APPEARANCE_H2',
  );
  expect(
    metadata.artStyle === 'hearthlight_biorealism',
    'art style must remain hearthlight_biorealism',
  );
  expect(
    state.presentationProfile === 'village_story_unblinded',
    'H2 must use the public story profile',
  );
  for (const [key, expected] of [
    ['familyIdentityVisible', true],
    ['sharedBodyIdentityNeutral', true],
    ['sharedBodyImmutable', true],
    ['liveResearchJoinAllowed', false],
    ['canonicalWritesAllowed', false],
    ['residentObservationWritesAllowed', false],
    ['modelCallsAllowed', false],
    ['networkFetchesAllowed', false],
    ['providerEndorsementClaimed', false],
    ['clothSimulationClaimed', false],
    ['productionMantleTopologyClaimed', true],
    ['productionBodyCompleteClaimed', false],
    ['h5TwoGroupsPerResidentConsolidationComplete', false],
    ['observerPromotionClaimed', false],
    ['fullWorldConvergenceClaimed', false],
  ]) {
    expect(state[key] === expected, `${key} must equal ${expected}`);
  }
  expect(state.researchSeatBinding === 'absent', 'research seat binding must be absent');
  expect(
    canonicalJson(state.publicDisplayNames) === canonicalJson(DISPLAY_NAMES),
    'public display names drifted',
  );
  expect(
    canonicalJson(state.familyIds) === canonicalJson(FAMILY_IDS),
    'family IDs drifted',
  );
  expect(
    canonicalJson(state.identityFirewall?.allowedFamilyChannels) ===
      canonicalJson(['detachable_mantle', 'glyph', 'caption']),
    'allowed family channels drifted',
  );
  expect(
    state.identityFirewall?.liveResearchFamilyIdentity === 'absent',
    'live research family identity must remain absent',
  );
  expect(
    state.atlas?.algorithm === 'stormglass_six_mantle_atlas_v1' &&
      canonicalJson(state.atlas?.albedoSize) === canonicalJson([2048, 2048]) &&
      canonicalJson(state.atlas?.normalSize) === canonicalJson([2048, 2048]) &&
      canonicalJson(state.atlas?.surfaceMaskSize) === canonicalJson([1024, 1024]),
    'atlas contract drifted',
  );
  expect(
    canonicalJson(state.atlas?.externalUris) === '[]',
    'atlas must have no external URIs',
  );
  expect(
    canonicalJson(state.lod?.maximumMantleTriangles) ===
      canonicalJson([2200, 900, 320]) &&
      canonicalJson(state.lod?.meshNodeRadialSegments) ===
        canonicalJson([12, 8, 6]) &&
      state.lod?.maximumMantleMaterialGroups === 1 &&
      state.lod?.secondLodAuthorityAllowed === false,
    'mantle LOD contract drifted',
  );
  expect(
    state.benchmark?.warmupFrames === 300 &&
      state.benchmark?.measuredFrames === 600 &&
      state.benchmark?.simultaneousResidentCount === 6,
    'benchmark protocol must be six residents over 300 plus 600 frames',
  );
  const kits = contract.objects.filter(
    (object) => object.type === 'production_family_mantle_kit',
  );
  expect(kits.length === 6, `expected six production mantle kits, found ${kits.length}`);
  expect(
    canonicalJson(kits.map((kit) => kit.publicDisplayName)) ===
      canonicalJson(DISPLAY_NAMES),
    'kit display names or ordering drifted',
  );
  expect(
    canonicalJson(kits.map((kit) => kit.familyId)) === canonicalJson(FAMILY_IDS),
    'kit family IDs drifted',
  );
  expect(
    canonicalJson(kits.map((kit) => kit.primaryNonColorCue)) ===
      canonicalJson(NON_COLOR_CUES),
    'non-color identity cues drifted',
  );
  expect(
    new Set(kits.map((kit) => canonicalJson(kit.atlasCell))).size === 6,
    'atlas cells must be unique',
  );
  for (const kit of kits) {
    expect(
      kit.detachedState === 'local_stowed_noncausal',
      `${kit.publicDisplayName} detached state drifted`,
    );
    expect(
      kit.wetRoughness < kit.dryRoughness,
      `${kit.publicDisplayName} wet roughness must be lower than dry`,
    );
    expect(
      Array.isArray(kit.surfaceParts) && kit.surfaceParts.length >= 5,
      `${kit.publicDisplayName} needs at least five authored parts`,
    );
    for (const part of kit.surfaceParts || []) {
      expect(Boolean(part.id && part.geometryProfile), `${kit.publicDisplayName} part incomplete`);
      expect(
        Array.isArray(part.position) &&
          part.position.length === 3 &&
          part.position.every(Number.isFinite),
        `${part.id} position must be finite`,
      );
      expect(
        Array.isArray(part.dimensions) &&
          part.dimensions.length === 3 &&
          part.dimensions.every((value) => Number.isFinite(value) && value > 0),
        `${part.id} dimensions must be positive`,
      );
      expect(
        [0, 1, 2].includes(part.visibleThroughLod),
        `${part.id} visibleThroughLod must be 0, 1, or 2`,
      );
    }
  }
  const bodyParts = bodyContract.objects.filter(
    (object) => object.type === 'stormglass_character_surface_part',
  );
  expect(bodyParts.length === 25, 'inherited H1 body must retain 25 parts');
  for (const [pathKey, hashKey] of [
    ['appearancePlan', 'appearancePlanSha256'],
    ['inheritedH1Source', 'inheritedH1SourceSha256'],
    ['inheritedH1Manifest', 'inheritedH1ManifestSha256'],
    ['inheritedH1Report', 'inheritedH1ReportSha256'],
    ['inheritedCompilerCatalog', 'inheritedCompilerCatalogSha256'],
    ['inheritedCompilerManifest', 'inheritedCompilerManifestSha256'],
    ['inheritedCompilerReport', 'inheritedCompilerReportSha256'],
  ]) {
    const relative = metadata[pathKey];
    const expectedHash = metadata[hashKey];
    const absolute = path.resolve(root, relative || '');
    expect(Boolean(relative && expectedHash && existsSync(absolute)), `${pathKey} missing`);
    if (relative && expectedHash && existsSync(absolute)) {
      expect(sha256File(absolute) === expectedHash, `${pathKey} hash drifted`);
    }
  }
  return { status: errors.length ? 'fail' : 'pass', errors };
}

function hexRgb(hex) {
  const packed = Number.parseInt(hex.replace('#', ''), 16);
  return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255];
}

function noise2d(x, y, seed) {
  let value =
    Math.imul((x + seed) | 0, 374761393) ^
    Math.imul((y - seed) | 0, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function atlasCellAt(x, y, width, height) {
  const column = Math.min(2, Math.floor((x / width) * 3));
  const row = Math.min(1, Math.floor((y / height) * 2));
  const cellWidth = width / 3;
  const cellHeight = height / 2;
  return {
    index: row * 3 + column,
    localX: x - column * cellWidth,
    localY: y - row * cellHeight,
    cellWidth,
    cellHeight,
  };
}

function mantleSample(kit, cell, seed) {
  const x = cell.localX;
  const y = cell.localY;
  const nx = x / cell.cellWidth;
  const ny = y / cell.cellHeight;
  const n = noise2d(Math.floor(x), Math.floor(y), seed + kit.wearMaskSeed);
  const n2 = noise2d(Math.floor(x / 7), Math.floor(y / 9), seed + 41);
  const warp = Math.sin(x * 1.13) * 0.06;
  const weft = Math.sin(y * 1.29) * 0.05;
  let cue = 0;
  if (kit.primaryNonColorCue === 'quiet_nested_open_arcs') {
    const radius = Math.hypot(nx - 0.5, ny - 0.56);
    cue = Math.max(0, 1 - Math.abs(Math.sin(radius * 42)) * 6);
  } else if (kit.primaryNonColorCue === 'recursive_interlock') {
    cue =
      Math.max(0, 1 - Math.abs(Math.sin(x * 0.035) * Math.cos(y * 0.035)) * 9);
  } else if (kit.primaryNonColorCue === 'paired_prism_panels') {
    cue = Math.max(0, 1 - Math.abs(((nx * 2 + ny * 3) % 0.34) - 0.17) * 22);
  } else if (kit.primaryNonColorCue === 'off_axis_signal_bands') {
    cue = Math.max(0, 1 - Math.abs(Math.sin((x + y * 1.55) * 0.045)) * 8);
  } else if (kit.primaryNonColorCue === 'modular_phase_lattice') {
    cue = Math.max(
      Math.max(0, 1 - Math.abs(Math.sin(x * 0.052)) * 12),
      Math.max(0, 1 - Math.abs(Math.sin(y * 0.052)) * 12),
    );
  } else {
    cue = Math.max(
      Math.max(0, 1 - Math.abs(Math.sin((x + y) * 0.038)) * 10),
      Math.max(0, 1 - Math.abs(Math.sin((x - y) * 0.038)) * 10),
    );
  }
  const base = hexRgb(kit.baseColor);
  const accent = hexRgb(kit.accentColor);
  const wear = n > 0.987 ? 0.34 : 0;
  const blend = Math.min(0.68, cue * 0.46 + wear);
  const fiber = warp + weft + (n - 0.5) * 0.05 + (n2 - 0.5) * 0.025;
  return {
    rgb: base.map((value, index) =>
      Math.round(
        Math.max(
          0,
          Math.min(255, value * (1 - blend) + accent[index] * blend + fiber * 35),
        ),
      ),
    ),
    height: fiber * 0.34 + cue * 0.13,
    roughness: Math.min(0.94, kit.dryRoughness + (n - 0.5) * 0.12),
    metalness: 0,
    ao: 0.82 + n * 0.14,
  };
}

function writePixel(data, index, red, green, blue, alpha = 255) {
  data[index] = Math.max(0, Math.min(255, red));
  data[index + 1] = Math.max(0, Math.min(255, green));
  data[index + 2] = Math.max(0, Math.min(255, blue));
  data[index + 3] = alpha;
}

export function generateMantleAtlasBuffers(PNG, atlas, kits) {
  const build = (width, height, kind) => {
    const image = new PNG({ width, height });
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const cell = atlasCellAt(x, y, width, height);
        const kit = kits[cell.index];
        const sample = mantleSample(kit, cell, atlas.seed);
        const index = (y * width + x) * 4;
        if (kind === 'albedo') {
          writePixel(image.data, index, ...sample.rgb);
        } else if (kind === 'normal') {
          const rightCell = atlasCellAt(Math.min(width - 1, x + 1), y, width, height);
          const downCell = atlasCellAt(x, Math.min(height - 1, y + 1), width, height);
          const right = mantleSample(kits[rightCell.index], rightCell, atlas.seed).height;
          const down = mantleSample(kits[downCell.index], downCell, atlas.seed).height;
          const dx = sample.height - right;
          const dy = sample.height - down;
          const dz = 1.8;
          const length = Math.hypot(dx, dy, dz) || 1;
          writePixel(
            image.data,
            index,
            Math.round((dx / length * 0.5 + 0.5) * 255),
            Math.round((dy / length * 0.5 + 0.5) * 255),
            Math.round((dz / length * 0.5 + 0.5) * 255),
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

function h2BrowserApplication(
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
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#06101d');
  scene.fog = new THREE.FogExp2('#071321', 0.035);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
  const camera = new THREE.PerspectiveCamera(
    35,
    PAYLOAD.benchmark.renderWidth / PAYLOAD.benchmark.renderHeight,
    0.1,
    100,
  );

  scene.add(new THREE.HemisphereLight('#9bbfd1', '#07101a', 1.1));
  const key = new THREE.DirectionalLight('#ffd4a2', 5.2);
  key.position.set(4.2, 6.2, 5.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -2;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#54b9dd', 3.8);
  rim.position.set(-5, 4.2, -3.5);
  scene.add(rim);
  const fill = new THREE.PointLight('#67d0d7', 11, 8, 2);
  fill.position.set(0, 2.4, 4.5);
  scene.add(fill);

  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(5.4, 5.7, 0.18, 96),
    new THREE.MeshStandardMaterial({
      color: '#172633',
      roughness: 0.38,
      metalness: 0.28,
      envMapIntensity: 0.9,
    }),
  );
  ground.position.y = -0.1;
  ground.receiveShadow = true;
  scene.add(ground);
  for (let index = 0; index < 3; index += 1) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(4.45 - index * 0.5, 0.018, 8, 160),
      new THREE.MeshStandardMaterial({
        color: index === 0 ? '#b66f3d' : '#327081',
        emissive: index === 0 ? '#763719' : '#123c49',
        emissiveIntensity: 0.45,
        roughness: 0.3,
        metalness: 0.72,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.01 + index * 0.004;
    scene.add(ring);
  }
  for (const x of [-4.5, -3, -1.5, 0, 1.5, 3, 4.5]) {
    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.05, 1.6, 6),
      new THREE.MeshStandardMaterial({
        color: '#164456',
        emissive: '#0b3041',
        emissiveIntensity: 0.6,
        roughness: 0.5,
      }),
    );
    spire.position.set(x, 0.72, -2.2);
    scene.add(spire);
  }

  const textureLoader = new THREE.TextureLoader();
  const loadTexture = (url, colorSpace = THREE.NoColorSpace) =>
    new Promise((resolve, reject) => {
      textureLoader.load(
        url,
        (texture) => {
          texture.colorSpace = colorSpace;
          texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
          texture.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
          resolve(texture);
        },
        undefined,
        reject,
      );
    });

  function applyUvRect(geometry, rect) {
    const uv = geometry.getAttribute('uv');
    if (!uv) return;
    for (let index = 0; index < uv.count; index += 1) {
      uv.setXY(
        index,
        rect[0] + uv.getX(index) * rect[2],
        rect[1] + uv.getY(index) * rect[3],
      );
    }
    uv.needsUpdate = true;
  }

  function transformGeometry(geometry, part) {
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
    return geometry;
  }

  function bodyGeometry(part, lod) {
    const radial = PAYLOAD.body.lod.radialSegments[lod];
    const caps = PAYLOAD.body.lod.capSegments[lod];
    const rounded = PAYLOAD.body.lod.roundedBoxSegments[lod];
    const [a, b, c] = part.dimensions;
    let geometry;
    if (part.geometryProfile === 'rounded_box') {
      geometry = new RoundedBoxGeometry(a, b, c, rounded, Math.min(a, b, c) * 0.18);
    } else if (part.geometryProfile === 'tailored_skirt') {
      geometry = new THREE.CylinderGeometry(b, a, c, radial, 2, false);
    } else if (
      part.geometryProfile === 'hood_shell' ||
      part.geometryProfile === 'stormglass_visor'
    ) {
      geometry = new THREE.SphereGeometry(1, radial, Math.max(6, caps * 2));
      geometry.scale(a, b, c);
    } else if (part.geometryProfile === 'hood_brow') {
      geometry = new THREE.BoxGeometry(a * 1.8, b * 1.7, c * 1.8);
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
      geometry.scale(a / (radius * 2), 1, c / (radius * 2));
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
      throw new Error(`Unsupported H1 body geometry ${part.geometryProfile}`);
    }
    geometry = transformGeometry(geometry, part);
    if (part.materialRegion !== 'stormglass_visor') {
      applyUvRect(geometry, PAYLOAD.bodyRegionRects[part.materialRegion]);
    }
    return geometry;
  }

  function extrudedShape(points, depth, rounded) {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let index = 1; index < points.length; index += 1) {
      shape.lineTo(points[index][0], points[index][1]);
    }
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: rounded > 1,
      bevelSegments: Math.max(1, rounded),
      bevelSize: Math.min(0.012, depth * 0.2),
      bevelThickness: Math.min(0.008, depth * 0.16),
      curveSegments: 2,
      steps: 1,
    });
    geometry.center();
    return geometry;
  }

  function mantleGeometry(part, kit, lod) {
    const radial = PAYLOAD.lod.mantleRadialSegments[lod];
    const rounded = PAYLOAD.lod.mantleRoundedSegments[lod];
    const [a, b, c] = part.dimensions;
    let geometry;
    if (part.geometryProfile === 'cape_panel') {
      geometry = extrudedShape(
        [
          [-a / 2, c / 2],
          [a / 2, c / 2],
          [b / 2, -c / 2],
          [-b / 2, -c / 2],
        ],
        0.035,
        rounded,
      );
    } else if (part.geometryProfile === 'rounded_panel') {
      geometry = new RoundedBoxGeometry(
        a,
        b,
        c,
        rounded,
        Math.min(a, b, c) * 0.28,
      );
    } else if (part.geometryProfile === 'open_arc') {
      geometry = new THREE.TorusGeometry(a, b, Math.max(3, rounded + 2), radial, Math.PI);
      geometry.scale(1, 1, c / Math.max(a, 0.001));
    } else if (
      part.geometryProfile === 'closed_loop' ||
      part.geometryProfile === 'clasp'
    ) {
      geometry = new THREE.TorusGeometry(a, b, Math.max(3, rounded + 2), radial);
      geometry.scale(1, 1, c / Math.max(a, 0.001));
    } else if (part.geometryProfile === 'prism_panel') {
      geometry = extrudedShape(
        [
          [0, b / 2],
          [a / 2, -b / 2],
          [-a / 2, -b / 2],
        ],
        c,
        rounded,
      );
    } else if (
      part.geometryProfile === 'signal_band' ||
      part.geometryProfile === 'lattice_tile' ||
      part.geometryProfile === 'mesh_link'
    ) {
      geometry = new RoundedBoxGeometry(
        a,
        b,
        c,
        Math.min(rounded, 2),
        Math.min(a, b, c) * 0.2,
      );
    } else if (part.geometryProfile === 'mesh_node') {
      const nodeRadial = PAYLOAD.lod.meshNodeRadialSegments[lod];
      geometry = new THREE.SphereGeometry(
        1,
        nodeRadial,
        Math.max(4, nodeRadial / 2),
      );
      geometry.scale(a, b, c);
    } else {
      throw new Error(`Unsupported H2 mantle geometry ${part.geometryProfile}`);
    }
    geometry = transformGeometry(geometry, part);
    const column = kit.atlasCell[0];
    const row = kit.atlasCell[1];
    applyUvRect(geometry, [column / 3, row === 0 ? 0.5 : 0, 1 / 3, 0.5]);
    return geometry;
  }

  function triangles(geometry) {
    return geometry.index
      ? geometry.index.count / 3
      : geometry.getAttribute('position').count / 3;
  }

  function buildResident(kit, lod, wet, textures) {
    const admittedBody = PAYLOAD.body.parts.filter(
      (part) => part.visibleThroughLod >= lod,
    );
    const opaqueBody = admittedBody.filter(
      (part) => part.materialRegion !== 'stormglass_visor',
    );
    const visorPart = admittedBody.find(
      (part) => part.materialRegion === 'stormglass_visor',
    );
    const bodyGeometries = opaqueBody.map((part) => bodyGeometry(part, lod));
    const bodyMerged = mergeGeometries(bodyGeometries, false);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: textures.bodyAlbedo,
      normalMap: textures.bodyNormal,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 1,
      roughnessMap: textures.bodyMask,
      metalness: 1,
      metalnessMap: textures.bodyMask,
      envMapIntensity: 1.05,
    });
    const bodyMesh = new THREE.Mesh(bodyMerged, bodyMaterial);
    bodyMesh.castShadow = bodyMesh.receiveShadow = true;

    const visorGeometry = bodyGeometry(visorPart, lod);
    const visorMaterial = new THREE.MeshPhysicalMaterial({
      color: '#245a69',
      emissive: '#0c3849',
      emissiveIntensity: 0.6,
      metalness: 0.08,
      roughness: 0.1,
      transmission: 0.3,
      thickness: 0.2,
      ior: 1.72,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.5,
    });
    const visorMesh = new THREE.Mesh(visorGeometry, visorMaterial);
    visorMesh.castShadow = true;

    const mantleParts = kit.surfaceParts.filter(
      (part) => part.visibleThroughLod >= lod,
    );
    const mantleGeometries = mantleParts.map((part) =>
      mantleGeometry(part, kit, lod),
    );
    const mantleMerged = mergeGeometries(mantleGeometries, false);
    const wetScale = kit.wetRoughness / kit.dryRoughness;
    const mantleMaterial = new THREE.MeshStandardMaterial({
      color: wet ? '#b4bac0' : '#ffffff',
      map: textures.mantleAlbedo,
      normalMap: textures.mantleNormal,
      normalScale: new THREE.Vector2(0.78, 0.78),
      roughness: wet ? wetScale : 1,
      roughnessMap: textures.mantleMask,
      metalness: 0,
      envMapIntensity: wet ? 1.35 : 0.95,
    });
    const mantleMesh = new THREE.Mesh(mantleMerged, mantleMaterial);
    mantleMesh.castShadow = mantleMesh.receiveShadow = true;

    const group = new THREE.Group();
    group.add(bodyMesh, visorMesh, mantleMesh);
    group.rotation.y = -0.12;
    const bodyTriangles = triangles(bodyMerged) + triangles(visorGeometry);
    const mantleTriangles = triangles(mantleMerged);
    return {
      group,
      summary: {
        name: kit.name,
        familyId: kit.familyId,
        lod,
        wet,
        bodyPartCount: admittedBody.length,
        mantlePartCount: mantleParts.length,
        bodyTriangles: Math.round(bodyTriangles),
        mantleTriangles: Math.round(mantleTriangles),
        residentTriangles: Math.round(bodyTriangles + mantleTriangles),
        bodyMaterialGroups: 2,
        mantleMaterialGroups: 1,
        totalMaterialGroups: 3,
      },
    };
  }

  function disposeGroup(group) {
    if (!group) return;
    group.traverse((node) => {
      node.geometry?.dispose?.();
      if (Array.isArray(node.material)) node.material.forEach((item) => item.dispose());
      else node.material?.dispose?.();
    });
    scene.remove(group);
  }

  const residentGroups = [];
  let activeView = { mode: 'lineup', lod: 0, wet: false, index: null };
  let textures;

  function setCamera(mode) {
    if (mode === 'lineup') {
      camera.position.set(0, 2.55, 10.2);
      camera.lookAt(0, 1.15, 0);
      camera.fov = 35;
    } else {
      camera.position.set(3.1, 2.15, 5.35);
      camera.lookAt(0, 1.18, 0);
      camera.fov = 34;
    }
    camera.updateProjectionMatrix();
  }

  function rebuildView(view) {
    for (const resident of residentGroups.splice(0)) disposeGroup(resident.group);
    const positions = [-4.05, -2.43, -0.81, 0.81, 2.43, 4.05];
    const summaries = [];
    for (let index = 0; index < PAYLOAD.kits.length; index += 1) {
      if (view.mode === 'family' && index !== view.index) continue;
      const built = buildResident(PAYLOAD.kits[index], view.lod, view.wet, textures);
      built.group.position.x = view.mode === 'lineup' ? positions[index] : 0;
      built.group.scale.setScalar(view.mode === 'lineup' ? 0.9 : 1.05);
      scene.add(built.group);
      residentGroups.push(built);
      summaries.push(built.summary);
    }
    setCamera(view.mode);
    renderer.render(scene, camera);
    activeView = { ...view };
    return summaries;
  }

  async function benchmarkLineup() {
    rebuildView({ mode: 'lineup', lod: 0, wet: false, index: null });
    const raf = [];
    const submit = [];
    let previous = performance.now();
    const total = PAYLOAD.benchmark.warmupFrames + PAYLOAD.benchmark.measuredFrames;
    for (let frame = 0; frame < total; frame += 1) {
      await new Promise((resolve) =>
        requestAnimationFrame((timestamp) => {
          const delta = timestamp - previous;
          previous = timestamp;
          const started = performance.now();
          renderer.render(scene, camera);
          const renderSubmit = performance.now() - started;
          if (frame >= PAYLOAD.benchmark.warmupFrames) {
            raf.push(delta);
            submit.push(renderSubmit);
          }
          resolve();
        }),
      );
    }
    const dropped = raf.filter(
      (value) => value > PAYLOAD.benchmark.droppedFrameThresholdMilliseconds,
    ).length;
    return {
      warmupFrames: PAYLOAD.benchmark.warmupFrames,
      measuredFrames: PAYLOAD.benchmark.measuredFrames,
      simultaneousResidentCount: 6,
      raf: PAYLOAD.summarize(raf),
      renderSubmit: PAYLOAD.summarize(submit),
      droppedFrames: dropped,
      droppedFrameRatio: dropped / Math.max(1, raf.length),
    };
  }

  async function main() {
    textures = {
      bodyAlbedo: await loadTexture(
        PAYLOAD.bodyAtlasDataUrls.albedo,
        THREE.SRGBColorSpace,
      ),
      bodyNormal: await loadTexture(PAYLOAD.bodyAtlasDataUrls.normal),
      bodyMask: await loadTexture(PAYLOAD.bodyAtlasDataUrls.surfaceMask),
      mantleAlbedo: await loadTexture(
        PAYLOAD.mantleAtlasDataUrls.albedo,
        THREE.SRGBColorSpace,
      ),
      mantleNormal: await loadTexture(PAYLOAD.mantleAtlasDataUrls.normal),
      mantleMask: await loadTexture(PAYLOAD.mantleAtlasDataUrls.surfaceMask),
    };
    const lodSummaries = [];
    for (let lod = 0; lod < 3; lod += 1) {
      for (const kit of PAYLOAD.kits) {
        const built = buildResident(kit, lod, false, textures);
        lodSummaries.push(built.summary);
        disposeGroup(built.group);
      }
    }
    const benchmark = await benchmarkLineup();
    const canvas = renderer.domElement;
    const gl = renderer.getContext();
    const rendererName =
      gl.getExtension('WEBGL_debug_renderer_info')
        ? gl.getParameter(
            gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL,
          )
        : gl.getParameter(gl.RENDERER);
    window.__h2SetView = async (view) => {
      const summaries = rebuildView(view);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      renderer.render(scene, camera);
      return summaries;
    };
    window.__H2 = {
      renderer: {
        unmaskedRenderer: rendererName,
        version: gl.getParameter(gl.VERSION),
        backend: rendererName.includes('D3D11') ? 'D3D11' : 'unknown',
        software: /SwiftShader|llvmpipe|software/i.test(rendererName),
      },
      benchmark,
      lodSummaries,
      activeView,
      canvas: { width: canvas.width, height: canvas.height },
      materialGroupsPerResident: 3,
      resetEvents: PAYLOAD.resetEvents,
      externalAssets: [],
    };
    window.__H2_READY__ = true;
  }
  main().catch((error) => {
    window.__H2_ERROR__ = error?.stack || String(error);
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
    lodOutput: null,
    weatherOutput: null,
    accessibilityOutput: null,
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
    else if (arg === '--lod-output') options.lodOutput = path.resolve(argv[++index]);
    else if (arg === '--weather-output') {
      options.weatherOutput = path.resolve(argv[++index]);
    } else if (arg === '--accessibility-output') {
      options.accessibilityOutput = path.resolve(argv[++index]);
    } else if (arg === '--report-output') {
      options.reportOutput = path.resolve(argv[++index]);
    } else if (arg === '--browser') options.browser = path.resolve(argv[++index]);
    else if (arg === '--timeout-ms') options.timeoutMs = Number(argv[++index]);
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/check-hololand-model-village-character-appearance-h2.mjs [options]

  --root <path>                  HoloLand repository root
  --holoscript-root <path>       Built HoloScript checkout
  --output <path>                Ephemeral witness directory
  --write-artifacts              Write deterministic mantle atlases
  --hero-output <path>           Durable 2400x1200 six-family hero
  --lod-output <path>            Durable 2400x600 LOD comparison
  --weather-output <path>        Durable 2400x650 dry/wet comparison
  --accessibility-output <path>  Durable 2400x600 accessibility comparison
  --report-output <path>         Durable Markdown report
  --skip-manifest                Bootstrap before immutable manifest
  --browser <path>               Chrome executable
  --timeout-ms <number>          Browser timeout`);
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

function writeBuffers(buffers, destinations) {
  for (const [kind, destination] of Object.entries(destinations)) {
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, buffers[kind]);
  }
}

async function buildBrowserSurface(plan, mantleAtlases, root, options, modules) {
  mkdirSync(options.outputDir, { recursive: true });
  const bundlePath = path.join(options.outputDir, 'character-appearance-h2.bundle.js');
  const htmlPath = path.join(options.outputDir, 'index.html');
  const bodyAtlasBuffers = Object.fromEntries(
    Object.entries(BODY_ATLAS_RELS).map(([kind, relative]) => [
      kind,
      readFileSync(path.join(root, relative)),
    ]),
  );
  const dataUrls = (buffers) =>
    Object.fromEntries(
      Object.entries(buffers).map(([kind, buffer]) => [
        kind,
        `data:image/png;base64,${buffer.toString('base64')}`,
      ]),
    );
  const payload = {
    benchmark: plan.benchmark,
    lod: plan.lod,
    kits: plan.kits,
    body: plan.body,
    bodyRegionRects: BODY_REGION_RECTS,
    bodyAtlasDataUrls: dataUrls(bodyAtlasBuffers),
    mantleAtlasDataUrls: dataUrls(mantleAtlases),
    resetEvents: RESET_EVENTS,
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
    `(${h2BrowserApplication.toString()})(THREE, RoundedBoxGeometry, RoomEnvironment, mergeGeometries, PAYLOAD);`,
  ].join('\n');
  try {
    await modules.esbuild.build({
      stdin: {
        contents: appSource,
        resolveDir: options.holoScriptRoot,
        sourcefile: 'character-appearance-h2.entry.js',
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
  <title>Stormglass Character Appearance H2</title>
  <style>
    html,body,#app{margin:0;width:100%;height:100%;overflow:hidden;background:#06101d}
    canvas{display:block}
    .hud{position:fixed;inset:0;pointer-events:none;color:#eef8fa;font-family:Inter,Segoe UI,sans-serif}
    .eyebrow{position:absolute;left:42px;top:34px;color:#79d4e2;font:700 12px/1.2 ui-monospace,monospace;letter-spacing:.22em}
    h1{position:absolute;left:40px;top:50px;margin:0;font:600 39px/1.05 Georgia,serif;text-shadow:0 2px 18px #000}
    .sub{position:absolute;left:42px;top:100px;color:#a9c3cf;font:500 13px/1.5 ui-monospace,monospace}
    .card{position:absolute;right:34px;top:30px;width:310px;padding:17px 20px;border:1px solid #355464;border-radius:14px;background:rgba(5,14,24,.84)}
    .label{color:#6ed0df;font:700 10px/1.4 ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase}
    .value{margin-top:6px;color:#edf7fa;font:600 13px/1.5 ui-monospace,monospace}
    .rule{height:1px;background:#27414e;margin:12px 0}
    .foot{position:absolute;left:42px;bottom:28px;color:#91abb7;font:600 10px/1.4 ui-monospace,monospace;letter-spacing:.12em}
    .truth{position:absolute;right:34px;bottom:28px;color:#8fb3bf;font:600 10px/1.4 ui-monospace,monospace;text-align:right}
  </style>
</head>
<body>
  <div id="app"></div>
  <div class="hud">
    <div class="eyebrow">STORMGLASS COMMONS // CHARACTER APPEARANCE H2</div>
    <h1>Six Mantles, One Shared Body</h1>
    <div class="sub">Claude · OpenAI · Gemini · Grok · GLM · Brittney</div>
    <div class="card">
      <div class="label">Production family kits</div>
      <div class="value">6 tailored silhouettes<br>6 non-color identity cues<br>1 deterministic 2K atlas</div>
      <div class="rule"></div>
      <div class="label">Identity firewall</div>
      <div class="value">Public story profile only<br>Detachable mantle channel<br>Live research identity absent</div>
      <div class="rule"></div>
      <div class="label">Measured local witness</div>
      <div class="value">300 warm-up + 600 frames<br>All six residents simultaneous</div>
    </div>
    <div class="foot">HEARTHLIGHT BIOREALISM · ACES / SRGB · DRY/WET RESPONSE · READ-ONLY</div>
    <div class="truth">NO MODEL CALLS · NO CANONICAL WRITES<br>H5 DRAW-GROUP CONSOLIDATION NOT CLAIMED</div>
  </div>
  <script src="./character-appearance-h2.bundle.js"></script>
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
      'Content-Type': absolute.endsWith('.js') ? 'text/javascript' : 'text/html',
      'Cache-Control': 'no-store',
    });
    response.end(readFileSync(absolute));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    server,
    url: `http://127.0.0.1:${server.address().port}/`,
  };
}

function labelSvg(width, height, title, subtitle, accent = '#72d2e0') {
  return Buffer.from(`<svg width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#06101d"/>
    <text x="24" y="38" fill="#f3f7f8" font-family="Segoe UI, sans-serif" font-size="25" font-weight="700">${title}</text>
    <text x="24" y="68" fill="${accent}" font-family="Consolas, monospace" font-size="14">${subtitle}</text>
  </svg>`);
}

async function panel(modules, image, width, imageHeight, title, subtitle, footer = 90) {
  const resized = await modules.sharp(image)
    .resize(width, imageHeight, { fit: 'fill' })
    .png()
    .toBuffer();
  return modules.sharp({
    create: {
      width,
      height: imageHeight + footer,
      channels: 4,
      background: '#06101d',
    },
  })
    .composite([
      { input: resized, left: 0, top: 0 },
      { input: labelSvg(width, footer, title, subtitle), left: 0, top: imageHeight },
    ])
    .png()
    .toBuffer();
}

async function horizontalSheet(modules, panels, destination, width, height) {
  const output = await modules.sharp({
    create: {
      width,
      height,
      channels: 4,
      background: '#06101d',
    },
  })
    .composite(
      panels.map((input, index) => ({
        input,
        left: index * Math.floor(width / panels.length),
        top: 0,
      })),
    )
    .png()
    .toBuffer();
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, output);
  return output;
}

async function gridSheet(modules, panels, destination) {
  const output = await modules.sharp({
    create: {
      width: 2400,
      height: 1200,
      channels: 4,
      background: '#06101d',
    },
  })
    .composite(
      panels.map((input, index) => ({
        input,
        left: (index % 3) * 800,
        top: Math.floor(index / 3) * 600,
      })),
    )
    .png()
    .toBuffer();
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, output);
  return output;
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
      () => window.__H2_READY__ === true || Boolean(window.__H2_ERROR__),
      null,
      { timeout: options.timeoutMs },
    );
    const browserError = await page.evaluate(() => window.__H2_ERROR__ || null);
    if (browserError) throw new Error(browserError);
    const witness = await page.evaluate(() => window.__H2);
    const canvas = page.locator('canvas');

    const individualPanels = [];
    for (let index = 0; index < plan.kits.length; index += 1) {
      await page.evaluate(
        (familyIndex) =>
          window.__h2SetView({
            mode: 'family',
            index: familyIndex,
            lod: 0,
            wet: false,
          }),
        index,
      );
      const screenshot = await canvas.screenshot({ type: 'png' });
      const kit = plan.kits[index];
      individualPanels.push(
        await panel(
          modules,
          screenshot,
          800,
          510,
          kit.name,
          kit.primaryNonColorCue.replaceAll('_', ' '),
        ),
      );
    }
    const heroPath =
      options.heroOutput || path.join(options.outputDir, 'character-appearance-h2-hero.png');
    const heroBuffer = await gridSheet(modules, individualPanels, heroPath);

    const lodPanels = [];
    for (let lod = 0; lod < 3; lod += 1) {
      const summaries = await page.evaluate(
        (level) =>
          window.__h2SetView({
            mode: 'lineup',
            index: null,
            lod: level,
            wet: false,
          }),
        lod,
      );
      const screenshot = await canvas.screenshot({ type: 'png' });
      const total = summaries.reduce(
        (sum, summary) => sum + summary.residentTriangles,
        0,
      );
      lodPanels.push(
        await panel(
          modules,
          screenshot,
          800,
          510,
          `LOD${lod}`,
          `${total.toLocaleString()} total resident triangles · 6 mantles`,
        ),
      );
    }
    const lodPath =
      options.lodOutput || path.join(options.outputDir, 'character-appearance-h2-lods.png');
    const lodBuffer = await horizontalSheet(modules, lodPanels, lodPath, 2400, 600);

    await page.evaluate(() =>
      window.__h2SetView({
        mode: 'lineup',
        index: null,
        lod: 0,
        wet: false,
      }),
    );
    const dry = await canvas.screenshot({ type: 'png' });
    await page.evaluate(() =>
      window.__h2SetView({
        mode: 'lineup',
        index: null,
        lod: 0,
        wet: true,
      }),
    );
    const wet = await canvas.screenshot({ type: 'png' });
    const weatherPanels = [
      await panel(modules, dry, 1200, 560, 'DRY', 'authored dry roughness', 90),
      await panel(modules, wet, 1200, 560, 'WET', 'lower roughness · darker cloth', 90),
    ];
    const weatherPath =
      options.weatherOutput ||
      path.join(options.outputDir, 'character-appearance-h2-weather.png');
    const weatherBuffer = await horizontalSheet(
      modules,
      weatherPanels,
      weatherPath,
      2400,
      650,
    );

    const colorPanel = await panel(
      modules,
      dry,
      800,
      510,
      'COLOR',
      'silhouette + glyph + hue',
    );
    const graySource = await modules.sharp(dry).grayscale().png().toBuffer();
    const grayPanel = await panel(
      modules,
      graySource,
      800,
      510,
      'GRAYSCALE',
      'non-color cues remain distinct',
    );
    const { data, info } = await modules.sharp(dry)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let offset = 0; offset < data.length; offset += info.channels) {
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      data[offset] = Math.round(0.625 * red + 0.375 * green);
      data[offset + 1] = Math.round(0.7 * red + 0.3 * green);
      data[offset + 2] = Math.round(0.3 * green + 0.7 * blue);
    }
    const cvdSource = await modules.sharp(data, {
      raw: {
        width: info.width,
        height: info.height,
        channels: info.channels,
      },
    })
      .png()
      .toBuffer();
    const cvdPanel = await panel(
      modules,
      cvdSource,
      800,
      510,
      'DEUTERANOPIA',
      'shape and weave carry identity',
    );
    const accessibilityPath =
      options.accessibilityOutput ||
      path.join(options.outputDir, 'character-appearance-h2-accessibility.png');
    const accessibilityBuffer = await horizontalSheet(
      modules,
      [colorPanel, grayPanel, cvdPanel],
      accessibilityPath,
      2400,
      600,
    );
    return {
      witness,
      heroBuffer,
      lodBuffer,
      weatherBuffer,
      accessibilityBuffer,
      heroPath,
      lodPath,
      weatherPath,
      accessibilityPath,
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
    return {
      status: 'fail',
      errors: parsed.errors.map((error) => JSON.stringify(error)),
    };
  }
  const state = properties(parsed.ast.state);
  if (
    parsed.ast.metadata.milestone !== 'MV_CHARACTER_APPEARANCE_H2' ||
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
    state.lodComparison,
    state.weatherComparison,
    state.accessibilityComparison,
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
    state.boundaries?.liveResearchJoinAllowed !== false ||
    state.boundaries?.canonicalWritesAllowed !== false ||
    state.boundaries?.productionBodyCompleteClaimed !== false ||
    state.boundaries?.h5DrawGroupConsolidationClaimed !== false
  ) {
    errors.push('manifest truth boundary drifted');
  }
  return {
    status: errors.length ? 'fail' : 'pass',
    errors,
    sourceHash: sha256File(manifestPath),
  };
}

function reportMarkdown(receipt) {
  const perLod = [0, 1, 2]
    .map((lod) => {
      const records = receipt.lod.summaries.filter((entry) => entry.lod === lod);
      return `| LOD${lod} | ${records.reduce((sum, item) => sum + item.mantleTriangles, 0)} | ${records.reduce((sum, item) => sum + item.residentTriangles, 0)} | ${Math.max(...records.map((item) => item.mantleTriangles))} |`;
    })
    .join('\n');
  return `# HoloLand Model Village Character Appearance H2

**Date:** 2026-07-27

**Status:** ${receipt.status.toUpperCase()}

**Receipt:** \`${receipt.receiptHash}\`

H2 promotes all six public family mantles from 4x4 proof tiles to tailored,
detachable local material kits over the immutable H1 shared body. Claude,
OpenAI, Gemini, Grok, GLM, and Brittney now each have a distinct silhouette,
non-color cue, weave, glyph, fastening, edge treatment, wear seed, dry response,
wet response, detached state, and source-authored LOD visibility.

## Visual result

![H2 six-family lineup](../assets/model-village/model-village-character-appearance-h2-family-lineup-2026-07-27.png)

![H2 LOD comparison](../assets/model-village/model-village-character-appearance-h2-lods-2026-07-27.png)

![H2 wet/dry response](../assets/model-village/model-village-character-appearance-h2-wet-dry-2026-07-27.png)

![H2 accessibility](../assets/model-village/model-village-character-appearance-h2-accessibility-2026-07-27.png)

## Source-authored LOD

| Tier | Six mantle triangles | Six resident triangles | Largest mantle |
|---|---:|---:|---:|
${perLod}

Each resident uses the unchanged H1 opaque body and stormglass visor plus one
merged mantle material group. H2 therefore measures three groups per resident.
The H5 target of no more than twelve groups across all six residents remains a
future consolidation gate and is not claimed here.

## Deterministic atlas custody

- 2K albedo: \`${receipt.atlases.albedo.sha256}\`
- 2K normal: \`${receipt.atlases.normal.sha256}\`
- 1K AO/roughness/metalness mask: \`${receipt.atlases.surfaceMask.sha256}\`
- Repeated generation: byte-identical
- External asset requests: 0

## Measured local browser profile

- Browser: ${receipt.render.browser}
- Renderer: ${receipt.render.renderer.unmaskedRenderer}
- Backend: ${receipt.render.renderer.backend}
- Protocol: ${receipt.performance.raf.samples} measured frames after 300 warm-up
- Six residents simultaneous at LOD0
- rAF p95: ${receipt.performance.raf.p95.toFixed(2)} ms
- Render-submit p95: ${receipt.performance.renderSubmit.p95.toFixed(2)} ms
- Dropped-frame ratio: ${(receipt.performance.droppedFrameRatio * 100).toFixed(3)}%

## Identity and truth boundary

The named mantles are admitted only to the public
\`village_story_unblinded\` presentation. The shared body, face channel,
proportions, motion quality, capability, and tool access remain family-neutral.
The live blinded research profile admits no family identity and no static seat
binding. This lane performs no model calls, canonical writes, resident
observation writes, network fetches, family-seat joins, or wallet mutation.

This is a production mantle-kit and operative browser-consumer milestone, not a
complete production character or observer. It does not claim cloth simulation,
H5 draw-group convergence, motion retargeting, face/hair completion,
photorealism, headset performance, live research participation, or full-world
convergence.
`;
}

export async function runCharacterAppearanceH2(options = parseArgs([])) {
  const root = options.root || ROOT;
  const holoScriptRoot = options.holoScriptRoot || DEFAULT_HOLOSCRIPT_ROOT;
  if (options.outputDir === DEFAULT_OUTPUT && existsSync(options.outputDir)) {
    rmSync(options.outputDir, { recursive: true, force: true });
  }
  mkdirSync(options.outputDir, { recursive: true });
  const stack = await parseStack(root, holoScriptRoot);
  const validation = validateH2Contract(stack.contract, stack.bodyContract, root);
  const plan = buildH2Plan(stack.contract, stack.bodyContract);
  const modules = await loadWorkspaceModules(holoScriptRoot);
  const firstAtlases = generateMantleAtlasBuffers(modules.PNG, plan.atlas, plan.kits);
  const secondAtlases = generateMantleAtlasBuffers(modules.PNG, plan.atlas, plan.kits);
  const repeatedAtlasIdentity = Object.keys(firstAtlases).every((key) =>
    firstAtlases[key].equals(secondAtlases[key]),
  );
  writeBuffers(
    firstAtlases,
    Object.fromEntries(
      Object.keys(firstAtlases).map((kind) => [
        kind,
        path.join(options.outputDir, path.basename(ATLAS_RELS[kind])),
      ]),
    ),
  );
  if (options.writeArtifacts) {
    writeBuffers(
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
    plan,
    firstAtlases,
    root,
    options,
    modules,
  );
  const browser = await runBrowser(surface, plan, options, modules);
  const manifest = options.skipManifest
    ? { status: 'skipped', errors: [], reason: 'bootstrap_skip_requested' }
    : await validateManifest(root, holoScriptRoot);
  const externalRequests = browser.requests.filter(
    (url) => !url.startsWith('http://127.0.0.1:'),
  );
  const lodSummaries = browser.witness.lodSummaries;
  const checks = {
    formatStackPass:
      stack.source.success && stack.policy.success && stack.seed.success,
    h2ContractPass: validation.status === 'pass',
    manifestPass: ['pass', 'skipped'].includes(manifest.status),
    repeatedAtlasByteIdentity: repeatedAtlasIdentity,
    exactSixKits: plan.kits.length === 6,
    exactEighteenLodWitnesses: lodSummaries.length === 18,
    mantleTriangleBudgets: lodSummaries.every(
      (entry) => entry.mantleTriangles <= plan.lod.maximumMantleTriangles[entry.lod],
    ),
    residentTriangleBudgets: lodSummaries.every(
      (entry) => entry.residentTriangles <= plan.lod.maximumResidentTriangles[entry.lod],
    ),
    monotonicPerFamilyTopology: plan.kits.every((kit) => {
      const rows = lodSummaries
        .filter((entry) => entry.name === kit.name)
        .sort((left, right) => left.lod - right.lod);
      return (
        rows.length === 3 &&
        rows[0].mantleTriangles > rows[1].mantleTriangles &&
        rows[1].mantleTriangles > rows[2].mantleTriangles
      );
    }),
    exactOneMantleMaterialGroup: lodSummaries.every(
      (entry) => entry.mantleMaterialGroups === 1,
    ),
    exactThreeResidentMaterialGroups: lodSummaries.every(
      (entry) => entry.totalMaterialGroups === 3,
    ),
    wetDryResponse: plan.kits.every(
      (kit) => kit.wetRoughness < kit.dryRoughness,
    ),
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
      canonicalJson(browser.witness.resetEvents) === canonicalJson(RESET_EVENTS),
    inheritedH1Immutable:
      sha256File(path.join(root, stack.contract.metadata.inheritedH1Source)) ===
        stack.contract.metadata.inheritedH1SourceSha256 &&
      sha256File(path.join(root, stack.contract.metadata.inheritedH1Manifest)) ===
        stack.contract.metadata.inheritedH1ManifestSha256,
    inheritedCompilerProofImmutable:
      sha256File(
        path.join(root, stack.contract.metadata.inheritedCompilerCatalog),
      ) === stack.contract.metadata.inheritedCompilerCatalogSha256 &&
      sha256File(
        path.join(root, stack.contract.metadata.inheritedCompilerManifest),
      ) === stack.contract.metadata.inheritedCompilerManifestSha256,
    identityBoundary:
      stack.contract.state.familyIdentityVisible === true &&
      stack.contract.state.familyIdentityChannel === 'detachable_mantle' &&
      stack.contract.state.researchSeatBinding === 'absent' &&
      stack.contract.state.liveResearchJoinAllowed === false,
    readOnlyBoundary:
      stack.contract.state.canonicalWritesAllowed === false &&
      stack.contract.state.residentObservationWritesAllowed === false &&
      stack.contract.state.modelCallsAllowed === false,
    boundedClaims:
      stack.contract.state.productionBodyCompleteClaimed === false &&
      stack.contract.state.clothSimulationClaimed === false &&
      stack.contract.state.h5TwoGroupsPerResidentConsolidationComplete === false,
  };
  const failures = Object.entries(checks)
    .filter(([, value]) => value !== true)
    .map(([name]) => name);
  const receiptCore = {
    schema: 'hololand.model-village.character-appearance-h2-witness.v1',
    status: failures.length ? 'fail' : 'pass',
    claim: {
      verified:
        'HoloScript owns six detachable production family mantle kits over one immutable identity-neutral H1 body, with distinct source-authored non-color silhouettes, deterministic local PBR maps, dry/wet response, three mantle LODs, and a measured six-resident hardware browser witness.',
      bounded:
        'The public family channel is excluded from live blinded research. H2 does not claim a complete production character, cloth simulation, H5 draw-group consolidation, motion retargeting, face/hair completion, observer promotion, headset performance, photorealism, or full-world convergence.',
    },
    sources: {
      source: { path: SOURCE_REL, sha256: sha256(stack.sourceText) },
      policy: { path: POLICY_REL, sha256: sha256(stack.policyText) },
      seed: { path: SEED_REL, sha256: sha256(stack.seedText) },
      checker: {
        path: path.relative(root, SCRIPT_PATH).replaceAll('\\', '/'),
        sha256: sha256File(SCRIPT_PATH),
      },
      inheritedH1: {
        path: stack.contract.metadata.inheritedH1Source,
        sha256: stack.contract.metadata.inheritedH1SourceSha256,
        immutable: true,
      },
      inheritedCompilerProof: {
        path: stack.contract.metadata.inheritedCompilerCatalog,
        sha256: stack.contract.metadata.inheritedCompilerCatalogSha256,
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
        dimensions: [2400, 1200],
      },
      lodComparison: {
        path: path.relative(root, browser.lodPath).replaceAll('\\', '/'),
        sha256: sha256(browser.lodBuffer),
        bytes: browser.lodBuffer.length,
        dimensions: [2400, 600],
      },
      weatherComparison: {
        path: path.relative(root, browser.weatherPath).replaceAll('\\', '/'),
        sha256: sha256(browser.weatherBuffer),
        bytes: browser.weatherBuffer.length,
        dimensions: [2400, 650],
      },
      accessibilityComparison: {
        path: path.relative(root, browser.accessibilityPath).replaceAll('\\', '/'),
        sha256: sha256(browser.accessibilityBuffer),
        bytes: browser.accessibilityBuffer.length,
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
        'HoloScript H2 .holo/.hsplus/.hs + immutable H1 body + immutable native compiler mantle proof -> deterministic six-kit atlas -> source-authored Three/WebGL2 D3D11 public story witness',
      appSourceSha256: surface.appSourceHash,
      bundleSha256: surface.bundleHash,
      htmlSha256: surface.htmlHash,
      externalAssets: [],
    },
    boundaries: {
      presentationProfile: stack.contract.state.presentationProfile,
      publicFamilyIdentityVisible: true,
      familyIdentityChannel: 'detachable_mantle_glyph_caption_only',
      liveResearchFamilyIdentityVisible: false,
      researchSeatBinding: 'absent',
      liveResearchJoinAllowed: false,
      canonicalWritesAllowed: false,
      residentObservationWritesAllowed: false,
      modelCalls: 0,
      networkFetches: 0,
      productionBodyCompleteClaimed: false,
      clothSimulationClaimed: false,
      h5DrawGroupConsolidationClaimed: false,
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
    'character-appearance-h2-witness.json',
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
    lodPath: browser.lodPath,
    weatherPath: browser.weatherPath,
    accessibilityPath: browser.accessibilityPath,
    reportPath: options.reportOutput,
  };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  runCharacterAppearanceH2(parseArgs())
    .then((result) => {
      const { receipt } = result;
      console.log(
        JSON.stringify(
          {
            status: receipt.status,
            receiptHash: receipt.receiptHash,
            receiptPath: result.receiptPath,
            heroPath: result.heroPath,
            lodPath: result.lodPath,
            weatherPath: result.weatherPath,
            accessibilityPath: result.accessibilityPath,
            reportPath: result.reportPath,
            renderer: receipt.render.renderer.unmaskedRenderer,
            rafP95Milliseconds: receipt.performance.raf.p95,
            renderSubmitP95Milliseconds: receipt.performance.renderSubmit.p95,
            droppedFrameRatio: receipt.performance.droppedFrameRatio,
            largestMantleTriangles: [0, 1, 2].map((lod) =>
              Math.max(
                ...receipt.lod.summaries
                  .filter((entry) => entry.lod === lod)
                  .map((entry) => entry.mantleTriangles),
              ),
            ),
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
