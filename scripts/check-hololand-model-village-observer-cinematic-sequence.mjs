#!/usr/bin/env node

import { Buffer } from 'node:buffer';
import { spawn, spawnSync } from 'node:child_process';
import console from 'node:console';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  objectProperties,
  sha256,
} from './check-hololand-model-village-resident-rig.mjs';
import {
  captureScreenshot,
  createCdpClient,
  delay,
  evaluate,
  removeDirectoryBestEffort,
  resolveBrowser,
  waitForDebuggerTarget,
  waitForExpression,
} from './check-hololand-model-village-observer-family-integration.mjs';
import {
  compareRenderedPngs,
} from './lib/model-village-rendered-png-proof.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const SEQUENCE_REL =
  'source/layers/vr/frontier/model-village/model-village-observer-cinematic-sequence.holo';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-observer-cinematic-sequence-manifest.holo';
const MV_V7_SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-observer-family-integration.holo';
const APPEARANCE_REL = 'source/proofs/model-village-appearance-invariance.hs';
const DEFAULT_OUTPUT_REL =
  '.tmp/hololand/model-village/observer-cinematic-sequence';
const MV_V7_OUTPUT_REL =
  '.tmp/hololand/model-village/observer-family-integration';
const DESKTOP_CONTACT_REL =
  'docs/assets/model-village/model-village-observer-cinematic-sequence-desktop-contact-sheet-2026-07-26.png';
const PORTRAIT_CONTACT_REL =
  'docs/assets/model-village/model-village-observer-cinematic-sequence-portrait-contact-sheet-2026-07-26.png';
const PUBLIC_PROFILE = 'village_story_unblinded';
const POSTLOCK_PROFILE = 'research_replay_postlock';
const DENIED_PROFILE = 'research_live_blinded';
const DISCLOSURE =
  'HoloLand-authored visual interpretation; not affiliated with or endorsed by the named providers.';
const PROTECTED_CANONICAL_FIELDS = Object.freeze([
  'canonicalSceneHash',
  'canonicalPoseHash',
  'logicalClockHash',
  'publicStateHash',
  'executedScheduleHash',
  'residentObservationHash',
  'actionReceiptRoot',
]);

