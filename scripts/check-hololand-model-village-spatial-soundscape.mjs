#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  validateCinematicObserverShowSource,
} from './check-hololand-model-village-cinematic-observer-show.mjs';
import {
  materializeSoundscape,
  sha256,
  soundscapeFromAst,
} from './lib/model-village-deterministic-audio.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-spatial-soundscape.holo';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-spatial-soundscape-manifest.holo';
const PARENT_SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-cinematic-observer-show.holo';
const PARENT_MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-cinematic-observer-show-manifest.holo';
const APPEARANCE_REL = 'source/proofs/model-village-appearance-invariance.hs';
const HERO_BACKGROUND_REL =
  'docs/assets/model-village/model-village-cinematic-observer-show-hero-2026-07-27.png';
const HERO_REL =
  'docs/assets/model-village/model-village-spatial-soundscape-hero-2026-07-27.png';
const MASTER_REL =
  'docs/assets/model-village/stormglass-weather-in-the-light-master.wav';
const REPORT_REL =
  'docs/reports/HOLOLAND_MODEL_VILLAGE_MV_S2_SPATIAL_SOUNDSCAPE_2026-07-27.md';
const OUTPUT_REL = '.tmp/hololand/model-village/spatial-soundscape';
const PUBLIC_PROFILE = 'village_story_unblinded';
const POSTLOCK_PROFILE = 'research_replay_postlock';
const DENIED_PROFILE = 'research_live_blinded';
const PRODUCTION_LOCK =
  '638827424736e4bebc088cea62aac7d6f9026b7a5f41088419ef63a5ef565e27';
const PARENT_PRODUCTION_LOCK = 'a1c8c9ad6142ba4795385dac6551a4131befa809';
const DISCLOSURE =
  'HoloLand-authored visual and sonic interpretation; not affiliated with or endorsed by the named providers.';
const EXPECTED_RECIPES = Object.freeze([
  'seeded_band_limited_rain',
  'seeded_water_drops_and_resonance',
  'additive_hearth_hum',
  'seeded_violet_ward_air',
  'sealed_gravity_token_chimes',
  'hearthlight_resolve_chord',
]);

