/**
 * main.ts — Bravura, gate 3: the black room with the first instrument.
 *
 * A spotlit timpani in the dark. Your hands (or controllers, or the mouse)
 * conduct it with the gate-2-certified tempo/phase following; the strike
 * you hear and the flash you see come from the same engine beat event.
 */

import { Conductor } from '../../tempo-latency-probe/src/conductor';
import { DESKTOP_CONFIG, XR_CONFIG } from '../../tempo-latency-probe/src/beatDetector';
import { verdictFor, trialVerdict, BANDS_NOTE } from '../../tempo-latency-probe/src/verdict';
import { Renderer, Material } from './renderer';
import { disc, sphere, cylinder, quad } from './meshes';
import { multiply, translation, rotationY, rotationX, scaling, perspective, lookAt, Mat4 } from './math3';
import { Timpani, makeTimpaniBuffers } from './timpani';
import { startBravuraXR, BravuraXRHandle, XRFrameData } from './xrSession';
import { Hud } from './hud';
import { Lessons, LessonResult } from './lessons';
import { Chimes } from './chimes';
import { CueTracker, rayPointsAt, rayAngleTo, gripRay, projectToScreen, Vec3 } from './cueing';

declare const GIT_COMMIT: string;

declare global {
  interface Window {
    __bravura?: {
      readonly conductor: Conductor | null;
      readonly audioContext: AudioContext | null;
      buildReceipt(): string;
      stop(): void;
      timpaniStats(): { hi: number[]; lo: number[] } | null;
      snapshotStats(): { size: [number, number]; nonBlack: number; maxLum: number };
      lessons: Lessons;
      chimes: Chimes | null;
      ensembleBus: GainNode | null;
      busDebug: { busMuted: boolean; mode: string };
      cueTracker: CueTracker;
      forcePointing(v: boolean): void;
      cueingChecks(): Record<string, boolean>;
      startLessons(ids?: Parameters<Lessons['startAll']>[2]): void;
    };
  }
}

const $ = (id: string) => document.getElementById(id) as HTMLElement;

const FLOOR: Material = { color: [0.135, 0.128, 0.118], metal: 0.2, shiny: 60, emissive: 0 };
const JOINT: Material = { color: [0.85, 0.8, 0.66], metal: 0, shiny: 30, emissive: 0.55 };
const BATON: Material = { color: [0.93, 0.92, 0.88], metal: 0, shiny: 40, emissive: 0.25 };
const GUIDE: Material = { color: [1.0, 0.84, 0.5], metal: 0, shiny: 20, emissive: 0.9 };
const MARKER: Material = { color: [0.95, 0.78, 0.4], metal: 0, shiny: 20, emissive: 0.8 };

let ac: AudioContext | null = null;
let conductor: Conductor | null = null;
let renderer: Renderer | null = null;
let timpani: Timpani | null = null;
let hud: Hud | null = null;
let hudTex: WebGLTexture | null = null;
let meshes: {
  floor: ReturnType<Renderer['createMesh']>;
  joint: ReturnType<Renderer['createMesh']>;
  baton: ReturnType<Renderer['createMesh']>;
  guide: ReturnType<Renderer['createMesh']>;
  hudQuad: ReturnType<Renderer['createMesh']>;
} | null = null;
let timpaniBuffers: { hi: AudioBuffer; lo: AudioBuffer } | null = null;
let xrHandle: BravuraXRHandle | null = null;
let mode: 'idle' | 'desktop' | 'vr' = 'idle';
let desktopRAF = 0;
let inputSource = '—';
let desktopPointerHandler: ((e: PointerEvent) => void) | null = null;
const lessons = new Lessons();
let lessonsSummaryShown = false;
let wasResting = false;
let chimes: Chimes | null = null;
const cueTracker = new CueTracker();
const CHIMES_X = 1.35;
const CHIMES_Z = -1.7;
let chimesCenter: Vec3 = [CHIMES_X, 1.05, CHIMES_Z];
let cursorCss = { x: -9999, y: -9999 };
let forcedPointing = false;
/** All instrument audio routes here; a cutoff silences it, the downbeat restores it. */
let ensembleBus: GainNode | null = null;
let busMuted = false;
/** Audio-clock time of the most recent rendered frame (rAF liveness). */
let lastFrameAt = 0;

