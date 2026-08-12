/**
 * main.ts — tempo-latency probe UI.
 *
 * Three ways to conduct the same measured pipeline:
 *   1. Desktop: wave the mouse up and down in the conducting area.
 *   2. VR (Quest browser): Enter VR, wave a hand (or controller).
 *   3. Self-test: a synthetic conductor with a known tempo step —
 *      deterministic check that the pipeline and the measurement work,
 *      plus a negative control that reproduces a known engine fault.
 */

import { Conductor } from './conductor';
import { DESKTOP_CONFIG, XR_CONFIG, StepTrial } from './beatDetector';
import { startXR, xrAvailable, XRHandle } from './xrInput';

declare const GIT_COMMIT: string;

declare global {
  interface Window {
    __probe?: {
      readonly conductor: Conductor | null;
      readonly audioContext: AudioContext | null;
      buildReceipt(): string;
      startSelfTest(negative: boolean): void;
      finishSession(note: string): void;
    };
  }
}

const $ = (id: string) => document.getElementById(id) as HTMLElement;

let ac: AudioContext | null = null;
let conductor: Conductor | null = null;
let xrHandle: XRHandle | null = null;
let mode: 'idle' | 'desktop' | 'vr' | 'selftest' | 'selftest-negative' = 'idle';
let selfTestTimer: ReturnType<typeof setInterval> | null = null;
let inputSource = '—';

function ensureAudio(): AudioContext {
  if (!ac) ac = new AudioContext({ latencyHint: 'interactive' });
  if (ac.state === 'suspended') void ac.resume();
  return ac;
}

function newConductor(kind: 'desktop' | 'vr' | 'selftest', negative = false): Conductor {
  const ctx = ensureAudio();
  const cfg = kind === 'desktop' ? DESKTOP_CONFIG : XR_CONFIG;
  const c = new Conductor(ctx, cfg, {
    onBeat: () => render(),
    onClick: () => render(),
    onStep: () => {
      $('trial-note').textContent = 'tempo change heard — timing the ensemble…';
    },
    onLock: (ms, beats) => {
      $('trial-note').textContent = `locked: ${Math.round(ms)} ms (${beats.toFixed(2)} beats)`;
      render();
    },
  });
  c.useNaiveSetter = negative;
  return c;
}

// ---------------------------------------------------------------------------
// Desktop mode
// ---------------------------------------------------------------------------

function startDesktop(): void {
  stopAll();
  mode = 'desktop';
  conductor = newConductor('desktop');
  conductor.start(90);
  inputSource = 'mouse';
  const area = $('area');
  area.classList.add('live');
  area.onpointermove = (e: PointerEvent) => {
    if (!conductor) return;
    conductor.feed({ t: (ac as AudioContext).currentTime, y: -e.clientY });
  };
  render();
}

// ---------------------------------------------------------------------------
// VR mode
// ---------------------------------------------------------------------------

async function startVR(): Promise<void> {
  stopAll();
  mode = 'vr';
  conductor = newConductor('vr');
  conductor.start(90);
  try {
    xrHandle = await startXR(
      (t, y, source) => {
        inputSource = source;
        conductor?.feed({ t, y });
      },
      () => (ac as AudioContext).currentTime,
      () => {
        // Session over (user pressed the Quest system button): show verdict.
        finishSession('Session ended — here is what was measured.');
      }
    );
    render();
  } catch (err) {
    stopAll();
    $('status').textContent = `Could not enter VR: ${(err as Error).message}`;
  }
}

// ---------------------------------------------------------------------------
// Self-test — synthetic conductor with a known step (100 → 160 BPM)
// ---------------------------------------------------------------------------

function startSelfTest(negative: boolean): void {
  stopAll();
  mode = negative ? 'selftest-negative' : 'selftest';
  conductor = newConductor('selftest', negative);
  conductor.start(100);
  inputSource = negative ? 'self-test (fault injected)' : 'self-test';

  const ctx = ac as AudioContext;
  const t0 = ctx.currentTime;
  const phaseBeats = 10; // beats at 100 BPM, then step
  const bpmA = 100;
  const bpmB = 160;
  const ampl = 0.15; // metres
  const durA = (phaseBeats * 60) / bpmA;
  const total = durA + (14 * 60) / bpmB;

  selfTestTimer = setInterval(() => {
    if (!conductor) return;
    const t = ctx.currentTime;
    const el = t - t0;
    if (el > total) {
      finishSession(
        negative
          ? 'Negative control finished — with the fault injected this SHOULD look broken.'
          : 'Self-test finished.'
      );
      return;
    }
    // Piecewise phase so the wave frequency steps cleanly at durA.
    const phase =
      el < durA ? el * (bpmA / 60) : durA * (bpmA / 60) + (el - durA) * (bpmB / 60);
    const y = ampl * Math.cos(2 * Math.PI * phase); // bottom once per beat
    conductor.feed({ t, y });
  }, 1000 / 72);
  render();
}