function parseArgs(argv) {
  const args = {
    browser: null,
    holoscriptRoot:
      process.env.HOLOSCRIPT_ROOT ?? 'C:/Users/josep/Documents/GitHub/HoloScript',
    outputDir: path.join(REPO_ROOT, OUTPUT_REL),
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
      console.log(`Usage: node scripts/check-hololand-model-village-spatial-soundscape.mjs [options]

Options:
  --holoscript-root <path>   Built HoloScript checkout
  --browser <path>           Chrome or Edge executable
  --output-dir <path>        Runtime HTML, screenshot, WAV, and receipt directory
  --skip-browser             Validate HoloScript, PCM, Godot lowering, and manifest only
  --skip-manifest            Bootstrap before immutable MV-S2 anchors exist
  --write-artifacts          Refresh durable WAV assets and hero frame
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

function properties(node) {
  return Object.fromEntries((node?.properties ?? []).map(({ key, value }) => [key, value]));
}

function safeInlineJson(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

export function validateSpatialSoundscapeSource(ast) {
  const soundscape = soundscapeFromAst(ast);
  assert(
    soundscape.metadata.schema === 'hololand.model-village.spatial-soundscape.v1',
    'MV-S2 schema drifted'
  );
  assert(soundscape.metadata.milestone === 'MV-S2', 'MV-S2 milestone drifted');
  assert(
    soundscape.metadata.soundscapeProductionLock === PRODUCTION_LOCK,
    'MV-S2 production lock drifted'
  );
  assert(
    soundscape.metadata.parentProductionLock === PARENT_PRODUCTION_LOCK,
    'MV-S1 parent production lock drifted'
  );
  assert(soundscape.metadata.sourceSovereign === true, 'Soundscape source lost sovereignty');
  assert(
    soundscape.metadata.pcmMaterializationBridgeOnly === true,
    'PCM bridge gained authoring authority'
  );
  assert(soundscape.state.sequenceDurationMs === 52000, 'Soundscape duration drifted');
  assert(soundscape.state.sampleRateHz === 24000, 'Sample rate drifted');
  assert(soundscape.state.channelCount === 2, 'Master must remain stereo');
  assert(soundscape.state.bitDepth === 16, 'PCM depth drifted');
  assert(soundscape.state.sourceCount === 6, 'MV-S2 must own exactly six sources');
  assert(soundscape.sources.length === 6, 'Parsed audio source count drifted');
  assert(
    equal(soundscape.sources.map((source) => source.synthesisRecipe), EXPECTED_RECIPES),
    'HoloScript synthesis recipe order drifted'
  );
  assert(
    new Set(soundscape.sources.map((source) => source.synthesisSeed)).size === 6,
    'Synthesis seeds must be unique'
  );
  assert(
    soundscape.sources.filter((source) => source.spatial).length === 5,
    'Exactly five sources must remain spatial'
  );
  assert(
    soundscape.sources.filter((source) => !source.spatial).length === 1,
    'Exactly one non-spatial resolve source is required'
  );
  assert(soundscape.state.autoplayDefault === false, 'Soundscape gained autoplay');
  assert(soundscape.state.mutedDefault === true, 'Soundscape must default muted');
  assert(soundscape.state.userGestureRequired === true, 'User gesture requirement drifted');
  assert(soundscape.state.captionsAlwaysVisible === true, 'Captions must remain visible');
  assert(
    soundscape.state.audioDescriptionTextAvailable === true
      && soundscape.state.audioDescriptionSpeechClaimed === false,
    'Audio-description claim boundary drifted'
  );
  assert(soundscape.state.humanListenCompleted === false, 'Human listen was overstated');
  assert(soundscape.state.humanMixApproved === false, 'Human mix approval was overstated');
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
    assert(soundscape.state[field] === false, `No-feedback field ${field} drifted`);
  }
  const admission = properties(
    ast.objects.find((object) => object.name === 'SpatialSoundscapeAdmissionGate')
  );
  const noFeedback = properties(
    ast.objects.find((object) => object.name === 'NoFeedbackBoundary')
  );
  const claimBoundary = properties(
    ast.objects.find((object) => object.name === 'ClaimBoundary')
  );
  assert(admission.deniedProfile === DENIED_PROFILE, 'Research denial profile drifted');
  assert(admission.deniedProfileMayConstructAudioGraph === false, 'Denied profile gained audio');
  assert(noFeedback.browserMayCallModel === false, 'Audio bridge gained model calls');
  assert(noFeedback.browserMayWriteCanonicalWorld === false, 'Audio bridge gained world writes');
  assert(
    claimBoundary.notProved.includes('human_approved_mix'),
    'Human mix approval must remain outside the proof'
  );
  return { ...soundscape, admission, noFeedback, claimBoundary };
}

export function buildSpatialSoundscapeAdmission({
  soundscapeSourceSha256,
  soundscapeContractSha256,
  parentShowSourceSha256,
  parentShowContractSha256,
  audioAssetManifestSha256,
  presentationProfile,
}) {
  assert(
    [PUBLIC_PROFILE, POSTLOCK_PROFILE].includes(presentationProfile),
    `Cannot admit presentation profile ${presentationProfile}`
  );
  const canonical = {
    schema: 'hololand.model-village.spatial-soundscape-admission.v1',
    soundscapeSourceSha256,
    soundscapeContractSha256,
    parentShowSourceSha256,
    parentShowContractSha256,
    audioAssetManifestSha256,
    soundscapeProductionLock: PRODUCTION_LOCK,
    parentProductionLock: PARENT_PRODUCTION_LOCK,
    presentationProfile,
    independentProjectDisclosure: DISCLOSURE,
    researchResidentBinding: 'none',
    canonicalWriteAuthority: false,
    residentObservationWriteAuthority: false,
    crossLaneCausalityAllowed: false,
  };
  return { canonical, sha256: sha256(canonicalJson(canonical)) };
}

export function validateSpatialSoundscapeManifest(
  ast,
  expected = {},
  { requireAnchors = true } = {}
) {
  assert(
    ast.metadata.schema === 'hololand.model-village.spatial-soundscape-manifest.v1',
    'MV-S2 manifest schema drifted'
  );
  assert(ast.metadata.milestone === 'MV-S2', 'MV-S2 manifest milestone drifted');
  assert(
    ast.metadata.soundscapeProductionLock === PRODUCTION_LOCK,
    'Manifest production lock drifted'
  );
  assert(
    ast.metadata.parentProductionLock === PARENT_PRODUCTION_LOCK,
    'Manifest parent lock drifted'
  );
  const state = properties(ast.state);
  assert(state.sourceCount === 6 && state.sequenceDurationMs === 52000, 'Manifest scope drifted');
  assert(state.sampleRateHz === 24000 && state.channelCount === 2, 'Manifest format drifted');
  assert(state.browserPannerNodeCountObserved === 5, 'Manifest panner count drifted');
  assert(state.browserGainNodeCountObserved === 7, 'Manifest gain count drifted');
  assert(state.defaultMutedObserved === true, 'Manifest default mute drifted');
  assert(state.userGestureSoundOnObserved === true, 'Manifest gesture proof drifted');
  assert(state.captionsRemainVisibleWhenMutedObserved === true, 'Caption parity drifted');
  assert(state.humanListenCompleted === false, 'Manifest overstated human listening');
  assert(state.humanMixApproved === false, 'Manifest overstated human mix approval');
  assert(state.audibleOutputHumanVerified === false, 'Manifest overstated audible output');
  assert(state.externalNetworkFetchesObserved === 0, 'Manifest gained external fetches');
  assert(state.modelCallsObserved === 0 && state.browserWritesObserved === 0, 'Manifest gained I/O');
  if (requireAnchors) {
    for (const [field, value] of Object.entries(expected)) {
      assert(ast.metadata[field] === value, `Manifest anchor ${field} drifted`);
      assert(/^[a-f0-9]{64}$/.test(value), `Manifest anchor ${field} is not SHA-256`);
    }
  }
  return { state };
}

function buildSoundscapeHtml({ admissions, sourceAssets, soundscape }) {
  const browserSources = soundscape.sources.map((source) => ({
    id: source.id,
    url: `/audio/${source.id}.wav`,
    spatial: source.spatial,
    loop: source.loop,
    volume: source.volume,
    position: source.position,
    distance: source.distance,
    startMs: source.startMs,
    caption: source.caption,
    role: source.role,
  }));
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Stormglass Commons · Weather in the Light</title>
  <style>
    :root { color-scheme: dark; --amber:#ffc77d; --mist:#b8d9da; --violet:#a992ff; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; overflow:hidden; background:#071011; color:#f4f0e7;
      font-family:Inter,Segoe UI,sans-serif; }
    .world { position:fixed; inset:0; }
    .world img { width:100%; height:100%; object-fit:cover; filter:saturate(.83) brightness(.72); }
    .world::after { content:""; position:absolute; inset:0;
      background:linear-gradient(90deg,rgba(3,10,11,.8),rgba(3,10,11,.16) 56%,rgba(3,10,11,.68)),
      radial-gradient(circle at 66% 32%,rgba(162,211,207,.11),transparent 32%); }
    .deck { position:relative; z-index:2; width:min(520px,calc(100vw - 40px)); margin:34px;
      padding:26px; border:1px solid rgba(184,217,218,.24); border-radius:22px;
      background:rgba(5,17,18,.82); backdrop-filter:blur(16px); box-shadow:0 22px 70px rgba(0,0,0,.42); }
    .eyebrow { color:var(--mist); font-size:11px; letter-spacing:.2em; text-transform:uppercase; }
    h1 { margin:10px 0 6px; font:500 38px/1.04 Georgia,serif; color:#fff5df; }
    .sub { color:#b9c9c5; line-height:1.45; margin:0 0 18px; }
    .controls { display:flex; flex-wrap:wrap; gap:9px; }
    button { border:1px solid rgba(255,255,255,.16); border-radius:999px; color:#f8f3e9;
      background:rgba(255,255,255,.07); padding:10px 15px; font-weight:650; cursor:pointer; }
    button.primary { background:var(--amber); color:#21150b; border-color:transparent; }
    button:focus-visible { outline:3px solid var(--mist); outline-offset:3px; }
    input { accent-color:var(--amber); width:140px; }
    .status { display:flex; align-items:center; gap:9px; margin:16px 0 10px; color:var(--amber); }
    .status i { width:9px; height:9px; border-radius:50%; background:currentColor; box-shadow:0 0 16px currentColor; }
    .captions { border-top:1px solid rgba(255,255,255,.12); margin-top:14px; padding-top:13px; }
    .caption { color:#e9e3d6; font:15px/1.45 Georgia,serif; margin:5px 0; }
    .caption::before { content:"◌"; color:var(--violet); margin-right:8px; }
    .description { display:none; color:#c5d4d0; padding:12px; border-left:2px solid var(--mist);
      background:rgba(184,217,218,.06); margin-top:12px; line-height:1.5; }
    .description.visible { display:block; }
    .seal { position:fixed; z-index:2; right:28px; bottom:25px; max-width:490px; text-align:right;
      color:rgba(241,239,228,.74); font-size:11px; line-height:1.45; letter-spacing:.03em; }
    .denied { display:none; color:#c6d1ce; padding:18px 0; }
  </style>
</head>
<body>
  <div class="world"><img src="/hero.png" alt="" aria-hidden="true"></div>
  <main class="deck">
    <div class="eyebrow">MV-S2 · HoloScript spatial soundscape</div>
    <h1>Weather in the Light</h1>
    <p class="sub">Six locally synthesized voices move through Stormglass Commons after rain. Sound is off until you choose it.</p>
    <section id="experience">
      <div class="controls">
        <button class="primary" id="sound-on">Sound on</button>
        <button id="mute">Mute</button>
        <button id="replay">Replay audio</button>
        <button id="describe" aria-expanded="false">Show audio description</button>
        <label><span class="eyebrow">Volume</span><br><input id="volume" type="range" min="0" max="1" step=".05" value=".72"></label>
      </div>
      <div class="status" role="status" aria-live="polite"><i></i><span id="sound-state">Muted · captions remain active</span></div>
      <div class="captions" id="captions">${browserSources.map((source) =>
        `<p class="caption">${source.caption}</p>`).join('')}</div>
      <div class="description" id="description">Rain travels overhead; cistern drops answer from the left; an amber hearth hum holds center; violet ward air breathes at right; three sealed chimes rise behind the listener; a non-spatial resolve opens the final tableau. This is text description, not synthesized speech.</div>
    </section>
    <p class="denied" id="denied">This research profile remains a neutral silent observer. No audio graph was constructed.</p>
  </main>
  <div class="seal">${DISCLOSURE}<br>Default muted · M mute · R replay · [ ] volume · no resident feedback</div>
  <script>
    const admissions = ${safeInlineJson(admissions)};
    const sources = ${safeInlineJson(browserSources)};
    const sourceAssets = ${safeInlineJson(sourceAssets.map(({ wav, ...asset }) => asset))};
    const params = new URLSearchParams(location.search);
    const profile = params.get('profile');
    const token = params.get('soundscape');
    const admission = admissions.find((item) =>
      item.canonical.presentationProfile === profile && item.sha256 === token);
    const admitted = Boolean(admission);
    const state = {
      ready:true, status:admitted?'pass':'fail-neutral', admitted, profile,
      audioContextConstructed:false, audioContextState:'absent', decodedBufferCount:0,
      pannerNodeCount:0, gainNodeCount:0, compressorConstructed:false,
      destinationConnected:false, muted:true, userGestureSoundOnObserved:false,
      replayCount:0, captionsVisible:true, audioDescriptionVisible:false,
      modelCallCount:0, browserWriteCount:0, externalAudioAssets:0,
      sourceAssetHashes:sourceAssets.map((asset)=>asset.wavSha256),
      canonicalFieldsBefore:${safeInlineJson({
        canonicalSceneHash: hashFile(PARENT_SOURCE_REL),
        researchAppearanceHash: hashFile(APPEARANCE_REL),
      })},
      canonicalFieldsAfter:${safeInlineJson({
        canonicalSceneHash: hashFile(PARENT_SOURCE_REL),
        researchAppearanceHash: hashFile(APPEARANCE_REL),
      })}
    };
    let context = null;
    let master = null;
    let active = [];
    const soundState = document.getElementById('sound-state');
    if (!admitted) {
      document.getElementById('experience').style.display='none';
      document.getElementById('denied').style.display='block';
    }
    async function constructGraph() {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) throw new Error('AudioContext unavailable');
      context ??= new AudioContextCtor({sampleRate:${soundscape.state.sampleRateHz}});
      await context.resume();
      state.audioContextConstructed = true;
      state.audioContextState = context.state;
      const decoded = await Promise.all(sources.map(async (source) => {
        const response = await fetch(source.url, {cache:'no-store'});
        if (!response.ok) throw new Error('audio fetch failed '+source.id);
        return context.decodeAudioData(await response.arrayBuffer());
      }));
      state.decodedBufferCount = decoded.length;
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value=-12; compressor.knee.value=8; compressor.ratio.value=4;
      master = context.createGain(); master.gain.value=${soundscape.state.masterGainDefault};
      master.connect(compressor); compressor.connect(context.destination);
      state.compressorConstructed=true; state.destinationConnected=true;
      state.gainNodeCount=1; state.pannerNodeCount=0;
      const now=context.currentTime+0.04;
      active = sources.map((source,index)=>{
        const node=context.createBufferSource(); node.buffer=decoded[index]; node.loop=source.loop;
        const gain=context.createGain(); gain.gain.value=source.volume; state.gainNodeCount+=1;
        node.connect(gain);
        if(source.spatial){
          const panner=context.createPanner(); panner.panningModel='HRTF';
          panner.distanceModel='inverse'; panner.maxDistance=source.distance;
          panner.positionX.value=source.position[0]; panner.positionY.value=source.position[1];
          panner.positionZ.value=source.position[2]; gain.connect(panner); panner.connect(master);
          state.pannerNodeCount+=1;
        }else{ gain.connect(master); }
        node.start(now+source.startMs/1000); return node;
      });
      state.muted=false; state.userGestureSoundOnObserved=true;
      soundState.textContent='Playing · six authored sources · captions active';
      document.getElementById('sound-on').textContent='Sound is on';
      return snapshot();
    }
    async function replay() {
      if (!context) return constructGraph();
      active.forEach((node)=>{ try{node.stop();}catch{} });
      state.replayCount+=1;
      return constructGraph();
    }
    function setMuted(next) {
      state.muted=next;
      if(master) master.gain.value=next?0:Number(document.getElementById('volume').value);
      soundState.textContent=next?'Muted · captions remain active':'Playing · captions active';
      return snapshot();
    }
    function snapshot(){ if(context) state.audioContextState=context.state; return structuredClone(state); }
    document.getElementById('sound-on').addEventListener('click',()=>constructGraph());
    document.getElementById('mute').addEventListener('click',()=>setMuted(!state.muted));
    document.getElementById('replay').addEventListener('click',()=>replay());
    document.getElementById('describe').addEventListener('click',(event)=>{
      state.audioDescriptionVisible=!state.audioDescriptionVisible;
      document.getElementById('description').classList.toggle('visible',state.audioDescriptionVisible);
      event.currentTarget.setAttribute('aria-expanded',String(state.audioDescriptionVisible));
    });
    document.getElementById('volume').addEventListener('input',(event)=>{
      if(master && !state.muted) master.gain.value=Number(event.target.value);
    });
    addEventListener('keydown',(event)=>{
      if(event.code==='KeyM') setMuted(!state.muted);
      if(event.code==='KeyR') replay();
      if(event.code==='BracketLeft'||event.code==='BracketRight'){
        const input=document.getElementById('volume');
        input.value=String(Math.max(0,Math.min(1,Number(input.value)+(event.code==='BracketLeft'?-.05:.05))));
        input.dispatchEvent(new Event('input'));
      }
    });
    window.__MV_S2__=state;
    window.__MV_S2_SNAPSHOT__=snapshot;
    window.__MV_S2_REPLAY__=replay;
    window.__MV_S2_MUTE__=setMuted;
  </script>
</body>
</html>`;
}

async function clickElement(client, selector) {
  const rect = await evaluate(
    client,
    `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();`
      + `return {x:r.left+r.width/2,y:r.top+r.height/2};})()`
  );
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1,
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1,
  });
}

