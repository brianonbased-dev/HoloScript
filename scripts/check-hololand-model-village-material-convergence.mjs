#!/usr/bin/env node
/* global atob, console, crypto, document, process, window */
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
  MATERIAL_CHANNELS,
  serializeMaterialSet,
  synthesizeMaterialSet,
  validateMaterialSpec,
} from './lib/model-village-material-synthesis.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const SOURCE_RELATIVE =
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-material-convergence.holo';
const BASE_SOURCE_RELATIVE =
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-courtyard.holo';
const BASE_BRIDGE_RELATIVE =
  'scripts/check-hololand-model-village-receipt-loom-courtyard.mjs';
const SYNTHESIS_RELATIVE =
  'scripts/lib/model-village-material-synthesis.mjs';
const CONCEPT_RELATIVE =
  'docs/assets/model-village/model-village-stormglass-commons-concept-2026-07-25.png';
const DEFAULT_OUTPUT_DIR = path.join(
  REPO_ROOT,
  '.tmp',
  'hololand',
  'model-village',
  'material-convergence-b',
);
const SURFACE_KEYS = Object.freeze([
  'agedTimber',
  'limePlaster',
  'handSplitSlate',
  'wetBasalt',
]);
const REQUIRED_BINDINGS = Object.freeze({
  old_timber: 'agedTimber',
  timber_cut: 'agedTimber',
  lime_plaster: 'limePlaster',
  slate_roof: 'handSplitSlate',
  wet_basalt: 'wetBasalt',
  dry_basalt: 'wetBasalt',
});
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

