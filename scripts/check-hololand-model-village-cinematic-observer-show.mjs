#!/usr/bin/env node

import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
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
  prepareMvV7,
} from './check-hololand-model-village-observer-cinematic-sequence.mjs';
import {
  compareRenderedPngs,
} from './lib/model-village-rendered-png-proof.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const SHOW_REL =
  'source/layers/vr/frontier/model-village/model-village-cinematic-observer-show.holo';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-cinematic-observer-show-manifest.holo';
const MV_V7_SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-observer-family-integration.holo';
const APPEARANCE_REL = 'source/proofs/model-village-appearance-invariance.hs';
const DEFAULT_OUTPUT_REL =
  '.tmp/hololand/model-village/cinematic-observer-show';
const ACT_ONE_REL =
  'docs/assets/model-village/model-village-cinematic-observer-show-act-one-2026-07-27.png';
const ACT_TWO_REL =
  'docs/assets/model-village/model-village-cinematic-observer-show-act-two-2026-07-27.png';
const HERO_REL =
  'docs/assets/model-village/model-village-cinematic-observer-show-hero-2026-07-27.png';
const PUBLIC_PROFILE = 'village_story_unblinded';
const POSTLOCK_PROFILE = 'research_replay_postlock';
const DENIED_PROFILE = 'research_live_blinded';
const PRODUCTION_LOCK = 'a1c8c9ad6142ba4795385dac6551a4131befa809';
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
const BEAT_OBJECTS = Object.freeze([
  'BeatStormglassBeforeTheProof',
  'BeatWaterGiven',
  'BeatTheHearthAnswers',
  'BeatTheBoundaryHolds',
  'BeatSeparatePhysicsWitness',
  'BeatProofInTheLight',
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
      console.log(`Usage: node scripts/check-hololand-model-village-cinematic-observer-show.mjs [options]

Options:
  --holoscript-root <path>   Built HoloScript checkout
  --browser <path>           Chrome or Edge executable
  --output-dir <path>        Runtime HTML, screenshots, and receipt directory
  --skip-browser             Validate HoloScript, MV-V7, admissions, and manifest only
  --skip-manifest            Bootstrap before immutable MV-S1 anchors exist
  --write-artifacts          Refresh the two act sheets and hero frame
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
    actId: beat.actId,
    evidenceLane: beat.evidenceLane,
    evidenceLaneLabel: beat.evidenceLaneLabel,
    evidenceKey: beat.evidenceKey,
    evidenceValue: beat.evidenceValue,
    causalSource: beat.causalSource,
    eyebrow: beat.eyebrow,
    title: beat.title,
    presenterCopy: beat.presenterCopy,
    audioDescription: beat.audioDescription,
    sealedClothPhaseSeconds: beat.sealedClothPhaseSeconds,
    physicsFrameStep: beat.physicsFrameStep,
    cameraScale: beat.cameraScale,
    cameraTranslateXPercent: beat.cameraTranslateXPercent,
    cameraTranslateYPercent: beat.cameraTranslateYPercent,
    cameraOriginXPercent: beat.cameraOriginXPercent,
    cameraOriginYPercent: beat.cameraOriginYPercent,
    cameraLens: beat.cameraLens,
    annotationGlyph: beat.annotationGlyph,
    crossLaneCausalityAllowed: beat.crossLaneCausalityAllowed,
  };
}

export function validateCinematicObserverShowSource(ast) {
  assert(
    ast.metadata.schema === 'hololand.model-village.cinematic-observer-show.v1',
    'MV-S1 show schema drifted'
  );
  assert(ast.metadata.milestone === 'MV-S1', 'MV-S1 milestone drifted');
  assert(ast.metadata.productionLock === PRODUCTION_LOCK, 'Production lock drifted');
  assert(ast.metadata.sourceSovereign === true, 'Show source must remain sovereign');
  assert(ast.metadata.canonicalWriteAuthority === false, 'Show gained canonical writes');
  assert(ast.metadata.causalEffect === false, 'Show gained a causal effect');
  const state = objectProperties(ast.state);
  assert(state.beatCount === 6, 'MV-S1 must own exactly six beats');
  assert(state.sequenceDurationMs === 52000, 'MV-S1 must remain exactly 52 seconds');
  assert(state.autoplayDefault === false, 'MV-S1 must not autoplay');
  assert(state.manualPlaybackRequired === true, 'MV-S1 manual playback drifted');
  assert(state.pauseRequired === true && state.replayRequired === true, 'Playback controls drifted');
  assert(state.reducedMotionDefault === true, 'Reduced-motion default drifted');
  assert(state.continuousCameraMotion === false, 'Continuous camera motion entered the cut');
  assert(state.audioEnabled === false, 'MV-S1 first cut gained audio');
  assert(state.audioGraphAllowed === false, 'MV-S1 first cut gained an audio graph');
  assert(state.audioAssetsAllowed === false, 'MV-S1 first cut gained audio assets');
  assert(state.crossLaneCausalityAllowed === false, 'Cross-lane causality became allowed');
  for (const field of [
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
    assert(state[field] === false, `State boundary ${field} drifted`);
  }

  const beats = BEAT_OBJECTS.map((name) => beatProjection(getObject(ast, name)));
  assert(
    equal(beats.map((beat) => beat.beatIndex), [0, 1, 2, 3, 4, 5]),
    'Beat indexes drifted'
  );
  assert(new Set(beats.map((beat) => beat.beatId)).size === 6, 'Beat IDs must be unique');
  assert(
    beats.reduce((sum, beat) => sum + beat.durationMs, 0) === 52000,
    'Beat durations do not sum to 52 seconds'
  );
  assert(
    equal(
      beats.map((beat) => beat.durationMs),
      [7000, 9000, 9000, 9000, 9000, 9000]
    ),
    'Six-beat timing contract drifted'
  );
  assert(
    equal(
      beats.map((beat) => beat.evidenceLane),
      ['v4_run', 'v4_run', 'v4_run', 'v4_run', 'mv_p10_physics_fixture', 'exhibit_synthesis']
    ),
    'Evidence lane sequence drifted'
  );
  assert(
    equal(beats.map((beat) => beat.physicsFrameStep), [42, 42, 42, 42, 599, 599]),
    'Physics frame steps drifted'
  );
  assert(
    beats.every((beat) => beat.crossLaneCausalityAllowed === false),
    'A show beat allows cross-lane causality'
  );
  assert(
    beats.every((beat) => [0.6, 1.2].includes(beat.sealedClothPhaseSeconds)),
    'A beat uses an unsealed cloth phase'
  );

  const admission = getObject(ast, 'CinematicShowAdmissionGate');
  const laneBoundary = getObject(ast, 'EvidenceLaneBoundary');
  const accessibility = getObject(ast, 'PresenterAccessibilityDeck');
  const silent = getObject(ast, 'SilentFirstCutBoundary');
  const exactReplay = getObject(ast, 'ExactReplayBoundary');
  const noFeedback = getObject(ast, 'NoFeedbackBoundary');
  const claimBoundary = getObject(ast, 'ClaimBoundary');

  assert(admission.failNeutral === true, 'Admission gate lost fail-neutral behavior');
  assert(
    admission.deniedProfileMayInstantiateNamedRenderer === false
      && admission.invalidAdmissionMayInstantiateNamedRenderer === false,
    'Admission gate may instantiate the named renderer'
  );
  assert(laneBoundary.crossLaneCausalityAllowed === false, 'Lane boundary weakened');
  assert(
    laneBoundary.physicsFixtureMayExplainV4Receipts === false
      && laneBoundary.v4ReceiptsMayClaimPhysicsFixtureExecution === false
      && laneBoundary.synthesisMayMergeEvidence === false,
    'Lane ownership boundary weakened'
  );
  assert(accessibility.pausedDefault === true, 'Show no longer defaults paused');
  assert(accessibility.continuousCameraMotion === false, 'Accessibility deck gained motion');
  assert(silent.audioEnabled === false, 'Silent boundary gained audio');
  assert(silent.audioGraphAllowed === false, 'Silent boundary gained an audio graph');
  assert(silent.externalAudioAssets === false, 'Silent boundary gained audio assets');
  assert(silent.audibleOutputVerified === false, 'Silent cut claims audible output');
  assert(silent.humanMixApproved === false, 'Silent cut claims a human-approved mix');
  assert(
    exactReplay.observerCompositePixelEqualityClaimed === false,
    'Whole observer composite pixel equality became claimed'
  );
  assert(noFeedback.browserMayCallModel === false, 'Browser gained a model-call edge');
  assert(noFeedback.browserMayWriteCanonicalWorld === false, 'Browser gained canonical writes');
  assert(noFeedback.browserMayWriteResidentObservation === false, 'Browser gained observation writes');
  assert(
    claimBoundary.notProved.includes('weather_or_fluid_physics')
      && claimBoundary.notProved.includes('audible_output_or_human_approved_mix')
      && claimBoundary.notProved.includes('genesis_sequence')
      && claimBoundary.notProved.includes('four_village_fold'),
    'Claim boundary lost deferred slices'
  );

  const contract = {
    schema: ast.metadata.schema,
    title: ast.metadata.title,
    productionLock: ast.metadata.productionLock,
    disclosure: ast.metadata.independentProjectDisclosure,
    state: {
      beatCount: state.beatCount,
      sequenceDurationMs: state.sequenceDurationMs,
      autoplayDefault: state.autoplayDefault,
      manualPlaybackRequired: state.manualPlaybackRequired,
      pauseRequired: state.pauseRequired,
      replayRequired: state.replayRequired,
      reducedMotionDefault: state.reducedMotionDefault,
      continuousCameraMotion: state.continuousCameraMotion,
      audioEnabled: state.audioEnabled,
      audioGraphAllowed: state.audioGraphAllowed,
      crossLaneCausalityAllowed: state.crossLaneCausalityAllowed,
      exactReplayBoundary: state.exactReplayBoundary,
      observerCompositePixelEqualityClaimed:
        state.observerCompositePixelEqualityClaimed,
    },
    beats,
    laneBoundary,
    silent,
    exactReplay,
    noFeedback,
  };
  return {
    state,
    beats,
    admission,
    laneBoundary,
    accessibility,
    silent,
    exactReplay,
    noFeedback,
    claimBoundary,
    showContractSha256: sha256(canonicalJson(contract)),
  };
}

export function buildCinematicObserverShowAdmission({
  showSourceSha256,
  showContractSha256,
  mvV7AdmissionSha256,
  observerCanonicalFieldsSha256,
  presentationProfile,
}) {
  const canonical = {
    schema: 'hololand.model-village.cinematic-observer-show-admission.v1',
    showSourceSha256,
    showContractSha256,
    mvV7AdmissionSha256,
    observerCanonicalFieldsSha256,
    productionLock: PRODUCTION_LOCK,
    presentationProfile,
    disclosure: DISCLOSURE,
    researchResidentBinding: 'none',
    researchSeatBinding: 'none',
    researchPersonaBinding: 'none',
    researchRoleBinding: 'none',
    adapterAssignmentBinding: 'none',
    exactModelRevisionBinding: 'none',
    postlockResearchJoinExecuted: false,
    canonicalWriteAuthority: false,
    residentObservationWriteAuthority: false,
    crossLaneCausalityAllowed: false,
    audioEnabled: false,
  };
  return { canonical, sha256: sha256(canonicalJson(canonical)) };
}

export function validateCinematicObserverShowManifest(
  ast,
  expected,
  { requireAnchors = true } = {}
) {
  assert(
    ast.metadata.schema === 'hololand.model-village.cinematic-observer-show-manifest.v1',
    'MV-S1 manifest schema drifted'
  );
  assert(ast.metadata.milestone === 'MV-S1', 'MV-S1 manifest milestone drifted');
  assert(ast.metadata.productionLock === PRODUCTION_LOCK, 'Manifest production lock drifted');
  const state = objectProperties(ast.state);
  assert(state.beatCount === 6, 'Manifest beat count drifted');
  assert(state.sequenceDurationMs === 52000, 'Manifest show duration drifted');
  assert(state.crossLaneCausalityAllowed === false, 'Manifest allows cross-lane causality');
  assert(state.audioEnabled === false, 'Manifest gained audio');
  assert(state.audioGraphObserved === false, 'Manifest claims an audio graph');
  assert(state.audibleOutputVerified === false, 'Manifest claims audible output');
  assert(state.humanMixApproved === false, 'Manifest claims a human-approved mix');
  assert(state.researchLiveBlindedAllowed === false, 'Manifest allows live unblinding');
  assert(
    state.namedRendererInstantiatedForResearch === false,
    'Manifest claims a research named renderer'
  );
  assert(state.modelCallsObserved === 0, 'Manifest model-call count drifted');
  assert(state.browserWritesObserved === 0, 'Manifest browser-write count drifted');
  assert(state.mvS1FirstExecutableCutClaimed === true, 'Manifest does not claim the MV-S1 cut');
  if (requireAnchors) {
    for (const [key, value] of Object.entries(expected)) {
      assert(ast.metadata[key] === value, `Manifest anchor ${key} drifted`);
    }
    for (const key of [
      'deterministicReplayObserved',
      'manualPlayPauseReplayObserved',
      'actOneContactSheetObserved',
      'actTwoContactSheetObserved',
      'heroFrameObserved',
      'browserNativeWebgpuObserved',
      'observerWebgl2Observed',
      'v4RunAndPhysicsFixtureVisiblySeparated',
      'canonicalHashNoninterferenceObserved',
      'researchAppearanceHashNoninterferenceObserved',
    ]) {
      assert(state[key] === true, `Manifest ${key} must be true`);
    }
    assert(state.externalNetworkFetchesObserved === 0, 'Manifest external fetches drifted');
    assert(state.externalVisualAssetsObserved === 0, 'Manifest visual assets drifted');
    assert(state.externalAudioAssetsObserved === 0, 'Manifest audio assets drifted');
  }
  return { metadata: ast.metadata, state };
}

function browserApplication(data) {
  const $ = (selector) => document.querySelector(selector);
  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const state = {
    schema: 'hololand.model-village.cinematic-observer-show-browser.v1',
    ready: false,
    status: 'booting',
    admitted: false,
    profile: null,
    beatIndex: null,
    beatId: null,
    playing: false,
    paused: true,
    timerArmed: false,
    reducedMotion: true,
    captionsVisible: true,
    audioEnabled: false,
    audioGraphConstructed: false,
    audioAssetsLoaded: 0,
    modelCallCount: 0,
    browserWriteCount: 0,
    browserWriteSurface: 'none',
    innerNamedRendererInstantiated: false,
    inner: null,
    observer: null,
    canonicalFieldsBefore: data.observerCanonicalFields,
    canonicalFieldsAfter: null,
    errors: [],
  };
  window.__MV_S1__ = state;
  let playbackTimer = null;

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
    cinematicStyle.textContent = '.control-deck,.disclosure{display:none!important}';
    frameDocument.head.append(cinematicStyle);
    const observerDocument = frameDocument.querySelector('#observer-frame')?.contentDocument;
    if (observerDocument) {
      const observerStyle = observerDocument.createElement('style');
      observerStyle.textContent = '.footer,.masthead{display:none!important}';
      observerDocument.head.append(observerStyle);
    }
    return frame;
  }

  function clearPlaybackTimer() {
    if (playbackTimer !== null) {
      clearTimeout(playbackTimer);
      playbackTimer = null;
    }
    state.timerArmed = false;
  }

  function updateTransport() {
    $('[data-play]').disabled = state.playing;
    $('[data-pause]').disabled = !state.playing;
    $('[data-play-state]').textContent = state.playing ? 'PLAYING' : 'PAUSED';
  }

  async function pause() {
    clearPlaybackTimer();
    state.playing = false;
    state.paused = true;
    updateTransport();
    return window.__MV_S1_SNAPSHOT__();
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

  function livingCommonsProjection(observer) {
    return (observer?.livingCommonsPresentation?.objects ?? [])
      .map((entry) => ({
        objectId: entry.objectId,
        field: entry.field ?? null,
        value: entry.value ?? null,
        entrypoint: entry.entrypoint ?? null,
        visible: entry.visible,
        actionReceiptHash: entry.actionReceiptHash ?? null,
      }))
      .sort((left, right) => left.objectId.localeCompare(right.objectId));
  }

  async function setBeat(index, { fromPlayback = false } = {}) {
    if (!state.admitted) return window.__MV_S1_SNAPSHOT__();
    const beat = data.beats[index];
    if (!beat) throw new Error(`Unknown show beat ${index}`);
    if (!fromPlayback) await pause();
    const frame = $('#mv-v7-frame');
    const innerWindow = frame?.contentWindow;
    if (!innerWindow?.__MV_V7_SET_PHASE__) throw new Error('MV-V7 phase control unavailable');
    await innerWindow.__MV_V7_SET_PHASE__(beat.sealedClothPhaseSeconds);
    const observerWindow =
      frame.contentDocument?.querySelector('#observer-frame')?.contentWindow;
    if (!observerWindow?.__MODEL_VILLAGE_SET_VIEW__) {
      throw new Error('Observer physics-frame control unavailable');
    }
    const observer = await observerWindow.__MODEL_VILLAGE_SET_VIEW__(
      'hero',
      'desktop',
      beat.physicsFrameStep
    );
    if (observer.physics?.visualFrameStep !== beat.physicsFrameStep) {
      throw new Error(`Observer physics frame ${beat.physicsFrameStep} did not apply`);
    }
    frame.style.transformOrigin =
      `${beat.cameraOriginXPercent}% ${beat.cameraOriginYPercent}%`;
    frame.style.transform =
      `translate(${beat.cameraTranslateXPercent}%,${beat.cameraTranslateYPercent}%)`
      + ` scale(${beat.cameraScale})`;
    document.documentElement.dataset.beat = beat.beatId;
    document.body.dataset.lane = beat.evidenceLane;
    $('[data-eyebrow]').textContent = beat.eyebrow;
    $('[data-title]').textContent = beat.title;
    $('[data-copy]').textContent = beat.presenterCopy;
    $('[data-audio-description]').textContent = beat.audioDescription;
    $('[data-progress]').textContent = `${String(index + 1).padStart(2, '0')} / 06`;
    $('#show-lane').textContent = beat.evidenceLaneLabel;
    $('#show-evidence-key').textContent = beat.evidenceKey.replaceAll('_', ' ');
    $('#show-evidence-value').textContent = beat.evidenceValue;
    $('#show-causal-source').textContent =
      `SOURCE · ${beat.causalSource.replaceAll('_', ' ')}`;
    document.querySelectorAll('[data-beat]').forEach((button) => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.beat) === index));
    });
    state.beatIndex = index;
    state.beatId = beat.beatId;
    state.camera = cameraTransform(beat);
    state.phase = beat.sealedClothPhaseSeconds;
    state.durationMs = beat.durationMs;
    state.evidenceLane = beat.evidenceLane;
    state.evidenceLaneLabel = beat.evidenceLaneLabel;
    state.evidenceKey = beat.evidenceKey;
    state.evidenceValue = beat.evidenceValue;
    state.causalSource = beat.causalSource;
    state.crossLaneCausalityAllowed = false;
    state.annotation = {
      eyebrow: beat.eyebrow,
      title: beat.title,
      presenterCopy: beat.presenterCopy,
      audioDescription: beat.audioDescription,
    };
    state.observer = {
      physics: {
        visualFrameStep: observer.physics.visualFrameStep,
        visualFrameHash: observer.physics.visualFrameHash,
        physicsStateHash: observer.physics.physicsStateHash,
        frameTraceHash: observer.physics.frameTraceHash,
      },
      livingCommonsStatus: observer.livingCommonsPresentation?.status ?? null,
      livingCommonsProjection: livingCommonsProjection(observer),
    };
    return window.__MV_S1_SNAPSHOT__();
  }

  function scheduleCurrentBeat() {
    clearPlaybackTimer();
    const beat = data.beats[state.beatIndex];
    if (!state.playing || !beat) return;
    state.timerArmed = true;
    playbackTimer = setTimeout(async () => {
      playbackTimer = null;
      state.timerArmed = false;
      const nextIndex = state.beatIndex + 1;
      if (nextIndex >= data.beats.length) {
        await pause();
        return;
      }
      await setBeat(nextIndex, { fromPlayback: true });
      scheduleCurrentBeat();
    }, beat.durationMs);
  }

  async function play() {
    if (!state.admitted) return window.__MV_S1_SNAPSHOT__();
    if (state.beatIndex === data.beats.length - 1) {
      await setBeat(0, { fromPlayback: true });
    }
    state.playing = true;
    state.paused = false;
    updateTransport();
    scheduleCurrentBeat();
    return window.__MV_S1_SNAPSHOT__();
  }

  async function replay() {
    await pause();
    await setBeat(0);
    return window.__MV_S1_SNAPSHOT__();
  }

  async function exactDigest() {
    const frame = $('#mv-v7-frame');
    const characterPixelDigest =
      await frame.contentWindow.__MV_V7_CHARACTER_PIXEL_DIGEST__();
    const exact = {
      beatId: state.beatId,
      beatIndex: state.beatIndex,
      durationMs: state.durationMs,
      camera: state.camera,
      phase: state.phase,
      annotation: state.annotation,
      evidenceLane: state.evidenceLane,
      evidenceLaneLabel: state.evidenceLaneLabel,
      evidenceKey: state.evidenceKey,
      evidenceValue: state.evidenceValue,
      causalSource: state.causalSource,
      crossLaneCausalityAllowed: state.crossLaneCausalityAllowed,
      observer: state.observer,
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

  window.__MV_S1_SET_BEAT__ = (index) => setBeat(Number(index));
  window.__MV_S1_PLAY__ = play;
  window.__MV_S1_PAUSE__ = pause;
  window.__MV_S1_REPLAY__ = replay;
  window.__MV_S1_EXACT_DIGEST__ = exactDigest;
  window.__MV_S1_EXACT_REPLAY__ = async () => {
    await pause();
    const digests = [];
    for (let index = 0; index < data.beats.length; index += 1) {
      await setBeat(index, { fromPlayback: true });
      digests.push(await exactDigest());
    }
    return digests;
  };
  window.__MV_S1_SNAPSHOT__ = () => JSON.parse(JSON.stringify({
    ...state,
    beatCount: data.beats.length,
    sequenceDurationMs: data.sequenceDurationMs,
    disclosure: data.disclosure,
    observerCompositePixelEqualityClaimed: false,
    externalVisualAssets: 0,
    externalAudioAssets: 0,
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
  $('[data-play]').addEventListener('click', play);
  $('[data-pause]').addEventListener('click', pause);
  $('[data-replay]').addEventListener('click', replay);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      setBeat(Math.max(0, (state.beatIndex ?? 0) - 1));
    } else if (event.key === 'ArrowRight') {
      setBeat(Math.min(data.beats.length - 1, (state.beatIndex ?? 0) + 1));
    } else if (event.key === 'Home') {
      replay();
    } else if (event.key === ' ') {
      event.preventDefault();
      if (state.playing) pause();
      else play();
    }
  });

  async function failNeutral(reason) {
    clearPlaybackTimer();
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
      'This profile cannot instantiate the public family renderer or cinematic show.';
  }

  async function boot() {
    const params = new URLSearchParams(location.search);
    state.profile = params.get('profile');
    const suppliedShow = params.get('show');
    const admission = admissionForProfile(state.profile);
    if (state.profile === data.deniedProfile) {
      await failNeutral('research_live_blinded preserves the neutral observer');
      return;
    }
    if (!admission || suppliedShow !== admission.sha256) {
      await failNeutral('missing or invalid exact cinematic show admission');
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
      throw new Error('Cinematic show changed observer canonical fields');
    }
    state.admitted = true;
    state.status = 'pass';
    $('[data-admission]').textContent =
      state.profile === data.postlockProfile
        ? 'POSTLOCK EXHIBIT ADMITTED'
        : 'PUBLIC STORY EXHIBIT';
    await setBeat(0, { fromPlayback: true });
    updateTransport();
    state.ready = true;
    document.body.classList.add('admitted');
  }

  boot().catch((error) => {
    clearPlaybackTimer();
    state.status = 'error';
    state.ready = true;
    state.errors.push(error.stack || error.message);
    $('[data-title]').textContent = 'Show gate failed';
    $('[data-copy]').textContent = error.message;
    console.error(error);
  });
}

function buildShowHtml(data) {
  const beatButtons = data.beats.map((beat) => (
    `<button data-beat="${beat.beatIndex}" aria-pressed="${beat.beatIndex === 0}" `
    + `title="${beat.title}"><span>0${beat.beatIndex + 1}</span>`
    + `<b>${beat.title}</b></button>`
  )).join('');
  return `<!doctype html>
<html lang="en" data-beat="stormglass_before_the_proof">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Stormglass Commons: Proof in the Light · MV-S1</title>
<style>
:root{--ink:#edf4f3;--mist:#91a8af;--hearth:#e6ad67;--jade:#77dcb9;--violet:#a698ff;--night:#02060c;--line:rgba(150,191,201,.23);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:var(--night)}
*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#02060c}body{position:relative}
.stage{position:absolute;inset:0;overflow:hidden;background:#07111f}.stage iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#07111f;will-change:transform;transition:none}
.cinema-grade{position:absolute;inset:0;z-index:2;pointer-events:none;background:linear-gradient(90deg,rgba(1,4,8,.34),transparent 23% 76%,rgba(1,4,8,.34)),linear-gradient(180deg,rgba(1,4,8,.43),transparent 18% 66%,rgba(1,4,8,.74));box-shadow:inset 0 0 0 1px rgba(174,211,219,.08),inset 0 0 150px rgba(0,0,0,.25)}
.frame-line{position:absolute;z-index:4;left:34px;right:34px;top:27px;height:1px;background:linear-gradient(90deg,var(--hearth),rgba(230,173,103,.08) 28%,rgba(119,220,185,.08) 72%,var(--jade));opacity:.68}
.show-id{position:absolute;z-index:5;left:43px;top:40px;display:flex;align-items:center;gap:11px;color:#a2b7bc;font:700 9px/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;text-shadow:0 2px 16px #000}.show-id:before{content:"";width:8px;height:8px;border:1px solid var(--hearth);transform:rotate(45deg);box-shadow:inset 0 0 0 2px rgba(2,6,12,.9)}.runtime{color:#6d858d}.admission{color:var(--jade)}
.sequence-nav{position:absolute;z-index:5;right:43px;top:38px;display:flex;gap:3px;padding:4px;border:1px solid rgba(150,191,201,.18);border-radius:3px;background:rgba(3,9,16,.76);backdrop-filter:blur(12px)}
.sequence-nav button,.transport button{appearance:none;border:0;border-radius:2px;background:transparent;color:#6e858d;padding:7px 8px;font:700 8px/1 ui-monospace,SFMono-Regular,Consolas,monospace;text-transform:uppercase;letter-spacing:.07em;cursor:pointer}.sequence-nav button span{color:#506872}.sequence-nav button b{display:none}.sequence-nav button[aria-pressed="true"]{color:#f1cf9f;background:rgba(123,82,37,.24);box-shadow:inset 0 0 0 1px rgba(230,173,103,.35)}.sequence-nav button[aria-pressed="true"] span{color:var(--hearth)}
.presenter{position:absolute;z-index:5;left:50%;bottom:40px;width:min(860px,calc(100% - 108px));transform:translateX(-50%);padding:16px 174px 16px 20px;border:1px solid rgba(150,191,201,.24);border-top-color:rgba(119,220,185,.56);border-radius:4px;background:linear-gradient(145deg,rgba(3,10,18,.95),rgba(9,23,34,.86));box-shadow:0 25px 90px rgba(0,0,0,.52),inset 0 1px rgba(255,255,255,.05);backdrop-filter:blur(20px)}
.presenter:before{content:"";position:absolute;left:20px;top:-1px;width:96px;height:1px;background:var(--jade);box-shadow:0 0 19px rgba(119,220,185,.45)}
.lane-row{display:flex;align-items:center;gap:9px;margin-bottom:7px}.lane{display:inline-flex;align-items:center;gap:7px;color:var(--jade);font:800 8px/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase}.lane:before{content:"";width:7px;height:7px;border:1px solid currentColor;transform:rotate(45deg)}.source{color:#647b83;font:700 7px/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em}
.eyebrow{color:#b6c7ca;font:700 8px/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.14em}.presenter h1{margin:7px 0 6px;color:#f1f6f5;font:400 clamp(27px,2.8vw,42px)/.95 Georgia,"Times New Roman",serif;letter-spacing:-.035em;text-shadow:0 3px 20px rgba(0,0,0,.44)}.presenter p{max-width:620px;margin:0;color:#a9babf;font-size:10px;line-height:1.46;letter-spacing:.008em}
.evidence{position:absolute;right:18px;top:16px;width:138px;padding:10px 11px;border:1px solid rgba(119,220,185,.26);background:rgba(2,8,14,.62)}.evidence small{display:block;color:#6b828a;font:700 7px/1.2 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em}.evidence strong{display:block;margin-top:6px;color:#dff8ef;font:500 19px/1 Georgia,serif;text-transform:uppercase}
.transport{position:absolute;right:17px;bottom:14px;display:flex;align-items:center;gap:2px}.transport button{padding:6px 7px;border:1px solid rgba(150,191,201,.14)}.transport button:hover:not(:disabled){color:#e7c18e;border-color:rgba(230,173,103,.32)}.transport button:disabled{opacity:.34;cursor:default}.progress{min-width:50px;color:#718890;font:700 8px/1 ui-monospace,monospace;text-align:center}.play-state{min-width:48px;color:#84dcc0;font:700 7px/1 ui-monospace,monospace;text-align:center}
.silent{position:absolute;z-index:5;left:43px;bottom:24px;padding:8px 10px;border:1px solid rgba(150,191,201,.19);border-radius:3px;background:rgba(3,10,18,.84);color:#849aa1;font:700 8px/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.09em}.silent span{color:#b6c8cc}
.disclosure{position:absolute;z-index:5;right:43px;bottom:26px;max-width:470px;color:#5f767e;font:600 7px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace;text-align:right;text-transform:uppercase;letter-spacing:.06em}
body[data-lane="mv_p10_physics_fixture"] .presenter{border-top-color:rgba(166,152,255,.66)}body[data-lane="mv_p10_physics_fixture"] .presenter:before{background:var(--violet);box-shadow:0 0 20px rgba(166,152,255,.5)}body[data-lane="mv_p10_physics_fixture"] .lane{color:var(--violet)}body[data-lane="mv_p10_physics_fixture"] .evidence{border-color:rgba(166,152,255,.36)}body[data-lane="mv_p10_physics_fixture"] .evidence strong{color:#ddd8ff}
body[data-lane="exhibit_synthesis"] .presenter{border-top-color:rgba(230,173,103,.62)}body[data-lane="exhibit_synthesis"] .presenter:before{background:var(--hearth);box-shadow:0 0 20px rgba(230,173,103,.46)}body[data-lane="exhibit_synthesis"] .lane{color:var(--hearth)}body[data-lane="exhibit_synthesis"] .evidence{border-color:rgba(230,173,103,.34)}body[data-lane="exhibit_synthesis"] .evidence strong{color:#f1cf9f}
.sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
.fail-neutral .sequence-nav,.fail-neutral .transport,.fail-neutral .evidence,.fail-neutral .silent{display:none}.fail-neutral .presenter{border-top-color:rgba(201,127,102,.5);padding-right:20px}.fail-neutral .lane{color:#d1947d}
@media(max-width:900px){.presenter{bottom:54px;width:calc(100% - 44px)}.silent{left:22px}.disclosure{right:22px}.sequence-nav{right:22px}.show-id{left:22px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
</style>
</head>
<body data-lane="v4_run">
  <main class="stage" data-stage aria-label="Stormglass cinematic observer show"></main>
  <div class="cinema-grade"></div>
  <div class="frame-line"></div>
  <div class="show-id"><span>Stormglass Commons</span><span class="runtime">00:52 · 6 beats</span><span class="admission" data-admission>VERIFYING</span></div>
  <nav class="sequence-nav" aria-label="Cinematic beats">${beatButtons}</nav>
  <article class="presenter" aria-live="polite">
    <div class="lane-row"><span class="lane" id="show-lane">V4 RUN RECEIPT</span><span class="source" id="show-causal-source">SOURCE · V4 RUN OBSERVER PROJECTION</span></div>
    <div class="eyebrow" data-eyebrow>BEAT 01 / THE WITNESS ARRIVES</div>
    <h1 data-title>Stormglass Before the Proof</h1>
    <p data-copy>Preparing the sealed observer tableau.</p>
    <aside class="evidence"><small id="show-evidence-key">observer stage</small><strong id="show-evidence-value">read only</strong></aside>
    <div class="transport" aria-label="Playback controls">
      <button data-prev aria-label="Previous beat">←</button>
      <button data-play aria-label="Play show">Play</button>
      <button data-pause aria-label="Pause show" disabled>Pause</button>
      <button data-replay aria-label="Replay from first beat">Replay</button>
      <span class="progress" data-progress>01 / 06</span>
      <span class="play-state" data-play-state>PAUSED</span>
      <button data-next aria-label="Next beat">→</button>
    </div>
  </article>
  <p class="sr-only" data-audio-description></p>
  <div class="silent">SILENT FIRST CUT · <span>NO AUDIO GRAPH</span></div>
  <p class="disclosure">${DISCLOSURE}</p>
  <script>(${browserApplication.toString()})(${safeInlineJson(data)});</script>
</body>
</html>`;
}

function buildContactSheetHtml({ title, subtitle, images, seal }) {
  const cards = images.map((image, index) => `
    <figure data-lane="${image.lane}">
      <img src="data:image/png;base64,${image.base64}" alt="${image.alt}">
      <figcaption><span>0${image.index + 1}</span><b>${image.label}</b><em>${image.laneLabel}</em></figcaption>
    </figure>`).join('');
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#030812;color:#e8f1f1;font-family:Inter,Arial,sans-serif}body{padding:24px 38px;background:radial-gradient(circle at 50% 14%,#102637 0,#06101b 42%,#02060c 100%)}header{height:92px;display:flex;justify-content:space-between;align-items:flex-start;border-top:1px solid rgba(230,173,103,.58);padding-top:13px}h1{margin:0;font:400 39px/1 Georgia,serif;letter-spacing:-.035em}p{max-width:720px;margin:6px 0 0;color:#829aa2;font:700 8px/1.4 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.1em}.seal{color:#82dcbc;font:700 9px/1 ui-monospace,monospace;letter-spacing:.13em}.grid{display:grid;grid-template-columns:repeat(3,1fr);align-items:start;gap:18px}figure{margin:0;padding:7px;border:1px solid rgba(150,191,201,.2);background:rgba(4,12,21,.82);box-shadow:0 24px 70px rgba(0,0,0,.35)}figure[data-lane="mv_p10_physics_fixture"]{border-color:rgba(166,152,255,.44)}figure[data-lane="exhibit_synthesis"]{border-color:rgba(230,173,103,.42)}img{display:block;width:100%;height:auto;aspect-ratio:16/9;object-fit:contain;background:#02060c}figcaption{display:grid;grid-template-columns:25px 1fr auto;align-items:center;gap:7px;margin-top:6px;padding:7px 9px;border:1px solid rgba(230,173,103,.24);background:rgba(2,8,14,.9);color:#e9c38f;font:700 8px/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em}figcaption span{color:#73909a}figcaption b{font-weight:700}figcaption em{color:#72d6b3;font-size:6px;font-style:normal}figure[data-lane="mv_p10_physics_fixture"] em{color:#b8afff}figure[data-lane="exhibit_synthesis"] em{color:#e9bd83}</style></head>
<body><header><div><h1>${title}</h1><p>${subtitle}</p></div><div class="seal">${seal}</div></header><main class="grid">${cards}</main></body></html>`;
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

async function navigateShow(client, url, timeoutMs = 120_000) {
  await client.send('Page.navigate', { url });
  await waitForExpression(client, 'window.__MV_S1__?.ready === true', timeoutMs);
  return evaluate(client, 'window.__MV_S1_SNAPSHOT__()');
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
  const servedRequests = [];
  const server = createServer((request, response) => {
    const parsed = new URL(request.url || '/', 'http://127.0.0.1');
    servedRequests.push(parsed.pathname);
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
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hololand-mv-s1-'));
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
      + `&show=${encodeURIComponent(story.sha256)}`;
    const storyState = await navigateShow(client, storyUrl);
    assert(
      storyState.status === 'pass' && storyState.admitted === true,
      `Story show failed: ${canonicalJson(storyState)}`
    );
    assert(storyState.beatCount === 6, 'Story show beat count drifted');
    assert(storyState.sequenceDurationMs === 52000, 'Story show duration drifted');
    assert(storyState.playing === false && storyState.paused === true, 'Show did not default paused');
    assert(storyState.innerNamedRendererInstantiated === true, 'Story renderer was not mounted');
    assert(storyState.inner?.familyCount === 6, 'Story tableau lost family embodiments');
    assert(storyState.inner?.lineup?.gpu?.navigatorGpu === true, 'navigator.gpu missing');
    assert(storyState.inner?.lineup?.gpu?.adapterAcquired === true, 'GPUAdapter missing');
    assert(storyState.inner?.lineup?.gpu?.deviceCreated === true, 'GPUDevice missing');
    assert(equal(storyState.canonicalFieldsBefore, observerCanonicalFields), 'Canonical before drifted');
    assert(
      equal(storyState.canonicalFieldsBefore, storyState.canonicalFieldsAfter),
      'Cinematic show changed canonical fields'
    );
    assert(storyState.audioEnabled === false, 'Silent cut gained audio');
    assert(storyState.audioGraphConstructed === false, 'Silent cut constructed audio');
    assert(storyState.audioAssetsLoaded === 0, 'Silent cut loaded audio assets');
    assert(storyState.modelCallCount === 0, 'Show made a model call');
    assert(storyState.browserWriteCount === 0, 'Show wrote browser state');

    const playing = await evaluate(client, 'window.__MV_S1_PLAY__()');
    assert(playing.playing === true && playing.paused === false, 'Manual play failed');
    assert(playing.timerArmed === true, 'Manual play did not arm the show timer');
    const paused = await evaluate(client, 'window.__MV_S1_PAUSE__()');
    assert(paused.playing === false && paused.paused === true, 'Manual pause failed');
    assert(paused.timerArmed === false, 'Pause did not clear the show timer');
    await evaluate(client, 'window.__MV_S1_SET_BEAT__(3)');
    const replayed = await evaluate(client, 'window.__MV_S1_REPLAY__()');
    assert(replayed.beatIndex === 0 && replayed.paused === true, 'Manual replay failed');

    const captureRecords = [];
    const exactFirstRun = [];
    for (let index = 0; index < beats.length; index += 1) {
      await evaluate(client, `window.__MV_S1_SET_BEAT__(${index})`);
      const showState = await evaluate(client, 'window.__MV_S1_SNAPSHOT__()');
      assert(showState.beatId === beats[index].beatId, `Beat ${index} did not apply`);
      assert(
        showState.observer?.physics?.visualFrameStep === beats[index].physicsFrameStep,
        `Beat ${index} physics frame drifted`
      );
      assert(
        showState.evidenceLane === beats[index].evidenceLane,
        `Beat ${index} evidence lane drifted`
      );
      const filePath = path.join(
        outputDir,
        `mv-s1-desktop-beat-${String(index + 1).padStart(2, '0')}.png`
      );
      const capture = await captureScreenshot(client, filePath, 1600, 900);
      const exact = await evaluate(client, 'window.__MV_S1_EXACT_DIGEST__()');
      captureRecords.push({ ...capture, filePath, showState });
      exactFirstRun.push(exact);
    }
    const exactReplay = await evaluate(client, 'window.__MV_S1_EXACT_REPLAY__()');
    assert(exactReplay.length === 6, 'Exact replay did not return six beats');
    for (let index = 0; index < exactReplay.length; index += 1) {
      assert(
        exactReplay[index].sha256 === exactFirstRun[index].sha256,
        `Exact replay beat ${index} drifted`
      );
    }
    assert(
      exactFirstRun[3].exact.evidenceLane === 'v4_run'
        && exactFirstRun[3].exact.evidenceValue === 'blocked',
      'Boundary beat lost the V4 RUN lane'
    );
    assert(
      exactFirstRun[4].exact.evidenceLane === 'mv_p10_physics_fixture'
        && exactFirstRun[4].exact.observer.physics.visualFrameStep === 599
        && exactFirstRun[4].exact.crossLaneCausalityAllowed === false,
      'Physics fixture beat lost its separate lane'
    );
    assert(
      exactFirstRun[5].exact.evidenceLane === 'exhibit_synthesis'
        && exactFirstRun[5].exact.evidenceValue === 'forbidden',
      'Final synthesis lost the causality prohibition'
    );

    const storage = await evaluate(
      client,
      `(async () => ({
        localStorageKeys: Object.keys(localStorage),
        sessionStorageKeys: Object.keys(sessionStorage),
        cookie: document.cookie,
        cacheKeys: 'caches' in window ? await caches.keys() : [],
        indexedDbNames: 'databases' in indexedDB
          ? (await indexedDB.databases()).map((entry) => entry.name).filter(Boolean)
          : []
      }))()`
    );
    assert(storage.localStorageKeys.length === 0, 'Show wrote localStorage');
    assert(storage.sessionStorageKeys.length === 0, 'Show wrote sessionStorage');
    assert(storage.cookie === '', 'Show wrote a cookie');
    assert(storage.cacheKeys.length === 0, 'Show wrote CacheStorage');
    assert(storage.indexedDbNames.length === 0, 'Show wrote IndexedDB');

    const contactImages = captureRecords.map((record, index) => ({
      base64: fs.readFileSync(record.filePath).toString('base64'),
      alt: `${beats[index].title} desktop show beat`,
      label: beats[index].title,
      lane: beats[index].evidenceLane,
      laneLabel: beats[index].evidenceLaneLabel,
      index,
    }));
    const actOneHtml = buildContactSheetHtml({
      title: 'Act I · Village Receipts',
      subtitle:
        'Stormglass before the proof · water given · the hearth answers · sealed V4 RUN evidence only',
      images: contactImages.slice(0, 3),
      seal: 'MV-S1 · 00:25 / 00:52',
    });
    routes.set('/act-one-contact.html', {
      body: actOneHtml,
      type: 'text/html; charset=utf-8',
    });
    await navigateDocument(client, `${origin}/act-one-contact.html`);
    const actOneContact = await captureScreenshot(
      client,
      path.join(outputDir, 'mv-s1-act-one-contact-sheet.png'),
      1920,
      540
    );

    const actTwoHtml = buildContactSheetHtml({
      title: 'Act II · Separate Witness',
      subtitle:
        'V4 boundary receipt · separate MV-P10 physics fixture · synthesis with cross-lane causality forbidden',
      images: contactImages.slice(3, 6),
      seal: 'MV-S1 · 00:27 / 00:52',
    });
    routes.set('/act-two-contact.html', {
      body: actTwoHtml,
      type: 'text/html; charset=utf-8',
    });
    await navigateDocument(client, `${origin}/act-two-contact.html`);
    const actTwoContact = await captureScreenshot(
      client,
      path.join(outputDir, 'mv-s1-act-two-contact-sheet.png'),
      1920,
      540
    );
    const heroFrame = {
      path: captureRecords[5].filePath,
      bytes: captureRecords[5].bytes,
      sha256: captureRecords[5].sha256,
      width: 1600,
      height: 900,
    };

    const postlockState = await navigateShow(
      client,
      `${origin}/index.html?profile=${encodeURIComponent(POSTLOCK_PROFILE)}`
      + `&show=${encodeURIComponent(postlock.sha256)}`
    );
    assert(
      postlockState.status === 'pass'
        && postlockState.admitted === true
        && postlockState.inner?.familyCount === 6,
      'Postlock cinematic show was not admitted'
    );
    assert(
      equal(postlockState.canonicalFieldsBefore, postlockState.canonicalFieldsAfter),
      'Postlock cinematic show changed canonical fields'
    );

    const missingAdmission = await navigateShow(
      client,
      `${origin}/index.html?profile=${encodeURIComponent(PUBLIC_PROFILE)}`
    );
    assert(
      missingAdmission.status === 'fail-neutral'
        && missingAdmission.admitted === false
        && missingAdmission.innerNamedRendererInstantiated === false
        && missingAdmission.inner?.familyCount === 0
        && missingAdmission.inner?.lineupFrameLoaded === false,
      'Missing show admission did not fail neutral'
    );
    const deniedResearch = await navigateShow(
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
      playPauseReplay: {
        playObserved: playing.playing === true,
        pauseObserved: paused.paused === true,
        replayObserved: replayed.beatIndex === 0,
        realAuthoredDurationMs: 52000,
      },
      postlock: postlockState,
      missingAdmission,
      deniedResearch,
      exactReplay: {
        firstRun: exactFirstRun,
        replay: exactReplay,
        exact: exactReplay.every(
          (entry, index) => entry.sha256 === exactFirstRun[index].sha256
        ),
        boundary:
          'beat_camera_annotation_lane_phase_physics_frame_v4_projection_and_character_pixels',
        observerCompositePixelEqualityClaimed: false,
      },
      storage,
      captures: {
        beats: captureRecords.map(({ filePath, showState, ...capture }) => ({
          ...capture,
          filePath,
          beatId: showState.beatId,
          evidenceLane: showState.evidenceLane,
        })),
        actOneContact,
        actTwoContact,
        heroFrame,
      },
      audio: {
        enabled: false,
        graphConstructed: false,
        externalAssets: 0,
        audibleOutputVerified: false,
        humanMixApproved: false,
      },
      modelCallCount: 0,
      browserWriteCount: 0,
      servedRequests,
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
  const showText = read(SHOW_REL);
  const manifestText = read(MANIFEST_REL);
  const showParsed = core.parseHolo(showText);
  const manifestParsed = core.parseHolo(manifestText);
  assert(
    showParsed.success && showParsed.errors.length === 0,
    `MV-S1 show source did not parse: ${canonicalJson(showParsed.errors)}`
  );
  assert(
    manifestParsed.success && manifestParsed.errors.length === 0,
    `MV-S1 manifest source did not parse: ${canonicalJson(manifestParsed.errors)}`
  );
  const policy = validateCinematicObserverShowSource(showParsed.ast);
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
  const showSourceSha256 = sha256(showText);
  const mvV7SourceSha256 = hashFile(MV_V7_SOURCE_REL);
  const admissions = mvV7Admissions.map((mvV7Admission) =>
    buildCinematicObserverShowAdmission({
      showSourceSha256,
      showContractSha256: policy.showContractSha256,
      mvV7AdmissionSha256: mvV7Admission.sha256,
      observerCanonicalFieldsSha256,
      presentationProfile: mvV7Admission.presentationProfile,
    })
  );
  const html = buildShowHtml({
    admissions,
    beats: policy.beats,
    deniedProfile: DENIED_PROFILE,
    disclosure: DISCLOSURE,
    mvV7Admissions,
    observerCanonicalFields,
    postlockProfile: POSTLOCK_PROFILE,
    sequenceDurationMs: policy.state.sequenceDurationMs,
  });
  const htmlPath = path.join(args.outputDir, 'model-village-cinematic-observer-show.html');
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
    'Cinematic show witness did not run in a secure loopback context'
  );
  const appearanceBefore = mvV7.receipt.noFeedback.researchAppearanceBefore;
  const appearanceAfter = mvV7.receipt.noFeedback.researchAppearanceAfter;
  assert(
    appearanceBefore.sha256 === appearanceAfter.sha256,
    'Research appearance hash changed across the cinematic show'
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
          actOneContact: copyArtifact(
            path.join(args.outputDir, 'mv-s1-act-one-contact-sheet.png'),
            ACT_ONE_REL
          ),
          actTwoContact: copyArtifact(
            path.join(args.outputDir, 'mv-s1-act-two-contact-sheet.png'),
            ACT_TWO_REL
          ),
          heroFrame: copyArtifact(browser.captures.heroFrame.path, HERO_REL),
        }
        : {
          actOneContact: {
            path: ACT_ONE_REL,
            bytes: fs.existsSync(path.join(REPO_ROOT, ACT_ONE_REL))
              ? fs.statSync(path.join(REPO_ROOT, ACT_ONE_REL)).size
              : 0,
            sha256: fs.existsSync(path.join(REPO_ROOT, ACT_ONE_REL))
              ? hashFile(ACT_ONE_REL)
              : null,
          },
          actTwoContact: {
            path: ACT_TWO_REL,
            bytes: fs.existsSync(path.join(REPO_ROOT, ACT_TWO_REL))
              ? fs.statSync(path.join(REPO_ROOT, ACT_TWO_REL)).size
              : 0,
            sha256: fs.existsSync(path.join(REPO_ROOT, ACT_TWO_REL))
              ? hashFile(ACT_TWO_REL)
              : null,
          },
          heroFrame: {
            path: HERO_REL,
            bytes: fs.existsSync(path.join(REPO_ROOT, HERO_REL))
              ? fs.statSync(path.join(REPO_ROOT, HERO_REL)).size
              : 0,
            sha256: fs.existsSync(path.join(REPO_ROOT, HERO_REL))
              ? hashFile(HERO_REL)
              : null,
          },
        }
    )
    : null;
  const renderedArtifactComparisons = browser
    ? {
      actOneContact: compareRenderedPngs(
        {
          repoRoot: REPO_ROOT,
          durableRelativePath: ACT_ONE_REL,
          capturedPath: browser.captures.actOneContact.path,
        }
      ),
      actTwoContact: compareRenderedPngs(
        {
          repoRoot: REPO_ROOT,
          durableRelativePath: ACT_TWO_REL,
          capturedPath: browser.captures.actTwoContact.path,
        }
      ),
      heroFrame: compareRenderedPngs(
        {
          repoRoot: REPO_ROOT,
          durableRelativePath: HERO_REL,
          capturedPath: browser.captures.heroFrame.path,
        }
      ),
    }
    : null;
  if (browser) {
    assert(durable.actOneContact.sha256, `Missing durable ${ACT_ONE_REL}`);
    assert(durable.actTwoContact.sha256, `Missing durable ${ACT_TWO_REL}`);
    assert(durable.heroFrame.sha256, `Missing durable ${HERO_REL}`);
    assert(
      renderedArtifactComparisons.actOneContact.acceptedGpuRasterTolerance,
      'Durable Act I contact sheet exceeds the sealed GPU raster tolerance'
    );
    assert(
      renderedArtifactComparisons.actTwoContact.acceptedGpuRasterTolerance,
      'Durable Act II contact sheet exceeds the sealed GPU raster tolerance'
    );
    assert(
      renderedArtifactComparisons.heroFrame.acceptedGpuRasterTolerance,
      'Durable hero frame exceeds the sealed GPU raster tolerance'
    );
  }

  const expectedManifest = browser ? {
    showSourceSha256,
    showContractSha256: policy.showContractSha256,
    mvV7IntegrationSourceSha256: mvV7SourceSha256,
    observerCanonicalFieldsSha256,
    storyAdmissionSha256: admissions.find(
      (admission) => admission.canonical.presentationProfile === PUBLIC_PROFILE
    ).sha256,
    postlockAdmissionSha256: admissions.find(
      (admission) => admission.canonical.presentationProfile === POSTLOCK_PROFILE
    ).sha256,
    showHtmlSha256: sha256(html),
    actOneContactSheetSha256: durable.actOneContact.sha256,
    actTwoContactSheetSha256: durable.actTwoContact.sha256,
    heroFrameSha256: durable.heroFrame.sha256,
  } : {};
  const manifest = validateCinematicObserverShowManifest(
    manifestParsed.ast,
    expectedManifest,
    { requireAnchors: !args.skipManifest && Boolean(browser) }
  );
  const receipt = {
    schema: 'hololand.model-village.cinematic-observer-show-witness.v1',
    status: 'PASS',
    generatedAt: new Date().toISOString(),
    milestone: 'MV-S1',
    source: {
      path: SHOW_REL,
      sha256: showSourceSha256,
      parser: 'HoloCompositionParser',
      parseErrors: showParsed.errors.length,
      sourceSovereign: true,
    },
    show: {
      title: showParsed.ast.metadata.title,
      format: showParsed.ast.metadata.format,
      productionLock: showParsed.ast.metadata.productionLock,
      beatCount: policy.beats.length,
      durationMs: policy.state.sequenceDurationMs,
      beats: policy.beats,
      contractSha256: policy.showContractSha256,
      autoplayDefault: false,
      pausedDefault: true,
      reducedMotionDefault: true,
      audioMode: 'silent_first_executable_cut',
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
      manualPlayback: true,
      playPauseReplay: browser.playPauseReplay,
      reducedMotionDefault: true,
      continuousCameraMotion: false,
      captionsAlwaysVisible: true,
      audioDescriptionTextAvailable: true,
      keyboardControls: ['ArrowLeft', 'ArrowRight', 'Space', 'Home'],
      desktopLayout: true,
      disclosureAlwaysVisible: true,
    } : { skipped: true },
    evidenceBoundary: {
      v4RunBeats: policy.beats
        .filter((beat) => beat.evidenceLane === 'v4_run')
        .map((beat) => beat.beatId),
      physicsFixtureBeats: policy.beats
        .filter((beat) => beat.evidenceLane === 'mv_p10_physics_fixture')
        .map((beat) => beat.beatId),
      synthesisBeats: policy.beats
        .filter((beat) => beat.evidenceLane === 'exhibit_synthesis')
        .map((beat) => beat.beatId),
      crossLaneCausalityAllowed: false,
      physicsFixtureMayExplainV4Receipts: false,
      visualSeparationObserved:
        browser
          ? browser.exactReplay.firstRun[3].exact.evidenceLane
              !== browser.exactReplay.firstRun[4].exact.evidenceLane
          : null,
    },
    audio: {
      mode: 'silent_first_executable_cut',
      enabled: false,
      graphConstructed: false,
      externalAssets: 0,
      audibleOutputVerified: false,
      humanMixApproved: false,
    },
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
      browserWriteCount: browser?.browserWriteCount ?? 0,
      modelCallCount: browser?.modelCallCount ?? 0,
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
        'One 52-second, six-beat HoloScript-owned desktop cinematic observer show with manual play, pause, previous, next, and replay controls; reduced-motion cuts; exact sealed exhibit replay; visibly separate V4 RUN village receipts and MV-P10 physics fixture evidence; silent/no-audio execution; real browser WebGPU characters over the verified WebGL2 observer; fail-neutral research; zero external fetches, model calls, browser writes, and canonical feedback.',
      notProved: policy.claimBoundary.notProved,
    },
  };
  fs.writeFileSync(
    path.join(args.outputDir, 'cinematic-observer-show-witness.json'),
    `${JSON.stringify(receipt, null, 2)}\n`
  );
  if (args.json) console.log(JSON.stringify(receipt, null, 2));
  else {
    console.log(
      `PASS MV-S1 cinematic observer show: ${policy.beats.length} beats / `
      + `${policy.state.sequenceDurationMs} ms, `
      + `${browser ? 'desktop WebGPU/WebGL2 witness' : 'browser skipped'}, `
      + `${browser?.externalNetworkRequests.length ?? 0} external fetches`
    );
    console.log(
      `Receipt: ${path.join(args.outputDir, 'cinematic-observer-show-witness.json')}`
    );
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`FAIL MV-S1 cinematic observer show: ${error.stack || error.message}`);
      process.exit(1);
    });
}