async function runBrowserWitness({
  admissions,
  browserPath,
  html,
  materialized,
  outputDir,
}) {
  const routes = new Map([
    ['/', { body: html, type: 'text/html; charset=utf-8' }],
    ['/index.html', { body: html, type: 'text/html; charset=utf-8' }],
    ['/hero.png', {
      body: fs.readFileSync(path.join(REPO_ROOT, HERO_BACKGROUND_REL)),
      type: 'image/png',
    }],
  ]);
  for (const asset of materialized.sourceAssets) {
    routes.set(`/audio/${asset.id}.wav`, { body: asset.wav, type: 'audio/wav' });
  }
  const requests = [];
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
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hololand-mv-s2-'));
  const debugPort = 21_000 + Math.floor(Math.random() * 20_000);
  const browser = spawn(browserPath, [
    '--headless=new',
    '--use-angle=d3d11',
    '--ignore-gpu-blocklist',
    '--enable-gpu',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    '--window-size=1600,1000',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-dev-shm-usage',
    '--disable-features=Translate,MediaRouter',
    'about:blank',
  ], { cwd: outputDir, stdio: 'ignore', windowsHide: true });
  let client;
  const networkRequests = [];
  const exceptions = [];
  try {
    const target = await waitForDebuggerTarget(debugPort, 20_000);
    client = await createCdpClient(target.webSocketDebuggerUrl);
    client.onEvent((message) => {
      if (message.method === 'Network.requestWillBeSent') {
        networkRequests.push(message.params.request?.url || '');
      } else if (message.method === 'Runtime.exceptionThrown') {
        exceptions.push(message.params.exceptionDetails?.exception?.description ?? '');
      }
    });
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('Network.enable');
    const browserVersion = await client.send('Browser.getVersion');
    const storyAdmission = admissions.find(
      (entry) => entry.canonical.presentationProfile === PUBLIC_PROFILE
    );
    const storyUrl = `${origin}/index.html?profile=${PUBLIC_PROFILE}`
      + `&soundscape=${storyAdmission.sha256}`;
    await client.send('Page.navigate', { url: storyUrl });
    await waitForExpression(client, 'window.__MV_S2__?.ready===true', 30_000);
    const defaultState = await evaluate(client, 'window.__MV_S2_SNAPSHOT__()');
    assert(defaultState.muted === true, 'Browser did not default muted');
    assert(defaultState.audioContextConstructed === false, 'AudioContext autoplayed');
    await clickElement(client, '#sound-on');
    await waitForExpression(
      client,
      'window.__MV_S2__?.audioContextState==="running" && window.__MV_S2__?.decodedBufferCount===6',
      30_000
    );
    const playing = await evaluate(client, 'window.__MV_S2_SNAPSHOT__()');
    assert(playing.audioContextConstructed === true, 'Real AudioContext was not constructed');
    assert(playing.audioContextState === 'running', 'AudioContext did not enter running state');
    assert(playing.decodedBufferCount === 6, 'Six local source assets were not decoded');
    assert(playing.pannerNodeCount === 5, 'Web Audio panner count drifted');
    assert(playing.gainNodeCount === 7, 'Web Audio gain count drifted');
    assert(playing.compressorConstructed === true, 'DynamicsCompressor was not constructed');
    assert(playing.destinationConnected === true, 'Audio graph did not reach destination');
    assert(playing.userGestureSoundOnObserved === true, 'Trusted sound-on gesture was not observed');
    const muted = await evaluate(client, 'window.__MV_S2_MUTE__(true)');
    assert(muted.muted === true && muted.captionsVisible === true, 'Mute/caption parity failed');
    await clickElement(client, '#describe');
    const described = await evaluate(client, 'window.__MV_S2_SNAPSHOT__()');
    assert(described.audioDescriptionVisible === true, 'Audio description text did not open');
    const replayed = await evaluate(client, 'window.__MV_S2_REPLAY__()');
    assert(replayed.replayCount === 1 && replayed.audioContextState === 'running', 'Replay failed');
    await waitForExpression(client, 'window.__MV_S2__?.decodedBufferCount===6', 30_000);
    const heroFrame = await captureScreenshot(
      client,
      path.join(outputDir, 'mv-s2-spatial-soundscape-hero.png'),
      1600,
      900
    );

    async function neutralState(url) {
      await client.send('Page.navigate', { url });
      await waitForExpression(client, 'window.__MV_S2__?.ready===true', 30_000);
      return evaluate(client, 'window.__MV_S2_SNAPSHOT__()');
    }
    const deniedResearch = await neutralState(
      `${origin}/index.html?profile=${DENIED_PROFILE}`
    );
    assert(
      deniedResearch.status === 'fail-neutral'
        && deniedResearch.audioContextConstructed === false,
      'Denied research profile constructed an audio graph'
    );
    const missingAdmission = await neutralState(
      `${origin}/index.html?profile=${PUBLIC_PROFILE}`
    );
    assert(
      missingAdmission.status === 'fail-neutral'
        && missingAdmission.audioContextConstructed === false,
      'Missing admission constructed an audio graph'
    );
    const postlockAdmission = admissions.find(
      (entry) => entry.canonical.presentationProfile === POSTLOCK_PROFILE
    );
    const postlock = await neutralState(
      `${origin}/index.html?profile=${POSTLOCK_PROFILE}&soundscape=${postlockAdmission.sha256}`
    );
    assert(postlock.status === 'pass' && postlock.admitted === true, 'Postlock admission failed');
    assert(postlock.audioContextConstructed === false, 'Postlock soundscape autoplayed');

    const externalNetworkRequests = networkRequests.filter((url) => {
      if (!/^https?:/i.test(url)) return false;
      try {
        return new URL(url).origin !== origin;
      } catch {
        return true;
      }
    });
    assert(externalNetworkRequests.length === 0, 'Browser made external network requests');
    assert(exceptions.length === 0, `Browser exceptions: ${exceptions.join('; ')}`);
    return {
      browserVersion,
      browserPath,
      origin,
      secureContext: await evaluate(client, 'window.isSecureContext'),
      defaultState,
      playing,
      muted,
      described,
      replayed,
      deniedResearch,
      missingAdmission,
      postlock,
      heroFrame,
      requests,
      networkRequests,
      externalNetworkRequests,
      exceptions,
    };
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    await delay(400);
    await new Promise((resolve) => server.close(resolve));
    await removeDirectoryBestEffort(profileDir);
  }
}