function parseArgs(argv) {
  const args = {
    browser: null,
    holoscriptRoot:
      process.env.HOLOSCRIPT_ROOT ?? 'C:/Users/josep/Documents/GitHub/HoloScript',
    outputDir: path.join(REPO_ROOT, DEFAULT_OUTPUT_REL),
    skipBrowser: false,
    skipManifest: false,
    writeArtifacts: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--browser') args.browser = path.resolve(argv[++index]);
    else if (arg === '--holoscript-root') args.holoscriptRoot = path.resolve(argv[++index]);
    else if (arg === '--output-dir') args.outputDir = path.resolve(argv[++index]);
    else if (arg === '--skip-browser') args.skipBrowser = true;
    else if (arg === '--skip-manifest') args.skipManifest = true;
    else if (arg === '--write-artifacts') args.writeArtifacts = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/check-hololand-model-village-observer-cinematic-sequence.mjs [options]

Options:
  --holoscript-root <path>   Built HoloScript checkout
  --browser <path>           Chrome or Edge executable
  --output-dir <path>        Runtime HTML, screenshots, and receipt directory
  --skip-browser             Validate HoloScript, MV-V7, admissions, and manifest only
  --skip-manifest            Bootstrap before immutable MV-V8 anchors exist
  --write-artifacts          Refresh the two durable contact sheets
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

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function hashFile(relativePath) {
  return sha256(fs.readFileSync(path.join(REPO_ROOT, relativePath)));
}

function safeInlineJson(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function runChild(command, args, { timeoutMs = 900_000 } = {}) {
  const child = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs,
    windowsHide: true,
  });
  if (child.status !== 0) {
    const output = `${child.stdout || ''}\n${child.stderr || ''}`.trim();
    throw new Error(
      `${path.basename(command)} ${args[0] || ''} failed (${child.status}):\n`
      + output.slice(-16_000)
    );
  }
  return child;
}

function getObject(ast, name) {
  const object = (ast.objects ?? []).find((candidate) => candidate.name === name);
  assert(object, `Missing HoloScript object ${name}`);
  return objectProperties(object);
}

function beatProjection(beat) {
  return {
    beatId: beat.beatId,
    beatIndex: beat.beatIndex,
    durationMs: beat.durationMs,
    eyebrow: beat.eyebrow,
    title: beat.title,
    presenterCopy: beat.presenterCopy,
    audioDescription: beat.audioDescription,
    sealedClothPhaseSeconds: beat.sealedClothPhaseSeconds,
    cameraScale: beat.cameraScale,
    cameraTranslateXPercent: beat.cameraTranslateXPercent,
    cameraTranslateYPercent: beat.cameraTranslateYPercent,
    cameraOriginXPercent: beat.cameraOriginXPercent,
    cameraOriginYPercent: beat.cameraOriginYPercent,
    cameraLens: beat.cameraLens,
    annotationGlyph: beat.annotationGlyph,
    optionalAudioCueHz: beat.optionalAudioCueHz,
    optionalAudioCueDurationMs: beat.optionalAudioCueDurationMs,
  };
}

export function validateObserverCinematicSequenceSource(ast) {
  assert(
    ast.metadata?.schema === 'hololand.model-village.observer-cinematic-sequence.v1',
    'Unexpected MV-V8 sequence schema'
  );
  assert(ast.metadata?.milestone === 'MV-V8', 'MV-V8 milestone is missing');
  assert(ast.metadata?.artStyle === 'hearthlight_biorealism', 'Art style drifted');
  assert(ast.metadata?.canonicalWriteAuthority === false, 'Sequence gained canonical authority');
  assert(
    ast.metadata?.residentObservationWriteAuthority === false,
    'Sequence gained resident-observation authority'
  );
  assert(ast.metadata?.causalEffect === false, 'Sequence gained causal effect');
  const state = objectProperties(ast.state);
  assert(state.beatCount === 2, 'MV-V8 must remain a bounded two-beat sequence');
  assert(state.sequenceDurationMs === 6800, 'MV-V8 duration drifted');
  assert(state.autoplayDefault === false, 'Autoplay must remain disabled by default');
  assert(state.reducedMotionDefault === true, 'Reduced motion must remain the default');
  assert(state.captionsAlwaysVisible === true, 'Presenter captions must remain visible');
  assert(state.audioDefaultMuted === true, 'Optional local audio must default muted');
  assert(state.audioExternalAssets === false, 'External audio assets are forbidden');
  assert(state.audioWorldCausalEffect === false, 'Audio gained world causal effect');
  assert(state.audioHumanMixApproved === false, 'Human mix approval cannot be preclaimed');
  assert(
    state.exactReplayBoundary === 'camera_annotation_phase_and_character_pixels',
    'Exact replay boundary drifted'
  );
  assert(
    state.observerCompositePixelEqualityClaimed === false,
    'Whole observer composite equality cannot be claimed'
  );
  assert(
    equal(state.admittedPresentationProfiles, [PUBLIC_PROFILE, POSTLOCK_PROFILE]),
    'Presentation admission profiles drifted'
  );
  assert(
    equal(state.deniedPresentationProfiles, [DENIED_PROFILE]),
    'Research denial profile drifted'
  );
  for (const key of [
    'canonicalWriteAuthority',
    'residentObservationWriteAuthority',
    'scheduleWriteAuthority',
    'clockWriteAuthority',
    'actionWriteAuthority',
    'receiptWriteAuthority',
    'causalEffect',
    'residentCanObservePresentation',
    'presentationCanAffectOutcome',
  ]) {
    assert(state[key] === false, `Sequence state ${key} must remain false`);
  }
  for (const key of [
    'researchResidentBinding',
    'researchSeatBinding',
    'researchPersonaBinding',
    'researchRoleBinding',
    'adapterAssignmentBinding',
    'exactModelRevisionBinding',
  ]) {
    assert(state[key] === 'none', `Sequence state ${key} must remain none`);
  }
  const gate = getObject(ast, 'ObserverCinematicAdmissionGate');
  assert(gate.deniedProfile === DENIED_PROFILE, 'Admission gate research profile drifted');
  assert(gate.failNeutral === true, 'Admission gate must fail neutral');
  assert(
    gate.deniedProfileMayInstantiateNamedRenderer === false,
    'Research profile may not instantiate the named renderer'
  );
  assert(
    gate.invalidAdmissionMayInstantiateNamedRenderer === false,
    'Invalid admission may not instantiate the named renderer'
  );
  const audio = getObject(ast, 'OptionalLocalAudioBoundary');
  assert(audio.enabledByDefault === false, 'Local audio must remain opt-in');
  assert(audio.requiresUserAction === true, 'Local audio must require user action');
  assert(audio.externalAudioAssets === false, 'Local audio may not load assets');
  assert(audio.audibleOutputVerified === false, 'Audible output cannot be preclaimed');
  assert(audio.humanMixApproved === false, 'Human mix approval cannot be preclaimed');
  const replay = getObject(ast, 'ExactReplayBoundary');
  assert(replay.observerCompositePixelEqualityClaimed === false, 'Replay boundary widened');
  const noFeedback = getObject(ast, 'NoFeedbackBoundary');
  for (const key of [
    'browserMayWriteCanonicalWorld',
    'browserMayWriteResidentObservation',
    'browserMayWriteSchedule',
    'browserMayWriteClock',
    'browserMayWritePrompt',
    'browserMayWriteAction',
    'browserMayWriteReceipt',
    'residentCanObservePresentation',
    'presentationCanAffectOutcome',
  ]) {
    assert(noFeedback[key] === false, `No-feedback boundary ${key} must remain false`);
  }
  const beats = (ast.objects ?? [])
    .map((object) => objectProperties(object))
    .filter((object) => typeof object.beatId === 'string')
    .map(beatProjection)
    .sort((left, right) => left.beatIndex - right.beatIndex);
  assert(beats.length === 2, 'Expected exactly two cinematic beat objects');
  assert(
    equal(beats.map((beat) => beat.beatId), ['the_commons_wakes', 'proof_in_the_light']),
    'Cinematic beat IDs drifted'
  );
  assert(
    equal(beats.map((beat) => beat.beatIndex), [0, 1]),
    'Cinematic beat indices must be contiguous'
  );
  assert(
    equal(beats.map((beat) => beat.sealedClothPhaseSeconds), [0.6, 1.2]),
    'Sealed cloth phases drifted'
  );
  for (const beat of beats) {
    assert(beat.durationMs > 0, `${beat.beatId} duration must be positive`);
    assert(beat.cameraScale >= 1 && beat.cameraScale <= 1.2, `${beat.beatId} camera scale unsafe`);
    assert(beat.optionalAudioCueHz > 0, `${beat.beatId} audio cue frequency invalid`);
    assert(beat.optionalAudioCueDurationMs > 0, `${beat.beatId} audio cue duration invalid`);
  }
  return {
    state,
    beats,
    sequenceContractSha256: sha256(canonicalJson(beats)),
    audio,
    replay,
    noFeedback,
  };
}

export function buildObserverCinematicAdmission({
  sequenceSourceSha256,
  sequenceContractSha256,
  mvV7AdmissionSha256,
  observerCanonicalFieldsSha256,
  presentationProfile,
}) {
  assert(
    [PUBLIC_PROFILE, POSTLOCK_PROFILE].includes(presentationProfile),
    `Unsupported cinematic profile ${presentationProfile}`
  );
  const canonical = {
    schema: 'hololand.model-village.observer-cinematic-sequence-admission.v1',
    presentationProfile,
    sequenceSourceSha256,
    sequenceContractSha256,
    mvV7AdmissionSha256,
    observerCanonicalFieldsSha256,
    independentProjectDisclosure: DISCLOSURE,
    researchResidentBinding: 'none',
    researchSeatBinding: 'none',
    postlockResearchJoinExecuted: false,
    canonicalWriteAuthority: false,
    residentObservationWriteAuthority: false,
    causalEffect: false,
  };
  return { canonical, sha256: sha256(canonicalJson(canonical)) };
}

function validateManifestSource(ast, expected, { requireAnchors = true } = {}) {
  assert(
    ast.metadata?.schema
      === 'hololand.model-village.observer-cinematic-sequence-manifest.v1',
    'Unexpected MV-V8 manifest schema'
  );
  const state = objectProperties(ast.state);
  assert(state.beatCount === 2, 'Manifest beat count drifted');
  assert(state.sequenceDurationMs === 6800, 'Manifest duration drifted');
  assert(state.researchLiveBlindedAllowed === false, 'Manifest unblinded research');
  assert(
    state.namedRendererInstantiatedForResearch === false,
    'Manifest claims a research named-renderer instantiation'
  );
  assert(state.audibleOutputVerified === false, 'Manifest overclaims audible output');
  assert(state.humanMixApproved === false, 'Manifest overclaims mix approval');
  assert(state.mvS1FullShowClaimed === false, 'MV-V8 may not close MV-S1');
  if (requireAnchors) {
    for (const [key, value] of Object.entries(expected)) {
      assert(ast.metadata?.[key] === value, `Manifest ${key} is stale`);
    }
    for (const key of [
      'deterministicReplayObserved',
      'desktopContactSheetObserved',
      'portraitContactSheetObserved',
      'browserNativeWebgpuObserved',
      'observerWebgl2Observed',
      'optionalLocalAudioGraphObserved',
      'canonicalHashNoninterferenceObserved',
      'researchAppearanceHashNoninterferenceObserved',
    ]) {
      assert(state[key] === true, `Manifest ${key} must be true`);
    }
    assert(state.externalNetworkFetchesObserved === 0, 'External fetch count drifted');
    assert(state.externalVisualAssetsObserved === 0, 'External visual asset count drifted');
    assert(state.externalAudioAssetsObserved === 0, 'External audio asset count drifted');
  }
  return { metadata: ast.metadata, state };
}

export function prepareMvV7(args) {
  const outputDir = path.join(REPO_ROOT, MV_V7_OUTPUT_REL);
  const childArgs = [
    'scripts/check-hololand-model-village-observer-family-integration.mjs',
    '--holoscript-root',
    args.holoscriptRoot,
    '--output-dir',
    outputDir,
    '--reuse-base-rendering',
    '--skip-browser',
    ...(args.browser ? ['--browser', args.browser] : []),
  ];
  runChild(process.execPath, childArgs);
  const receiptPath = path.join(outputDir, 'observer-family-integration-witness.json');
  assert(fs.existsSync(receiptPath), 'MV-V7 witness is missing');
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert(receipt.status === 'PASS', 'MV-V7 witness did not pass');
  assert(receipt.noFeedback?.canonicalFieldsEqual === true, 'MV-V7 canonical fields drifted');
  assert(
    receipt.noFeedback?.researchAppearanceHashUnchanged === true,
    'MV-V7 research appearance drifted'
  );
  const required = {
    integrationHtmlPath: path.join(outputDir, 'model-village-observer-family-integration.html'),
    lineupHtmlPath: path.join(outputDir, 'lineup', 'model-village-browser-studio-lineup.html'),
    observerHtmlPath: path.join(outputDir, 'observer', 'model-village-render-witness.html'),
    observerBundlePath: path.join(outputDir, 'observer', 'model-village-render-bundle.js'),
  };
  for (const [name, filePath] of Object.entries(required)) {
    assert(fs.existsSync(filePath), `MV-V7 ${name} is missing`);
  }
  return { outputDir, receipt, ...required };
}

function browserApplication(data) {
  const $ = (selector) => document.querySelector(selector);
  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const state = {
    schema: 'hololand.model-village.observer-cinematic-sequence-browser.v1',
    ready: false,
    status: 'booting',
    admitted: false,
    profile: null,
    beatIndex: null,
    beatId: null,
    reducedMotion: true,
    captionsVisible: true,
    audioEnabled: false,
    audioGraphConstructed: false,
    audioOutputConnected: false,
    audioContextState: 'not-created',
    innerNamedRendererInstantiated: false,
    inner: null,
    canonicalFieldsBefore: data.observerCanonicalFields,
    canonicalFieldsAfter: null,
    errors: [],
  };
  window.__MV_V8__ = state;
  let audioContext = null;
  let masterGain = null;

  const sameJson = (left, right) => {
    if (!left || !right) return left === right;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return JSON.stringify(leftKeys) === JSON.stringify(rightKeys)
      && leftKeys.every((key) => left[key] === right[key]);
  };
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
  const mvV7AdmissionForProfile = (profile) =>
    data.mvV7Admissions.find((candidate) => candidate.presentationProfile === profile);

  async function mountMvV7(profile, integration) {
    const stage = $('[data-stage]');
    stage.replaceChildren();
    const frame = document.createElement('iframe');
    frame.id = 'mv-v7-frame';
    frame.title = profile === data.deniedProfile
      ? 'Neutral verified Stormglass observer'
      : 'Admitted six-family Stormglass observer tableau';
    const params = new URLSearchParams({ profile });
    if (integration) params.set('integration', integration);
    frame.src = `/mv7/index.html?${params}`;
    stage.append(frame);
    await waitFor(() => frame.contentWindow?.__MV_V7__?.ready === true, 'MV-V7 tableau');
    const frameDocument = frame.contentDocument;
    const cinematicStyle = frameDocument.createElement('style');
    cinematicStyle.textContent = `
      .control-deck,.disclosure{display:none!important}
    `;
    frameDocument.head.append(cinematicStyle);
    const observerDocument = frameDocument.querySelector('#observer-frame')?.contentDocument;
    if (observerDocument) {
      const observerStyle = observerDocument.createElement('style');
      observerStyle.textContent = '.footer{display:none!important}';
      observerDocument.head.append(observerStyle);
    }
    return frame;
  }

  async function constructAudioGraph() {
    if (audioContext) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('Web Audio API is unavailable');
    audioContext = new AudioContext();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(audioContext.destination);
    state.audioGraphConstructed = true;
    state.audioOutputConnected = true;
    state.audioContextState = audioContext.state;
  }

  async function cueBeat(beat) {
    if (!state.audioEnabled || !audioContext || !masterGain) return;
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    const now = audioContext.currentTime;
    const duration = beat.optionalAudioCueDurationMs / 1000;
    const gain = audioContext.createGain();
    const fundamental = audioContext.createOscillator();
    const overtone = audioContext.createOscillator();
    fundamental.type = 'sine';
    overtone.type = 'triangle';
    fundamental.frequency.value = beat.optionalAudioCueHz;
    overtone.frequency.value = beat.optionalAudioCueHz * 1.5;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    fundamental.connect(gain);
    overtone.connect(gain);
    gain.connect(masterGain);
    fundamental.start(now);
    overtone.start(now);
    fundamental.stop(now + duration);
    overtone.stop(now + duration);
    state.audioContextState = audioContext.state;
  }

  async function setAudio(enabled) {
    if (enabled) await constructAudioGraph();
    state.audioEnabled = Boolean(enabled);
    if (masterGain) masterGain.gain.value = state.audioEnabled ? 1 : 0;
    const button = $('[data-audio]');
    button.setAttribute('aria-pressed', String(state.audioEnabled));
    button.textContent = state.audioEnabled ? 'Local cue on' : 'Local cue muted';
    if (state.audioEnabled && state.beatIndex !== null) {
      await cueBeat(data.beats[state.beatIndex]);
    }
    return window.__MV_V8_SNAPSHOT__();
  }

  function cameraTransform(beat) {
    return {
      scale: beat.cameraScale,
      translateXPercent: beat.cameraTranslateXPercent,
      translateYPercent: beat.cameraTranslateYPercent,
      originXPercent: beat.cameraOriginXPercent,
      originYPercent: beat.cameraOriginYPercent,
      lens: beat.cameraLens,
    };
  }

  async function setBeat(index, { cue = true } = {}) {
    if (!state.admitted) return window.__MV_V8_SNAPSHOT__();
    const beat = data.beats[index];
    if (!beat) throw new Error(`Unknown sequence beat ${index}`);
    const frame = $('#mv-v7-frame');
    const innerWindow = frame?.contentWindow;
    if (!innerWindow?.__MV_V7_SET_PHASE__) throw new Error('MV-V7 phase control unavailable');
    await innerWindow.__MV_V7_SET_PHASE__(beat.sealedClothPhaseSeconds);
    frame.style.transformOrigin =
      `${beat.cameraOriginXPercent}% ${beat.cameraOriginYPercent}%`;
    frame.style.transform =
      `translate(${beat.cameraTranslateXPercent}%,${beat.cameraTranslateYPercent}%)`
      + ` scale(${beat.cameraScale})`;
    document.documentElement.dataset.beat = beat.beatId;
    $('[data-eyebrow]').textContent = beat.eyebrow;
    $('[data-title]').textContent = beat.title;
    $('[data-copy]').textContent = beat.presenterCopy;
    $('[data-audio-description]').textContent = beat.audioDescription;
    $('[data-progress]').textContent = `${index + 1} / ${data.beats.length}`;
    document.querySelectorAll('[data-beat]').forEach((button) => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.beat) === index));
    });
    state.beatIndex = index;
    state.beatId = beat.beatId;
    state.camera = cameraTransform(beat);
    state.phase = beat.sealedClothPhaseSeconds;
    state.annotation = {
      eyebrow: beat.eyebrow,
      title: beat.title,
      presenterCopy: beat.presenterCopy,
      audioDescription: beat.audioDescription,
    };
    if (cue) await cueBeat(beat);
    return window.__MV_V8_SNAPSHOT__();
  }

  async function exactDigest() {
    const frame = $('#mv-v7-frame');
    const characterPixelDigest =
      await frame.contentWindow.__MV_V7_CHARACTER_PIXEL_DIGEST__();
    const exact = {
      beatId: state.beatId,
      beatIndex: state.beatIndex,
      camera: state.camera,
      phase: state.phase,
      annotation: state.annotation,
      characterPixelDigest,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(exact));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return {
      exact,
      sha256: [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, '0'))
        .join(''),
    };
  }

  window.__MV_V8_SET_BEAT__ = (index) => setBeat(Number(index));
  window.__MV_V8_REPLAY__ = async () => {
    const digests = [];
    for (let index = 0; index < data.beats.length; index += 1) {
      await setBeat(index, { cue: false });
      digests.push(await exactDigest());
    }
    return digests;
  };
  window.__MV_V8_SET_AUDIO__ = setAudio;
  window.__MV_V8_EXACT_DIGEST__ = exactDigest;
  window.__MV_V8_SNAPSHOT__ = () => JSON.parse(JSON.stringify({
    ...state,
    beatCount: data.beats.length,
    disclosure: data.disclosure,
    audioDefaultMuted: data.audioDefaultMuted,
    audioExternalAssets: false,
    audioHumanMixApproved: false,
    observerCompositePixelEqualityClaimed: false,
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollHeight: document.documentElement.scrollHeight,
    documentClientHeight: document.documentElement.clientHeight,
  }));

  document.querySelectorAll('[data-beat]').forEach((button) => {
    button.addEventListener('click', () => setBeat(Number(button.dataset.beat)));
  });
  $('[data-prev]').addEventListener('click', () =>
    setBeat(Math.max(0, (state.beatIndex ?? 0) - 1)));
  $('[data-next]').addEventListener('click', () =>
    setBeat(Math.min(data.beats.length - 1, (state.beatIndex ?? 0) + 1)));
  $('[data-replay]').addEventListener('click', () => setBeat(0));
  $('[data-audio]').addEventListener('click', () => setAudio(!state.audioEnabled));
  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') setBeat(Math.max(0, (state.beatIndex ?? 0) - 1));
    else if (event.key === 'ArrowRight') {
      setBeat(Math.min(data.beats.length - 1, (state.beatIndex ?? 0) + 1));
    } else if (event.key === 'Home') setBeat(0);
  });

  async function failNeutral(reason) {
    const frame = await mountMvV7(data.deniedProfile, null);
    const inner = frame.contentWindow.__MV_V7_SNAPSHOT__();
    if (
      inner.status !== 'fail-neutral'
      || inner.familyCount !== 0
      || inner.lineupFrameLoaded !== false
    ) {
      throw new Error('Neutral MV-V7 observer did not preserve the research boundary');
    }
    state.inner = inner;
    state.innerNamedRendererInstantiated = false;
    state.status = 'fail-neutral';
    state.admitted = false;
    state.reason = reason;
    state.ready = true;
    document.body.classList.add('fail-neutral');
    $('[data-admission]').textContent = 'NEUTRAL OBSERVER';
    $('[data-title]').textContent = 'Research view remains unnamed';
    $('[data-copy]').textContent =
      'This profile cannot instantiate the public family renderer or cinematic sequence.';
  }

  async function boot() {
    const params = new URLSearchParams(location.search);
    state.profile = params.get('profile');
    const suppliedSequence = params.get('sequence');
    const admission = admissionForProfile(state.profile);
    if (state.profile === data.deniedProfile) {
      await failNeutral('research_live_blinded preserves the neutral observer');
      return;
    }
    if (!admission || suppliedSequence !== admission.sha256) {
      await failNeutral('missing or invalid exact cinematic admission');
      return;
    }
    const mvV7Admission = mvV7AdmissionForProfile(state.profile);
    if (!mvV7Admission) throw new Error('Matching MV-V7 admission is missing');
    const frame = await mountMvV7(state.profile, mvV7Admission.sha256);
    const inner = frame.contentWindow.__MV_V7_SNAPSHOT__();
    if (
      inner.status !== 'pass'
      || inner.admitted !== true
      || inner.familyCount !== 6
      || inner.lineup?.gpu?.navigatorGpu !== true
      || inner.lineup?.gpu?.adapterAcquired !== true
      || inner.lineup?.gpu?.deviceCreated !== true
    ) {
      throw new Error('Admitted MV-V7 dual-renderer tableau failed');
    }
    state.inner = inner;
    state.innerNamedRendererInstantiated = true;
    state.canonicalFieldsAfter = inner.canonicalFieldsAfter;
    if (!sameJson(state.canonicalFieldsBefore, state.canonicalFieldsAfter)) {
      throw new Error('Cinematic wrapper changed observer canonical fields');
    }
    state.admitted = true;
    state.status = 'pass';
    $('[data-admission]').textContent =
      state.profile === data.postlockProfile
        ? 'POSTLOCK EXHIBIT ADMITTED'
        : 'PUBLIC STORY EXHIBIT';
    await setBeat(0, { cue: false });
    state.ready = true;
    document.body.classList.add('admitted');
  }

  boot().catch((error) => {
    state.status = 'error';
    state.ready = true;
    state.errors.push(error.stack || error.message);
    $('[data-title]').textContent = 'Sequence gate failed';
    $('[data-copy]').textContent = error.message;
    console.error(error);
  });
}

