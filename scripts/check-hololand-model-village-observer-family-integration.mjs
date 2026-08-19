#!/usr/bin/env node

import { Buffer } from 'node:buffer';
import console from 'node:console';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  objectProperties,
  sha256,
} from './check-hololand-model-village-resident-rig.mjs';
import {
  runModelVillageArtDirectionCheck,
  verifyModelVillageArtDirectionReceipt,
} from './check-hololand-model-village-art-direction.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const INTEGRATION_REL =
  'source/layers/vr/frontier/model-village/model-village-observer-family-integration.holo';
const PLACEMENT_REL =
  'source/layers/vr/frontier/model-village/model-village-observer-family-placement-manifest.holo';
const OBSERVER_REL =
  'source/layers/vr/frontier/model-village/model-village-observer-projection.holo';
const LINEUP_REL =
  'source/layers/vr/frontier/model-village/model-village-browser-studio-lineup.holo';
const LINEUP_MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-browser-studio-lineup-manifest.holo';
const APPEARANCE_REL = 'source/proofs/model-village-appearance-invariance.hs';
const WORLD_REL = 'source/layers/vr/frontier/model-village/model-village.holo';
const PUBLIC_PROFILE = 'village_story_unblinded';
const POSTLOCK_PROFILE = 'research_replay_postlock';
const DENIED_PROFILE = 'research_live_blinded';
const DISCLOSURE =
  'HoloLand-authored visual interpretation; not affiliated with or endorsed by the named providers.';
const DEFAULT_OUTPUT_REL =
  '.tmp/hololand/model-village/observer-family-integration';
const HERO_REL =
  'docs/assets/model-village/model-village-six-family-observer-integration-hero-2026-07-26.png';
const PORTRAIT_REL =
  'docs/assets/model-village/model-village-six-family-observer-integration-portrait-2026-07-26.png';
const DEUTERANOPIA_REL =
  'docs/assets/model-village/model-village-six-family-observer-integration-deuteranopia-2026-07-26.png';
const PROTECTED_CANONICAL_FIELDS = Object.freeze([
  'canonicalSceneHash',
  'canonicalPoseHash',
  'logicalClockHash',
  'publicStateHash',
  'executedScheduleHash',
  'residentObservationHash',
  'actionReceiptRoot',
]);
const FORBIDDEN_PLACEMENT_FIELDS = Object.freeze([
  'residentId',
  'seatId',
  'personaId',
  'villageRole',
  'roleId',
  'adapterId',
  'agentSurfaceId',
  'exactModelRevision',
  'researchResidentBinding',
  'researchSeatBinding',
  'researchPersonaBinding',
  'researchRoleBinding',
  'adapterAssignmentBinding',
]);
const EXPECTED_FAMILIES = Object.freeze([
  {
    familyId: 'anthropic',
    slug: 'claude',
    publicDisplayName: 'Claude',
    patternId: 'quiet_nested_open_arcs',
  },
  {
    familyId: 'openai',
    slug: 'openai',
    publicDisplayName: 'OpenAI',
    patternId: 'recursive_cell_interlock',
  },
  {
    familyId: 'google',
    slug: 'gemini',
    publicDisplayName: 'Gemini',
    patternId: 'paired_offset_prismatic_panels',
  },
  {
    familyId: 'xai',
    slug: 'grok',
    publicDisplayName: 'Grok',
    patternId: 'off_axis_signal_bands',
  },
  {
    familyId: 'ollama',
    slug: 'glm',
    publicDisplayName: 'GLM',
    patternId: 'modular_phase_lattice',
  },
  {
    familyId: 'sovereign',
    slug: 'brittney',
    publicDisplayName: 'Brittney',
    patternId: 'sovereign_locality_mesh',
  },
]);

