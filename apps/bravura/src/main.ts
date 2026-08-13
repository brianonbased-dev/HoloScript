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
      startLessons(ids?: Parameters<Lessons['startAll']>[2]): void;
    };
  }
}

const $ = (id: string) => document.getElementById(id) as HTMLElement;

const FLOOR: Material = { color: [0.135, 0.128, 0.118], metal: 0.2, shiny: 60, emissive: 0 };
const JOINT: Material = { color: [0.85, 0.8, 0.66], metal: 0, shiny: 30, emissive: 0.55 };
const BATON: Material = { color: [0.93, 0.92, 0.88], metal: 0, shiny: 40, emissive: 0.25 };

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

const HUD_MODEL = multiply(
  multiply(translation(0.78, 1.34, -1.42), rotationY(-0.35)),
  scaling(0.64, 0.32, 1)
);

function ensureAudio(): AudioContext {
  if (!ac) ac = new AudioContext({ latencyHint: 'interactive' });
  if (ac.state === 'suspended') void ac.resume();
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
  hud = new Hud();
  hudTex = renderer.createHudTexture(hud.canvas);
  meshes = {
    floor: renderer.createMesh(disc(6, 0, 5, 64)),
    joint: renderer.createMesh(sphere(1, 8, 12)),
    baton: renderer.createMesh(cylinder(0.007, 0.004, 0.36, 10)),
    hudQuad: renderer.createMesh(quad()),
  };
}

function newConductor(kind: 'desktop' | 'vr'): Conductor {
  const ctx = ensureAudio();
  if (!timpaniBuffers) timpaniBuffers = makeTimpaniBuffers(ctx);
  const c = new Conductor(ctx, kind === 'desktop' ? DESKTOP_CONFIG : XR_CONFIG, {
    onClick: (t, isDownbeat, velocity) => timpani?.strike(t, isDownbeat, velocity ?? 1),
  });
  c.setClickBuffers(timpaniBuffers.hi, timpaniBuffers.lo);
  // An orchestra that loses its conductor falls quiet (founder question
  // 2026-08-13: "why do the beats continue with no cursor movement?").
  c.autoRestBeats = 8;
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
  }

  if (hudTex) r.drawHud(meshes.hudQuad, HUD_MODEL, hudTex);
}

function pumpHud(): void {
  if (!hud || !conductor || !renderer || !hudTex) return;
  const now = (ac as AudioContext).currentTime;
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

  // Whole page is the podium (same founder bug report as the probe: input
  // bound to one element reads as a dead page when the cursor is elsewhere).
  desktopPointerHandler = (e: PointerEvent) => {
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
    timpani?.update((ac as AudioContext).currentTime);
    pumpHud();
    const eye: [number, number, number] = [0.05, 1.5, 0.95];
    r.beginView(
      { x: 0, y: 0, width: w, height: h },
      perspective(0.96, w / h, 0.05, 40),
      lookAt(eye, [0, 0.8, -1.35], [0, 1, 0]),
      eye
    );
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
  $('status').textContent = 'In the room. Wave a hand; change speed and hold it.';
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
        timpani?.update((ac as AudioContext).currentTime);
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
    startLessons: (ids) => {
      if (mode === 'idle') startDesktop();
      lessonsSummaryShown = false;
      lessons.spreadFloor = mode === 'vr' ? 0.05 : 50;
      if (conductor) lessons.startAll(conductor, (ac as AudioContext).currentTime, ids);
    },
  };
});