function buildSequenceHtml(data) {
  const beatButtons = data.beats
    .map((beat) =>
      `<button data-beat="${beat.beatIndex}" aria-pressed="${beat.beatIndex === 0}">`
      + `<span>0${beat.beatIndex + 1}</span>${beat.title}</button>`)
    .join('');
  return `<!doctype html>
<html lang="en" data-beat="the_commons_wakes">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Stormglass Commons: Proof in the Light · MV-V8</title>
<style>
:root{--ink:#e8f1f1;--mist:#8da5ad;--hearth:#e6ad67;--jade:#81ddbd;--night:#02060c;--line:rgba(150,191,201,.23);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:var(--night)}
*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#02060c}body{position:relative}
.stage{position:absolute;inset:0;overflow:hidden;background:#07111f}.stage iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#07111f;will-change:transform;transition:none}
.cinema-grade{position:absolute;inset:0;z-index:2;pointer-events:none;background:linear-gradient(90deg,rgba(1,4,8,.26),transparent 23% 76%,rgba(1,4,8,.28)),linear-gradient(180deg,rgba(1,4,8,.38),transparent 18% 70%,rgba(1,4,8,.62));box-shadow:inset 0 0 0 1px rgba(174,211,219,.08),inset 0 0 120px rgba(0,0,0,.22)}
.frame-line{position:absolute;z-index:4;left:32px;right:32px;top:28px;height:1px;background:linear-gradient(90deg,var(--hearth),rgba(230,173,103,.08) 28%,rgba(129,221,189,.08) 72%,var(--jade));opacity:.62}
.show-id{position:absolute;z-index:5;left:42px;top:39px;display:flex;align-items:center;gap:11px;color:#9fb4ba;font:700 9px/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.15em;text-transform:uppercase;text-shadow:0 2px 16px #000}.show-id:before{content:"";width:8px;height:8px;border:1px solid var(--hearth);transform:rotate(45deg);box-shadow:inset 0 0 0 2px rgba(2,6,12,.9)}
.admission{color:var(--jade)}
.sequence-nav{position:absolute;z-index:5;right:42px;top:38px;display:flex;gap:5px;padding:4px;border:1px solid rgba(150,191,201,.18);border-radius:3px;background:rgba(3,9,16,.72);backdrop-filter:blur(10px)}
.sequence-nav button,.transport button{appearance:none;border:0;border-radius:2px;background:transparent;color:#7f969e;padding:7px 10px;font:700 8px/1 ui-monospace,SFMono-Regular,Consolas,monospace;text-transform:uppercase;letter-spacing:.08em;cursor:pointer}.sequence-nav button span{margin-right:6px;color:#536b74}.sequence-nav button[aria-pressed="true"]{color:#f1cf9f;background:rgba(123,82,37,.24);box-shadow:inset 0 0 0 1px rgba(230,173,103,.3)}.sequence-nav button[aria-pressed="true"] span{color:var(--hearth)}
.presenter{position:absolute;z-index:5;left:50%;bottom:42px;width:min(760px,calc(100% - 80px));transform:translateX(-50%);padding:18px 20px 17px;border:1px solid rgba(150,191,201,.24);border-top-color:rgba(230,173,103,.54);border-radius:4px;background:linear-gradient(145deg,rgba(3,10,18,.94),rgba(9,23,34,.82));box-shadow:0 24px 80px rgba(0,0,0,.48),inset 0 1px rgba(255,255,255,.05);backdrop-filter:blur(18px)}
.presenter:before{content:"";position:absolute;left:20px;top:-1px;width:92px;height:1px;background:var(--hearth);box-shadow:0 0 18px rgba(230,173,103,.45)}
.eyebrow{color:#d8a767;font:700 9px/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.16em}.presenter h1{margin:8px 0 6px;color:#f0f5f4;font:400 clamp(28px,3vw,45px)/.95 Georgia,"Times New Roman",serif;letter-spacing:-.035em;text-shadow:0 3px 20px rgba(0,0,0,.44)}.presenter p{max-width:650px;margin:0;color:#a7b8bd;font-size:11px;line-height:1.5;letter-spacing:.008em}
.transport{position:absolute;right:18px;bottom:16px;display:flex;align-items:center;gap:2px}.transport button{padding:7px 8px;border:1px solid rgba(150,191,201,.14)}.transport button:hover{color:#e7c18e;border-color:rgba(230,173,103,.32)}.progress{min-width:44px;color:#718890;font:700 8px/1 ui-monospace,monospace;text-align:center}
.audio{position:absolute;z-index:5;left:42px;bottom:24px;border:1px solid rgba(150,191,201,.2);border-radius:3px;background:rgba(3,10,18,.82);color:#8ba1a8;padding:8px 10px;font:700 8px/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em;cursor:pointer}.audio[aria-pressed="true"]{color:#efc68d;border-color:rgba(230,173,103,.45)}
.disclosure{position:absolute;z-index:5;right:42px;bottom:26px;max-width:460px;color:#5f767e;font:600 7px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace;text-align:right;text-transform:uppercase;letter-spacing:.06em}
.sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
.fail-neutral .sequence-nav,.fail-neutral .transport,.fail-neutral .audio{display:none}.fail-neutral .presenter{border-top-color:rgba(201,127,102,.5)}.fail-neutral .eyebrow{color:#d1947d}
@media(max-width:600px){
  .frame-line,.show-id{display:none}.sequence-nav{left:13px;right:13px;top:158px;justify-content:stretch}.sequence-nav button{flex:1;padding:7px 4px;font-size:6px}.sequence-nav button span{margin-right:3px}
  .presenter{left:12px;right:12px;bottom:74px;width:auto;transform:none;padding:13px 14px 12px}.presenter h1{font-size:29px;margin:6px 0 5px}.presenter p{font-size:8px;line-height:1.42;padding-right:72px}.eyebrow{font-size:7px}.transport{right:9px;bottom:10px}.transport button{font-size:7px;padding:6px}.progress{min-width:34px;font-size:7px}
  .audio{left:14px;bottom:39px;padding:6px 8px;font-size:6px}.disclosure{left:14px;right:14px;bottom:8px;max-width:none;font-size:5px;text-align:center}.cinema-grade{background:linear-gradient(180deg,rgba(1,4,8,.27),transparent 24% 61%,rgba(1,4,8,.72))}
}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
</style>
</head>
<body>
  <main class="stage" data-stage aria-label="Stormglass cinematic observer sequence"></main>
  <div class="cinema-grade"></div>
  <div class="frame-line"></div>
  <div class="show-id"><span>Stormglass Commons</span><span class="admission" data-admission>VERIFYING</span></div>
  <nav class="sequence-nav" aria-label="Cinematic beats">${beatButtons}</nav>
  <article class="presenter" aria-live="polite">
    <div class="eyebrow" data-eyebrow>BEAT 01 / ARRIVAL</div>
    <h1 data-title>The Commons Wakes</h1>
    <p data-copy>Preparing the sealed observer tableau.</p>
    <div class="transport" aria-label="Playback controls">
      <button data-prev aria-label="Previous beat">←</button>
      <button data-replay aria-label="Replay from first beat">Replay</button>
      <span class="progress" data-progress>1 / 2</span>
      <button data-next aria-label="Next beat">→</button>
    </div>
  </article>
  <p class="sr-only" data-audio-description></p>
  <button class="audio" data-audio aria-pressed="false">Local cue muted</button>
  <p class="disclosure">${DISCLOSURE}</p>
  <script>(${browserApplication.toString()})(${safeInlineJson(data)});</script>
</body>
</html>`;
}