function parseArgs(argv) {
  const args = {
    browser: null,
    holoscriptRoot:
      process.env.HOLOSCRIPT_ROOT ?? 'C:/Users/josep/Documents/GitHub/HoloScript',
    outputDir: path.join(REPO_ROOT, DEFAULT_OUTPUT_REL),
    reuseBaseRendering: false,
    skipBrowser: false,
    skipManifest: false,
    writeArtifacts: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--browser') args.browser = path.resolve(argv[++index]);
    else if (arg === '--holoscript-root') {
      args.holoscriptRoot = path.resolve(argv[++index]);
    } else if (arg === '--output-dir') {
      args.outputDir = path.resolve(argv[++index]);
    } else if (arg === '--reuse-base-rendering') args.reuseBaseRendering = true;
    else if (arg === '--skip-browser') args.skipBrowser = true;
    else if (arg === '--skip-manifest') args.skipManifest = true;
    else if (arg === '--write-artifacts') args.writeArtifacts = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/check-hololand-model-village-observer-family-integration.mjs [options]

Options:
  --holoscript-root <path>   Built HoloScript checkout
  --browser <path>           Chrome or Edge executable
  --output-dir <path>        Runtime HTML, screenshots, and receipt directory
  --reuse-base-rendering     Reuse an already-passing observer rendering receipt
  --skip-browser             Validate sources, placement, admissions, and base receipts only
  --skip-manifest            Bootstrap before immutable MV-V7 anchors exist
  --write-artifacts          Refresh the three durable browser screenshots
  --json                     Emit the complete receipt`);
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

function equal(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function hashFile(relativePath) {
  return sha256(fs.readFileSync(path.join(REPO_ROOT, relativePath)));
}

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function safeInlineJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
}

function sha256Map(relativePaths) {
  return Object.fromEntries(relativePaths.map((relativePath) => [
    relativePath,
    hashFile(relativePath),
  ]));
}

function placementProjection(object) {
  const properties = objectProperties(object);
  return {
    familyId: properties.familyId,
    slug: properties.slug,
    publicDisplayName: properties.publicDisplayName,
    patternId: properties.patternId,
    storyPlacementId: properties.storyPlacementId,
    worldAnchor: properties.worldAnchor,
    desktop: properties.desktop,
    portrait: properties.portrait,
    depthBand: properties.depthBand,
    labelAlign: properties.labelAlign,
    researchBinding: properties.researchBinding,
  };
}

export function validateObserverFamilyIntegrationSource(ast) {
  const metadata = ast.metadata ?? {};
  const state = objectProperties(ast.state);
  assert(
    metadata.schema === 'hololand.model-village.observer-family-integration.v1',
    'MV-V7 integration schema drifted'
  );
  assert(metadata.milestone === 'MV-V7', 'MV-V7 milestone is missing');
  assert(metadata.worldName === 'Stormglass Commons', 'World identity drifted');
  assert(metadata.artStyle === 'hearthlight_biorealism', 'Art style drifted');
  assert(metadata.independentProjectDisclosure === DISCLOSURE, 'Disclosure drifted');
  assert(metadata.canonicalWriteAuthority === false, 'Canonical writes were enabled');
  assert(
    metadata.residentObservationWriteAuthority === false,
    'Resident observation writes were enabled'
  );
  assert(metadata.causalEffect === false, 'Integration gained causal authority');
  assert(state.defaultPresentationProfile === DENIED_PROFILE, 'Neutral default drifted');
  assert(
    equal(state.admittedPresentationProfiles, [PUBLIC_PROFILE, POSTLOCK_PROFILE]),
    'Admitted presentation profiles drifted'
  );
  assert(equal(state.deniedPresentationProfiles, [DENIED_PROFILE]), 'Research denial drifted');
  assert(state.namedFamilyCount === 6, 'MV-V7 must present six public families');
  assert(state.placementKey === 'family_id', 'Placement must be keyed by family_id');
  for (const field of [
    'placementUsesCatalogArrayOrder',
    'placementUsesResearchResident',
    'placementUsesResearchSeat',
    'placementUsesResearchPersona',
    'placementUsesVillageRole',
    'placementUsesAdapterAssignment',
    'placementUsesExactModelRevision',
    'postlockResearchJoinExecuted',
    'canonicalWriteAuthority',
    'residentObservationWriteAuthority',
    'scheduleWriteAuthority',
    'clockWriteAuthority',
    'actionWriteAuthority',
    'receiptWriteAuthority',
    'causalEffect',
    'worldAmbienceCausalEffect',
    'continuousBrowserClothSolverClaimed',
    'realTimeClaimed',
    'photorealismClaimed',
    'productionTailoringClaimed',
    'completeMvP2Claimed',
  ]) {
    assert(state[field] === false, `${field} must remain false`);
  }
  for (const field of [
    'researchResidentBinding',
    'researchSeatBinding',
    'researchPersonaBinding',
    'researchRoleBinding',
    'adapterAssignmentBinding',
    'exactModelRevisionBinding',
  ]) {
    assert(state[field] === 'none', `${field} must remain none`);
  }
  assert(state.missingAdmissionBehavior === 'fail_neutral', 'Missing admission must fail neutral');
  assert(state.invalidAdmissionBehavior === 'fail_neutral', 'Bad admission must fail neutral');
  assert(
    state.researchProfileBehavior === 'preserve_neutral_observer',
    'Research profile must preserve the neutral observer'
  );
  assert(state.readOnlyObserver === true, 'Integration is not a read-only observer');
  assert(state.browserNativeWebgpuRequired === true, 'Browser WebGPU is not required');
  assert(state.observerWebgl2Required === true, 'Observer WebGL2 is not required');
  assert(state.externalVisualAssets === false, 'External visual assets were enabled');
  assert(
    equal(state.supportedAccessibilityModes, ['color', 'grayscale', 'deuteranopia']),
    'Accessibility modes drifted'
  );
  assert(equal(state.sealedPhysicsPhaseSeconds, [0, 0.6, 1.2]), 'Physics phases drifted');
  const objects = Object.fromEntries((ast.objects ?? []).map((object) => [object.name, object]));
  for (const name of [
    'ObserverIntegrationAdmissionGate',
    'VerifiedPlacementConsumer',
    'DualRendererWitness',
    'SealedPhysicsPresentation',
    'ObserverAccessibilityDeck',
    'NoFeedbackBoundary',
    'ClaimBoundary',
  ]) {
    assert(objects[name], `MV-V7 object ${name} is missing`);
  }
  const gate = objectProperties(objects.ObserverIntegrationAdmissionGate);
  assert(
    equal(gate.admittedProfiles, [PUBLIC_PROFILE, POSTLOCK_PROFILE]),
    'Admission gate profile list drifted'
  );
  assert(gate.deniedProfile === DENIED_PROFILE, 'Admission gate research denial drifted');
  assert(gate.failNeutral === true, 'Admission gate must fail neutral');
  assert(gate.mayWriteCanonicalWorld === false, 'Admission gate gained world writes');
  assert(
    gate.mayWriteResidentObservation === false,
    'Admission gate gained observation writes'
  );
  const renderer = objectProperties(objects.DualRendererWitness);
  assert(renderer.navigatorGpuRequired === true, 'navigator.gpu is not required');
  assert(renderer.gpuAdapterRequired === true, 'GPUAdapter is not required');
  assert(renderer.gpuDeviceRequired === true, 'GPUDevice is not required');
  assert(
    renderer.threeJsUsedForCharacterRendering === false,
    'Character renderer gained a Three.js path'
  );
  const noFeedback = objectProperties(objects.NoFeedbackBoundary);
  for (const [key, value] of Object.entries(noFeedback)) {
    if (key.startsWith('browserMayWrite') || key.endsWith('CanAffectOutcome')) {
      assert(value === false, `${key} must remain false`);
    }
  }
  return { metadata, state, objects };
}

export function validatePlacementManifestSource(ast, { requireAnchors = true } = {}) {
  const metadata = ast.metadata ?? {};
  const state = objectProperties(ast.state);
  assert(
    metadata.schema === 'hololand.model-village.observer-family-placement-manifest.v1',
    'MV-V7 placement manifest schema drifted'
  );
  assert(metadata.milestone === 'MV-V7', 'MV-V7 placement milestone is missing');
  assert(metadata.independentProjectDisclosure === DISCLOSURE, 'Manifest disclosure drifted');
  assert(state.placementCount === 6, 'Placement manifest must contain six placements');
  assert(state.placementKey === 'family_id', 'Placement manifest key drifted');
  assert(state.placementUsesCatalogArrayOrder === false, 'Catalog order became placement authority');
  assert(state.staticResearchJoin === false, 'Placement manifest gained a research join');
  assert(state.researchLiveBlindedAllowed === false, 'Live research family reveal was enabled');
  assert(state.canonicalWriteAuthority === false, 'Placement manifest gained world writes');
  assert(
    state.residentObservationWriteAuthority === false,
    'Placement manifest gained observation writes'
  );
  assert(state.causalEffect === false, 'Placement manifest gained causal authority');
  assert(state.completeMvP2Claimed === false, 'Placement manifest overclaims MV-P2');
  const placements = (ast.objects ?? []).map(placementProjection);
  assert(placements.length === 6, 'Placement object count drifted');
  const byFamily = new Map(placements.map((placement) => [placement.familyId, placement]));
  assert(byFamily.size === 6, 'Placement family IDs are not unique');
  for (const expected of EXPECTED_FAMILIES) {
    const observed = byFamily.get(expected.familyId);
    assert(observed, `Missing ${expected.familyId} placement`);
    for (const field of ['slug', 'publicDisplayName', 'patternId']) {
      assert(observed[field] === expected[field], `${expected.familyId}.${field} drifted`);
    }
    assert(observed.researchBinding === 'none', `${expected.familyId} gained a research binding`);
    assert(
      Array.isArray(observed.worldAnchor) && observed.worldAnchor.length === 3,
      `${expected.familyId} world anchor is invalid`
    );
    for (const profile of ['desktop', 'portrait']) {
      const value = observed[profile];
      assert(
        Array.isArray(value)
          && value.length === 3
          && value.every((entry) => typeof entry === 'number'),
        `${expected.familyId} ${profile} placement is invalid`
      );
      assert(value[0] > 0 && value[0] < 100, `${expected.familyId} ${profile} x is invalid`);
      assert(value[1] > 0 && value[1] < 100, `${expected.familyId} ${profile} y is invalid`);
      assert(value[2] > 0 && value[2] <= 1.2, `${expected.familyId} ${profile} scale is invalid`);
    }
  }
  for (const object of ast.objects ?? []) {
    const properties = objectProperties(object);
    for (const field of FORBIDDEN_PLACEMENT_FIELDS) {
      assert(!Object.hasOwn(properties, field), `${object.name} contains forbidden ${field}`);
    }
  }
  const canonicalPlacements = [...placements].sort((left, right) =>
    left.familyId.localeCompare(right.familyId)
  );
  const placementContractSha256 = sha256(canonicalJson(canonicalPlacements));
  if (requireAnchors) {
    assert(
      metadata.placementContractSha256 === placementContractSha256,
      'Placement contract hash is stale'
    );
  }
  return { metadata, state, placements: canonicalPlacements, placementContractSha256 };
}

export function buildObserverIntegrationAdmission({
  integrationSourceSha256,
  lineupManifestSourceSha256,
  lineupSourceSha256,
  observerCanonicalFieldsSha256,
  observerProjectionSourceSha256,
  placementContractSha256,
  presentationProfile,
}) {
  assert(
    [PUBLIC_PROFILE, POSTLOCK_PROFILE].includes(presentationProfile),
    `Unsupported integration presentation profile ${presentationProfile}`
  );
  const canonical = {
    schema: 'hololand.model-village.observer-family-integration-admission.v1',
    presentationProfile,
    integrationSourceSha256,
    placementContractSha256,
    observerProjectionSourceSha256,
    browserStudioLineupSourceSha256: lineupSourceSha256,
    browserStudioLineupManifestSourceSha256: lineupManifestSourceSha256,
    observerCanonicalFieldsSha256,
    independentProjectDisclosure: DISCLOSURE,
    placementKey: 'family_id',
    researchResidentBinding: 'none',
    researchSeatBinding: 'none',
    postlockResearchJoinExecuted: false,
    canonicalWriteAuthority: false,
    residentObservationWriteAuthority: false,
  };
  return {
    canonical,
    canonicalJson: canonicalJson(canonical),
    sha256: sha256(canonicalJson(canonical)),
  };
}

function runChild(command, args, { cwd = REPO_ROOT, timeoutMs = 300_000 } = {}) {
  const child = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs,
    windowsHide: true,
  });
  if (child.status !== 0) {
    const output = `${child.stdout || ''}\n${child.stderr || ''}`.trim();
    throw new Error(
      `${path.basename(command)} ${args[0] || ''} failed (${child.status}):\n`
      + output.slice(-12_000)
    );
  }
  return child;
}

function runMvV6Build(outputDir, holoscriptRoot) {
  fs.mkdirSync(outputDir, { recursive: true });
  runChild(process.execPath, [
    'scripts/check-hololand-model-village-browser-studio-lineup.mjs',
    '--holoscript-root',
    holoscriptRoot,
    '--output-dir',
    outputDir,
    '--skip-browser',
    '--skip-manifest',
  ]);
  const witnessPath = path.join(outputDir, 'browser-studio-lineup-witness.json');
  const htmlPath = path.join(outputDir, 'model-village-browser-studio-lineup.html');
  assert(fs.existsSync(witnessPath), 'MV-V6 build did not emit a witness');
  assert(fs.existsSync(htmlPath), 'MV-V6 build did not emit browser HTML');
  const witness = JSON.parse(fs.readFileSync(witnessPath, 'utf8'));
  assert(witness.status === 'PASS', 'MV-V6 source/bundle build did not pass');
  return { witness, htmlPath };
}

function runObserverRendering(outputDir, args) {
  fs.mkdirSync(outputDir, { recursive: true });
  const receiptPath = path.join(outputDir, 'rendering-witness.json');
  if (!args.reuseBaseRendering || !fs.existsSync(receiptPath)) {
    runChild(process.execPath, [
      'scripts/hololand-model-village-rendering-truth-gate.mjs',
      '--root',
      REPO_ROOT,
      '--holoscript-root',
      args.holoscriptRoot,
      '--output-dir',
      outputDir,
      '--timeout-ms',
      '120000',
      ...(args.browser ? ['--browser', args.browser] : []),
    ], { timeoutMs: 600_000 });
  }
  const htmlPath = path.join(outputDir, 'model-village-render-witness.html');
  const bundlePath = path.join(outputDir, 'model-village-render-bundle.js');
  assert(fs.existsSync(receiptPath), 'Observer rendering receipt is missing');
  assert(fs.existsSync(htmlPath), 'Observer browser HTML is missing');
  assert(fs.existsSync(bundlePath), 'Observer browser bundle is missing');
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert(receipt.status === 'pass', 'Observer rendering truth gate did not pass');
  assert(
    receipt.observerBoundary?.isolatedProjectionToggleExecuted === true,
    'Observer consumer toggle was not executed'
  );
  assert(
    receipt.observerBoundary?.canonicalAuthoritativeMutationDelta === 0,
    'Observer rendering mutated authoritative state'
  );
  assert(
    new Set(Object.values(receipt.observerBoundary.authoritativeHashes ?? {})).size === 1,
    'Observer authoritative hashes differ'
  );
  assert(
    receipt.observerBoundary?.on?.browserObserved?.comparison?.sevenFieldsEqual === true,
    'Observer seven-field comparison failed'
  );
  assert(
    receipt.assertions?.actualWebgl2Context === true,
    'Observer did not create a WebGL2 context'
  );
  assert(
    receipt.assertions?.noKnownSoftwareFallback === true,
    'Observer rendering used a known software fallback'
  );
  assert(
    receipt.assertions?.noExternalNetworkAssetsFetched === true,
    'Observer fetched external visual assets'
  );
  return { receipt, htmlPath, bundlePath };
}

function researchAppearanceHash(receipt) {
  assert(verifyModelVillageArtDirectionReceipt(receipt), 'Art-direction receipt hash is invalid');
  assert(receipt.status === 'pass', 'Art-direction check failed');
  const projection = receipt.residents
    .map((resident) => ({
      residentId: resident.residentId,
      researchAppearanceDigest: resident.researchAppearanceDigest,
    }))
    .sort((left, right) => left.residentId.localeCompare(right.residentId));
  assert(projection.length === 6, 'Research appearance projection lost residents');
  return {
    projection,
    sha256: sha256(canonicalJson(projection)),
  };
}

function browserApplication(data) {
  const $ = (selector) => document.querySelector(selector);
  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const state = {
    schema: 'hololand.model-village.observer-family-integration-browser.v1',
    ready: false,
    status: 'booting',
    admitted: false,
    profile: null,
    familyCount: 0,
    mode: 'color',
    phase: 0.6,
    observer: null,
    lineup: null,
    canonicalFieldsBefore: data.observerCanonicalFields,
    canonicalFieldsAfter: null,
    errors: [],
  };
  window.__MV_V7__ = state;

  const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const waitFor = async (predicate, label, timeoutMs = 120000) => {
    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline) {
      const value = predicate();
      if (value) return value;
      await sleep(50);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };
  const admissionForProfile = (profile) =>
    data.admissions.find((candidate) => candidate.canonical.presentationProfile === profile);

  function applyObserverPresentation(observerDocument) {
    const title = observerDocument.querySelector('#view-title');
    const subtitle = observerDocument.querySelector('#view-subtitle');
    if (title) title.textContent = 'The Six at Stormglass';
    if (subtitle) {
      subtitle.textContent =
        'Six public family mantles inhabit one verified, read-only village replay. The village cannot hear the presentation.';
    }
    const style = observerDocument.createElement('style');
    style.textContent = `
      .evidence-card{display:none!important}
      .masthead{max-width:720px!important}
      .footer{bottom:19px!important}
      @media(max-width:600px){
        .masthead{top:18px!important;left:18px!important;right:12px!important}
        .masthead h1{font-size:37px!important;max-width:270px!important}
        .masthead p{font-size:10px!important;max-width:330px!important}
        .footer{display:none!important}
      }
    `;
    observerDocument.head.append(style);
  }

  function makeGlyph() {
    const glyph = document.createElement('span');
    glyph.className = 'family-glyph';
    glyph.setAttribute('aria-hidden', 'true');
    glyph.innerHTML = '<i></i><i></i><i></i>';
    return glyph;
  }

  function buildEmbodiment(placement) {
    const article = document.createElement('article');
    article.className = `embodiment depth-${placement.depthBand}`;
    article.dataset.familyId = placement.familyId;
    article.style.setProperty('--x', placement.desktop[0]);
    article.style.setProperty('--y', placement.desktop[1]);
    article.style.setProperty('--s', placement.desktop[2]);
    article.style.setProperty('--px', placement.portrait[0]);
    article.style.setProperty('--py', placement.portrait[1]);
    article.style.setProperty('--ps', placement.portrait[2]);
    article.style.setProperty('--align', placement.labelAlign);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    canvas.dataset.familyCanvas = placement.slug;
    canvas.setAttribute(
      'aria-label',
      `${placement.publicDisplayName}, ${placement.patternId.replaceAll('_', ' ')} public story mantle`
    );
    const contact = document.createElement('span');
    contact.className = 'contact-shadow';
    const label = document.createElement('div');
    label.className = 'family-label';
    label.append(makeGlyph());
    const copy = document.createElement('span');
    copy.innerHTML =
      `<b>${placement.publicDisplayName}</b>`
      + `<small>${placement.patternId.replaceAll('_', ' ')}</small>`;
    label.append(copy);
    article.append(contact, canvas, label);
    return article;
  }

  function canvasHasPixels(canvas) {
    const bytes = canvas.getContext('2d', { willReadFrequently: true })
      .getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 3; index < bytes.length; index += 4) {
      if (bytes[index] > 8) return true;
    }
    return false;
  }

  async function copyFamilyCanvases() {
    const lineupDocument = $('#lineup-frame').contentDocument;
    for (const placement of data.placements) {
      const source = lineupDocument.querySelector(`[data-canvas="${placement.slug}"]`);
      const target = document.querySelector(`[data-family-canvas="${placement.slug}"]`);
      if (!source || !target) throw new Error(`Missing ${placement.slug} browser canvas`);
      target.width = source.width;
      target.height = source.height;
      const context = target.getContext('2d', { alpha: true, willReadFrequently: true });
      context.clearRect(0, 0, target.width, target.height);
      context.drawImage(source, 0, 0);
      if (!canvasHasPixels(target)) {
        throw new Error(`${placement.slug} observer canvas contains no visible pixels`);
      }
    }
  }

  async function setMode(mode) {
    const lineupWindow = $('#lineup-frame')?.contentWindow;
    if (!lineupWindow?.__MV_V6_SET_MODE__) throw new Error('MV-V6 mode control is unavailable');
    await lineupWindow.__MV_V6_SET_MODE__(mode);
    state.mode = mode;
    document.documentElement.dataset.mode = mode;
    document.querySelectorAll('[data-mode]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    });
    await copyFamilyCanvases();
    return window.__MV_V7_SNAPSHOT__();
  }

  async function setPhase(phase) {
    const lineupWindow = $('#lineup-frame')?.contentWindow;
    if (!lineupWindow?.__MV_V6_SET_PHASE__) throw new Error('MV-V6 phase control is unavailable');
    await lineupWindow.__MV_V6_SET_PHASE__(phase);
    state.phase = phase;
    document.querySelectorAll('[data-phase]').forEach((button) => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.phase) === phase));
    });
    await copyFamilyCanvases();
    $('[data-phase-copy]').textContent = `${phase.toFixed(1)} s sealed XPBD`;
    return window.__MV_V7_SNAPSHOT__();
  }

  function failNeutral(reason) {
    state.status = 'fail-neutral';
    state.ready = true;
    state.admitted = false;
    state.reason = reason;
    document.body.classList.add('fail-neutral');
    $('[data-admission]').textContent = 'NEUTRAL OBSERVER';
    $('[data-status]').textContent = reason;
    $('[data-family-layer]').replaceChildren();
  }

  window.__MV_V7_SET_MODE__ = setMode;
  window.__MV_V7_SET_PHASE__ = setPhase;
  window.__MV_V7_REPAINT__ = async () => {
    if (!state.admitted) return window.__MV_V7_SNAPSHOT__();
    await copyFamilyCanvases();
    return window.__MV_V7_SNAPSHOT__();
  };
  window.__MV_V7_CHARACTER_PIXEL_DIGEST__ = async () => {
    const canvases = [...document.querySelectorAll('canvas[data-family-canvas]')];
    const chunks = canvases.map((canvas) =>
      canvas.getContext('2d', { willReadFrequently: true })
        .getImageData(0, 0, canvas.width, canvas.height).data
    );
    const byteLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
  };
  window.__MV_V7_SNAPSHOT__ = () => {
    const familyElements = [...document.querySelectorAll('.embodiment')];
    return JSON.parse(JSON.stringify({
      ...state,
      disclosure: data.disclosure,
      familyCount: familyElements.length,
      familyNames: familyElements.map((element) =>
        element.querySelector('.family-label b')?.textContent || ''
      ),
      visibleFamilyNames: familyElements
        .filter((element) => {
          const style = getComputedStyle(element);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        })
        .map((element) => element.querySelector('.family-label b')?.textContent || ''),
      canvasCount: document.querySelectorAll('canvas[data-family-canvas]').length,
      canvasPixelsPresent: [...document.querySelectorAll('canvas[data-family-canvas]')]
        .map((canvas) => canvasHasPixels(canvas)),
      lineupFrameLoaded: Boolean($('#lineup-frame')),
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollHeight: document.documentElement.scrollHeight,
      documentClientHeight: document.documentElement.clientHeight,
    }));
  };

  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  });
  document.querySelectorAll('[data-phase]').forEach((button) => {
    button.addEventListener('click', () => setPhase(Number(button.dataset.phase)));
  });

  async function boot() {
    const params = new URLSearchParams(location.search);
    state.profile = params.get('profile');
    const suppliedIntegration = params.get('integration');
    const observerFrame = $('#observer-frame');
    await waitFor(
      () => observerFrame.contentWindow?.__MODEL_VILLAGE_WITNESS__?.ready === true,
      'verified observer'
    );
    const observerSnapshot = observerFrame.contentWindow.__MODEL_VILLAGE_SNAPSHOT__();
    state.observer = observerSnapshot;
    state.canonicalFieldsAfter = observerSnapshot.observerBoundary?.canonicalFields ?? null;
    if (
      observerSnapshot.status !== 'pass'
      || observerSnapshot.observerBoundary?.consumerAcknowledgement?.matches !== true
      || !sameJson(state.canonicalFieldsBefore, state.canonicalFieldsAfter)
    ) {
      throw new Error('Observer canonical receipt acknowledgement failed');
    }

    const admission = admissionForProfile(state.profile);
    if (state.profile === data.deniedProfile) {
      failNeutral('research_live_blinded preserves six neutral resident proxies');
      return;
    }
    if (!admission) {
      failNeutral('unsupported presentation profile preserves the neutral observer');
      return;
    }
    if (suppliedIntegration !== admission.sha256) {
      failNeutral('missing or invalid exact observer integration admission');
      return;
    }

    applyObserverPresentation(observerFrame.contentDocument);
    const lineupFrame = document.createElement('iframe');
    lineupFrame.id = 'lineup-frame';
    lineupFrame.title = 'Source HoloScript character renderer';
    lineupFrame.src =
      `/lineup/index.html?profile=${encodeURIComponent(data.lineupProfile)}`
      + `&admission=${encodeURIComponent(data.lineupAdmission)}`;
    document.body.append(lineupFrame);
    await waitFor(
      () => lineupFrame.contentWindow?.__MV_V6__?.ready === true,
      'MV-V6 browser-native character consumer'
    );
    const lineupState = lineupFrame.contentWindow.__MV_V6_SNAPSHOT__();
    if (
      lineupState.status !== 'pass'
      || lineupState.admitted !== true
      || lineupState.gpu?.navigatorGpu !== true
      || lineupState.gpu?.adapterAcquired !== true
      || lineupState.gpu?.deviceCreated !== true
    ) {
      throw new Error('MV-V6 browser-native WebGPU consumer was not admitted');
    }
    state.lineup = lineupState;
    const familyLayer = $('[data-family-layer]');
    for (const placement of data.placements) {
      familyLayer.append(buildEmbodiment(placement));
    }
    await copyFamilyCanvases();
    state.familyCount = data.placements.length;
    state.admitted = true;
    state.status = 'pass';
    state.ready = true;
    document.body.classList.add('admitted');
    $('[data-admission]').textContent =
      state.profile === data.postlockProfile ? 'POSTLOCK REPLAY ADMITTED' : 'PUBLIC STORY ADMITTED';
    $('[data-status]').textContent =
      'Read-only dual renderer · six family-ID placements · zero feedback';
  }

  boot().catch((error) => {
    state.status = 'error';
    state.ready = true;
    state.errors.push(error.stack || error.message);
    $('[data-status]').textContent = error.message;
    console.error(error);
  });
}

function controlsHtml() {
  return `
    <aside class="control-deck" aria-label="Observer presentation controls">
      <div class="proof-kicker" data-admission>VERIFYING ADMISSION</div>
      <p class="proof-status" data-status>Waiting for observer and browser GPU…</p>
      <div class="control-row" aria-label="Perception mode">
        <button data-mode="color" aria-pressed="true">Color</button>
        <button data-mode="grayscale" aria-pressed="false">Gray</button>
        <button data-mode="deuteranopia" aria-pressed="false">Deuter</button>
      </div>
      <div class="control-row phases" aria-label="Sealed XPBD phase">
        <button data-phase="0" aria-pressed="false">Rest</button>
        <button data-phase="0.6" aria-pressed="true">0.6 s</button>
        <button data-phase="1.2" aria-pressed="false">1.2 s</button>
      </div>
      <div class="phase-copy" data-phase-copy>0.6 s sealed XPBD</div>
    </aside>`;
}

function buildIntegrationHtml(data) {
  return `<!doctype html>
<html lang="en" data-mode="color">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>The Six at Stormglass · MV-V7</title>
<style>
:root{--ink:#e3eef0;--mist:#91aab2;--loom:#e4a95f;--night:#030812;--line:rgba(150,191,201,.23);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:var(--night)}
*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#030812}body{position:relative}
#observer-frame{position:absolute;inset:0;width:100%;height:100%;border:0;background:#07111f}
#lineup-frame{position:absolute;left:-8px;top:-8px;width:2px;height:2px;opacity:.001;pointer-events:none;border:0}
.scene-veil{position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(2,7,13,.18),transparent 25% 72%,rgba(2,7,13,.2)),linear-gradient(180deg,transparent 55%,rgba(2,7,13,.42));z-index:2}
.family-layer{position:absolute;inset:0;z-index:4;pointer-events:none}
.embodiment{position:absolute;left:calc(var(--x)*1%);top:calc(var(--y)*1%);width:256px;height:302px;transform:translate(-50%,-50%) scale(var(--s));transform-origin:50% 80%;filter:drop-shadow(0 24px 22px rgba(0,0,0,.45));transition:opacity .18s}
.embodiment:before{content:"";position:absolute;left:50%;top:45%;width:190px;height:220px;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(ellipse,rgba(91,151,169,.12),transparent 67%);box-shadow:inset 0 0 70px rgba(112,180,196,.045)}
.embodiment canvas{position:absolute;left:0;top:0;width:256px;height:256px;image-rendering:auto;filter:drop-shadow(0 12px 10px rgba(0,0,0,.54))}
.contact-shadow{position:absolute;left:50%;top:228px;width:118px;height:24px;transform:translateX(-50%);border-radius:50%;background:radial-gradient(ellipse,rgba(0,0,0,.72),rgba(0,0,0,.08) 70%,transparent);filter:blur(3px)}
.family-label{position:absolute;left:50%;top:238px;min-width:174px;max-width:220px;transform:translateX(-50%);display:flex;gap:8px;align-items:center;padding:8px 11px;border:1px solid rgba(153,200,210,.25);border-radius:3px;background:linear-gradient(135deg,rgba(5,13,23,.9),rgba(10,24,37,.68));box-shadow:0 12px 32px rgba(0,0,0,.28),inset 0 1px rgba(255,255,255,.045);backdrop-filter:blur(10px);text-align:var(--align)}
.family-label span:last-child{display:block;min-width:0}.family-label b{display:block;color:#f1f6f6;font:400 23px/1 Georgia,"Times New Roman",serif;letter-spacing:-.02em}.family-label small{display:block;margin-top:3px;color:#88a0a9;font:600 7px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;text-transform:uppercase;letter-spacing:.09em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.family-glyph{position:relative;display:block;flex:0 0 24px;width:24px;height:22px}.family-glyph i{position:absolute;display:block;width:16px;height:6px;border:1px solid #d0a466;border-radius:50%;transform:rotate(-18deg)}.family-glyph i:nth-child(2){top:6px;right:0;transform:rotate(18deg)}.family-glyph i:nth-child(3){top:12px;left:2px}
.depth-mid{opacity:.94}.control-deck{position:absolute;z-index:6;right:24px;bottom:24px;width:310px;padding:14px 15px 13px;border:1px solid var(--line);border-radius:4px;background:linear-gradient(145deg,rgba(5,13,23,.9),rgba(10,24,37,.72));box-shadow:0 20px 70px rgba(0,0,0,.32),inset 0 1px rgba(255,255,255,.05);backdrop-filter:blur(14px)}
.proof-kicker{color:#83e0bf;font:700 10px/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.16em}.proof-status{min-height:26px;margin:7px 0 10px;color:#9bb1b8;font-size:10px;line-height:1.35}.control-row{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:5px}.control-row button{appearance:none;border:1px solid rgba(150,191,201,.2);border-radius:3px;background:rgba(10,23,35,.86);color:#92a9b1;padding:7px 4px;font:700 8px/1 ui-monospace,monospace;cursor:pointer}.control-row button[aria-pressed="true"]{border-color:rgba(228,169,95,.58);color:#efc78c;background:rgba(109,72,30,.25);box-shadow:inset 0 0 15px rgba(228,169,95,.08)}.phase-copy{margin-top:8px;color:#6f8991;font:600 8px/1 ui-monospace,monospace;text-align:right;text-transform:uppercase;letter-spacing:.09em}
.disclosure{position:absolute;z-index:6;left:52px;bottom:48px;max-width:500px;color:#789099;font:600 8px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;text-transform:uppercase;letter-spacing:.06em;text-shadow:0 2px 16px #02060b}
.fail-neutral .family-layer{display:none}.fail-neutral .control-row,.fail-neutral .phase-copy{display:none}.fail-neutral .proof-kicker{color:#d8a087}
html[data-mode="grayscale"] .family-layer{filter:grayscale(1)}html[data-mode="deuteranopia"] .family-layer{filter:url("#none")}
@media(max-width:600px){
  .embodiment{left:calc(var(--px)*1%);top:calc(var(--py)*1%);transform:translate(-50%,-50%) scale(var(--ps));height:300px}
  .family-label{top:226px;min-width:142px;padding:7px 8px}.family-label b{font-size:20px}.family-label small{font-size:6px;max-width:110px}.family-glyph{display:none}
  .control-deck{left:9px;right:9px;bottom:8px;width:auto;padding:8px 10px 7px;display:grid;grid-template-columns:1fr 1fr;gap:4px 9px}.proof-kicker{font-size:8px}.proof-status{margin:0;min-height:0;text-align:right;font-size:7px}.control-row{margin:0}.control-row button{padding:6px 3px;font-size:7px}.phase-copy{display:none}
  .disclosure{left:16px;right:16px;bottom:78px;max-width:none;font-size:6px;text-align:center}.scene-veil{background:linear-gradient(180deg,transparent 50%,rgba(2,7,13,.4))}
}
</style>
</head>
<body>
  <iframe id="observer-frame" title="Verified read-only Stormglass Commons observer" src="/observer/model-village-render-witness.html"></iframe>
  <div class="scene-veil"></div>
  <section class="family-layer" data-family-layer aria-label="Six public model-family embodiments"></section>
  ${controlsHtml()}
  <p class="disclosure">${DISCLOSURE}</p>
  <script>(${browserApplication.toString()})(${safeInlineJson(data)});</script>
</body>
</html>`;
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function candidateBrowsers(explicitPath) {
  if (explicitPath) return [explicitPath];
  const programFiles = process.env.ProgramFiles || 'C:/Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)';
  const localAppData = process.env.LOCALAPPDATA || '';
  return [
    path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ];
}

export function resolveBrowser(explicitPath) {
  const candidates = candidateBrowsers(explicitPath);
  const found = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (found) return found;
  throw new Error(`No Chrome/Edge executable found. Tried: ${candidates.join(', ')}`);
}

export function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJson(url, timeoutMs = 2_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function waitForDebuggerTarget(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
      const target = targets.find((candidate) =>
        candidate.type === 'page' && candidate.webSocketDebuggerUrl
      );
      if (target) return target;
    } catch (error) {
      lastError = error;
    }
    await delay(180);
  }
  throw new Error(`Timed out waiting for browser debugger target: ${lastError?.message || 'none'}`);
}

function waitForEvent(client, method, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${method}`));
    }, timeoutMs);
    const cleanup = client.onEvent((message) => {
      if (message.method === method) {
        clearTimeout(timer);
        cleanup();
        resolve(message.params || {});
      }
    });
  });
}