export function validateMaterialConvergenceContract(contract, root = REPO_ROOT) {
  const errors = [];
  const { metadata, state, nodes } = contract;
  if (metadata.worldName !== 'Stormglass Commons') {
    errors.push('worldName must be Stormglass Commons');
  }
  if (metadata.artStyle !== 'hearthlight_biorealism') {
    errors.push('artStyle must be hearthlight_biorealism');
  }
  if (metadata.milestone !== 'MV_V1_MATERIAL_CONVERGENCE_B') {
    errors.push('milestone must be MV_V1_MATERIAL_CONVERGENCE_B');
  }
  if (metadata.projectionRole !== 'read_only_material_development') {
    errors.push('projectionRole must be read_only_material_development');
  }
  if (metadata.sourceSemanticsRewritten !== false) {
    errors.push('sourceSemanticsRewritten must remain false');
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
  if (state.modelCallsAllowed !== false) {
    errors.push('modelCallsAllowed must remain false');
  }
  if (state.networkFetchesAllowed !== false) {
    errors.push('networkFetchesAllowed must remain false');
  }
  if (state.researchLiveBlindedCompatible !== true) {
    errors.push('the material tracer must remain research-live-blinded compatible');
  }
  if (state.publicFamilyIdentityPresented !== false
    || state.exactModelIdentityPresented !== false) {
    errors.push('the material tracer must not expose public or exact model identity');
  }
  if (state.productionResidentClaimed !== false) {
    errors.push('productionResidentClaimed must remain false');
  }
  if (state.fullWorldConvergenceClaimed !== false) {
    errors.push('fullWorldConvergenceClaimed must remain false');
  }
  if (state.gameplayPhysicsClaimed !== false) {
    errors.push('gameplayPhysicsClaimed must remain false');
  }
  if (state.sourceRecipeAuthority !== 'holoscript') {
    errors.push('sourceRecipeAuthority must be holoscript');
  }
  if (state.textureSynthesisBridge !== 'deterministic_local_presentation_only') {
    errors.push('textureSynthesisBridge must be deterministic_local_presentation_only');
  }
  if (state.textureNetworkRequests !== 0) {
    errors.push('textureNetworkRequests must be zero');
  }
  if (state.surfaceCount !== SURFACE_KEYS.length) {
    errors.push(`surfaceCount must be ${SURFACE_KEYS.length}`);
  }
  if (state.channelCountPerSurface !== MATERIAL_CHANNELS.length) {
    errors.push(`channelCountPerSurface must be ${MATERIAL_CHANNELS.length}`);
  }
  if (canonicalJson(state.requiredChannels) !== canonicalJson(MATERIAL_CHANNELS)) {
    errors.push('requiredChannels do not match the deterministic PBR channel contract');
  }
  if (canonicalJson(state.surfaceBindings) !== canonicalJson(REQUIRED_BINDINGS)) {
    errors.push('surfaceBindings do not match the accepted courtyard material names');
  }

  const materialSurfaces = state.materialSurfaces || {};
  for (const surfaceKey of SURFACE_KEYS) {
    const spec = materialSurfaces[surfaceKey];
    if (!spec) {
      errors.push(`missing material surface ${surfaceKey}`);
      continue;
    }
    errors.push(...validateMaterialSpec(spec).map(
      (error) => `${surfaceKey}: ${error}`,
    ));
    if (Object.keys(spec.hashes || {}).sort().join(',')
      !== [...MATERIAL_CHANNELS].sort().join(',')) {
      errors.push(`${surfaceKey}: expected exactly ${MATERIAL_CHANNELS.length} channel hashes`);
      continue;
    }
    if (Object.values(spec.hashes).some((hash) => !SHA256_PATTERN.test(hash))) {
      errors.push(`${surfaceKey}: channel hashes must be lowercase sha256`);
      continue;
    }
    try {
      const generated = synthesizeMaterialSet(spec);
      for (const channel of MATERIAL_CHANNELS) {
        if (generated.hashes[channel] !== spec.hashes[channel]) {
          errors.push(`${surfaceKey}: ${channel} bytes do not match the authored hash`);
        }
      }
    } catch (error) {
      errors.push(`${surfaceKey}: synthesis failed: ${error.message}`);
    }
  }
  if (Object.keys(materialSurfaces).sort().join(',') !== [...SURFACE_KEYS].sort().join(',')) {
    errors.push('materialSurfaces must contain exactly the four accepted surface keys');
  }

  const surfaceNodes = nodes.filter(
    (node) => node.props?.properties?.presentationKit === 'deterministic_pbr_surface',
  );
  const nodeKeys = surfaceNodes.map(
    (node) => node.props.properties.materialKey,
  ).sort();
  if (canonicalJson(nodeKeys) !== canonicalJson([...SURFACE_KEYS].sort())) {
    errors.push('the HoloScript scene must carry one deterministic surface node per material');
  }
  if (surfaceNodes.some((node) => node.props?.visible !== false)) {
    errors.push('material authority nodes must remain invisible');
  }

  return {
    schema: 'hololand.model-village.material-convergence-contract.v1',
    status: errors.length === 0 ? 'pass' : 'fail',
    errors,
    counts: {
      surfaces: Object.keys(materialSurfaces).length,
      channels: Object.keys(materialSurfaces).length * MATERIAL_CHANNELS.length,
      bindings: Object.keys(state.surfaceBindings || {}).length,
      authorityNodes: surfaceNodes.length,
    },
  };
}

export function extractBaseBrowserApplication(sourceText) {
  const startMarker = 'async function courtyardBrowserApplication';
  const endMarker = '\n}\n\nasync function buildSurface';
  const start = sourceText.indexOf(startMarker);
  if (start < 0) throw new Error(`Base bridge is missing ${startMarker}`);
  const endStart = sourceText.indexOf(endMarker, start);
  if (endStart < 0) throw new Error('Base bridge browser application end marker is missing');
  return sourceText.slice(start, endStart + 2);
}

async function compileMaterialConvergence(root, holoScriptRoot) {
  const corePath = path.join(holoScriptRoot, 'packages', 'core', 'dist', 'index.js');
  const core = await import(pathToFileURL(corePath).href);
  const sourcePath = path.resolve(root, SOURCE_RELATIVE);
  const baseSourcePath = path.resolve(root, BASE_SOURCE_RELATIVE);
  const baseBridgePath = path.resolve(root, BASE_BRIDGE_RELATIVE);
  const sourceText = readFileSync(sourcePath, 'utf8');
  const baseSourceText = readFileSync(baseSourcePath, 'utf8');
  const baseBridgeText = readFileSync(baseBridgePath, 'utf8');
  const parsed = new core.HoloCompositionParser().parse(sourceText);
  const baseParsed = new core.HoloCompositionParser().parse(baseSourceText);
  if (!parsed.success) {
    throw new Error(`Material HoloCompositionParser failed: ${canonicalJson(parsed.errors)}`);
  }
  if (!baseParsed.success) {
    throw new Error(`Base HoloCompositionParser failed: ${canonicalJson(baseParsed.errors)}`);
  }

  const sceneIr = new core.SceneIRCompiler({ defaultLighting: false })
    .compileComposition(parsed.ast);
  const baseSceneIr = new core.SceneIRCompiler({ defaultLighting: false })
    .compileComposition(baseParsed.ast);
  const contract = {
    metadata: parsed.ast.metadata,
    state: stateProperties(parsed.ast.state),
    nodes: flatten(sceneIr)
      .filter((node) => node.type !== 'group')
      .map((node) => ({ id: node.id || null, type: node.type, props: node.props || {} })),
  };
  const baseContract = {
    metadata: baseParsed.ast.metadata,
    state: stateProperties(baseParsed.ast.state),
    environment: stateProperties(baseParsed.ast.environment),
    nodes: flatten(baseSceneIr)
      .filter((node) => node.type !== 'group')
      .map((node) => ({ id: node.id || null, type: node.type, props: node.props || {} })),
  };
  const validation = validateMaterialConvergenceContract(contract, root);
  const baseValidation = validateCourtyardContract(baseContract, root);
  if (validation.status !== 'pass') {
    throw new Error(`Material source contract failed: ${validation.errors.join('; ')}`);
  }
  if (baseValidation.status !== 'pass') {
    throw new Error(`Base courtyard contract failed: ${baseValidation.errors.join('; ')}`);
  }
  if (sha256(baseBridgeText) !== contract.metadata.baseBridgeSha256) {
    throw new Error('Base bridge changed after the material overlay was authored');
  }

  const materialSets = Object.fromEntries(
    SURFACE_KEYS.map((surfaceKey) => [
      surfaceKey,
      serializeMaterialSet(synthesizeMaterialSet(contract.state.materialSurfaces[surfaceKey])),
    ]),
  );
  return {
    contract,
    validation,
    sourcePath,
    sourceHash: sha256(sourceText),
    sceneIrHash: sha256(canonicalJson(sceneIr)),
    base: {
      contract: baseContract,
      validation: baseValidation,
      sourcePath: baseSourcePath,
      sourceHash: sha256(baseSourceText),
      sceneIrHash: sha256(canonicalJson(baseSceneIr)),
      bridgePath: baseBridgePath,
      bridgeHash: sha256(baseBridgeText),
      browserApplication: extractBaseBrowserApplication(baseBridgeText),
    },
    materialSets,
    corePath,
    coreHash: sha256File(corePath),
  };
}

async function materialConvergenceBrowserApplication(
  THREE,
  RoomEnvironment,
  payload,
  baseApplication,
) {
  const convergence = {
    schema: 'hololand.model-village.material-convergence-browser.v1',
    ready: false,
    status: 'booting',
    error: null,
  };
  window.__MV_MATERIAL_CONVERGENCE__ = convergence;
  try {
    const channelNames = ['albedo', 'normal', 'roughness', 'clearcoat'];
    const decodedSets = {};
    for (const [surfaceKey, materialSet] of Object.entries(payload.materialSets)) {
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

    class MaterialConvergencePhysicalMaterial extends THREE.MeshPhysicalMaterial {
      constructor(parameters = {}) {
        super(parameters);
        const surfaceKey = payload.surfaceBindings[parameters.name];
        if (!surfaceKey) return;
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
        } else if (parameters.name === 'old_timber' || parameters.name === 'timber_cut') {
          this.clearcoat = 0.08;
          this.clearcoatRoughness = 0.58;
        }
        this.needsUpdate = true;
        appliedMaterials.push({
          material: parameters.name,
          surfaceKey,
          channels: [...channelNames],
          repeat: [...materialSet.repeat],
          resolution: materialSet.resolution,
        });
      }
    }

    const patchedThree = {
      ...THREE,
      MeshPhysicalMaterial: MaterialConvergencePhysicalMaterial,
    };
    await baseApplication(patchedThree, RoomEnvironment, payload.base);
    const baseWitness = window.__MV_COURTYARD_WITNESS__;
    if (baseWitness?.status !== 'pass') {
      throw new Error(`Inherited courtyard application failed: ${baseWitness?.error || 'unknown'}`);
    }

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

    document.title = 'Receipt Loom Courtyard — Material Convergence B';
    const eyebrow = document.querySelector('.eyebrow');
    if (eyebrow) eyebrow.textContent = 'STORMGLASS COMMONS // MATERIAL CONVERGENCE B';
    const subtitle = document.querySelector('header p');
    if (subtitle) {
      subtitle.textContent =
        'Hearthlight Biorealism · HoloScript-owned PBR · real-time local WebGL2';
    }
    const truthLabels = document.querySelectorAll('.truth span');
    if (truthLabels.length >= 3) {
      truthLabels[0].textContent = 'READ-ONLY MATERIAL TRACER';
      truthLabels[1].textContent = '4 PROVENANCE-BOUND SURFACES';
      truthLabels[2].textContent = '16 HASH-LOCKED CHANNELS';
    }

    convergence.ready = true;
    convergence.status = 'pass';
    convergence.sourceHash = payload.materialSourceHash;
    convergence.sceneIrHash = payload.materialSceneIrHash;
    convergence.baseBridgeHash = payload.baseBridgeHash;
    convergence.browserHashes = browserHashes;
    convergence.appliedMaterials = appliedMaterials;
    convergence.textureCount = Object.keys(textures).length;
    convergence.surfaceCount = Object.keys(decodedSets).length;
    convergence.channelCount = Object.keys(textures).length;
    convergence.presentation = {
      publicFamilyIdentityPresented: false,
      exactModelIdentityPresented: false,
      productionResidentClaimed: false,
      canonicalWritesAllowed: false,
      modelCalls: 0,
    };
    baseWitness.materialConvergence = convergence;
    window.__MV_MATERIAL_CONVERGENCE_SNAPSHOT__ = () => ({
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
  const bundlePath = path.join(outputDir, 'material-convergence-b.bundle.js');
  const htmlPath = path.join(outputDir, 'material-convergence-b.html');
  const payload = {
    schema: 'hololand.model-village.material-convergence-render-payload.v1',
    materialSourceHash: compiled.sourceHash,
    materialSceneIrHash: compiled.sceneIrHash,
    baseBridgeHash: compiled.base.bridgeHash,
    surfaceBindings: compiled.contract.state.surfaceBindings,
    materialSets: compiled.materialSets,
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
    `(${materialConvergenceBrowserApplication.toString()})(`,
    '  THREE, RoomEnvironment, PAYLOAD, BASE_APPLICATION,',
    ');',
  ].join('\n');
  await esbuild.build({
    stdin: {
      contents: appSource,
      resolveDir: holoScriptRoot,
      sourcefile: 'material-convergence-b.entry.js',
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
  <title>Receipt Loom Courtyard — Material Convergence B</title>
</head>
<body>
  <script src="./material-convergence-b.bundle.js"></script>
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
      if (!url.startsWith('file:') && !url.startsWith('data:')) {
        externalRequests.push(url);
      }
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
      () => window.__MV_MATERIAL_CONVERGENCE__?.ready === true,
      undefined,
      { timeout: timeoutMs },
    );
    const state = await page.evaluate(
      () => window.__MV_MATERIAL_CONVERGENCE_SNAPSHOT__?.()
        || { convergence: window.__MV_MATERIAL_CONVERGENCE__ },
    );
    if (state.convergence?.status !== 'pass') {
      throw new Error(
        `Browser material witness failed: ${
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
      console.log(`Usage: node scripts/check-hololand-model-village-material-convergence.mjs [options]
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

export async function runMaterialConvergenceCheck(options = {}) {
  const root = path.resolve(options.root || REPO_ROOT);
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT_DIR);
  const holoScriptRoot = resolveHoloScriptRoot(root, options.holoScriptRoot);
  const browserPath = resolveBrowser(options.browser);
  if (options.clean !== false && existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true });
  }
  mkdirSync(outputDir, { recursive: true });

  const compiled = await compileMaterialConvergence(root, holoScriptRoot);
  const surface = await buildSurface(outputDir, holoScriptRoot, compiled);
  const heroPath = path.resolve(
    options.heroOutput || path.join(outputDir, 'material-convergence-b-1600x900.png'),
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
  const budget = compiled.contract.state.qualityBudget;
  const expectedHashes = Object.fromEntries(SURFACE_KEYS.map((surfaceKey) => [
    surfaceKey,
    compiled.materialSets[surfaceKey].hashes,
  ]));
  const checks = {
    sourceContractPass: compiled.validation.status === 'pass',
    baseContractPass: compiled.base.validation.status === 'pass',
    sourceHashReachedBrowser: convergence.sourceHash === compiled.sourceHash,
    sceneIrHashReachedBrowser: convergence.sceneIrHash === compiled.sceneIrHash,
    immutableBaseBridgeReachedBrowser:
      convergence.baseBridgeHash === compiled.base.bridgeHash,
    channelBytesReachedBrowser:
      canonicalJson(convergence.browserHashes) === canonicalJson(expectedHashes),
    allSurfacesApplied:
      convergence.surfaceCount === SURFACE_KEYS.length
      && convergence.channelCount === SURFACE_KEYS.length * MATERIAL_CHANNELS.length
      && convergence.appliedMaterials.length === Object.keys(REQUIRED_BINDINGS).length,
    webgl2: base.gl?.webgl2 === true,
    hardwareRenderer: !rendererIsSoftware(base.gl),
    d3d11Backend: /direct3d11|d3d11/i.test(base.gl?.unmaskedRenderer || ''),
    noExternalRequests: browser.externalRequests.length === 0,
    noPageErrors: browser.pageErrors.length === 0,
    drawCallBudget: base.rendererInfo?.calls <= budget.maxDrawCalls,
    triangleBudget: base.rendererInfo?.triangles <= budget.maxTriangles,
    materialBudget: base.rendererInfo?.materialCount <= budget.maxMaterials,
    textureBudget:
      base.rendererInfo?.textures >= 20
      && base.rendererInfo?.textures <= budget.maxTextures,
    lockedResolution:
      pngDimensions(heroBuffer).width === budget.renderWidth
      && pngDimensions(heroBuffer).height === budget.renderHeight,
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
    schema: 'hololand.model-village.material-convergence-witness.v1',
    status: failures.length === 0 ? 'pass' : 'fail',
    claim: {
      verified:
        'Four HoloScript-owned deterministic PBR surface sets were hash-verified in Node and Chromium, bound to the immutable Receipt Loom courtyard, and rendered on the local D3D11 GPU path.',
      bounded:
        'Material Convergence B improves timber, lime plaster, slate, and rain-darkened basalt. It does not claim production residents, full-world convergence, gameplay physics, named family embodiments, scanned photogrammetry, or a path-traced renderer.',
    },
    sources: {
      materialOverlay: {
        path: SOURCE_RELATIVE,
        sha256: compiled.sourceHash,
        sceneIrSha256: compiled.sceneIrHash,
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
      synthesis: {
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
    surfaces: Object.fromEntries(SURFACE_KEYS.map((surfaceKey) => [
      surfaceKey,
      {
        recipe: compiled.materialSets[surfaceKey].recipe,
        seed: compiled.materialSets[surfaceKey].seed,
        resolution: compiled.materialSets[surfaceKey].resolution,
        repeat: compiled.materialSets[surfaceKey].repeat,
        normalScale: compiled.materialSets[surfaceKey].normalScale,
        hashes: compiled.materialSets[surfaceKey].hashes,
      },
    ])),
    bridge: {
      route:
        'HoloScript material overlay -> deterministic local synthesis -> immutable A scene application -> MeshPhysicalMaterial texture binding',
      appSourceSha256: surface.appSourceHash,
      bundleSha256: surface.bundleHash,
      htmlSha256: surface.htmlHash,
      esbuildSha256: surface.esbuildHash,
      sourceSemanticsRewritten: false,
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
      rendererInfo: base.rendererInfo,
      compositionMetrics: base.compositionMetrics,
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
    },
    checks,
    failures,
    residue: [
      'replace the two neutral Craftfolk staging forms with receipted production resident assets before claiming resident convergence',
      'ship geometric microdetail or production-authored scanned assets before claiming concept-level surface realism',
      'measure a production frame-time distribution before claiming performance convergence',
      'keep the live research village identity-blinded while public model-family embodiments remain a separate presentation projection',
    ],
  };
  const receipt = {
    ...receiptCore,
    receipt: {
      algorithm: 'sha256-canonical-json',
      receiptHash: sha256(canonicalJson(receiptCore)),
    },
  };
  const receiptPath = path.join(outputDir, 'material-convergence-b-witness.json');
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  if (failures.length > 0) {
    throw new Error(
      `Material convergence witness failed: ${failures.join(', ')}. Receipt: ${receiptPath}`,
    );
  }
  return { receipt, receiptPath, heroPath };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === SCRIPT_PATH;
if (isMain) {
  runMaterialConvergenceCheck(parseArgs())
    .then(({ receipt, receiptPath, heroPath }) => {
      console.log(JSON.stringify({
        status: receipt.status,
        receiptPath,
        receiptHash: receipt.receipt.receiptHash,
        heroPath,
        heroHash: receipt.render.hero.sha256,
        gl: receipt.render.gl,
        rendererInfo: receipt.render.rendererInfo,
        surfaces: Object.fromEntries(Object.entries(receipt.surfaces).map(
          ([surfaceKey, surface]) => [surfaceKey, surface.hashes],
        )),
      }, null, 2));
    })
    .catch((error) => {
      console.error(error?.stack || error);
      process.exitCode = 1;
    });
}
