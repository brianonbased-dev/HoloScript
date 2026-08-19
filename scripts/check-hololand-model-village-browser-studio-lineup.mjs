#!/usr/bin/env node

import { Buffer } from 'node:buffer';
import console from 'node:console';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  objectProperties,
  sha256,
} from './check-hololand-model-village-resident-rig.mjs';
import { loadMantleTextureTile } from './check-hololand-model-village-cloth-mantle.mjs';
import {
  FAMILY_MANTLES,
  validateFamilyMantleCatalogSource,
} from './check-hololand-model-village-family-mantles.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-browser-studio-lineup.holo';
const CATALOG_REL =
  'source/layers/vr/frontier/model-village/model-village-family-mantle-catalog.holo';
const PUBLIC_CATALOG_REL =
  'source/layers/vr/frontier/model-village/model-village-public-embodiments.holo';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-browser-studio-lineup-manifest.holo';
const HERO_REL =
  'docs/assets/model-village/model-village-six-family-browser-studio-hero-2026-07-26.png';
const PORTRAIT_REL =
  'docs/assets/model-village/model-village-six-family-browser-studio-portrait-2026-07-26.png';
const ACCESSIBILITY_REL =
  'docs/assets/model-village/model-village-six-family-browser-studio-deuteranopia-2026-07-26.png';
const DETACHED_REL =
  'docs/assets/model-village/model-village-six-family-browser-studio-detached-2026-07-26.png';
const DEFAULT_OUTPUT_REL = '.tmp/hololand/model-village/browser-studio-lineup';
const PROFILE = 'village_story_unblinded';
const DENIED_PROFILE = 'research_live_blinded';
const DISCLOSURE =
  'HoloLand-authored visual interpretation; not affiliated with or endorsed by the named providers.';
const PHASES = Object.freeze([0, 0.6, 1.2]);
const RENDER_SIZE = 256;
const CLEAR = Object.freeze([0, 0, 0, 0]);
const CAMERA = Object.freeze([0, 1.05, 6]);
const LIGHT = Object.freeze([0.4, 0.86, 0.36]);
const HEIGHT_SCALE = 1.25;
const RESEARCH_BINDING_FIELDS = Object.freeze([
  'researchResidentBinding',
  'researchSeatBinding',
  'researchPersonaBinding',
  'researchRoleBinding',
  'adapterAssignmentBinding',
  'exactModelRevisionBinding',
]);

const bundleRel = (family) =>
  `assets/model-village/residents/stormglass-${family.slug}-mantle-lod0.character.json`;