export async function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  const handlers = new Set();
  let nextId = 1;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out opening CDP socket')), 10_000);
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('CDP WebSocket error'));
    }, { once: true });
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
      clearTimeout(item.timer);
      if (message.error) item.reject(new Error(`${item.method}: ${message.error.message}`));
      else item.resolve(message.result || {});
      return;
    }
    for (const handler of handlers) handler(message);
  });
  socket.addEventListener('close', () => {
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error('CDP socket closed'));
    }
    pending.clear();
  });
  return {
    send(method, params = {}, timeoutMs = 30_000) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        pending.set(id, { method, resolve, reject, timer });
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

export async function evaluate(client, expression, timeoutMs = 30_000) {
  const result = await client.send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    timeoutMs
  );
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description
      || result.exceptionDetails.text
      || 'Browser evaluation failed'
    );
  }
  return result.result?.value;
}

export async function waitForExpression(client, expression, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await evaluate(client, expression, 5_000).catch(() => null);
    if (last) return last;
    await delay(180);
  }
  throw new Error(`Timed out waiting for expression; last=${JSON.stringify(last)}`);
}

async function navigate(client, url, timeoutMs = 120_000) {
  const loaded = waitForEvent(client, 'Page.loadEventFired', timeoutMs);
  await client.send('Page.navigate', { url });
  await loaded;
  await waitForExpression(client, 'window.__MV_V7__?.ready === true', timeoutMs);
  return evaluate(client, 'window.__MV_V7_SNAPSHOT__()');
}