const HUD_MODEL = multiply(
  multiply(translation(0.78, 1.34, -1.42), rotationY(-0.35)),
  scaling(0.64, 0.32, 1)
);

function ensureAudio(): AudioContext {
  if (!ac) ac = new AudioContext({ latencyHint: 'interactive' });
  if (ac.state === 'suspended') void ac.resume();
  if (!ensembleBus) {
    ensembleBus = ac.createGain();
    ensembleBus.connect(ac.destination);
  }
  return ac;
}

function ensureScene(): void {
  if (renderer) return;
  const canvas = $('gl') as HTMLCanvasElement;
  // preserveDrawingBuffer: screenshots (verification + sharing) must show the
  // room; cost is negligible at this scene size.
  const gl = canvas.getContext('webgl', {
    xrCompatible: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error('WebGL unavailable');
  renderer = new Renderer(gl);
  timpani = new Timpani(renderer, 0, -1.35, 0);
  chimes = new Chimes(renderer, ensureAudio(), CHIMES_X, CHIMES_Z, -0.5);
  if (ensembleBus) chimes.output = ensembleBus;
  chimesCenter = chimes.center(CHIMES_X, CHIMES_Z);
  lessons.chimes = chimes;
  cueTracker.onCue = (t) => chimes?.cue(t);
  hud = new Hud();
  hudTex = renderer.createHudTexture(hud.canvas);
  meshes = {
    floor: renderer.createMesh(disc(6, 0, 5, 64)),
    joint: renderer.createMesh(sphere(1, 8, 12)),
    baton: renderer.createMesh(cylinder(0.007, 0.004, 0.36, 10)),
    guide: renderer.createMesh(sphere(1, 10, 14)),
    hudQuad: renderer.createMesh(quad()),
  };
}

function newConductor(kind: 'desktop' | 'vr'): Conductor {
  const ctx = ensureAudio();
  if (!timpaniBuffers) timpaniBuffers = makeTimpaniBuffers(ctx);
  const c = new Conductor(ctx, kind === 'desktop' ? DESKTOP_CONFIG : XR_CONFIG, {
    onClick: (t, isDownbeat, velocity, beatInBar, scheduledAt) => {
      timpani?.strike(t, isDownbeat, velocity ?? 1);
      chimes?.onBeat(scheduledAt ?? t, beatInBar ?? (isDownbeat ? 0 : 1), velocity ?? 1);
    },
    onHold: () => {
      $('status').textContent = 'HOLD — frozen. One decisive flick cuts them off.';
    },
    onCutoff: () => {
      if (ensembleBus && ac) {
        ensembleBus.gain.setTargetAtTime(0, ac.currentTime, 0.03);
        busMuted = true;
      }
      $('status').textContent = 'Cut. Silence. Breathe — and give the next downbeat.';
    },
    // Audio-critical: the bus MUST come back on the downbeat itself, never
    // on a render frame (frames stall when compositing pauses — found live:
    // a dead rAF left the room permanently silent after a cutoff).
    onDownbeat: () => {
      if (busMuted && ensembleBus && ac) {
        ensembleBus.gain.setTargetAtTime(1, ac.currentTime, 0.05);
        busMuted = false;
      }
    },
  });
  c.setClickBuffers(timpaniBuffers.hi, timpaniBuffers.lo);
  if (ensembleBus) c.output = ensembleBus;
  // An orchestra that loses its conductor falls quiet (founder question
  // 2026-08-13: "why do the beats continue with no cursor movement?").
  c.autoRestBeats = 8;
  // The full grammar: raise-and-freeze holds them; a flick cuts them off.
  c.holdsEnabled = true;
  return c;
}

// ---------------------------------------------------------------------------
// Scene drawing (shared by desktop mono and each XR eye)
// ---------------------------------------------------------------------------

function drawScene(data?: Pick<XRFrameData, 'hands' | 'controllers'>): void {
  const r = renderer;
  if (!r || !meshes || !timpani) return;

  r.draw(meshes.floor, translation(0, 0, 0), FLOOR);
  timpani.draw(r);
  chimes?.draw(r);

  if (data) {
    for (const side of ['left', 'right'] as const) {
      const hf = data.hands[side];
      if (hf) {
        for (let j = 0; j < 25; j++) {
          const x = hf.positions[j * 3];
          if (Number.isNaN(x)) continue;
          const y = hf.positions[j * 3 + 1];
          const z = hf.positions[j * 3 + 2];
          const rad = Math.max(hf.radii[j], 0.004);
          r.draw(
            meshes.joint,
            multiply(translation(x, y, z), scaling(rad, rad, rad)),
            JOINT
          );
        }
      } else if (data.controllers[side]) {
        // Baton along the grip's forward, tilted like a held stick.
        const grip = data.controllers[side] as Float32Array as Mat4;
        const model = multiply(grip, rotationX(-2.1));
        r.draw(meshes.baton, model, BATON);
      }
    }

    // The wrist the room is actually listening to gets a warm glow, so the
    // student can SEE which hand holds the podium (and see it vanish the
    // moment tracking loses that hand — truth over mystery).
    const beatHand =
      inputSource === 'hand-right' ? 'right' : inputSource === 'hand-left' ? 'left' : null;
    const bh = beatHand ? data.hands[beatHand] : undefined;
    if (bh && !Number.isNaN(bh.positions[0])) {
      r.draw(
        meshes.joint,
        multiply(
          translation(bh.positions[0], bh.positions[1], bh.positions[2]),
          scaling(0.024, 0.024, 0.024)
        ),
        MARKER
      );
    }
  }

  // Lesson 1 demo: a ball bouncing on the drum head shows the stroke the
  // room listens for. It lands exactly on the drum's real clicks, so what
  // the student sees IS what they hear.
  const gBpm = lessons.guideBpm();
  if (gBpm && ac && conductor) {
    const period = 60 / (conductor.ensembleBpm || gBpm);
    const ref = conductor.lastClick ? conductor.lastClick.scheduledAt : 0;
    const phase = ((((ac.currentTime - ref) / period) % 1) + 1) % 1;
    const gy = 0.95 + 0.42 * Math.sin(Math.PI * phase);
    r.draw(meshes.guide, multiply(translation(0, gy, -1.35), scaling(0.05, 0.05, 0.05)), GUIDE);
  }

  if (hudTex) r.drawHud(meshes.hudQuad, HUD_MODEL, hudTex);
}

function pumpHud(): void {
  if (!hud || !conductor || !renderer || !hudTex) return;
  const now = (ac as AudioContext).currentTime;
  lastFrameAt = now;
  const lessonUi = lessons.tick(now);
  if (lessons.finished && !lessonsSummaryShown) {
    lessonsSummaryShown = true;
    showLessonsSummary(lessons.results);
  }
  const resting = conductor.isResting;
  if (resting !== wasResting) {
    wasResting = resting;
    if (mode !== 'idle') {
      $('status').textContent = resting
        ? 'The drum rests — give a downbeat to begin again.'
        : mode === 'vr'
          ? 'In the room. Wave a hand; change speed and hold it.'
          : 'Conducting with the mouse — wave up and down anywhere.';
    }
  }
  const s = conductor.detector.summary();
  const last = s.trials.length ? s.trials[s.trials.length - 1] : null;
  const changed = hud.render({
    youBpm: s.conductedBpm,
    ensembleBpm: conductor.isRunning && !resting ? conductor.ensembleBpm : null,
    beats: s.beats,
    source: inputSource,
    lastTrial:
      last && last.latencyMs !== null
        ? {
            ms: last.latencyMs,
            beats: last.latencyBeats as number,
            cls: trialVerdict(last),
          }
        : null,
    offsetMs: s.medianBeatOffsetMs,
    lesson: lessonUi,
    ensemble: conductor.isHolding
      ? 'HOLDING — flick to cut'
      : busMuted
        ? 'silence — give the downbeat'
        : cueTracker.isPointingAt((ac as AudioContext).currentTime)
          ? '→ chimes'
          : chimes?.state === 'pending-join'
            ? 'chimes joining on 1…'
            : chimes?.state === 'pending-leave'
              ? 'chimes leaving on 1'
              : chimes?.state === 'active'
                ? 'chimes playing'
                : '',
  });
  if (changed) renderer.updateHudTexture(hudTex, hud.canvas);
}

function showLessonsSummary(results: LessonResult[]): void {
  const worst = results.some((r) => r.cls === 'bad')
    ? 'bad'
    : results.some((r) => r.cls === 'warn')
      ? 'warn'
      : 'good';
  const banner = $('verdict');
  banner.className = `verdict ${worst}`;
  banner.textContent = results.map((r) => `${r.title}: ${r.score}/100`).join('  ·  ') +
    ' — the room keeps playing; run the lessons again any time.';
  $('final-numbers').textContent = results.map((r) => `${r.title}: ${r.verdict}`).join(' ');
  $('receipt-row').style.display = 'block';
}

/**
 * Lessons watch ONE conductor. Every mode switch builds a fresh conductor,
 * so an active lesson run must be re-attached (it restarts from Lesson 1 in
 * the new mode's units). Without this, "Teach me" then "Enter the room"
 * left the counter frozen at 0/18 forever — the founder's first headset run.
 */
function rebindLessons(): void {
  if (!lessons.running || !conductor) return;
  lessonsSummaryShown = false;
  lessons.spreadFloor = mode === 'vr' ? 0.05 : 50;
  lessons.startAll(conductor, (ac as AudioContext).currentTime);
}

// ---------------------------------------------------------------------------
// Desktop mode
// ---------------------------------------------------------------------------

function startDesktop(): void {
  stopAll(false);
  ensureScene();
  mode = 'desktop';
  conductor = newConductor('desktop');
  conductor.start(90);
  inputSource = 'mouse';
  $('status').textContent = 'Conducting with the mouse — wave up and down over the room.';
  rebindLessons();

  // Whole page is the podium (same founder bug report as the probe: input
  // bound to one element reads as a dead page when the cursor is elsewhere).
  desktopPointerHandler = (e: PointerEvent) => {
    cursorCss = { x: e.clientX, y: e.clientY };
    conductor?.feed({ t: (ac as AudioContext).currentTime, y: -e.clientY, x: e.clientX });
  };
  window.addEventListener('pointermove', desktopPointerHandler);

  const loop = () => {
    if (mode !== 'desktop') return;
    desktopRAF = requestAnimationFrame(loop);
    const r = renderer as Renderer;
    const gl = r.gl;
    const canvasEl = gl.canvas as HTMLCanvasElement;
    const w = canvasEl.clientWidth * devicePixelRatio;
    const h = canvasEl.clientHeight * devicePixelRatio;
    if (canvasEl.width !== w || canvasEl.height !== h) {
      canvasEl.width = w;
      canvasEl.height = h;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0.008, 0.008, 0.012, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const nowA = (ac as AudioContext).currentTime;
    timpani?.update(nowA);
    chimes?.update(nowA);
    // Frame both instruments regardless of pane aspect.
    const eye: [number, number, number] = [0.55, 1.55, 1.55];
    const proj = perspective(0.96, w / h, 0.05, 40);
    const view = lookAt(eye, [0.55, 0.8, -1.5], [0, 1, 0]);
    // Desktop cue: the cursor resting on the chimes IS pointing at them.
    const scr = projectToScreen(proj, view, chimesCenter, canvasEl.clientWidth, canvasEl.clientHeight);
    const pointing =
      forcedPointing ||
      (scr !== null && Math.hypot(cursorCss.x - scr[0], cursorCss.y - scr[1]) < 95);
    cueTracker.update(pointing, nowA);
    pumpHud();
    r.beginView({ x: 0, y: 0, width: w, height: h }, proj, view, eye);
    drawScene();
  };
  loop();
}

// ---------------------------------------------------------------------------
// VR mode
// ---------------------------------------------------------------------------

async function startVR(): Promise<void> {
  stopAll(false);
  ensureScene();
  mode = 'vr';
  conductor = newConductor('vr');
  conductor.start(90);
  $('status').textContent = 'In the room. Bounce one hand — the beat lands at the bottom of each bounce.';
  rebindLessons();
  try {
    const r = renderer as Renderer;
    xrHandle = await startBravuraXR(
      r.gl,
      () => (ac as AudioContext).currentTime,
      (t, y, source, x) => {
        inputSource = source;
        conductor?.feed({ t, y, x });
      },
      (data) => {
        const gl = r.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, data.framebuffer);
        gl.clearColor(0.008, 0.008, 0.012, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        const nowA = (ac as AudioContext).currentTime;
        timpani?.update(nowA);
        chimes?.update(nowA);
        // VR cue: the NON-beat hand's index ray, or either controller's
        // grip ray (the beat hand sweeps and must never cue by accident).
        let pointing = forcedPointing;
        if (!pointing) {
          for (const side of ['left', 'right'] as const) {
            const hf = data.hands[side];
            if (hf && inputSource !== `hand-${side}`) {
              const wx = hf.positions[0];
              if (!Number.isNaN(wx)) {
                const origin: Vec3 = [wx, hf.positions[1], hf.positions[2]];
                const tip: Vec3 = [hf.positions[27], hf.positions[28], hf.positions[29]];
                if (!Number.isNaN(tip[0])) {
                  const dir: Vec3 = [tip[0] - origin[0], tip[1] - origin[1], tip[2] - origin[2]];
                  if (rayPointsAt(origin, dir, chimesCenter, 0.35)) pointing = true;
                }
              }
            }
            const grip = data.controllers[side];
            if (grip) {
              const ray = gripRay(grip as Float32Array as Mat4);
              if (rayPointsAt(ray.origin, ray.dir, chimesCenter, 0.3)) pointing = true;
            }
          }
        }
        cueTracker.update(pointing, nowA);
        pumpHud();
        for (const v of data.views) {
          r.beginView(v.viewport, v.proj as Mat4, v.view as Mat4, v.camPos);
          drawScene(data);
        }
      },
      () => finishSession('Session ended — here is what was measured.')
    );
  } catch (err) {
    stopAll(false);
    $('status').textContent = `Could not enter VR: ${(err as Error).message}`;
  }
}

// ---------------------------------------------------------------------------
// Lifecycle, verdict, receipt
// ---------------------------------------------------------------------------

function stopAll(showIdle = true): void {
  if (desktopRAF) cancelAnimationFrame(desktopRAF);
  desktopRAF = 0;
  if (xrHandle) {
    void xrHandle.end().catch(() => {});
    xrHandle = null;
  }
  if (desktopPointerHandler) {
    window.removeEventListener('pointermove', desktopPointerHandler);
    desktopPointerHandler = null;
  }
  conductor?.stop();
  mode = 'idle';
  if (showIdle) $('status').textContent = 'Stopped.';
}

function finishSession(note: string): void {
  const summary = conductor?.detector.summary();
  stopAll(false);
  $('status').textContent = note;
  if (!summary) return;
  const v = verdictFor(summary.trials);
  const banner = $('verdict');
  banner.className = `verdict ${v.cls}`;
  banner.textContent = v.text;
  const t = summary.trials;
  $('final-numbers').textContent = t.length
    ? t
        .map(
          (tr) =>
            `${tr.toBpm > tr.fromBpm ? 'speed-up' : 'slow-down'}: ${Math.round(
              tr.latencyMs as number
            )} ms (${(tr.latencyBeats as number).toFixed(2)} beats)`
        )
        .join(' · ')
    : 'No completed tempo-change trials.';
  $('receipt-row').style.display = 'block';
}

function buildReceipt(): string {
  const s = conductor?.detector.summary();
  return JSON.stringify(
    {
      app: 'bravura-room',
      game: 'Bravura',
      gate: 'gate 3',
      commit: typeof GIT_COMMIT === 'string' ? GIT_COMMIT : 'dev',
      when: new Date().toISOString(),
      mode,
      inputSource,
      userAgent: navigator.userAgent,
      audio: ac
        ? { sampleRate: ac.sampleRate, baseLatency: ac.baseLatency ?? null, outputLatency: ac.outputLatency ?? null }
        : null,
      summary: s ?? null,
      lessons: lessons.results,
      chimes: chimes
        ? {
            state: chimes.state,
            cues: chimes.cueLog.length,
            transitions: chimes.transitionLog.slice(-6),
          }
        : null,
      holds: conductor
        ? {
            holdCount: conductor.holdCount,
            cutoffCount: conductor.cutoffCount,
            busGain: ensembleBus ? Math.round(ensembleBus.gain.value * 100) / 100 : null,
          }
        : null,
      verdict: s ? verdictFor(s.trials).text : null,
      bands: BANDS_NOTE,
    },
    null,
    2
  );
}

function downloadReceipt(): void {
  const blob = new Blob([buildReceipt()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bravura-room-receipt-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Buffer sanity stats for eyes-only verification: peak + rms per quarter. */
function timpaniStats(): { hi: number[]; lo: number[] } | null {
  if (!timpaniBuffers) return null;
  const stats = (b: AudioBuffer): number[] => {
    const d = b.getChannelData(0);
    const q = Math.floor(d.length / 4);
    const out: number[] = [];
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    out.push(Math.round(peak * 1000) / 1000);
    for (let w = 0; w < 4; w++) {
      let sum = 0;
      for (let i = w * q; i < (w + 1) * q; i++) sum += d[i] * d[i];
      out.push(Math.round(Math.sqrt(sum / q) * 1000) / 1000);
    }
    return out; // [peak, rmsQ1..rmsQ4]
  };
  return { hi: stats(timpaniBuffers.hi), lo: stats(timpaniBuffers.lo) };
}

/**
 * Verification probe: render one desktop frame synchronously and read pixels
 * back in the same JS turn (valid without preserveDrawingBuffer), then count
 * non-black pixels on a sample grid. Proof the scene draws, without eyes.
 */
function snapshotStats(): { size: [number, number]; nonBlack: number; maxLum: number } {
  ensureScene();
  const r = renderer as Renderer;
  const gl = r.gl;
  const canvasEl = gl.canvas as HTMLCanvasElement;
  const w = (canvasEl.width = Math.max(canvasEl.clientWidth * devicePixelRatio, 320));
  const h = (canvasEl.height = Math.max(canvasEl.clientHeight * devicePixelRatio, 240));
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.clearColor(0.008, 0.008, 0.012, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  timpani?.update(ac ? ac.currentTime : 0);
  const eye: [number, number, number] = [0.06, 1.62, 1.25];
  r.beginView(
    { x: 0, y: 0, width: w, height: h },
    perspective(0.96, w / h, 0.05, 40),
    lookAt(eye, [0, 0.82, -1.35], [0, 1, 0]),
    eye
  );
  drawScene();
  const px = new Uint8Array(4);
  let nonBlack = 0;
  let maxLum = 0;
  const N = 24;
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      gl.readPixels(
        Math.floor(((gx + 0.5) / N) * w),
        Math.floor(((gy + 0.5) / N) * h),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        px
      );
      const lum = (px[0] + px[1] + px[2]) / 3;
      if (lum > 8) nonBlack++;
      if (lum > maxLum) maxLum = lum;
    }
  }
  return { size: [w, h], nonBlack, maxLum };
}

// ---------------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------------

window.addEventListener('DOMContentLoaded', () => {
  // Heartbeat: lessons and the HUD state machine keep advancing even when
  // the page stops compositing (headset off, hidden tab — rAF freezes but
  // audio and teaching must not). Rendering itself can wait for frames.
  setInterval(() => {
    if (!ac || mode === 'idle') return;
    if (ac.currentTime - lastFrameAt > 0.35) pumpHud();
  }, 250);
  $('btn-vr').onclick = () => void startVR();
  $('btn-desktop').onclick = () => startDesktop();
  $('btn-teach').onclick = () => {
    if (mode === 'idle') startDesktop();
    lessonsSummaryShown = false;
    lessons.spreadFloor = mode === 'vr' ? 0.05 : 50;
    if (conductor) lessons.startAll(conductor, (ac as AudioContext).currentTime);
  };
  $('btn-stop').onclick = () => {
    lessons.stop();
    finishSession('Stopped — here is what was measured.');
  };
  $('btn-receipt').onclick = () => downloadReceipt();
  if (!navigator.xr) {
    ($('btn-vr') as HTMLButtonElement).disabled = true;
    $('btn-vr').title = 'WebXR not available in this browser';
  }
  window.__bravura = {
    get conductor() {
      return conductor;
    },
    get audioContext() {
      return ac;
    },
    buildReceipt,
    stop: () => finishSession('Stopped.'),
    timpaniStats,
    snapshotStats,
    lessons,
    get chimes() {
      return chimes;
    },
    get ensembleBus() {
      return ensembleBus;
    },
    get busDebug() {
      return { busMuted, mode };
    },
    cueTracker,
    forcePointing: (v: boolean) => {
      forcedPointing = v;
    },
    /** In-page unit checks for the pointing/projection math. */
    cueingChecks: () => {
      const straight = rayPointsAt([0, 0, 0], [1, 0, 0], [5, 0, 0], 0.35) === true;
      const off40deg = rayPointsAt([0, 0, 0], [1, 0, 0], [5, 5 * Math.tan(0.7), 0], 0.35) === false;
      const angle90 = Math.abs(rayAngleTo([0, 0, 0], [1, 0, 0], [0, 3, 0]) - Math.PI / 2) < 1e-6;
      const grip = gripRay(
        new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 3, 4, 1]) as unknown as Parameters<
          typeof gripRay
        >[0]
      );
      const gripOk =
        Math.abs(grip.dir[2] + 1) < 1e-6 && grip.origin[0] === 2 && grip.origin[1] === 3;
      const proj = perspective(0.96, 1.5, 0.05, 40);
      const view = lookAt([0, 1.5, 0.95], [0, 0.8, -1.35], [0, 1, 0]);
      const centerish = projectToScreen(proj, view, [0, 0.8, -1.35], 900, 600);
      const projOk =
        centerish !== null && Math.abs(centerish[0] - 450) < 2 && centerish[1] > 250 && centerish[1] < 350;
      const behind = projectToScreen(proj, view, [0, 1.5, 10], 900, 600) === null;
      return { straight, off40deg, angle90, gripOk, projOk, behind };
    },
    startLessons: (ids) => {
      if (mode === 'idle') startDesktop();
      lessonsSummaryShown = false;
      lessons.spreadFloor = mode === 'vr' ? 0.05 : 50;
      if (conductor) lessons.startAll(conductor, (ac as AudioContext).currentTime, ids);
    },
  };
});