function buildContactSheetHtml({ title, subtitle, images, portrait = false }) {
  const cards = images.map((image, index) => `
    <figure>
      <img src="data:image/png;base64,${image.base64}" alt="${image.alt}">
      <figcaption><span>0${index + 1}</span>${image.label}</figcaption>
    </figure>`).join('');
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#030812;color:#e8f1f1;font-family:Inter,Arial,sans-serif}body{padding:${portrait ? '24px 32px' : '26px 42px'};background:radial-gradient(circle at 50% 16%,#102637 0,#06101b 42%,#02060c 100%)}header{height:${portrait ? '104px' : '102px'};display:flex;justify-content:space-between;align-items:flex-start;border-top:1px solid rgba(230,173,103,.58);padding-top:14px}h1{margin:0;font:400 ${portrait ? '34px' : '42px'}/1 Georgia,serif;letter-spacing:-.035em}p{max-width:${portrait ? '390px' : '570px'};margin:7px 0 0;color:#829aa2;font:700 ${portrait ? '8px' : '9px'}/1.4 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.1em}.seal{color:#82dcbc;font:700 9px/1 ui-monospace,monospace;letter-spacing:.13em}.grid{display:grid;grid-template-columns:repeat(2,1fr);align-items:start;gap:${portrait ? '20px' : '22px'}figure{margin:0;padding:8px;border:1px solid rgba(150,191,201,.2);background:rgba(4,12,21,.8);box-shadow:0 24px 70px rgba(0,0,0,.35)}img{display:block;width:100%;height:auto;aspect-ratio:${portrait ? '390/844' : '16/9'};object-fit:contain;background:#02060c}figcaption{display:block;margin-top:7px;padding:8px 10px;border:1px solid rgba(230,173,103,.28);background:rgba(2,8,14,.88);color:#e9c38f;font:700 9px/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.1em}figcaption span{margin-right:9px;color:#73909a}</style></head>
<body><header><div><h1>${title}</h1><p>${subtitle}</p></div><div class="seal">MV-V8 · EXACT SEALED CUTS</div></header><main class="grid">${cards}</main></body></html>`;
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

async function navigateSequence(client, url, timeoutMs = 120_000) {
  await client.send('Page.navigate', { url });
  await waitForExpression(client, 'window.__MV_V8__?.ready === true', timeoutMs);
  return evaluate(client, 'window.__MV_V8_SNAPSHOT__()');
}

async function navigateDocument(client, url, timeoutMs = 30_000) {
  await client.send('Page.navigate', { url });
  await waitForExpression(client, 'document.readyState === "complete"', timeoutMs);
}

async function runBrowserWitness({
  admissions,
  beats,
  browserPath,
  html,
  mvV7,
  outputDir,
  observerCanonicalFields,
}) {
  const requests = [];
  const routes = new Map([
    ['/', { body: html, type: 'text/html; charset=utf-8' }],
    ['/index.html', { body: html, type: 'text/html; charset=utf-8' }],
    ['/mv7/index.html', {
      body: fs.readFileSync(mvV7.integrationHtmlPath),
      type: contentType(mvV7.integrationHtmlPath),
    }],
    ['/lineup/index.html', {
      body: fs.readFileSync(mvV7.lineupHtmlPath),
      type: contentType(mvV7.lineupHtmlPath),
    }],
    ['/observer/model-village-render-witness.html', {
      body: fs.readFileSync(mvV7.observerHtmlPath),
      type: contentType(mvV7.observerHtmlPath),
    }],
    ['/observer/model-village-render-bundle.js', {
      body: fs.readFileSync(mvV7.observerBundlePath),
      type: contentType(mvV7.observerBundlePath),
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
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hololand-mv-v8-'));
  const debugPort = 21_000 + Math.floor(Math.random() * 20_000);
  const launchFlags = [
    '--headless=new',
    '--use-angle=d3d11',
    '--ignore-gpu-blocklist',
    '--enable-gpu',
    '--enable-unsafe-webgpu',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    '--window-size=1600,1000',
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
    const story = admissions.find(
      (admission) => admission.canonical.presentationProfile === PUBLIC_PROFILE
    );
    const postlock = admissions.find(
      (admission) => admission.canonical.presentationProfile === POSTLOCK_PROFILE
    );
    const storyUrl =
      `${origin}/index.html?profile=${encodeURIComponent(PUBLIC_PROFILE)}`
      + `&sequence=${encodeURIComponent(story.sha256)}`;
    const storyState = await navigateSequence(client, storyUrl);
    assert(
      storyState.status === 'pass' && storyState.admitted === true,
      `Story sequence failed: ${canonicalJson(storyState)}`
    );
    assert(storyState.beatCount === 2, 'Story sequence beat count drifted');
    assert(storyState.innerNamedRendererInstantiated === true, 'Story renderer was not mounted');
    assert(storyState.inner?.familyCount === 6, 'Story tableau lost family embodiments');
    assert(storyState.inner?.lineup?.gpu?.navigatorGpu === true, 'navigator.gpu missing');
    assert(storyState.inner?.lineup?.gpu?.adapterAcquired === true, 'GPUAdapter missing');
    assert(storyState.inner?.lineup?.gpu?.deviceCreated === true, 'GPUDevice missing');
    assert(
      equal(storyState.canonicalFieldsBefore, observerCanonicalFields),
      'Browser canonical fields before drifted'
    );
    assert(
      equal(storyState.canonicalFieldsBefore, storyState.canonicalFieldsAfter),
      'Cinematic wrapper changed canonical fields'
    );
    assert(storyState.audioEnabled === false, 'Audio did not default muted');
    assert(storyState.audioGraphConstructed === false, 'Audio graph auto-started');

    const desktopBeat0Path = path.join(outputDir, 'mv-v8-desktop-beat-01.png');
    const desktopBeat1Path = path.join(outputDir, 'mv-v8-desktop-beat-02.png');
    const portraitBeat0Path = path.join(outputDir, 'mv-v8-portrait-beat-01.png');
    const portraitBeat1Path = path.join(outputDir, 'mv-v8-portrait-beat-02.png');
    const desktopBeat0 = await captureScreenshot(client, desktopBeat0Path, 1600, 900);
    const exactBeat0 = await evaluate(client, 'window.__MV_V8_EXACT_DIGEST__()');
    await evaluate(client, 'window.__MV_V8_SET_BEAT__(1)');
    const beat1State = await evaluate(client, 'window.__MV_V8_SNAPSHOT__()');
    assert(beat1State.beatId === beats[1].beatId, 'Second cinematic beat did not apply');
    const desktopBeat1 = await captureScreenshot(client, desktopBeat1Path, 1600, 900);
    const exactBeat1 = await evaluate(client, 'window.__MV_V8_EXACT_DIGEST__()');
    const replay = await evaluate(client, 'window.__MV_V8_REPLAY__()');
    assert(replay.length === 2, 'Replay did not return two exact digests');
    assert(replay[0].sha256 === exactBeat0.sha256, 'Beat 0 exact replay drifted');
    assert(replay[1].sha256 === exactBeat1.sha256, 'Beat 1 exact replay drifted');

    const audioOn = await evaluate(client, 'window.__MV_V8_SET_AUDIO__(true)');
    assert(audioOn.audioEnabled === true, 'Local audio opt-in failed');
    assert(audioOn.audioGraphConstructed === true, 'Local audio graph was not constructed');
    assert(audioOn.audioOutputConnected === true, 'Local audio graph was not connected');
    assert(audioOn.audioExternalAssets === false, 'Local audio gained external assets');
    const audioOff = await evaluate(client, 'window.__MV_V8_SET_AUDIO__(false)');
    assert(audioOff.audioEnabled === false, 'Local audio mute failed');

    await evaluate(client, 'window.__MV_V8_SET_BEAT__(0)');
    const portraitBeat0 = await captureScreenshot(client, portraitBeat0Path, 390, 844);
    const portraitState0 = await evaluate(client, 'window.__MV_V8_SNAPSHOT__()');
    assert(
      portraitState0.documentScrollWidth <= portraitState0.documentClientWidth,
      'Portrait beat 0 has horizontal overflow'
    );
    await evaluate(client, 'window.__MV_V8_SET_BEAT__(1)');
    const portraitBeat1 = await captureScreenshot(client, portraitBeat1Path, 390, 844);
    const portraitState1 = await evaluate(client, 'window.__MV_V8_SNAPSHOT__()');
    assert(
      portraitState1.documentScrollWidth <= portraitState1.documentClientWidth,
      'Portrait beat 1 has horizontal overflow'
    );

    const desktopContactHtml = buildContactSheetHtml({
      title: 'Proof in the Light',
      subtitle:
        'Two HoloScript-owned cuts · sealed 0.6 s / 1.2 s cloth phases · reduced-motion replay',
      images: [
        {
          base64: fs.readFileSync(desktopBeat0Path).toString('base64'),
          alt: 'The Commons Wakes desktop cinematic beat',
          label: beats[0].title,
        },
        {
          base64: fs.readFileSync(desktopBeat1Path).toString('base64'),
          alt: 'Proof in the Light desktop cinematic beat',
          label: beats[1].title,
        },
      ],
    });
    routes.set('/desktop-contact.html', {
      body: desktopContactHtml,
      type: 'text/html; charset=utf-8',
    });
    await navigateDocument(client, `${origin}/desktop-contact.html`);
    const desktopContact = await captureScreenshot(
      client,
      path.join(outputDir, 'mv-v8-desktop-contact-sheet.png'),
      1600,
      600
    );

    const portraitContactHtml = buildContactSheetHtml({
      title: 'Portrait Sequence',
      subtitle: 'The same exact two cuts through the zero-install portrait doorway',
      portrait: true,
      images: [
        {
          base64: fs.readFileSync(portraitBeat0Path).toString('base64'),
          alt: 'The Commons Wakes portrait cinematic beat',
          label: beats[0].title,
        },
        {
          base64: fs.readFileSync(portraitBeat1Path).toString('base64'),
          alt: 'Proof in the Light portrait cinematic beat',
          label: beats[1].title,
        },
      ],
    });
    routes.set('/portrait-contact.html', {
      body: portraitContactHtml,
      type: 'text/html; charset=utf-8',
    });
    await navigateDocument(client, `${origin}/portrait-contact.html`);
    const portraitContact = await captureScreenshot(
      client,
      path.join(outputDir, 'mv-v8-portrait-contact-sheet.png'),
      900,
      920
    );

    const postlockState = await navigateSequence(
      client,
      `${origin}/index.html?profile=${encodeURIComponent(POSTLOCK_PROFILE)}`
      + `&sequence=${encodeURIComponent(postlock.sha256)}`
    );
    assert(
      postlockState.status === 'pass'
      && postlockState.admitted === true
      && postlockState.inner?.familyCount === 6,
      'Postlock cinematic sequence was not admitted'
    );
    assert(
      equal(postlockState.canonicalFieldsBefore, postlockState.canonicalFieldsAfter),
      'Postlock cinematic sequence changed canonical fields'
    );

    const missingAdmission = await navigateSequence(
      client,
      `${origin}/index.html?profile=${encodeURIComponent(PUBLIC_PROFILE)}`
    );
    assert(
      missingAdmission.status === 'fail-neutral'
      && missingAdmission.admitted === false
      && missingAdmission.innerNamedRendererInstantiated === false
      && missingAdmission.inner?.familyCount === 0
      && missingAdmission.inner?.lineupFrameLoaded === false,
      'Missing sequence admission did not fail neutral'
    );
    const deniedResearch = await navigateSequence(
      client,
      `${origin}/index.html?profile=${encodeURIComponent(DENIED_PROFILE)}`
    );
    assert(
      deniedResearch.status === 'fail-neutral'
      && deniedResearch.admitted === false
      && deniedResearch.innerNamedRendererInstantiated === false
      && deniedResearch.inner?.familyCount === 0
      && deniedResearch.inner?.visibleFamilyNames?.length === 0
      && deniedResearch.inner?.lineupFrameLoaded === false,
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
      story: storyState,
      postlock: postlockState,
      missingAdmission,
      deniedResearch,
      exactReplay: {
        beat0: exactBeat0,
        beat1: exactBeat1,
        replay,
        exact: replay[0].sha256 === exactBeat0.sha256
          && replay[1].sha256 === exactBeat1.sha256,
        boundary: 'camera_annotation_phase_and_character_pixels',
        observerCompositePixelEqualityClaimed: false,
      },
      audio: {
        defaultMuted: storyState.audioEnabled === false,
        graphConstructed: audioOn.audioGraphConstructed,
        outputConnected: audioOn.audioOutputConnected,
        contextStateObserved: audioOn.audioContextState,
        externalAssets: 0,
        audibleOutputVerified: false,
        humanMixApproved: false,
      },
      captures: {
        desktopBeat0,
        desktopBeat1,
        portraitBeat0,
        portraitBeat1,
        desktopContact,
        portraitContact,
      },
      portrait: {
        beat0HorizontalOverflow: false,
        beat1HorizontalOverflow: false,
      },
      networkRequests,
      externalNetworkRequests,
      consoleMessages,
      exceptions,
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
    bytes: fs.statSync(target).size,
    sha256: sha256(fs.readFileSync(target)),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(args.outputDir, { recursive: true });
  const core = await import(
    pathToFileURL(path.join(args.holoscriptRoot, 'packages/core/dist/index.js')).href
  );
  const sequenceText = read(SEQUENCE_REL);
  const manifestText = read(MANIFEST_REL);
  const sequenceParsed = core.parseHolo(sequenceText);
  const manifestParsed = core.parseHolo(manifestText);
  assert(
    sequenceParsed.success && sequenceParsed.errors.length === 0,
    `MV-V8 sequence source did not parse: ${canonicalJson(sequenceParsed.errors)}`
  );
  assert(
    manifestParsed.success && manifestParsed.errors.length === 0,
    `MV-V8 manifest source did not parse: ${canonicalJson(manifestParsed.errors)}`
  );
  const policy = validateObserverCinematicSequenceSource(sequenceParsed.ast);
  const mvV7 = prepareMvV7(args);
  const mvV7Admissions = mvV7.receipt.admissions;
  const observerCanonicalFields = mvV7.receipt.noFeedback.canonicalFieldsBefore;
  for (const key of PROTECTED_CANONICAL_FIELDS) {
    assert(
      typeof observerCanonicalFields?.[key] === 'string',
      `MV-V7 canonical field ${key} is missing`
    );
  }
  const observerCanonicalFieldsSha256 = sha256(canonicalJson(observerCanonicalFields));
  const sequenceSourceSha256 = sha256(sequenceText);
  const mvV7SourceSha256 = hashFile(MV_V7_SOURCE_REL);
  const admissions = mvV7Admissions.map((mvV7Admission) =>
    buildObserverCinematicAdmission({
      sequenceSourceSha256,
      sequenceContractSha256: policy.sequenceContractSha256,
      mvV7AdmissionSha256: mvV7Admission.sha256,
      observerCanonicalFieldsSha256,
      presentationProfile: mvV7Admission.presentationProfile,
    })
  );
  const html = buildSequenceHtml({
    admissions,
    audioDefaultMuted: true,
    beats: policy.beats,
    deniedProfile: DENIED_PROFILE,
    disclosure: DISCLOSURE,
    mvV7Admissions,
    observerCanonicalFields,
    postlockProfile: POSTLOCK_PROFILE,
  });
  const htmlPath = path.join(args.outputDir, 'model-village-observer-cinematic-sequence.html');
  fs.writeFileSync(htmlPath, html);
  const browser = args.skipBrowser
    ? null
    : await runBrowserWitness({
      admissions,
      beats: policy.beats,
      browserPath: resolveBrowser(args.browser),
      html,
      mvV7,
      outputDir: args.outputDir,
      observerCanonicalFields,
    });
  assert(
    !browser || browser.secureContext === true,
    'Cinematic witness did not run in a secure loopback context'
  );
  const appearanceBefore = mvV7.receipt.noFeedback.researchAppearanceBefore;
  const appearanceAfter = mvV7.receipt.noFeedback.researchAppearanceAfter;
  assert(
    appearanceBefore.sha256 === appearanceAfter.sha256,
    'Research appearance hash changed across the cinematic witness'
  );
  assert(
    hashFile(APPEARANCE_REL)
      === mvV7.receipt.noFeedback.guardedSourceHashesAfter[APPEARANCE_REL],
    'Appearance invariance source changed after MV-V7 witness'
  );
  const durable = browser
    ? (
      args.writeArtifacts
        ? {
          desktopContact: copyArtifact(
            path.join(args.outputDir, 'mv-v8-desktop-contact-sheet.png'),
            DESKTOP_CONTACT_REL
          ),
          portraitContact: copyArtifact(
            path.join(args.outputDir, 'mv-v8-portrait-contact-sheet.png'),
            PORTRAIT_CONTACT_REL
          ),
        }
        : {
          desktopContact: {
            path: DESKTOP_CONTACT_REL,
            bytes: fs.existsSync(path.join(REPO_ROOT, DESKTOP_CONTACT_REL))
              ? fs.statSync(path.join(REPO_ROOT, DESKTOP_CONTACT_REL)).size
              : 0,
            sha256: fs.existsSync(path.join(REPO_ROOT, DESKTOP_CONTACT_REL))
              ? hashFile(DESKTOP_CONTACT_REL)
              : null,
          },
          portraitContact: {
            path: PORTRAIT_CONTACT_REL,
            bytes: fs.existsSync(path.join(REPO_ROOT, PORTRAIT_CONTACT_REL))
              ? fs.statSync(path.join(REPO_ROOT, PORTRAIT_CONTACT_REL)).size
              : 0,
            sha256: fs.existsSync(path.join(REPO_ROOT, PORTRAIT_CONTACT_REL))
              ? hashFile(PORTRAIT_CONTACT_REL)
              : null,
          },
        }
    )
    : null;
  const renderedArtifactComparisons = browser
    ? {
      desktopContact: compareRenderedPngs({
        repoRoot: REPO_ROOT,
        durableRelativePath: DESKTOP_CONTACT_REL,
        capturedPath: browser.captures.desktopContact.path,
      }),
      portraitContact: compareRenderedPngs({
        repoRoot: REPO_ROOT,
        durableRelativePath: PORTRAIT_CONTACT_REL,
        capturedPath: browser.captures.portraitContact.path,
      }),
    }
    : null;
  if (browser) {
    assert(durable.desktopContact.sha256, `Missing durable ${DESKTOP_CONTACT_REL}`);
    assert(durable.portraitContact.sha256, `Missing durable ${PORTRAIT_CONTACT_REL}`);
    assert(
      renderedArtifactComparisons.desktopContact.acceptedGpuRasterTolerance,
      'Durable desktop contact sheet exceeds the sealed GPU raster tolerance'
    );
    assert(
      renderedArtifactComparisons.portraitContact.acceptedGpuRasterTolerance,
      'Durable portrait contact sheet exceeds the sealed GPU raster tolerance'
    );
  }
  const expectedManifest = browser ? {
    sequenceSourceSha256,
    sequenceContractSha256: policy.sequenceContractSha256,
    mvV7IntegrationSourceSha256: mvV7SourceSha256,
    observerCanonicalFieldsSha256,
    storyAdmissionSha256: admissions.find(
      (admission) => admission.canonical.presentationProfile === PUBLIC_PROFILE
    ).sha256,
    postlockAdmissionSha256: admissions.find(
      (admission) => admission.canonical.presentationProfile === POSTLOCK_PROFILE
    ).sha256,
    sequenceHtmlSha256: sha256(html),
    desktopContactSheetSha256: durable.desktopContact.sha256,
    portraitContactSheetSha256: durable.portraitContact.sha256,
  } : {};
  const manifest = validateManifestSource(
    manifestParsed.ast,
    expectedManifest,
    { requireAnchors: !args.skipManifest && Boolean(browser) }
  );
  const receipt = {
    schema: 'hololand.model-village.observer-cinematic-sequence-witness.v1',
    status: 'PASS',
    generatedAt: new Date().toISOString(),
    milestone: 'MV-V8',
    source: {
      path: SEQUENCE_REL,
      sha256: sequenceSourceSha256,
      parser: 'HoloCompositionParser',
      parseErrors: sequenceParsed.errors.length,
      sourceSovereign: true,
    },
    sequence: {
      title: sequenceParsed.ast.metadata.title,
      format: sequenceParsed.ast.metadata.format,
      beatCount: policy.beats.length,
      durationMs: policy.state.sequenceDurationMs,
      beats: policy.beats,
      contractSha256: policy.sequenceContractSha256,
      autoplayDefault: false,
      reducedMotionDefault: true,
    },
    admissions: admissions.map((admission) => ({
      presentationProfile: admission.canonical.presentationProfile,
      sha256: admission.sha256,
      canonical: admission.canonical,
    })),
    inheritedMvV7: {
      status: mvV7.receipt.status,
      sourceSha256: mvV7SourceSha256,
      admissions: mvV7Admissions,
      browserGpu:
        mvV7.receipt.browser?.admitted?.lineup?.gpu
        ?? browser?.story?.inner?.lineup?.gpu
        ?? null,
      observerWebgl2: mvV7.receipt.observer?.assertions?.actualWebgl2Context ?? true,
    },
    browser: browser ?? { skipped: true },
    accessibility: browser ? {
      reducedMotionDefault: true,
      continuousCameraMotion: false,
      captionsAlwaysVisible: true,
      audioDescriptionTextAvailable: true,
      keyboardControls: ['ArrowLeft', 'ArrowRight', 'Home'],
      portraitHorizontalOverflow: false,
      disclosureAlwaysVisible: true,
    } : { skipped: true },
    noFeedback: {
      canonicalFieldsBefore: observerCanonicalFields,
      canonicalFieldsAfter: browser?.story.canonicalFieldsAfter ?? observerCanonicalFields,
      canonicalFieldsEqual:
        !browser || equal(observerCanonicalFields, browser.story.canonicalFieldsAfter),
      executedScheduleHashUnchanged:
        !browser
        || observerCanonicalFields.executedScheduleHash
          === browser.story.canonicalFieldsAfter.executedScheduleHash,
      residentObservationHashUnchanged:
        !browser
        || observerCanonicalFields.residentObservationHash
          === browser.story.canonicalFieldsAfter.residentObservationHash,
      researchAppearanceBefore: appearanceBefore,
      researchAppearanceAfter: appearanceAfter,
      researchAppearanceHashUnchanged: appearanceBefore.sha256 === appearanceAfter.sha256,
      browserWriteSurface: 'none',
      residentCanObservePresentation: false,
      presentationCanAffectOutcome: false,
    },
    browserHtml: {
      path: path.relative(REPO_ROOT, htmlPath).replaceAll('\\', '/'),
      sha256: sha256(html),
      bytes: Buffer.byteLength(html),
      externalVisualAssets: 0,
      externalAudioAssets: 0,
    },
    durable,
    renderedArtifactComparisons,
    manifest,
    claimBoundary: {
      proved:
        'Two HoloScript-owned discrete camera, annotation, and sealed cloth-phase beats replay exactly at the exhibit-state and character-pixel boundary over the admitted MV-V7 dual renderer, in desktop and portrait browser captures, with a muted-by-default local procedural audio graph, accessibility controls, research fail-neutral behavior, zero external fetches, and no canonical, schedule, observation, or research-appearance feedback.',
      notProved: [
        'the MV-S1 52-second six-beat observer show',
        'audible output or a human-approved audio mix',
        'spatial audio, adaptive music, voice, or TTS',
        'continuous camera animation or whole observer composite pixel equality',
        'permission to reveal family identity during live blinded research',
        'provider affiliation, endorsement, or exact model revision',
        'postlock research identity joins',
        'photorealism or published real-time performance',
        'WebXR or headset performance',
      ],
    },
  };
  fs.writeFileSync(
    path.join(args.outputDir, 'observer-cinematic-sequence-witness.json'),
    `${JSON.stringify(receipt, null, 2)}\n`
  );
  if (args.json) console.log(JSON.stringify(receipt, null, 2));
  else {
    console.log(
      `PASS MV-V8 observer cinematic sequence: ${policy.beats.length} exact sealed beats, `
      + `${browser ? 'desktop + portrait WebGPU/WebGL2 witness' : 'browser skipped'}, `
      + `${browser?.externalNetworkRequests.length ?? 0} external fetches`
    );
    console.log(
      `Receipt: ${path.join(args.outputDir, 'observer-cinematic-sequence-witness.json')}`
    );
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`FAIL MV-V8 observer cinematic sequence: ${error.stack || error.message}`);
      process.exit(1);
    });
}