function parseArgs(argv) {
  const args = {
    holoscriptRoot:
      process.env.HOLOSCRIPT_ROOT ?? 'C:/Users/josep/Documents/GitHub/HoloScript',
    browser: null,
    outputDir: path.join(REPO_ROOT, DEFAULT_OUTPUT_REL),
    writeArtifacts: false,
    skipBrowser: false,
    skipManifest: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--holoscript-root') args.holoscriptRoot = path.resolve(argv[++index]);
    else if (arg === '--browser') args.browser = argv[++index];
    else if (arg === '--output-dir') args.outputDir = path.resolve(argv[++index]);
    else if (arg === '--write-artifacts') args.writeArtifacts = true;
    else if (arg === '--skip-browser') args.skipBrowser = true;
    else if (arg === '--skip-manifest') args.skipManifest = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/check-hololand-model-village-browser-studio-lineup.mjs [options]

Options:
  --holoscript-root <path>  Built HoloScript checkout
  --browser <path>          Chrome or Edge executable
  --output-dir <path>       Runtime HTML, screenshots, and receipt directory
  --write-artifacts         Refresh the four durable browser screenshots
  --skip-browser            Validate HoloScript, admission, bundles, and replay payload only
  --skip-manifest           Bootstrap before the immutable MV-V6 manifest exists
  --json                    Emit the complete receipt`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function trait(object, name) {
  return object?.traits?.find((candidate) => candidate.name === name);
}

function stripMantles(ast) {
  const clone = globalThis.structuredClone(ast);
  for (const family of FAMILY_MANTLES) {
    const object = clone.objects.find((candidate) => candidate.name === family.name);
    const clothing = trait(object, 'clothing')?.config;
    assert(clothing, `Cannot detach ${family.name} mantle`);
    for (const key of [
      'mantle_style',
      'mantle_color',
      'mantle_detachable',
      'mantle_albedo_map',
      'mantle_normal_map',
      'mantle_roughness_map',
    ]) {
      delete clothing[key];
    }
  }
  return clone;
}

export function validateBrowserStudioLineupSource(ast) {
  const metadata = ast.metadata ?? {};
  const state = objectProperties(ast.state);
  assert(
    metadata.schema === 'hololand.model-village.browser-studio-lineup.v1',
    'MV-V6 source schema drifted'
  );
  assert(metadata.milestone === 'MV-V6', 'MV-V6 milestone is missing');
  assert(metadata.presentationProfile === PROFILE, 'Story presentation profile drifted');
  assert(
    metadata.deniedPresentationProfile === DENIED_PROFILE,
    'Live blinded denial drifted'
  );
  assert(metadata.renderTarget === 'browser-native-webgpu', 'Browser WebGPU target drifted');
  assert(
    metadata.physicsPresentation === 'sealed_deterministic_xpbd_phase_replay',
    'Physics replay boundary drifted'
  );
  assert(metadata.independentProjectDisclosure === DISCLOSURE, 'Disclosure drifted');
  assert(metadata.researchLiveBlindedAllowed === false, 'Live research reveal was enabled');
  assert(metadata.canonicalWriteAuthority === false, 'Canonical write authority was enabled');
  assert(
    metadata.residentObservationWriteAuthority === false,
    'Resident observation writes were enabled'
  );
  assert(metadata.causalEffect === false, 'Presentation gained causal authority');
  assert(state.browserConsumerBuilt === true, 'MV-V6 source must own the browser consumer');
  assert(state.namedFamilyMantlesPresented === 6, 'MV-V6 must present all six mantles');
  assert(state.completeMvP2Claimed === false, 'MV-V6 overclaims complete MV-P2');
  assert(state.storyGalleryOrderDefinesResearchSeat === false, 'Gallery order became a seat join');
  assert(state.catalogHasStaticResearchJoin === false, 'A static research join was authored');
  assert(state.missingAdmissionBehavior === 'fail_neutral', 'Missing admission must fail neutral');
  assert(state.invalidAdmissionBehavior === 'fail_neutral', 'Bad admission must fail neutral');
  assert(state.researchProfileBehavior === 'fail_neutral', 'Research profile must fail neutral');
  assert(
    equal(state.supportedAccessibilityModes, ['color', 'grayscale', 'deuteranopia']),
    'Accessibility modes drifted'
  );
  assert(equal(state.sealedPhysicsPhaseSeconds, PHASES), 'Sealed cloth phases drifted');
  assert(state.clothSolver === 'xpbd', 'Cloth solver drifted');
  assert(state.clothFixedStepHz === 120, 'Cloth fixed-step rate drifted');
  assert(state.clothIterations === 5, 'Cloth iterations drifted');
  assert(
    state.continuousBrowserClothSolverClaimed === false,
    'Source overclaims continuous browser cloth'
  );
  assert(state.nativeBrowserWebgpuRequired === true, 'Native browser WebGPU is not required');
  assert(state.externalVisualAssets === false, 'External visual assets were enabled');
  assert(state.photorealismClaimed === false, 'Source overclaims photorealism');
  assert(state.realTimeClaimed === false, 'Source overclaims real time');
  for (const field of RESEARCH_BINDING_FIELDS) {
    assert(state[field] === 'none', `${field} must remain none`);
  }
  const objects = Object.fromEntries((ast.objects ?? []).map((object) => [object.name, object]));
  for (const name of [
    'BrowserStudioAdmissionGate',
    'HearthlightStage',
    'AccessibilityControlDeck',
    'BrowserWebGPUWitness',
    'SealedClothReplayWitness',
    'ClaimBoundary',
  ]) {
    assert(objects[name], `MV-V6 object ${name} is missing`);
  }
  const gate = objectProperties(objects.BrowserStudioAdmissionGate);
  assert(gate.expectedProfile === PROFILE, 'Admission gate profile drifted');
  assert(gate.deniedProfile === DENIED_PROFILE, 'Admission gate denial drifted');
  assert(gate.failNeutral === true, 'Admission gate is not fail neutral');
  assert(gate.mayWriteCanonicalWorld === false, 'Admission gate gained world writes');
  assert(gate.mayWriteResidentObservation === false, 'Admission gate gained observation writes');
  const browser = objectProperties(objects.BrowserWebGPUWitness);
  assert(browser.navigatorGpuRequired === true, 'navigator.gpu is not required');
  assert(browser.adapterAcquisitionRequired === true, 'GPU adapter acquisition is not required');
  assert(browser.deviceCreationRequired === true, 'GPU device creation is not required');
  assert(browser.threeJsUsed === false && browser.r3fUsed === false, 'Browser bridge drifted');
  const replay = objectProperties(objects.SealedClothReplayWitness);
  assert(replay.exactReplayRequired === true, 'Exact replay is not required');
  assert(replay.writesBackToExperiment === false, 'Cloth replay gained experiment writes');
  return { metadata, state, objects };
}

export function buildBrowserStudioAdmission({
  sourceSha256,
  catalogSha256,
  bundleSha256,
}) {
  const canonical = {
    schema: 'hololand.model-village.browser-studio-admission.v1',
    presentationProfile: PROFILE,
    browserStudioLineupSourceSha256: sourceSha256,
    familyMantleCatalogSourceSha256: catalogSha256,
    familyBundleSha256: bundleSha256,
    independentProjectDisclosure: DISCLOSURE,
    researchLiveBlindedAllowed: false,
    canonicalWriteAuthority: false,
  };
  return {
    canonical,
    canonicalJson: canonicalJson(canonical),
    sha256: sha256(canonicalJson(canonical)),
  };
}

function typedArray(value) {
  return Array.from(value);
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
      uvs: typedArray(spec.mesh.uvs),
    },
    jointMatrices: typedArray(spec.jointMatrices),
    modelMatrix: typedArray(spec.modelMatrix),
    materialGroups: spec.materialGroups,
  };
}

function buildReplayPayload(engine, catalogAst) {
  const neutralAst = stripMantles(catalogAst);
  const families = FAMILY_MANTLES.map((family) => {
    const first = engine.CharacterRender.buildCharacterHostFromComposition(catalogAst, {
      objectId: family.name,
      entityId: `mv-v6-${family.slug}-texture-source`,
      lodLevel: 0,
    });
    assert(first.ok && first.host && first.mantle, `${family.name} host did not resolve`);
    const texture = loadMantleTextureTile(REPO_ROOT, first.mantle);
    const phases = PHASES.map((timeSeconds) => {
      const built = engine.CharacterRender.buildCharacterHostFromComposition(catalogAst, {
        objectId: family.name,
        entityId: `mv-v6-${family.slug}-${String(timeSeconds).replace('.', '-')}`,
        lodLevel: 0,
      });
      assert(built.ok && built.host, `${family.name} phase host did not resolve`);
      built.host.setMantleTextureTile(texture.tile);
      built.host.applyWorldState({
        position: { x: 0, y: 0, z: 0 },
        rotationY: -0.12,
      });
      built.host.applyLocomotion('idle', 0.35, 1);
      const cloth = built.host.sampleClothSimulation(timeSeconds);
      assert(cloth?.solver === 'xpbd', `${family.name} phase lacks XPBD receipt`);
      assert(
        cloth.fixedSteps === Math.round(timeSeconds * 120),
        `${family.name} phase step count drifted`
      );
      assert(cloth.maxDisplacement <= 0.180001, `${family.name} exceeded cloth bound`);
      return {
        timeSeconds,
        cloth,
        spec: serializeSpec(built.host.getDrawSpec()),
      };
    });
    return {
      name: family.name,
      slug: family.slug,
      familyId: family.familyId,
      style: family.style,
      patternId: family.patternId,
      glyphId: family.glyphId,
      accent: family.accent,
      phases,
    };
  });
  const neutral = engine.CharacterRender.buildCharacterHostFromComposition(neutralAst, {
    objectId: FAMILY_MANTLES[0].name,
    entityId: 'mv-v6-neutral-detached',
    lodLevel: 0,
  });
  assert(neutral.ok && neutral.host, 'Neutral detached host did not resolve');
  neutral.host.applyWorldState({
    position: { x: 0, y: 0, z: 0 },
    rotationY: -0.12,
  });
  neutral.host.applyLocomotion('idle', 0.35, 1);
  return {
    schema: 'hololand.model-village.browser-studio-payload.v1',
    renderSize: RENDER_SIZE,
    clear: CLEAR,
    camera: CAMERA,
    light: LIGHT,
    heightScale: HEIGHT_SCALE,
    phases: PHASES,
    families,
    neutralSpec: serializeSpec(neutral.host.getDrawSpec()),
  };
}

function browserRendererEntry() {
  return `
import { renderCharacter } from './character-render.ts';
window.__HOLOSCRIPT_CHARACTER_RENDER__ = renderCharacter;
`;
}

async function bundleBrowserRenderer(holoscriptRoot) {
  const esbuild = await import(
    pathToFileURL(path.join(holoscriptRoot, 'node_modules/esbuild/lib/main.js')).href
  );
  const result = await esbuild.build({
    stdin: {
      contents: browserRendererEntry(),
      resolveDir: path.join(holoscriptRoot, 'packages/engine/src/character-render'),
      sourcefile: 'mv-v6-browser-renderer.ts',
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
  });
  assert(result.outputFiles?.length === 1, 'Browser renderer bundle was not emitted');
  return result.outputFiles[0].text;
}

function safeInlineJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
}

function browserApplication() {
  return String.raw`
(() => {
  const payload = window.__MV_V6_PAYLOAD__;
  const admission = window.__MV_V6_ADMISSION__;
  const disclosure = window.__MV_V6_DISCLOSURE__;
  const $ = (selector) => document.querySelector(selector);
  const state = {
    schema: 'hololand.model-village.browser-studio-browser-state.v1',
    ready: false,
    status: 'booting',
    admitted: false,
    profile: null,
    mode: 'color',
    phase: 0.6,
    detached: false,
    reducedMotion: true,
    renderer: 'HoloScript CharacterRender.renderCharacter',
    backend: 'browser-native-webgpu',
    gpu: null,
    metrics: {},
    errors: [],
  };
  window.__MV_V6__ = state;

  const setStatus = (text) => {
    document.querySelectorAll('[data-status-copy]').forEach((node) => {
      node.textContent = text;
    });
  };
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
      uvs: new Float32Array(value.mesh.uvs),
    },
    jointMatrices: new Float32Array(value.jointMatrices),
    modelMatrix: new Float32Array(value.modelMatrix),
    materialGroups: value.materialGroups,
  });
  const colorModes = {
    color: (r, g, b) => [r, g, b],
    grayscale: (r, g, b) => {
      const v = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return [v, v, v];
    },
    deuteranopia: (r, g, b) => [
      0.625 * r + 0.375 * g,
      0.7 * r + 0.3 * g,
      0.3 * g + 0.7 * b,
    ],
  };
  const cache = new Map();
  let device;

  function drawGrid(canvas, grid, mode) {
    canvas.width = grid.width;
    canvas.height = grid.height;
    const bytes = new Uint8ClampedArray(grid.data);
    const transform = colorModes[mode];
    for (let i = 0; i < bytes.length; i += 4) {
      const next = transform(bytes[i], bytes[i + 1], bytes[i + 2]);
      bytes[i] = Math.max(0, Math.min(255, Math.round(next[0])));
      bytes[i + 1] = Math.max(0, Math.min(255, Math.round(next[1])));
      bytes[i + 2] = Math.max(0, Math.min(255, Math.round(next[2])));
    }
    canvas.getContext('2d', { alpha: true }).putImageData(
      new ImageData(bytes, grid.width, grid.height),
      0,
      0
    );
  }

  async function renderSpec(cacheKey, spec) {
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const started = performance.now();
    const grid = await window.__HOLOSCRIPT_CHARACTER_RENDER__(device, hydrateSpec(spec), {
      size: payload.renderSize,
      clear: payload.clear,
      cameraPos: payload.camera,
      lightDir: payload.light,
      heightScale: payload.heightScale,
    });
    const result = {
      width: grid.width,
      height: grid.height,
      data: Array.from(grid.data),
      renderMs: performance.now() - started,
    };
    cache.set(cacheKey, result);
    return result;
  }

  function phaseRecord(family, phase) {
    return family.phases.find((candidate) => Math.abs(candidate.timeSeconds - phase) < 0.0001);
  }

  async function paint() {
    state.busy = true;
    setStatus('Rendering six sovereign HoloScript draw specs…');
    const started = performance.now();
    const renderTimes = [];
    for (const family of payload.families) {
      const record = phaseRecord(family, state.phase);
      const key = state.detached ? 'neutral' : family.slug + ':' + state.phase;
      const spec = state.detached ? payload.neutralSpec : record.spec;
      const grid = await renderSpec(key, spec);
      renderTimes.push(grid.renderMs);
      drawGrid(document.querySelector('[data-canvas="' + family.slug + '"]'), grid, state.mode);
      const cloth = document.querySelector('[data-cloth="' + family.slug + '"]');
      cloth.textContent = state.detached
        ? 'mantle detached · neutral body'
        : record.cloth.fixedSteps + ' XPBD steps · ' +
          (record.cloth.maxDisplacement * 100).toFixed(2) + ' cm';
    }
    state.metrics.lastPaintMs = performance.now() - started;
    state.metrics.lastGpuRenderSumMs = renderTimes.reduce((sum, value) => sum + value, 0);
    state.metrics.cachedGridCount = cache.size;
    state.busy = false;
    setStatus(
      state.detached
        ? 'Neutral detached comparison · no research identity assigned'
        : 'Six admitted story mantles · sealed cloth phase ' + state.phase.toFixed(1) + ' s'
    );
    return window.__MV_V6_SNAPSHOT__();
  }

  async function sampleRaf() {
    const deltas = [];
    let previous = performance.now();
    for (let i = 0; i < 90; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const now = performance.now();
      if (i > 9) deltas.push(now - previous);
      previous = now;
    }
    deltas.sort((a, b) => a - b);
    const percentile = (p) => deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * p))];
    state.metrics.rafSampleFrames = deltas.length;
    state.metrics.rafP50Ms = percentile(0.5);
    state.metrics.rafP95Ms = percentile(0.95);
  }

  window.__MV_V6_SNAPSHOT__ = () => JSON.parse(JSON.stringify({
    ...state,
    disclosure,
    familyCount: payload.families.length,
    canvasCount: document.querySelectorAll('canvas[data-canvas]').length,
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollHeight: document.documentElement.scrollHeight,
    documentClientHeight: document.documentElement.clientHeight,
  }));
  window.__MV_V6_SET_MODE__ = async (mode) => {
    if (!colorModes[mode]) throw new Error('Unsupported accessibility mode: ' + mode);
    state.mode = mode;
    document.documentElement.dataset.mode = mode;
    document.querySelectorAll('[data-mode]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    });
    return paint();
  };
  window.__MV_V6_SET_PHASE__ = async (phase) => {
    if (!payload.phases.includes(phase)) throw new Error('Unsupported phase: ' + phase);
    state.phase = phase;
    document.querySelectorAll('[data-phase]').forEach((button) => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.phase) === phase));
    });
    return paint();
  };
  window.__MV_V6_SET_DETACHED__ = async (detached) => {
    state.detached = Boolean(detached);
    $('#detach').setAttribute('aria-pressed', String(state.detached));
    document.body.classList.toggle('detached', state.detached);
    return paint();
  };

  function failNeutral(reason) {
    state.status = 'fail-neutral';
    state.ready = true;
    state.admitted = false;
    state.reason = reason;
    document.body.classList.add('fail-neutral');
    $('#admission-title').textContent = 'Presentation withheld';
    $('#admission-copy').textContent =
      'No family identity is displayed. This story gallery requires an exact source-bound admission; live blinded research always remains neutral.';
    setStatus(reason);
  }

  async function boot() {
    const params = new URLSearchParams(location.search);
    state.profile = params.get('profile');
    const suppliedAdmission = params.get('admission');
    if (state.profile !== admission.canonical.presentationProfile) {
      failNeutral(
        state.profile === '${DENIED_PROFILE}'
          ? 'research_live_blinded is explicitly denied'
          : 'missing or unadmitted story presentation profile'
      );
      return;
    }
    if (suppliedAdmission !== admission.sha256) {
      failNeutral('missing or invalid exact source-bound presentation admission');
      return;
    }
    if (!navigator.gpu) throw new Error('navigator.gpu is unavailable');
    const adapterStarted = performance.now();
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('navigator.gpu.requestAdapter returned null');
    device = await adapter.requestDevice();
    state.metrics.adapterAndDeviceMs = performance.now() - adapterStarted;
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
    state.admitted = true;
    state.status = 'rendering';
    document.body.classList.add('admitted');
    await paint();
    await sampleRaf();
    state.status = 'pass';
    state.ready = true;
    setStatus('Native browser WebGPU admitted · six HoloScript residents ready');
  }

  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => window.__MV_V6_SET_MODE__(button.dataset.mode));
  });
  document.querySelectorAll('[data-phase]').forEach((button) => {
    button.addEventListener('click', () => window.__MV_V6_SET_PHASE__(Number(button.dataset.phase)));
  });
  $('#detach').addEventListener('click', () => window.__MV_V6_SET_DETACHED__(!state.detached));

  boot().catch((error) => {
    state.status = 'error';
    state.ready = true;
    state.errors.push(error.stack || error.message);
    setStatus(error.message);
    console.error(error);
  });
})();
`;
}

function familyCards() {
  return FAMILY_MANTLES.map(
    (family, index) => `
      <article class="resident" style="--accent:${family.accent}" aria-labelledby="name-${family.slug}">
        <div class="resident-index">0${index + 1}</div>
        <div class="glyph" aria-hidden="true"><i></i><i></i><i></i></div>
        <canvas data-canvas="${family.slug}" width="${RENDER_SIZE}" height="${RENDER_SIZE}"
          aria-label="${family.name}, ${family.patternId.replaceAll('_', ' ')} mantle"></canvas>
        <div class="resident-copy">
          <span class="family-kicker">${family.familyId} story mantle</span>
          <h2 id="name-${family.slug}">${family.name}</h2>
          <p class="pattern">${family.patternId.replaceAll('_', ' ')}</p>
          <p class="cloth" data-cloth="${family.slug}">sealed XPBD phase</p>
        </div>
      </article>`
  ).join('');
}

function buildHtml({ payload, admission, rendererBundle, sourceSha256 }) {
  return `<!doctype html>