export async function setViewport(client, width, height) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
    screenWidth: width,
    screenHeight: height,
  });
  await delay(500);
}

export async function captureScreenshot(client, filePath, width, height) {
  await setViewport(client, width, height);
  const screenshot = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { x: 0, y: 0, width, height, scale: 1 },
  }, 30_000);
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

export async function removeDirectoryBestEffort(directory) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
      return;
    } catch {
      await delay(120 * (attempt + 1));
    }
  }
}

async function runBrowserWitness({
  admissions,
  browserPath,
  html,
  lineupHtmlPath,
  lineupAdmission,
  observerBundlePath,
  observerHtmlPath,
  outputDir,
}) {
  const requests = [];
  const routes = new Map([
    ['/index.html', { body: html, type: 'text/html; charset=utf-8' }],
    ['/', { body: html, type: 'text/html; charset=utf-8' }],
    ['/lineup/index.html', {
      body: fs.readFileSync(lineupHtmlPath),
      type: contentType(lineupHtmlPath),
    }],
    ['/observer/model-village-render-witness.html', {
      body: fs.readFileSync(observerHtmlPath),
      type: contentType(observerHtmlPath),
    }],
    ['/observer/model-village-render-bundle.js', {
      body: fs.readFileSync(observerBundlePath),
      type: contentType(observerBundlePath),
    }],
  ]);
  const server = createServer((request, response) => {
    const parsed = new URL(request.url || '/', 'http://127.0.0.1');
    requests.push(parsed.pathname);
    const route = routes.get(parsed.pathname);
    if (!route) {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'content-type': route.type,
      'cache-control': 'no-store',
      'cross-origin-opener-policy': 'same-origin',
    });
    response.end(route.body);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address !== 'string', 'Loopback server did not bind');
  const origin = `http://127.0.0.1:${address.port}`;
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hololand-mv-v7-'));
  const debugPort = 21_000 + Math.floor(Math.random() * 20_000);
  const launchFlags = [
    '--headless=new',
    '--use-angle=d3d11',
    '--ignore-gpu-blocklist',
    '--enable-gpu',
    '--enable-unsafe-webgpu',
    `--remote-debugging-port=${debugPort}`,
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
    cwd: outputDir,
    stdio: 'ignore',
    windowsHide: true,
  });
  const consoleMessages = [];
  const exceptions = [];
  const networkRequests = [];
  let client;
  try {
    const target = await waitForDebuggerTarget(debugPort, 20_000);
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
        networkRequests.push(message.params.request?.url || '');
      }
    });
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('Network.enable');
    const browserVersion = await client.send('Browser.getVersion');
    await setViewport(client, 1600, 900);

    const story = admissions.find(
      (admission) => admission.canonical.presentationProfile === PUBLIC_PROFILE
    );
    const postlock = admissions.find(
      (admission) => admission.canonical.presentationProfile === POSTLOCK_PROFILE
    );
    const admittedUrl =
      `${origin}/index.html?profile=${encodeURIComponent(PUBLIC_PROFILE)}`
      + `&integration=${encodeURIComponent(story.sha256)}`;
    const admitted = await navigate(client, admittedUrl);
    assert(admitted.status === 'pass' && admitted.admitted === true, 'Story integration failed');
    assert(admitted.familyCount === 6, 'Story integration did not mount six families');
    assert(admitted.canvasCount === 6, 'Story integration did not mount six canvases');
    assert(admitted.canvasPixelsPresent.every(Boolean), 'A story canvas has no visible pixels');
    assert(admitted.lineup?.gpu?.navigatorGpu === true, 'navigator.gpu was not observed');
    assert(admitted.lineup?.gpu?.adapterAcquired === true, 'GPUAdapter was not acquired');
    assert(admitted.lineup?.gpu?.deviceCreated === true, 'GPUDevice was not created');
    assert(
      equal(admitted.canonicalFieldsBefore, admitted.canonicalFieldsAfter),
      'Browser integration changed canonical fields'
    );
    const hero = await captureScreenshot(
      client,
      path.join(outputDir, 'mv-v7-hero.png'),
      1600,
      900
    );
    const characterReplayBefore = await evaluate(
      client,
      'window.__MV_V7_CHARACTER_PIXEL_DIGEST__()'
    );
    await evaluate(client, 'window.__MV_V7_REPAINT__()');
    const characterReplayAfter = await evaluate(
      client,
      'window.__MV_V7_CHARACTER_PIXEL_DIGEST__()'
    );
    assert(
      characterReplayBefore === characterReplayAfter,
      'Exact sealed character replay pixels drifted'
    );
    const heroReplay = await captureScreenshot(
      client,
      path.join(outputDir, 'mv-v7-hero-replay.png'),
      1600,
      900
    );

    await evaluate(client, 'window.__MV_V7_SET_MODE__("deuteranopia")');
    const deuteranopiaState = await evaluate(client, 'window.__MV_V7_SNAPSHOT__()');
    assert(deuteranopiaState.mode === 'deuteranopia', 'Deuteranopia mode was not applied');
    const deuteranopia = await captureScreenshot(
      client,
      path.join(outputDir, 'mv-v7-deuteranopia.png'),
      1600,
      900
    );
    assert(deuteranopia.sha256 !== hero.sha256, 'Deuteranopia mode did not change pixels');

    await evaluate(client, 'window.__MV_V7_SET_MODE__("color")');
    await evaluate(client, 'window.__MV_V7_SET_PHASE__(1.2)');
    const portrait = await captureScreenshot(
      client,
      path.join(outputDir, 'mv-v7-portrait.png'),
      390,
      844
    );
    const portraitState = await evaluate(client, 'window.__MV_V7_SNAPSHOT__()');
    assert(
      portraitState.documentScrollWidth <= portraitState.documentClientWidth,
      'Portrait observer has horizontal overflow'
    );

    await setViewport(client, 1600, 900);
    const postlockState = await navigate(
      client,
      `${origin}/index.html?profile=${encodeURIComponent(POSTLOCK_PROFILE)}`
      + `&integration=${encodeURIComponent(postlock.sha256)}`
    );
    assert(
      postlockState.status === 'pass'
      && postlockState.admitted === true
      && postlockState.familyCount === 6,
      'Postlock public tableau was not admitted'
    );
    assert(
      equal(postlockState.canonicalFieldsBefore, postlockState.canonicalFieldsAfter),
      'Postlock presentation changed canonical fields'
    );

    const missingAdmission = await navigate(
      client,
      `${origin}/index.html?profile=${encodeURIComponent(PUBLIC_PROFILE)}`
    );
    assert(
      missingAdmission.status === 'fail-neutral'
      && missingAdmission.familyCount === 0
      && missingAdmission.lineupFrameLoaded === false,
      'Missing integration admission did not fail neutral'
    );

    const deniedResearch = await navigate(
      client,
      `${origin}/index.html?profile=${encodeURIComponent(DENIED_PROFILE)}`
    );
    assert(
      deniedResearch.status === 'fail-neutral'
      && deniedResearch.familyCount === 0
      && deniedResearch.visibleFamilyNames.length === 0
      && deniedResearch.lineupFrameLoaded === false,
      'research_live_blinded did not preserve the neutral observer'
    );

    const externalNetworkRequests = networkRequests.filter((url) => {
      if (!/^https?:/i.test(url)) return false;
      try {
        return new URL(url).origin !== origin;
      } catch {
        return true;
      }
    });
    assert(externalNetworkRequests.length === 0, 'Browser made external network requests');
    assert(exceptions.length === 0, 'Browser emitted runtime exceptions');
    assert(
      consoleMessages.every((message) => message.level !== 'error'),
      'Browser console contains errors'
    );
    return {
      browserVersion,
      browserPath,
      launchFlags,
      origin,
      secureContext: await evaluate(client, 'window.isSecureContext'),
      admitted,
      postlock: postlockState,
      missingAdmission,
      deniedResearch,
      captures: { hero, heroReplay, portrait, deuteranopia },
      characterReplay: {
        beforeSha256: characterReplayBefore,
        afterSha256: characterReplayAfter,
        exact: characterReplayBefore === characterReplayAfter,
        observerCompositePixelEqualityClaimed: false,
      },
      networkRequests,
      externalNetworkRequests,
      consoleMessages,
      exceptions,
      lineupAdmission,
    };
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    await delay(500);
    await new Promise((resolve) => server.close(resolve));
    await removeDirectoryBestEffort(profileDir);
  }
}