// ---------------------------------------------------------------------------
// Lifecycle + verdict + receipt
// ---------------------------------------------------------------------------

function stopAll(): void {
  if (selfTestTimer) {
    clearInterval(selfTestTimer);
    selfTestTimer = null;
  }
  if (xrHandle) {
    void xrHandle.end().catch(() => {});
    xrHandle = null;
  }
  $('area').classList.remove('live');
  ($('area') as HTMLElement).onpointermove = null;
  conductor?.stop();
  mode = 'idle';
}

function finishSession(note: string): void {
  const summary = conductor?.detector.summary();
  stopAll();
  $('status').textContent = note;
  renderVerdict(summary);
}

function verdictFor(beats: number | null): { text: string; cls: string } {
  if (beats === null)
    return {
      text: 'No tempo-change trials were completed — wave steadily, then clearly change speed.',
      cls: 'unknown',
    };
  if (beats <= 1.25)
    return { text: 'The ensemble follows within about a beat. This will feel like conducting.', cls: 'good' };
  if (beats <= 2.5)
    return { text: 'The ensemble is a couple of beats behind. Playable, needs tightening.', cls: 'warn' };
  return { text: 'Too slow to feel like conducting. Engineering needed before the game is fun.', cls: 'bad' };
}

function renderVerdict(summary: ReturnType<Conductor['detector']['summary']> | undefined): void {
  if (!summary) return;
  const v = verdictFor(summary.medianStepLatencyBeats);
  const banner = $('verdict');
  banner.className = `verdict ${v.cls}`;
  banner.textContent = v.text;
  const ms =
    summary.medianStepLatencyMs !== null ? `${Math.round(summary.medianStepLatencyMs)} ms` : '—';
  const beats =
    summary.medianStepLatencyBeats !== null ? summary.medianStepLatencyBeats.toFixed(2) : '—';
  const phase =
    summary.medianBeatOffsetMs !== null ? `${Math.round(summary.medianBeatOffsetMs)} ms` : '—';
  $('final-numbers').textContent =
    `Tempo change → ensemble locked: ${ms} (${beats} beats, median of ${summary.trials.length} trial(s)). ` +
    `Beat-to-click offset: ${phase}.`;
  $('receipt-row').style.display = 'block';
}

function render(): void {
  if (!conductor) return;
  const s = conductor.detector.summary();
  $('you-bpm').textContent = s.conductedBpm ? String(Math.round(s.conductedBpm)) : '—';
  $('ens-bpm').textContent = conductor.isRunning ? String(Math.round(conductor.ensembleBpm)) : '—';
  $('beats').textContent = String(s.beats);
  $('trials').textContent = String(s.trials.length);
  $('source').textContent = inputSource;
  $('status').textContent =
    mode === 'idle' ? 'Stopped.' : `Conducting (${mode}) — beat source: ${inputSource}`;
}

function buildReceipt(): string {
  const s = conductor?.detector.summary();
  const ctx = ac;
  return JSON.stringify(
    {
      app: 'tempo-latency-probe',
      gate: 'conducting-game gate 1',
      commit: typeof GIT_COMMIT === 'string' ? GIT_COMMIT : 'dev',
      when: new Date().toISOString(),
      mode,
      inputSource,
      userAgent: navigator.userAgent,
      audio: ctx
        ? {
            sampleRate: ctx.sampleRate,
            baseLatency: ctx.baseLatency ?? null,
            outputLatency: ctx.outputLatency ?? null,
          }
        : null,
      summary: s ?? null,
      trials: s?.trials ?? [],
      verdict: s ? verdictFor(s.medianStepLatencyBeats).text : null,
      bands: 'green ≤1.25 beats, amber ≤2.5, red above — design targets, not industry standards',
    },
    null,
    2
  );
}

function downloadReceipt(): void {
  const blob = new Blob([buildReceipt()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tempo-latency-receipt-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  try {
    localStorage.setItem('tempo-latency-last-receipt', buildReceipt());
  } catch {
    /* storage may be unavailable; the download already happened */
  }
}

// ---------------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------------

window.addEventListener('DOMContentLoaded', () => {
  $('btn-desktop').onclick = () => startDesktop();
  $('btn-vr').onclick = () => void startVR();
  $('btn-selftest').onclick = () => startSelfTest(false);
  $('btn-negative').onclick = () => startSelfTest(true);
  $('btn-stop').onclick = () => finishSession('Stopped — here is what was measured.');
  $('btn-receipt').onclick = () => downloadReceipt();
  if (!xrAvailable()) {
    ($('btn-vr') as HTMLButtonElement).disabled = true;
    $('btn-vr').title = 'WebXR not available in this browser';
  }
  // Expose for automated verification (synthetic pointer events can't carry
  // audio-clock timestamps; tests drive the conductor directly).
  window.__probe = {
    get conductor() {
      return conductor;
    },
    get audioContext() {
      return ac;
    },
    buildReceipt,
    startSelfTest,
    finishSession,
  };
});