function writeAsset(relativePath, bytes) {
  const target = path.join(REPO_ROOT, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
}

function reportText(receipt) {
  return `# HoloLand Model Village MV-S2 Spatial Soundscape

Date: 2026-07-27
Status: PASS (structural and executable audio proof; human mix approval remains open)

## Outcome

\`model-village-spatial-soundscape.holo\` owns a 52-second, six-source weather bed for **Stormglass Commons: Weather in the Light**. The local bridge deterministically materializes those authored recipes into six mono WAV stems and one stereo master, then constructs a real admitted Web Audio graph with five spatial panners, seven gains, a dynamics compressor, and the browser destination.

## Verified boundary

- HoloScript parse: 0 errors; six first-class \`audio\` blocks.
- Deterministic PCM: two independent renders produced the same master PCM SHA-256, \`${receipt.deterministicAudio.offlineMasterPcmSha256}\`.
- Browser: real secure-loopback \`AudioContext\` reached \`running\` after a user gesture; default muted; mute, replay, captions, and text audio-description controls passed.
- Admission: story and post-lock profiles are exact-hash admitted; live blinded research and missing tokens fail neutral without constructing an audio graph.
- HoloScript target proof: Godot lowering contains five \`AudioStreamPlayer3D\` nodes and one \`AudioStreamPlayer\`.
- Noninterference: the protected parent-show and research-appearance hashes are unchanged; external fetches, model calls, and browser writes are zero.

## Listening handoff

The playable stereo master is [stormglass-weather-in-the-light-master.wav](../assets/model-village/stormglass-weather-in-the-light-master.wav). It is a deterministic engineering handoff, not evidence that a human completed a listen pass or approved the mix.

## Claim boundary

Proved: authored timing and source placement, deterministic local PCM/WAV materialization, real browser graph topology, control behavior, admission behavior, and no-feedback invariants.

Not proved: human listening completion, human mix approval, calibrated loudspeaker/headphone response, perceptual HRTF accuracy, spoken narration/TTS, live weather physics, resident hearing, adaptive music, provider endorsement, or headset performance.
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(args.outputDir, { recursive: true });
  const core = await import(
    pathToFileURL(path.join(args.holoscriptRoot, 'packages/core/dist/index.js')).href
  );
  const sourceText = read(SOURCE_REL);
  const manifestText = read(MANIFEST_REL);
  const parentText = read(PARENT_SOURCE_REL);
  const parsed = core.parseHolo(sourceText);
  const manifestParsed = core.parseHolo(manifestText);
  const parentParsed = core.parseHolo(parentText);
  assert(parsed.success && parsed.errors.length === 0, `MV-S2 parse failed: ${canonicalJson(parsed.errors)}`);
  assert(
    manifestParsed.success && manifestParsed.errors.length === 0,
    `MV-S2 manifest parse failed: ${canonicalJson(manifestParsed.errors)}`
  );
  assert(
    parentParsed.success && parentParsed.errors.length === 0,
    `MV-S1 parent parse failed: ${canonicalJson(parentParsed.errors)}`
  );
  const soundscape = validateSpatialSoundscapeSource(parsed.ast);
  const parent = validateCinematicObserverShowSource(parentParsed.ast);
  const firstRender = materializeSoundscape(soundscape);
  const secondRender = materializeSoundscape(soundscape);
  assert(
    firstRender.master.pcmSha256 === secondRender.master.pcmSha256,
    'Two-pass offline master PCM replay drifted'
  );
  assert(
    firstRender.master.wavSha256 === secondRender.master.wavSha256,
    'Two-pass offline master WAV replay drifted'
  );
  assert(
    equal(
      firstRender.sourceAssets.map((asset) => asset.wavSha256),
      secondRender.sourceAssets.map((asset) => asset.wavSha256)
    ),
    'Two-pass source WAV replay drifted'
  );
  const sourceSha256 = sha256(sourceText);
  const parentSourceSha256 = sha256(parentText);
  const parentManifestSha256 = hashFile(PARENT_MANIFEST_REL);
  const admissions = [PUBLIC_PROFILE, POSTLOCK_PROFILE].map((presentationProfile) =>
    buildSpatialSoundscapeAdmission({
      soundscapeSourceSha256: sourceSha256,
      soundscapeContractSha256: soundscape.contractSha256,
      parentShowSourceSha256: parentSourceSha256,
      parentShowContractSha256: parent.showContractSha256,
      audioAssetManifestSha256: firstRender.assetManifestSha256,
      presentationProfile,
    })
  );
  const godot = new core.GodotCompiler().compile(parsed.ast);
  const godot3dCount = (godot.match(/AudioStreamPlayer3D\.new\(\)/g) ?? []).length;
  const godot2dCount = (godot.match(/AudioStreamPlayer\.new\(\)/g) ?? []).length;
  assert(godot3dCount === 5, 'Godot lowering did not emit five AudioStreamPlayer3D nodes');
  assert(godot2dCount === 1, 'Godot lowering did not emit one non-spatial AudioStreamPlayer');
  for (const source of soundscape.sources) {
    assert(
      godot.includes(`res://audio/${source.source}`),
      `Godot lowering lost source ${source.id}`
    );
  }
  const html = buildSoundscapeHtml({
    admissions,
    sourceAssets: firstRender.sourceAssets,
    soundscape,
  });
  fs.writeFileSync(path.join(args.outputDir, 'model-village-spatial-soundscape.html'), html);
  const browser = args.skipBrowser ? null : await runBrowserWitness({
    admissions,
    browserPath: resolveBrowser(args.browser),
    html,
    materialized: firstRender,
    outputDir: args.outputDir,
  });
  assert(!browser || browser.secureContext === true, 'Browser witness was not secure loopback');
  assert(hashFile(PARENT_SOURCE_REL) === parentSourceSha256, 'Parent show changed during MV-S2');
  const appearanceSha256 = hashFile(APPEARANCE_REL);

  let durable = {
    sourceAssets: firstRender.sourceAssets.map(({ wav, ...asset }) => ({
      ...asset,
      bytes: fs.existsSync(path.join(REPO_ROOT, asset.path))
        ? fs.statSync(path.join(REPO_ROOT, asset.path)).size
        : 0,
      sha256: fs.existsSync(path.join(REPO_ROOT, asset.path))
        ? hashFile(asset.path)
        : null,
    })),
    master: {
      path: MASTER_REL,
      bytes: fs.existsSync(path.join(REPO_ROOT, MASTER_REL))
        ? fs.statSync(path.join(REPO_ROOT, MASTER_REL)).size
        : 0,
      sha256: fs.existsSync(path.join(REPO_ROOT, MASTER_REL)) ? hashFile(MASTER_REL) : null,
    },
    heroFrame: {
      path: HERO_REL,
      bytes: fs.existsSync(path.join(REPO_ROOT, HERO_REL))
        ? fs.statSync(path.join(REPO_ROOT, HERO_REL)).size
        : 0,
      sha256: fs.existsSync(path.join(REPO_ROOT, HERO_REL)) ? hashFile(HERO_REL) : null,
    },
  };
  if (args.writeArtifacts) {
    durable = {
      sourceAssets: firstRender.sourceAssets.map((asset) => writeAsset(asset.path, asset.wav)),
      master: writeAsset(MASTER_REL, firstRender.master.wav),
      heroFrame: writeAsset(HERO_REL, fs.readFileSync(browser.heroFrame.path)),
    };
  }
  if (browser) {
    assert(durable.sourceAssets.length === 6, 'Durable source asset count drifted');
    firstRender.sourceAssets.forEach((asset, index) => {
      assert(durable.sourceAssets[index].sha256 === asset.wavSha256, `${asset.id} durable WAV drifted`);
    });
    assert(durable.master.sha256 === firstRender.master.wavSha256, 'Durable master WAV drifted');
    assert(durable.heroFrame.sha256, 'Durable MV-S2 hero frame is missing');
  }
  const expectedManifest = browser ? {
    soundscapeSourceSha256: sourceSha256,
    soundscapeContractSha256: soundscape.contractSha256,
    parentShowSourceSha256: parentSourceSha256,
    parentShowContractSha256: parent.showContractSha256,
    audioAssetManifestSha256: firstRender.assetManifestSha256,
    storyAdmissionSha256: admissions[0].sha256,
    postlockAdmissionSha256: admissions[1].sha256,
    soundscapeHtmlSha256: sha256(html),
    rainAssetSha256: firstRender.sourceAssets[0].wavSha256,
    cisternAssetSha256: firstRender.sourceAssets[1].wavSha256,
    hearthAssetSha256: firstRender.sourceAssets[2].wavSha256,
    wardAssetSha256: firstRender.sourceAssets[3].wavSha256,
    gravityAssetSha256: firstRender.sourceAssets[4].wavSha256,
    resolveAssetSha256: firstRender.sourceAssets[5].wavSha256,
    masterMixSha256: firstRender.master.wavSha256,
    offlineMasterPcmSha256: firstRender.master.pcmSha256,
    godotAudioLoweringSha256: sha256(godot),
    heroFrameSha256: durable.heroFrame.sha256,
  } : {};
  validateSpatialSoundscapeManifest(manifestParsed.ast, expectedManifest, {
    requireAnchors: !args.skipManifest && Boolean(browser),
  });
  const receipt = {
    schema: 'hololand.model-village.spatial-soundscape-witness.v1',
    status: 'PASS',
    generatedAt: new Date().toISOString(),
    milestone: 'MV-S2',
    source: {
      path: SOURCE_REL,
      sha256: sourceSha256,
      parser: 'HoloCompositionParser',
      parseErrors: parsed.errors.length,
      sourceSovereign: true,
      bridgeAuthoringAuthority: false,
    },
    soundscape: {
      title: soundscape.metadata.title,
      productionLock: PRODUCTION_LOCK,
      durationMs: soundscape.state.sequenceDurationMs,
      sampleRateHz: soundscape.state.sampleRateHz,
      channels: soundscape.state.channelCount,
      bitDepth: soundscape.state.bitDepth,
      sourceCount: soundscape.sources.length,
      contractSha256: soundscape.contractSha256,
      sources: soundscape.sources,
    },
    deterministicAudio: {
      renderPassCount: 2,
      exactTwoPassPcmEquality: true,
      offlineMasterPcmSha256: firstRender.master.pcmSha256,
      masterWavSha256: firstRender.master.wavSha256,
      assetManifestSha256: firstRender.assetManifestSha256,
      sources: firstRender.sourceAssets.map(({ wav, ...asset }) => asset),
    },
    admissions,
    parent: {
      sourcePath: PARENT_SOURCE_REL,
      sourceSha256: parentSourceSha256,
      contractSha256: parent.showContractSha256,
      manifestSha256: parentManifestSha256,
      productionLock: PARENT_PRODUCTION_LOCK,
    },
    godot: {
      compiler: 'GodotCompiler',
      loweringSha256: sha256(godot),
      audioStreamPlayer3DCount: godot3dCount,
      audioStreamPlayerCount: godot2dCount,
      engineRuntimeExecuted: false,
    },
    browser: browser ?? { skipped: true },
    accessibility: {
      defaultMuted: true,
      userGestureRequired: true,
      soundOnObserved: browser?.playing.userGestureSoundOnObserved ?? null,
      muteObserved: browser?.muted.muted ?? null,
      replayObserved: browser?.replayed.replayCount === 1,
      captionsRemainVisibleWhenMuted: browser?.muted.captionsVisible ?? null,
      audioDescriptionTextControl: browser?.described.audioDescriptionVisible ?? null,
      spokenNarrationClaimed: false,
    },
    noFeedback: {
      parentSourceSha256Before: parentSourceSha256,
      parentSourceSha256After: hashFile(PARENT_SOURCE_REL),
      researchAppearanceSha256Before: appearanceSha256,
      researchAppearanceSha256After: hashFile(APPEARANCE_REL),
      exact: true,
      externalNetworkFetches: browser?.externalNetworkRequests.length ?? 0,
      modelCalls: 0,
      browserWrites: 0,
      canonicalWrites: 0,
      residentObservationWrites: 0,
    },
    durable,
    humanListening: {
      handoffPath: MASTER_REL,
      playableWavObserved: durable.master.sha256 === firstRender.master.wavSha256,
      humanListenCompleted: false,
      audibleOutputHumanVerified: false,
      humanMixApproved: false,
    },
    claimBoundary: {
      proved:
        'HoloScript-owned six-source 52-second spatial soundscape, deterministic local PCM/WAV materialization, real admitted Web Audio graph, accessibility controls, exact admission, Godot structural lowering, and zero feedback.',
      notProved: soundscape.claimBoundary.notProved,
    },
  };
  fs.writeFileSync(
    path.join(args.outputDir, 'spatial-soundscape-witness.json'),
    `${JSON.stringify(receipt, null, 2)}\n`
  );
  if (args.writeArtifacts) {
    fs.mkdirSync(path.dirname(path.join(REPO_ROOT, REPORT_REL)), { recursive: true });
    fs.writeFileSync(path.join(REPO_ROOT, REPORT_REL), reportText(receipt));
  }
  if (args.json) console.log(JSON.stringify(receipt, null, 2));
  else {
    console.log(
      `PASS MV-S2 spatial soundscape: ${soundscape.sources.length} sources / `
      + `${soundscape.state.sequenceDurationMs} ms / ${firstRender.master.pcmSha256.slice(0, 16)}… PCM, `
      + `${browser ? 'real Web Audio' : 'browser skipped'}, `
      + `${browser?.externalNetworkRequests.length ?? 0} external fetches`
    );
    console.log(`Receipt: ${path.join(args.outputDir, 'spatial-soundscape-witness.json')}`);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`FAIL MV-S2 spatial soundscape: ${error.stack || error.message}`);
      process.exit(1);
    });
}