function copyArtifact(sourcePath, relativeTarget) {
  const target = path.join(REPO_ROOT, relativeTarget);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(sourcePath, target);
  return {
    path: relativeTarget,
    sha256: sha256(fs.readFileSync(target)),
    bytes: fs.statSync(target).size,
  };
}

function validateWitnessManifest(ast, expected) {
  const policy = validatePlacementManifestSource(ast);
  const metadata = policy.metadata;
  const state = policy.state;
  for (const [field, value] of Object.entries(expected)) {
    assert(metadata[field] === value, `MV-V7 manifest ${field} is stale`);
  }
  assert(state.browserNativeWebgpuObserved === true, 'Manifest lacks browser WebGPU proof');
  assert(state.observerWebgl2Observed === true, 'Manifest lacks observer WebGL2 proof');
  assert(
    state.canonicalHashNoninterferenceObserved === true,
    'Manifest lacks canonical noninterference proof'
  );
  assert(
    state.researchAppearanceHashNoninterferenceObserved === true,
    'Manifest lacks research appearance noninterference proof'
  );
  assert(state.accessibilityModesObserved === 3, 'Manifest lacks accessibility proof');
  assert(state.externalNetworkFetchesObserved === 0, 'Manifest reports external fetches');
  assert(state.externalVisualAssetsObserved === 0, 'Manifest reports external visual assets');
  return { schema: metadata.schema, validated: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(args.outputDir, { recursive: true });
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
  const core = await import(
    pathToFileURL(path.join(args.holoscriptRoot, 'packages/core/dist/index.js')).href
  );
  const integrationText = read(INTEGRATION_REL);
  const placementText = read(PLACEMENT_REL);
  const integrationParsed = core.parseHolo(integrationText);
  const placementParsed = core.parseHolo(placementText);
  assert(
    integrationParsed.success && integrationParsed.errors.length === 0,
    `MV-V7 integration source did not parse: ${canonicalJson(integrationParsed.errors)}`
  );
  assert(
    placementParsed.success && placementParsed.errors.length === 0,
    `MV-V7 placement manifest did not parse: ${canonicalJson(placementParsed.errors)}`
  );
  const integrationPolicy = validateObserverFamilyIntegrationSource(integrationParsed.ast);
  const placementPolicy = validatePlacementManifestSource(
    placementParsed.ast,
    { requireAnchors: !args.skipManifest }
  );

  const guardedPaths = [
    WORLD_REL,
    OBSERVER_REL,
    APPEARANCE_REL,
    LINEUP_REL,
    LINEUP_MANIFEST_REL,
  ];
  const guardedBefore = sha256Map(guardedPaths);
  const lineupDir = path.join(args.outputDir, 'lineup');
  const observerDir = path.join(args.outputDir, 'observer');
  const lineup = runMvV6Build(lineupDir, args.holoscriptRoot);
  const observer = runObserverRendering(observerDir, args);
  const canonicalFields =
    observer.receipt.observerBoundary.on.browserObserved.canonicalFields;
  assert(
    equal(Object.keys(canonicalFields).sort(), [...PROTECTED_CANONICAL_FIELDS].sort()),
    'Observer canonical field set drifted'
  );
  const observerCanonicalFieldsSha256 = sha256(canonicalJson(canonicalFields));

  const artBeforeResult = await runModelVillageArtDirectionCheck({
    root: REPO_ROOT,
    output: path.join(args.outputDir, 'art-direction-before.json'),
  });
  const appearanceBefore = researchAppearanceHash(artBeforeResult.receipt);

  const admissionInputs = {
    integrationSourceSha256: sha256(integrationText),
    lineupManifestSourceSha256: hashFile(LINEUP_MANIFEST_REL),
    lineupSourceSha256: hashFile(LINEUP_REL),
    observerCanonicalFieldsSha256,
    observerProjectionSourceSha256: hashFile(OBSERVER_REL),
    placementContractSha256: placementPolicy.placementContractSha256,
  };
  const admissions = [
    buildObserverIntegrationAdmission({
      ...admissionInputs,
      presentationProfile: PUBLIC_PROFILE,
    }),
    buildObserverIntegrationAdmission({
      ...admissionInputs,
      presentationProfile: POSTLOCK_PROFILE,
    }),
  ];
  const browserData = {
    schema: 'hololand.model-village.observer-family-integration-browser-data.v1',
    admissions,
    deniedProfile: DENIED_PROFILE,
    postlockProfile: POSTLOCK_PROFILE,
    lineupProfile: PUBLIC_PROFILE,
    lineupAdmission: lineup.witness.admission.sha256,
    placements: placementPolicy.placements,
    observerCanonicalFields: canonicalFields,
    observerCanonicalFieldsSha256,
    disclosure: DISCLOSURE,
  };
  const html = buildIntegrationHtml(browserData);
  const htmlPath = path.join(args.outputDir, 'model-village-observer-family-integration.html');
  fs.writeFileSync(htmlPath, html);

  const browser = args.skipBrowser
    ? null
    : await runBrowserWitness({
        admissions,
        browserPath: resolveBrowser(args.browser),
        html,
        lineupHtmlPath: lineup.htmlPath,
        lineupAdmission: lineup.witness.admission.sha256,
        observerBundlePath: observer.bundlePath,
        observerHtmlPath: observer.htmlPath,
        outputDir: args.outputDir,
      });
  if (browser) {
    assert(browser.secureContext === true, 'Loopback integration was not a secure context');
  }

  const artAfterResult = await runModelVillageArtDirectionCheck({
    root: REPO_ROOT,
    output: path.join(args.outputDir, 'art-direction-after.json'),
  });
  const appearanceAfter = researchAppearanceHash(artAfterResult.receipt);
  assert(
    appearanceBefore.sha256 === appearanceAfter.sha256,
    'Research appearance hash changed across observer integration'
  );
  const guardedAfter = sha256Map(guardedPaths);
  assert(equal(guardedBefore, guardedAfter), 'MV-V7 browser integration mutated guarded sources');

  let durable = null;
  if (args.writeArtifacts) {
    assert(browser, '--write-artifacts requires the browser witness');
    durable = {
      hero: copyArtifact(path.join(args.outputDir, 'mv-v7-hero.png'), HERO_REL),
      portrait: copyArtifact(path.join(args.outputDir, 'mv-v7-portrait.png'), PORTRAIT_REL),
      deuteranopia: copyArtifact(
        path.join(args.outputDir, 'mv-v7-deuteranopia.png'),
        DEUTERANOPIA_REL
      ),
    };
  } else if (browser) {
    for (const relative of [HERO_REL, PORTRAIT_REL, DEUTERANOPIA_REL]) {
      assert(fs.existsSync(path.join(REPO_ROOT, relative)), `Missing durable screenshot ${relative}`);
    }
    durable = {
      hero: { path: HERO_REL, sha256: hashFile(HERO_REL) },
      portrait: { path: PORTRAIT_REL, sha256: hashFile(PORTRAIT_REL) },
      deuteranopia: { path: DEUTERANOPIA_REL, sha256: hashFile(DEUTERANOPIA_REL) },
    };
    assert(durable.hero.sha256 === browser.captures.hero.sha256, 'Durable hero is stale');
    assert(
      durable.portrait.sha256 === browser.captures.portrait.sha256,
      'Durable portrait is stale'
    );
    assert(
      durable.deuteranopia.sha256 === browser.captures.deuteranopia.sha256,
      'Durable deuteranopia capture is stale'
    );
  }

  const manifestExpected = browser
    ? {
        integrationSourceSha256: sha256(integrationText),
        observerProjectionSourceSha256: hashFile(OBSERVER_REL),
        browserStudioLineupSourceSha256: hashFile(LINEUP_REL),
        browserStudioLineupManifestSourceSha256: hashFile(LINEUP_MANIFEST_REL),
        placementContractSha256: placementPolicy.placementContractSha256,
        observerCanonicalFieldsSha256,
        storyAdmissionSha256: admissions[0].sha256,
        postlockAdmissionSha256: admissions[1].sha256,
        integrationHtmlSha256: sha256(html),
        heroSha256: browser.captures.hero.sha256,
        portraitSha256: browser.captures.portrait.sha256,
        deuteranopiaSha256: browser.captures.deuteranopia.sha256,
      }
    : null;
  const manifest =
    args.skipManifest || !browser
      ? {
          validated: false,
          reason: args.skipManifest ? 'bootstrap_skip_requested' : 'browser_skipped',
        }
      : validateWitnessManifest(placementParsed.ast, manifestExpected);

  const receipt = {
    schema: 'hololand.model-village.observer-family-integration-witness.v1',
    generatedAt: new Date().toISOString(),
    milestone: 'MV-V7 Admitted Six-Family Observer Integration',
    status: 'PASS',
    source: {
      path: INTEGRATION_REL,
      sha256: sha256(integrationText),
      parser: 'HoloCompositionParser',
      presentationProfiles: integrationPolicy.state.admittedPresentationProfiles,
      deniedProfile: DENIED_PROFILE,
      independentProjectDisclosure: DISCLOSURE,
      canonicalWriteAuthority: false,
      residentObservationWriteAuthority: false,
      causalEffect: false,
    },
    placement: {
      path: PLACEMENT_REL,
      placementKey: 'family_id',
      placementCount: placementPolicy.placements.length,
      placementContractSha256: placementPolicy.placementContractSha256,
      placements: placementPolicy.placements,
      catalogArrayOrderUsed: false,
      researchJoin: 'none',
    },
    admissions: admissions.map((admission) => ({
      presentationProfile: admission.canonical.presentationProfile,
      sha256: admission.sha256,
      canonical: admission.canonical,
    })),
    observer: {
      source: OBSERVER_REL,
      sourceSha256: hashFile(OBSERVER_REL),
      renderer: 'HoloScript SceneIR observer adapter on WebGL2',
      renderingTruthSchema: observer.receipt.schema,
      renderingTruthStatus: observer.receipt.status,
      actualWebgl2Context: true,
      noKnownSoftwareFallback: true,
      canonicalFields,
      canonicalFieldsSha256: observerCanonicalFieldsSha256,
      authoritativeHashes: observer.receipt.observerBoundary.authoritativeHashes,
      canonicalAuthoritativeMutationDelta:
        observer.receipt.observerBoundary.canonicalAuthoritativeMutationDelta,
      observerConsumerToggleExecuted:
        observer.receipt.observerBoundary.isolatedProjectionToggleExecuted,
    },
    characters: {
      source: LINEUP_REL,
      sourceSha256: hashFile(LINEUP_REL),
      sourceToBundleIntegrityObserved: true,
      renderer: 'HoloScript CharacterRender.renderCharacter',
      compileTarget: 'character-webgpu',
      familyCount: 6,
      sealedXpbdPhaseSeconds: [0, 0.6, 1.2],
      continuousBrowserClothSolverClaimed: false,
    },
    browser: browser
      ? {
          secureContext: browser.secureContext,
          browserVersion: browser.browserVersion,
          executable: browser.browserPath,
          launchFlags: browser.launchFlags,
          navigatorGpuObserved: browser.admitted.lineup.gpu.navigatorGpu,
          gpuAdapterAcquired: browser.admitted.lineup.gpu.adapterAcquired,
          gpuDeviceCreated: browser.admitted.lineup.gpu.deviceCreated,
          gpu: browser.admitted.lineup.gpu,
          storyFamilyCount: browser.admitted.familyCount,
          postlockFamilyCount: browser.postlock.familyCount,
          missingAdmissionFailsNeutral: browser.missingAdmission.status === 'fail-neutral',
          researchLiveBlindedFailsNeutral: browser.deniedResearch.status === 'fail-neutral',
          externalNetworkFetchCount: browser.externalNetworkRequests.length,
          externalVisualAssets: 0,
          exactCharacterReplay: browser.characterReplay.exact,
          characterReplay: browser.characterReplay,
          captures: browser.captures,
          consoleMessages: browser.consoleMessages,
          exceptions: browser.exceptions,
        }
      : {
          skipped: true,
          reason: 'browser_skipped',
        },
    accessibility: browser
      ? {
          modes: ['color', 'grayscale', 'deuteranopia'],
          modesObserved: 3,
          deuteranopiaChangesPixels:
            browser.captures.deuteranopia.sha256 !== browser.captures.hero.sha256,
          identityChannels: ['silhouette', 'pattern', 'glyph', 'caption'],
          portraitHorizontalOverflow: false,
          disclosureAlwaysVisible: true,
        }
      : { modesObserved: 0, reason: 'browser_skipped' },
    noFeedback: {
      canonicalFieldsBefore: canonicalFields,
      canonicalFieldsAfter: browser?.admitted.canonicalFieldsAfter ?? canonicalFields,
      canonicalFieldsEqual:
        !browser || equal(browser.admitted.canonicalFieldsBefore, browser.admitted.canonicalFieldsAfter),
      executedScheduleHashUnchanged:
        !browser
        || browser.admitted.canonicalFieldsBefore.executedScheduleHash
          === browser.admitted.canonicalFieldsAfter.executedScheduleHash,
      residentObservationHashUnchanged:
        !browser
        || browser.admitted.canonicalFieldsBefore.residentObservationHash
          === browser.admitted.canonicalFieldsAfter.residentObservationHash,
      researchAppearanceBefore: appearanceBefore,
      researchAppearanceAfter: appearanceAfter,
      researchAppearanceHashUnchanged: appearanceBefore.sha256 === appearanceAfter.sha256,
      guardedSourceHashesBefore: guardedBefore,
      guardedSourceHashesAfter: guardedAfter,
      guardedSourcesUnchanged: equal(guardedBefore, guardedAfter),
      browserWriteSurface: 'none',
      residentCanObservePresentation: false,
      presentationCanAffectOutcome: false,
    },
    browserHtml: {
      path: path.relative(REPO_ROOT, htmlPath).replaceAll('\\', '/'),
      sha256: sha256(html),
      bytes: Buffer.byteLength(html),
      selfContainedIntegrationShell: true,
      externalVisualAssets: 0,
    },
    durable,
    manifest,
    claimBoundary: {
      proved:
        'An exact source- and canonical-field-bound public or postlock presentation admission places six family-ID-keyed HoloScript CharacterRender WebGPU residents over the existing verified HoloScript SceneIR/WebGL2 observer, with sealed XPBD phases, exact replay, accessibility views, and no canonical, schedule, observation, or research-appearance feedback.',
      notProved: [
        'permission to reveal family identity during live blinded research',
        'provider affiliation or endorsement',
        'exact provider model revisions or provider-to-research-seat assignments',
        'postlock research identity joins',
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
    path.join(args.outputDir, 'observer-family-integration-witness.json'),
    `${JSON.stringify(receipt, null, 2)}\n`
  );
  if (args.json) console.log(JSON.stringify(receipt, null, 2));
  else {
    console.log(
      `PASS MV-V7 observer integration: ${placementPolicy.placements.length} public families, `
      + `${browser ? 'WebGPU characters over verified WebGL2 observer' : 'browser skipped'}, `
      + `${browser?.externalNetworkRequests.length ?? 0} external fetches`
    );
    console.log(
      `Receipt: ${path.join(args.outputDir, 'observer-family-integration-witness.json')}`
    );
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`FAIL MV-V7 observer integration: ${error.stack || error.message}`);
      process.exit(1);
    });
}