<html lang="en" data-mode="color">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Stormglass Commons · Six Family Mantles</title>
<style>
:root{--night:#050a12;--basalt:#0c1622;--ink:#dce9ec;--mist:#7e9daa;--loom:#e4a95f;--storm:#557f91;--line:rgba(150,191,201,.18);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:var(--night)}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;overflow-x:hidden}body{min-height:100vh;background:radial-gradient(circle at 50% 56%,rgba(228,169,95,.12),transparent 26%),radial-gradient(circle at 50% 40%,rgba(85,127,145,.19),transparent 52%),linear-gradient(180deg,#07111f 0%,#08121c 48%,#03070c 100%);letter-spacing:.01em}
body:before{content:"";position:fixed;inset:0;pointer-events:none;background:linear-gradient(115deg,transparent 0 46%,rgba(126,157,170,.04) 46.2% 46.5%,transparent 46.7%),repeating-linear-gradient(90deg,transparent 0 79px,rgba(150,191,201,.015) 80px);mix-blend-mode:screen}
.shell{min-height:100vh;display:grid;grid-template-rows:auto 1fr auto;position:relative}.topbar{display:grid;grid-template-columns:1fr auto;align-items:start;padding:24px 34px 12px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,rgba(4,9,16,.92),rgba(4,9,16,.5));backdrop-filter:blur(16px);z-index:4}
.eyebrow,.family-kicker,.resident-index,.status-label{font:600 10px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;text-transform:uppercase;letter-spacing:.18em}.eyebrow{color:#9fc2ca}.topbar h1{font-family:Georgia,"Times New Roman",serif;font-size:clamp(26px,3vw,43px);font-weight:400;line-height:1;margin:5px 0 6px;letter-spacing:-.035em}.subtitle{margin:0;color:var(--mist);font-size:13px}.admission-mark{display:flex;gap:10px;align-items:center;padding:9px 12px;border:1px solid rgba(95,184,157,.34);border-radius:99px;color:#9ed8c5;background:rgba(35,91,75,.16);font:600 10px/1 ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase}.admission-mark:before{content:"";width:7px;height:7px;border-radius:50%;background:#6cc9a9;box-shadow:0 0 16px #6cc9a9}
.workspace{display:grid;grid-template-columns:minmax(0,1fr) 286px;gap:18px;padding:16px 28px 12px;min-height:0}.stage{position:relative;min-width:0;border:1px solid var(--line);border-radius:22px;padding:18px;overflow:hidden;background:linear-gradient(180deg,rgba(14,28,42,.78),rgba(5,10,17,.86));box-shadow:0 24px 90px rgba(0,0,0,.42),inset 0 1px rgba(255,255,255,.04)}
.stage:before{content:"";position:absolute;left:5%;right:5%;bottom:-32%;height:72%;border-radius:50%;background:radial-gradient(ellipse at 50% 0,rgba(85,127,145,.18),rgba(8,18,28,.88) 58%,#03070c 70%);border-top:1px solid rgba(134,177,188,.18);transform:perspective(500px) rotateX(58deg)}
.loom{position:absolute;left:50%;top:47%;width:112px;height:112px;transform:translate(-50%,-50%) rotate(45deg);border:1px solid rgba(228,169,95,.36);background:radial-gradient(circle,rgba(255,213,151,.42),rgba(228,169,95,.11) 34%,transparent 68%);box-shadow:0 0 80px rgba(228,169,95,.24),inset 0 0 24px rgba(255,222,172,.2);z-index:0}.loom:after{content:"RECEIPT LOOM";position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-45deg);white-space:nowrap;color:#f2c789;font:600 8px/1 ui-monospace,monospace;letter-spacing:.22em}
.resident-grid{position:relative;z-index:1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:13px;height:100%}.resident{position:relative;min-height:302px;overflow:hidden;border:1px solid color-mix(in srgb,var(--accent) 32%,transparent);border-radius:16px;background:radial-gradient(circle at 50% 31%,color-mix(in srgb,var(--accent) 12%,transparent),transparent 42%),linear-gradient(180deg,rgba(11,23,35,.72),rgba(6,12,20,.9));box-shadow:inset 0 1px rgba(255,255,255,.035);display:grid;grid-template-rows:minmax(0,1fr) auto}
.resident:after{content:"";position:absolute;inset:auto 16% 64px;height:1px;background:linear-gradient(90deg,transparent,var(--accent),transparent);opacity:.42}.resident canvas{width:min(100%,256px);height:auto;max-height:220px;align-self:end;justify-self:center;image-rendering:auto;filter:drop-shadow(0 14px 14px rgba(0,0,0,.4));transition:opacity .2s}.resident-copy{display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:6px 15px 13px;background:linear-gradient(180deg,transparent,rgba(3,8,14,.82))}.family-kicker{grid-column:1/-1;color:color-mix(in srgb,var(--accent) 76%,white)}.resident h2{font-family:Georgia,"Times New Roman",serif;font-size:24px;font-weight:400;line-height:1;margin:3px 0 1px}.resident p{margin:0}.pattern{align-self:end;max-width:150px;color:#94acb4;font-size:10px;text-transform:capitalize;text-align:right}.cloth{grid-column:1/-1;color:#667f8a;font:500 9px/1.4 ui-monospace,monospace}.resident-index{position:absolute;left:12px;top:11px;color:color-mix(in srgb,var(--accent) 78%,white);z-index:2}.glyph{position:absolute;right:12px;top:11px;width:27px;height:24px;z-index:2}.glyph i{position:absolute;display:block;width:18px;height:7px;border:1px solid var(--accent);border-radius:50%;transform:rotate(-18deg)}.glyph i:nth-child(2){top:6px;right:0;transform:rotate(18deg)}.glyph i:nth-child(3){top:13px;left:2px}
.rail{display:flex;flex-direction:column;gap:12px}.panel{border:1px solid var(--line);border-radius:16px;padding:15px;background:rgba(8,17,27,.76);box-shadow:inset 0 1px rgba(255,255,255,.03)}.panel h3{margin:0 0 8px;font-family:Georgia,"Times New Roman",serif;font-size:19px;font-weight:400}.panel p{margin:0;color:#8fa8b2;font-size:12px;line-height:1.45}.status{display:grid;grid-template-columns:auto 1fr;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}.status-label{color:#5fc29f}.status-copy{font-size:10px;line-height:1.4;color:#b1c5ca}
.controls{display:grid;gap:8px}.control-group{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.control-title{margin:3px 0 0;color:#69838e;font:600 9px/1.2 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}.controls button{appearance:none;border:1px solid rgba(150,191,201,.19);border-radius:8px;background:rgba(11,25,37,.9);color:#91aab3;padding:8px 5px;font:600 9px/1 ui-monospace,monospace;cursor:pointer}.controls button[aria-pressed="true"]{border-color:rgba(228,169,95,.54);color:#f0c88d;background:rgba(118,77,30,.22);box-shadow:inset 0 0 16px rgba(228,169,95,.08)}#detach{width:100%;margin-top:2px}.source-hash{word-break:break-all;color:#557581!important;font:500 9px/1.45 ui-monospace,monospace!important}.boundary{margin-top:auto}.boundary strong{display:block;color:#c7d9dd;font-size:11px;margin-bottom:4px}.boundary ul{margin:0;padding-left:15px;color:#6f8993;font-size:10px;line-height:1.55}
.footer{display:grid;grid-template-columns:1fr auto;gap:20px;padding:10px 32px 13px;border-top:1px solid var(--line);color:#748d97;font-size:10px;line-height:1.4}.footer strong{color:#a8bdc3;font-weight:500}.proof{font:600 9px/1.4 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.11em;color:#8db4bd}
.fail-neutral .workspace{display:none}.fail-neutral .admission-mark{border-color:rgba(201,133,109,.35);color:#db9b82}.fail-neutral .admission-mark:before{background:#d98568;box-shadow:0 0 16px #d98568}.neutral-screen{display:none;min-height:70vh;place-items:center;padding:28px}.fail-neutral .neutral-screen{display:grid}.neutral-card{max-width:670px;padding:44px;border:1px solid rgba(147,180,190,.2);border-radius:24px;background:rgba(8,17,27,.8);text-align:center}.neutral-sigil{width:90px;height:90px;margin:0 auto 22px;border:1px solid #557f91;border-radius:50%;box-shadow:inset 0 0 32px rgba(85,127,145,.18)}.neutral-card h2{font:400 38px/1 Georgia,serif;margin:0 0 12px}.neutral-card p{color:#8da6af;line-height:1.6}
@media(max-width:900px){.topbar{padding:14px 16px 10px;grid-template-columns:1fr}.admission-mark{position:absolute;right:12px;top:12px;font-size:8px}.topbar h1{font-size:26px;max-width:260px}.subtitle{font-size:10px;max-width:300px}.workspace{display:block;padding:8px 8px 4px}.stage{height:545px;padding:8px;border-radius:14px}.resident-grid{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr));gap:6px}.resident{min-height:0;border-radius:11px}.resident canvas{width:110px;max-height:110px}.resident-copy{padding:1px 8px 6px;display:block}.family-kicker{font-size:7px}.resident h2{font-size:17px;margin:1px 0}.pattern{font-size:7px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cloth{font-size:7px}.resident-index{font-size:7px;left:7px;top:6px}.glyph{transform:scale(.6);transform-origin:top right;right:6px;top:6px}.loom{width:70px;height:70px}.rail{margin-top:6px}.rail .panel:first-child,.rail .panel:nth-child(3){display:none}.controls{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:7px}.control-group{gap:3px}.control-title{font-size:7px}.controls button{font-size:7px;padding:5px 2px}.controls #detach{grid-column:1/-1}.boundary{display:none}.footer{padding:6px 10px;font-size:8px;display:block}.proof{margin-top:2px}.footer .disclosure{display:block}.shell{grid-template-rows:auto auto auto}.neutral-screen{min-height:68vh}}
</style>
</head>
<body>
<div class="shell">
  <header class="topbar">
    <div>
      <div class="eyebrow">HoloLand · MV-V6 · Story gallery</div>
      <h1>Stormglass Commons</h1>
      <p class="subtitle">Six model-family mantles, authored in HoloScript and rendered on the browser’s native GPU.</p>
    </div>
    <div class="admission-mark">Source-bound admission</div>
  </header>
  <div class="neutral-screen">
    <div class="neutral-card">
      <div class="neutral-sigil" aria-hidden="true"></div>
      <h2 id="admission-title">Checking presentation admission</h2>
      <p id="admission-copy">Family identity remains neutral until the story presentation profile and exact source-bound admission verify.</p>
      <p><strong data-status-copy>Booting fail-neutral gate…</strong></p>
    </div>
  </div>
  <main class="workspace">
    <section class="stage" aria-label="Six admitted HoloScript family residents">
      <div class="loom" aria-label="Warm Receipt Loom focal light"></div>
      <div class="resident-grid">${familyCards()}</div>
    </section>
    <aside class="rail" aria-label="Presentation proof and controls">
      <section class="panel">
        <h3>Proof in the light</h3>
        <p>One shared faceless Stormglass body. Six detachable story mantles. Identity is carried by silhouette, weave, glyph, and caption—not color alone.</p>
        <div class="status"><span class="status-label">Verified</span><span class="status-copy" data-status-copy>Waiting for browser GPU…</span></div>
      </section>
      <section class="panel controls" aria-label="Accessibility and cloth replay controls">
        <div class="control-title">Perception</div>
        <div class="control-group">
          <button data-mode="color" aria-pressed="true">Color</button>
          <button data-mode="grayscale" aria-pressed="false">Gray</button>
          <button data-mode="deuteranopia" aria-pressed="false">Deuter</button>
        </div>
        <div class="control-title">Sealed XPBD phase</div>
        <div class="control-group">
          <button data-phase="0" aria-pressed="false">Rest</button>
          <button data-phase="0.6" aria-pressed="true">0.6 s</button>
          <button data-phase="1.2" aria-pressed="false">1.2 s</button>
        </div>
        <button id="detach" aria-pressed="false">Detach all mantles</button>
      </section>
      <section class="panel">
        <h3>HoloScript source</h3>
        <p>Browser-native WebGPU · 120 Hz XPBD sealed replay · zero external visual assets.</p>
        <p class="source-hash">${sourceSha256}</p>
      </section>
      <section class="panel boundary">
        <strong>Claim boundary</strong>
        <ul>
          <li>Story profile only</li>
          <li>No research-seat assignment</li>
          <li>No exact model revision claim</li>
          <li>No continuous browser cloth claim</li>
          <li>No photoreal or headset claim</li>
        </ul>
      </section>
    </aside>
  </main>
  <footer class="footer">
    <span class="disclosure"><strong>${DISCLOSURE}</strong></span>
    <span class="proof">Hearthlight Biorealism · physically grounded target</span>
  </footer>
</div>
<script>window.__MV_V6_PAYLOAD__=${safeInlineJson(payload)};window.__MV_V6_ADMISSION__=${safeInlineJson(admission)};window.__MV_V6_DISCLOSURE__=${JSON.stringify(DISCLOSURE)};</script>
<script>${rendererBundle}</script>
<script>${browserApplication()}</script>
</body>
</html>`;
}

function candidateBrowsers(explicitPath) {
  if (explicitPath) return [explicitPath];
  const localAppData = process.env.LOCALAPPDATA || '';
  const programFiles = process.env.PROGRAMFILES || '';
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] || '';
  return [
    path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    'chrome',
    'chrome.exe',
    'msedge',
    'msedge.exe',
  ].filter(Boolean);
}

function resolveBrowser(explicitPath) {
  const candidates = candidateBrowsers(explicitPath);
  for (const candidate of candidates) {
    if (candidate.includes(path.sep) || candidate.includes('/')) {
      if (fs.existsSync(candidate)) return candidate;
      continue;
    }
    const probe = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [candidate], {
      stdio: 'ignore',
      windowsHide: true,
    });
    if (probe.status === 0) return candidate;
  }
  throw new Error(`No Chrome/Edge executable found. Tried: ${candidates.join(', ')}`);
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchJson(url, timeoutMs = 2_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
    return await response.json();
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
  throw new Error(
    `Timed out waiting for browser debugger target: ${lastError?.message || 'none'}`
  );
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
      (event) => {
        clearTimeout(timeout);
        reject(new Error(`CDP socket error: ${event.message || 'unknown'}`));
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

async function waitForExpression(client, expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastValue = null;
  while (Date.now() < deadline) {
    lastValue = await evaluate(client, expression, 5_000).catch(() => null);
    if (lastValue) return lastValue;
    await delay(200);
  }
  throw new Error(
    `Timed out waiting for browser expression. Last value: ${JSON.stringify(lastValue)}`
  );
}

async function captureScreenshot(client, filePath, width, height) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
    screenWidth: width,
    screenHeight: height,
  });
  await delay(80);
  const screenshot = await client.send(
    'Page.captureScreenshot',
    {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    },
    30_000
  );
  const bytes = Buffer.from(screenshot.data, 'base64');
  fs.writeFileSync(filePath, bytes);
  return {
    path: path.relative(REPO_ROOT, filePath).replaceAll('\\', '/'),
    width,
    height,
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
}

async function runBrowserWitness({ browserPath, html, outputDir, admission }) {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url || '/');
    if (request.url?.startsWith('/index.html') || request.url === '/') {
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
  assert(address && typeof address === 'object', 'Loopback server did not bind');
  const baseUrl = `http://127.0.0.1:${address.port}/index.html`;
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hololand-mv-v6-'));
  const debuggerPort = 21_000 + Math.floor(Math.random() * 20_000);
  const launchFlags = [
    '--headless=new',
    '--use-angle=d3d11',
    '--ignore-gpu-blocklist',
    '--enable-gpu',
    '--enable-unsafe-webgpu',
    `--remote-debugging-port=${debuggerPort}`,
    `--user-data-dir=${profileDir}`,
    '--window-size=1600,900',
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
  const consoleMessages = [];
  const exceptions = [];
  const networkRequests = [];
  try {
    const target = await waitForDebuggerTarget(debuggerPort, 20_000);
    client = await createCdpClient(target.webSocketDebuggerUrl);
    client.onEvent((message) => {
      if (message.method === 'Runtime.consoleAPICalled') {
        consoleMessages.push({
          level: message.params.type,
          text: (message.params.args || [])
            .map((arg) => arg.value ?? arg.description ?? '')
            .join(' '),
        });
      } else if (message.method === 'Runtime.exceptionThrown') {
        exceptions.push({
          text: message.params.exceptionDetails?.text || '',
          description: message.params.exceptionDetails?.exception?.description || '',
        });
      } else if (message.method === 'Network.requestWillBeSent') {
        networkRequests.push({
          url: message.params.request?.url || '',
          type: message.params.type || '',
        });
      }
    });
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('Network.enable');
    const version = await client.send('Browser.getVersion');

    const neutralLoaded = waitForEvent(client, 'Page.loadEventFired', 60_000);
    await client.send('Page.navigate', { url: baseUrl });
    await neutralLoaded;
    await waitForExpression(client, 'window.__MV_V6__?.ready === true', 60_000);
    const missingAdmission = await evaluate(client, 'window.__MV_V6_SNAPSHOT__()');
    assert(missingAdmission.status === 'fail-neutral', 'Missing admission did not fail neutral');
    assert(missingAdmission.familyCount === 6, 'Neutral page source lost the family contract');
    const neutralCapture = await captureScreenshot(
      client,
      path.join(outputDir, 'mv-v6-fail-neutral.png'),
      1600,
      900
    );

    const deniedLoaded = waitForEvent(client, 'Page.loadEventFired', 60_000);
    await client.send('Page.navigate', {
      url: `${baseUrl}?profile=${DENIED_PROFILE}&admission=${admission.sha256}`,
    });
    await deniedLoaded;
    await waitForExpression(client, 'window.__MV_V6__?.ready === true', 60_000);
    const deniedResearch = await evaluate(client, 'window.__MV_V6_SNAPSHOT__()');
    assert(deniedResearch.status === 'fail-neutral', 'Research profile did not fail neutral');

    const admittedLoaded = waitForEvent(client, 'Page.loadEventFired', 120_000);
    await client.send('Page.navigate', {
      url: `${baseUrl}?profile=${PROFILE}&admission=${admission.sha256}`,
    });
    await admittedLoaded;
    await waitForExpression(
      client,
      'window.__MV_V6__?.ready === true && window.__MV_V6__?.status !== "rendering"',
      120_000
    );
    const boot = await evaluate(client, 'window.__MV_V6_SNAPSHOT__()');
    assert(boot.status === 'pass', `Admitted browser boot failed: ${boot.errors?.join(' ')}`);
    assert(boot.gpu?.navigatorGpu === true, 'Browser did not observe navigator.gpu');
    assert(boot.gpu?.adapterAcquired === true, 'Browser did not acquire a GPU adapter');
    assert(boot.gpu?.deviceCreated === true, 'Browser did not create a GPU device');
    assert(boot.gpu.verifiedDeviceMethods.length >= 5, 'GPUDevice methods are incomplete');
    assert(boot.familyCount === 6 && boot.canvasCount === 6, 'Six browser residents not mounted');
    assert(boot.documentScrollWidth <= boot.documentClientWidth, 'Desktop overflows horizontally');

    const captures = {};
    captures.hero = await captureScreenshot(
      client,
      path.join(outputDir, 'mv-v6-hero.png'),
      1600,
      900
    );
    captures.heroReplay = await captureScreenshot(
      client,
      path.join(outputDir, 'mv-v6-hero-replay.png'),
      1600,
      900
    );
    assert(captures.hero.sha256 === captures.heroReplay.sha256, 'Hero replay pixels drifted');

    await evaluate(client, 'window.__MV_V6_SET_MODE__("deuteranopia")', 120_000);
    captures.deuteranopia = await captureScreenshot(
      client,
      path.join(outputDir, 'mv-v6-deuteranopia.png'),
      1600,
      900
    );
    assert(
      captures.deuteranopia.sha256 !== captures.hero.sha256,
      'Deuteranopia mode did not change pixels'
    );

    await evaluate(client, 'window.__MV_V6_SET_MODE__("grayscale")', 120_000);
    captures.grayscale = await captureScreenshot(
      client,
      path.join(outputDir, 'mv-v6-grayscale.png'),
      1600,
      900
    );
    assert(captures.grayscale.sha256 !== captures.hero.sha256, 'Grayscale did not change pixels');

    await evaluate(client, 'window.__MV_V6_SET_MODE__("color")', 120_000);
    await evaluate(client, 'window.__MV_V6_SET_PHASE__(1.2)', 120_000);
    captures.phase = await captureScreenshot(
      client,
      path.join(outputDir, 'mv-v6-phase-1-2.png'),
      1600,
      900
    );
    assert(captures.phase.sha256 !== captures.hero.sha256, 'Cloth phase did not change pixels');

    await evaluate(client, 'window.__MV_V6_SET_DETACHED__(true)', 120_000);
    captures.detached = await captureScreenshot(
      client,
      path.join(outputDir, 'mv-v6-detached.png'),
      1600,
      900
    );
    assert(captures.detached.sha256 !== captures.phase.sha256, 'Detachment did not change pixels');

    await evaluate(client, 'window.__MV_V6_SET_DETACHED__(false)', 120_000);
    await evaluate(client, 'window.__MV_V6_SET_PHASE__(0.6)', 120_000);
    captures.portrait = await captureScreenshot(
      client,
      path.join(outputDir, 'mv-v6-portrait.png'),
      390,
      844
    );
    const portraitState = await evaluate(client, 'window.__MV_V6_SNAPSHOT__()');
    assert(
      portraitState.documentScrollWidth <= portraitState.documentClientWidth,
      'Portrait overflows horizontally'
    );
    const externalNetworkRequests = networkRequests.filter((request) => {
      try {
        const url = new URL(request.url);
        return (
          (url.protocol === 'http:' || url.protocol === 'https:') &&
          url.hostname !== '127.0.0.1' &&
          url.hostname !== 'localhost'
        );
      } catch {
        return false;
      }
    });
    assert(externalNetworkRequests.length === 0, 'Browser attempted external network requests');
    assert(exceptions.length === 0, `Browser exceptions: ${JSON.stringify(exceptions)}`);
    return {
      browserVersion: version,
      browserPath,
      launchFlags,
      secureContext: await evaluate(client, 'window.isSecureContext'),
      origin: `http://127.0.0.1:${address.port}`,
      missingAdmission,
      deniedResearch,
      admitted: boot,
      portraitState,
      captures,
      neutralCapture,
      consoleMessages,
      exceptions,
      serverRequests: requests,
      networkRequests,
      externalNetworkRequests,
    };
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    await delay(500);
    await new Promise((resolve) => server.close(resolve));
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        fs.rmSync(profileDir, { recursive: true, force: true });
        break;
      } catch {
        await delay(150 * (attempt + 1));
      }
    }
  }
}

function validateManifest(core, manifestText, expected) {
  const parsed = core.parseHolo(manifestText);
  assert(parsed.success && parsed.errors.length === 0, 'MV-V6 manifest did not parse');
  const metadata = parsed.ast.metadata ?? {};
  const state = objectProperties(parsed.ast.state);
  assert(
    metadata.schema === 'hololand.model-village.browser-studio-lineup-manifest.v1',
    'MV-V6 manifest schema drifted'
  );
  assert(metadata.sourceSha256 === expected.sourceSha256, 'Manifest source hash is stale');
  assert(metadata.catalogSha256 === expected.catalogSha256, 'Manifest catalog hash is stale');
  assert(equal(metadata.bundleSha256, expected.bundleSha256), 'Manifest bundle hashes are stale');
  assert(metadata.browserHtmlSha256 === expected.browserHtmlSha256, 'Manifest HTML hash is stale');
  assert(metadata.heroSha256 === expected.heroSha256, 'Manifest hero hash is stale');
  assert(metadata.portraitSha256 === expected.portraitSha256, 'Manifest portrait hash is stale');
  assert(
    metadata.deuteranopiaSha256 === expected.deuteranopiaSha256,
    'Manifest deuteranopia hash is stale'
  );
  assert(metadata.detachedSha256 === expected.detachedSha256, 'Manifest detached hash is stale');
  assert(metadata.admissionSha256 === expected.admissionSha256, 'Manifest admission hash is stale');
  assert(state.browserConsumerBuilt === true, 'Manifest does not close browser consumer');
  assert(state.browserNativeWebgpuObserved === true, 'Manifest lacks browser WebGPU proof');
  assert(state.sourceToBundleIntegrityObserved === true, 'Manifest lacks source/bundle integrity');
  assert(state.failNeutralAdmissionObserved === true, 'Manifest lacks fail-neutral evidence');
  assert(state.accessibilityModesObserved === 3, 'Manifest lacks accessibility evidence');
  assert(state.externalVisualAssetsObserved === 0, 'Manifest reports external visual assets');
  assert(state.completeMvP2Claimed === false, 'Manifest overclaims complete MV-P2');
  return { schema: metadata.schema, validated: true };
}

function copyArtifact(source, relativeTarget) {
  const target = path.join(REPO_ROOT, relativeTarget);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return {
    path: relativeTarget,
    sha256: sha256(fs.readFileSync(target)),
    bytes: fs.statSync(target).size,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  for (const relative of [
    'packages/core/dist/index.js',
    'packages/engine/dist/index.js',
    'node_modules/esbuild/lib/main.js',
  ]) {
    assert(
      fs.existsSync(path.join(args.holoscriptRoot, relative)),
      `Missing built HoloScript dependency: ${relative}`
    );
  }
  fs.mkdirSync(args.outputDir, { recursive: true });
  const guardedPaths = [
    'source/layers/vr/frontier/model-village/model-village.holo',
    'source/layers/vr/frontier/model-village/model-village-observer-projection.holo',
    PUBLIC_CATALOG_REL,
    CATALOG_REL,
  ].map((relative) => path.join(REPO_ROOT, relative));
  const guardedBefore = Object.fromEntries(
    guardedPaths.map((filePath) => [path.relative(REPO_ROOT, filePath), sha256(fs.readFileSync(filePath))])
  );

  const core = await import(
    pathToFileURL(path.join(args.holoscriptRoot, 'packages/core/dist/index.js')).href
  );
  const engine = await import(
    pathToFileURL(path.join(args.holoscriptRoot, 'packages/engine/dist/index.js')).href
  );
  const sourceText = fs.readFileSync(path.join(REPO_ROOT, SOURCE_REL), 'utf8');
  const catalogText = fs.readFileSync(path.join(REPO_ROOT, CATALOG_REL), 'utf8');
  const publicCatalogText = fs.readFileSync(path.join(REPO_ROOT, PUBLIC_CATALOG_REL), 'utf8');
  const sourceParsed = core.parseHolo(sourceText);
  const catalogParsed = core.parseHolo(catalogText);
  const publicCatalogParsed = core.parseHolo(publicCatalogText);
  assert(sourceParsed.success && sourceParsed.errors.length === 0, 'MV-V6 source did not parse');
  assert(catalogParsed.success && catalogParsed.errors.length === 0, 'MV-V5 catalog did not parse');
  assert(
    publicCatalogParsed.success && publicCatalogParsed.errors.length === 0,
    'Public catalog did not parse'
  );
  const policy = validateBrowserStudioLineupSource(sourceParsed.ast);
  const catalogPolicy = validateFamilyMantleCatalogSource(
    catalogParsed.ast,
    publicCatalogParsed.ast
  );

  const bundleHashes = [];
  for (const family of FAMILY_MANTLES) {
    const compile = async () =>
      new core.ExportManager({
        useCircuitBreaker: false,
        useFallback: false,
        useMemoryMonitoring: false,
      }).export('character-webgpu', catalogParsed.ast, {
        compilerOptions: {
          objectId: family.name,
          entityId: `model-village-${family.slug}-story-resident`,
          lodLevel: 0,
        },
      });
    const first = await compile();
    const second = await compile();
    assert(first.success && second.success, `${family.name} compile failed`);
    assert(!first.usedFallback && !second.usedFallback, `${family.name} used fallback`);
    assert(first.output === second.output, `${family.name} compile replay drifted`);
    const builtBytes = Buffer.from(first.output, 'utf8');
    const committedBytes = fs.readFileSync(path.join(REPO_ROOT, bundleRel(family)));
    assert(
      sha256(builtBytes) === sha256(committedBytes),
      `${family.name} source-to-bundle integrity failed`
    );
    bundleHashes.push(sha256(builtBytes));
  }

  const admission = buildBrowserStudioAdmission({
    sourceSha256: sha256(sourceText),
    catalogSha256: sha256(catalogText),
    bundleSha256: bundleHashes,
  });
  const replayStarted = performance.now();
  const payload = buildReplayPayload(engine, catalogParsed.ast);
  const replayBuildMs = performance.now() - replayStarted;
  assert(payload.families.length === 6, 'Replay payload lost residents');
  assert(
    payload.families.every((family) => family.phases.length === PHASES.length),
    'Replay payload lost phases'
  );
  assert(
    new Set(
      payload.families.flatMap((family) =>
        family.phases.map((phase) => phase.cloth.positionDigest)
      )
    ).size >= 12,
    'Cloth replay payload collapsed'
  );
  const rendererBundle = await bundleBrowserRenderer(args.holoscriptRoot);
  const html = buildHtml({
    payload,
    admission,
    rendererBundle,
    sourceSha256: sha256(sourceText),
  });
  const htmlPath = path.join(args.outputDir, 'model-village-browser-studio-lineup.html');
  fs.writeFileSync(htmlPath, html);
  const browser = args.skipBrowser
    ? null
    : await runBrowserWitness({
        browserPath: resolveBrowser(args.browser),
        html,
        outputDir: args.outputDir,
        admission,
      });
  if (browser) {
    assert(browser.secureContext === true, 'Loopback browser origin was not a secure context');
  }

  let durable = null;
  if (args.writeArtifacts) {
    assert(browser, '--write-artifacts requires the browser witness');
    durable = {
      hero: copyArtifact(browser.captures.hero.path.startsWith('.tmp')
        ? path.join(REPO_ROOT, browser.captures.hero.path)
        : path.join(args.outputDir, 'mv-v6-hero.png'), HERO_REL),
      portrait: copyArtifact(path.join(args.outputDir, 'mv-v6-portrait.png'), PORTRAIT_REL),
      deuteranopia: copyArtifact(
        path.join(args.outputDir, 'mv-v6-deuteranopia.png'),
        ACCESSIBILITY_REL
      ),
      detached: copyArtifact(path.join(args.outputDir, 'mv-v6-detached.png'), DETACHED_REL),
    };
  } else if (browser) {
    for (const relative of [HERO_REL, PORTRAIT_REL, ACCESSIBILITY_REL, DETACHED_REL]) {
      assert(fs.existsSync(path.join(REPO_ROOT, relative)), `Missing durable screenshot ${relative}`);
    }
    durable = {
      hero: { path: HERO_REL, sha256: sha256(fs.readFileSync(path.join(REPO_ROOT, HERO_REL))) },
      portrait: {
        path: PORTRAIT_REL,
        sha256: sha256(fs.readFileSync(path.join(REPO_ROOT, PORTRAIT_REL))),
      },
      deuteranopia: {
        path: ACCESSIBILITY_REL,
        sha256: sha256(fs.readFileSync(path.join(REPO_ROOT, ACCESSIBILITY_REL))),
      },
      detached: {
        path: DETACHED_REL,
        sha256: sha256(fs.readFileSync(path.join(REPO_ROOT, DETACHED_REL))),
      },
    };
    assert(durable.hero.sha256 === browser.captures.hero.sha256, 'Durable hero is stale');
    assert(durable.portrait.sha256 === browser.captures.portrait.sha256, 'Durable portrait is stale');
    assert(
      durable.deuteranopia.sha256 === browser.captures.deuteranopia.sha256,
      'Durable accessibility image is stale'
    );
    assert(durable.detached.sha256 === browser.captures.detached.sha256, 'Detached image is stale');
  }

  const expected = browser
    ? {
        sourceSha256: sha256(sourceText),
        catalogSha256: sha256(catalogText),
        bundleSha256: bundleHashes,
        browserHtmlSha256: sha256(html),
        heroSha256: browser.captures.hero.sha256,
        portraitSha256: browser.captures.portrait.sha256,
        deuteranopiaSha256: browser.captures.deuteranopia.sha256,
        detachedSha256: browser.captures.detached.sha256,
        admissionSha256: admission.sha256,
      }
    : null;
  const manifest =
    args.skipManifest || !browser
      ? { validated: false, reason: args.skipManifest ? 'bootstrap_skip_requested' : 'browser_skipped' }
      : validateManifest(
          core,
          fs.readFileSync(path.join(REPO_ROOT, MANIFEST_REL), 'utf8'),
          expected
        );
  const guardedAfter = Object.fromEntries(
    guardedPaths.map((filePath) => [path.relative(REPO_ROOT, filePath), sha256(fs.readFileSync(filePath))])
  );
  assert(equal(guardedBefore, guardedAfter), 'MV-V6 witness mutated canonical or blinded source');

  const receipt = {
    schema: 'hololand.model-village.browser-studio-lineup-witness.v1',
    generatedAt: new Date().toISOString(),
    milestone: 'MV-V6 Admitted Browser and Studio Six-Family Lineup',
    status: 'PASS',
    source: {
      path: SOURCE_REL,
      sha256: sha256(sourceText),
      parseErrors: sourceParsed.errors.length,
      presentationProfile: policy.metadata.presentationProfile,
      independentProjectDisclosure: DISCLOSURE,
      researchLiveBlindedAllowed: false,
      canonicalWriteAuthority: false,
      residentObservationWriteAuthority: false,
      causalEffect: false,
    },
    catalog: {
      path: CATALOG_REL,
      sha256: sha256(catalogText),
      familyCount: catalogPolicy.families.length,
      compileTarget: 'character-webgpu',
      repeatedCompileByteIdentical: true,
      fallbackUsed: false,
      bundleSha256: bundleHashes,
      sourceToBundleIntegrityObserved: true,
    },
    admission: {
      ...admission,
      missingAdmissionFailsNeutral: browser?.missingAdmission.status === 'fail-neutral',
      researchLiveBlindedFailsNeutral: browser?.deniedResearch.status === 'fail-neutral',
    },
    physics: {
      solver: 'xpbd',
      fixedStepHz: 120,
      iterations: 5,
      phaseSeconds: PHASES,
      replayBuildMs: Math.round(replayBuildMs * 100) / 100,
      positionDigests: Object.fromEntries(
        payload.families.map((family) => [
          family.name,
          family.phases.map((phase) => phase.cloth.positionDigest),
        ])
      ),
      maxDisplacementMeters: Object.fromEntries(
        payload.families.map((family) => [
          family.name,
          family.phases.map((phase) => phase.cloth.maxDisplacement),
        ])
      ),
      sealedPhaseReplay: true,
      continuousBrowserSolverClaimed: false,
      writesBackToExperiment: false,
    },
    browser: browser
      ? {
          browserConsumerBuilt: true,
          nativeWebgpuObserved: true,
          secureContext: browser.secureContext,
          browserVersion: browser.browserVersion,
          executable: browser.browserPath,
          launchFlags: browser.launchFlags,
          gpu: browser.admitted.gpu,
          metrics: browser.admitted.metrics,
          renderer: browser.admitted.renderer,
          backend: browser.admitted.backend,
          captures: browser.captures,
          heroReplayExact: true,
          externalNetworkFetchCount: browser.externalNetworkRequests.length,
          externalVisualAssets: 0,
          exceptions: browser.exceptions,
          portraitHorizontalOverflow: false,
          desktopHorizontalOverflow: false,
        }
      : {
          browserConsumerBuilt: false,
          nativeWebgpuObserved: false,
          reason: 'browser_skipped',
        },
    accessibility: browser
      ? {
          modes: ['color', 'grayscale', 'deuteranopia'],
          modesObserved: 3,
          deuteranopiaChangesPixels: true,
          grayscaleChangesPixels: true,
          redundantIdentityChannels: ['silhouette', 'pattern', 'glyph', 'caption'],
          mantleDetachmentObserved: true,
          audioDescriptionTextPresent: true,
          disclosureAlwaysVisible: true,
        }
      : { modesObserved: 0, reason: 'browser_skipped' },
    durable,
    browserHtml: {
      path: path.relative(REPO_ROOT, htmlPath).replaceAll('\\', '/'),
      sha256: sha256(html),
      bytes: Buffer.byteLength(html),
      selfContained: true,
      rendererBundleSha256: sha256(rendererBundle),
      rendererBundleBytes: Buffer.byteLength(rendererBundle),
    },
    researchIntegrity: {
      researchLiveBlindedAllowed: false,
      staticResearchJoin: false,
      storyGalleryOrderDefinesResearchSeat: false,
      researchBindingFields: Object.fromEntries(
        RESEARCH_BINDING_FIELDS.map((field) => [field, 'none'])
      ),
      guardedSourceHashesUnchanged: guardedAfter,
    },
    manifest,
    claimBoundary: {
      proved:
        'An exact source-bound public story profile admits a self-contained HoloLand browser surface that acquires navigator.gpu, a GPUAdapter, and GPUDevice, then renders six HoloScript character draw specs with three sealed deterministic XPBD cloth phases, detachment, and color-accessibility views.',
      notProved: [
        'permission to reveal family identity during live blinded research',
        'provider affiliation or endorsement',
        'exact provider model revisions or static provider-to-seat assignments',
        'continuous browser cloth solving',
        'production tailoring, self-collision, or body collision',
        'photorealism or physically accurate cloth',
        'published real-time performance or long-duration thermal behavior',
        'WebXR or headset performance',
        'complete MV-P2 production readiness',
      ],
    },
  };
  fs.writeFileSync(
    path.join(args.outputDir, 'browser-studio-lineup-witness.json'),
    `${JSON.stringify(receipt, null, 2)}\n`
  );
  if (args.json) console.log(JSON.stringify(receipt, null, 2));
  else {
    console.log(
      `PASS MV-V6 browser lineup: ${payload.families.length} residents, ` +
        `${browser ? 'native browser WebGPU observed' : 'browser skipped'}, ` +
        `${browser?.externalNetworkRequests.length ?? 0} external fetches`
    );
    console.log(
      `Receipt: ${path.join(args.outputDir, 'browser-studio-lineup-witness.json')}`
    );
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`FAIL MV-V6 browser lineup: ${error.stack || error.message}`);
      process.exit(1);
    });
}
