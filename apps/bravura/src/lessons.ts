/**
 * lessons.ts — the room starts teaching.
 *
 * Three ~30-second lessons, each a single skill with an honest measurement
 * and a plain-words score card. Free play is the default; lessons are a
 * button. House rule: the room teaches by responding, never by homework.
 *
 *   1. Steady Hand — keep an even beat at your own pace (wobble measure).
 *   2. On the Beat — the drum leads at 90; land your strokes on it
 *      (signed early/late offsets vs the engine grid; misses count).
 *   3. Louder & Softer — big strokes vs small strokes on prompt
 *      (stroke size drives strike strength; contrast + control).
 */

import { Conductor } from '../../tempo-latency-probe/src/conductor';
import { median } from '../../tempo-latency-probe/src/beatDetector';

export type LessonId = 'steady' | 'onbeat' | 'dynamics';

export interface LessonResult {
  id: LessonId;
  title: string;
  score: number; // 0..100
  verdict: string;
  cls: 'good' | 'warn' | 'bad';
  raw: Record<string, number | null>;
}

export interface LessonUi {
  prompt: string;
  sub: string;
  progress: string;
  card: LessonResult | null;
}

const TITLES: Record<LessonId, string> = {
  steady: 'Steady Hand',
  onbeat: 'On the Beat',
  dynamics: 'Louder & Softer',
};

const CARD_SECONDS = 5;
const ONBEAT_BPM = 90;
const ONBEAT_SECONDS = 12;

export class Lessons {
  state: 'idle' | 'running' | 'card' = 'idle';
  current: LessonId | null = null;
  readonly results: LessonResult[] = [];
  private queue: LessonId[] = [];
  private conductor: Conductor | null = null;
  private t0 = 0;
  private baseBeats = 0;
  private cardUntil = 0;
  private pendingCard: LessonResult | null = null;

  startAll(conductor: Conductor, now: number): void {
    this.results.length = 0;
    this.queue = ['steady', 'onbeat', 'dynamics'];
    this.conductor = conductor;
    this.next(now);
  }

  stop(): void {
    if (this.conductor) this.conductor.followMode = 'follow';
    this.state = 'idle';
    this.current = null;
    this.queue = [];
  }

  get finished(): boolean {
    return this.state === 'idle' && this.results.length > 0;
  }

  private next(now: number): void {
    const c = this.conductor;
    if (!c) return;
    const id = this.queue.shift();
    if (!id) {
      c.followMode = 'follow';
      this.state = 'idle';
      this.current = null;
      return;
    }
    this.current = id;
    this.state = 'running';
    this.t0 = now;
    this.baseBeats = c.detector.beatTimes.length;
    c.clearScoring();
    if (id === 'onbeat') {
      c.followMode = 'lead';
      c.seq.setTempoAnchored(ONBEAT_BPM);
    } else {
      c.followMode = 'follow';
    }
  }

  /** Advance; call every frame with the audio-clock time. */
  tick(now: number): LessonUi | null {
    const c = this.conductor;
    if (!c || this.state === 'idle') return null;

    if (this.state === 'card') {
      if (now >= this.cardUntil) {
        this.next(now);
        return this.tick(now);
      }
      return {
        prompt: this.pendingCard ? TITLES[this.pendingCard.id] : '',
        sub: '',
        progress: '',
        card: this.pendingCard,
      };
    }

    const id = this.current as LessonId;
    const beats = c.detector.beatTimes.length - this.baseBeats;

    if (id === 'steady') {
      const need = 18; // 2 settle + 16 scored
      if (beats >= need) return this.finish(this.scoreSteady(c), now);
      return {
        prompt: 'Lesson 1 · Steady Hand',
        sub: 'Wave an even beat — any speed you like.',
        progress: `${Math.min(beats, need)} / ${need} beats`,
        card: null,
      };
    }

    if (id === 'onbeat') {
      const el = now - this.t0;
      if (el >= ONBEAT_SECONDS) return this.finish(this.scoreOnbeat(c, el), now);
      return {
        prompt: 'Lesson 2 · On the Beat',
        sub: `The drum leads at ${ONBEAT_BPM}. Land your stroke ON its beat.`,
        progress: `${Math.ceil(ONBEAT_SECONDS - el)} s`,
        card: null,
      };
    }

    // dynamics
    const need = 16;
    if (beats >= need) return this.finish(this.scoreDynamics(c), now);
    const block = Math.floor(Math.max(beats, 0) / 4) % 2;
    return {
      prompt: 'Lesson 3 · Louder & Softer',
      sub: block === 0 ? 'BIG strokes — make it thunder.' : 'small strokes — barely a whisper.',
      progress: `${Math.min(beats, need)} / ${need} beats`,
      card: null,
    };
  }

  private finish(result: LessonResult, now: number): LessonUi {
    this.results.push(result);
    this.pendingCard = result;
    this.state = 'card';
    this.cardUntil = now + CARD_SECONDS;
    if (this.conductor) this.conductor.followMode = 'follow';
    try {
      const key = `bravura-best-${result.id}`;
      const prev = Number(localStorage.getItem(key) ?? '0');
      if (result.score > prev) localStorage.setItem(key, String(result.score));
    } catch {
      /* storage unavailable — bests just don't persist */
    }
    return { prompt: TITLES[result.id], sub: '', progress: '', card: result };
  }

  // ── Scoring ───────────────────────────────────────────────────────────────

  private scoreSteady(c: Conductor): LessonResult {
    const xs = c.detector.intervals.slice(-16);
    const mean = xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
    const sd = Math.sqrt(
      xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(xs.length, 1)
    );
    const cv = mean > 0 ? sd / mean : 1;
    let verdict: string;
    let cls: LessonResult['cls'];
    if (cv <= 0.045) {
      verdict = 'Rock steady. A metronome would be jealous.';
      cls = 'good';
    } else if (cv <= 0.09) {
      verdict = 'Steady hand — just a tiny wobble.';
      cls = 'good';
    } else if (cv <= 0.16) {
      verdict = 'A little wobbly — calmer, evener strokes.';
      cls = 'warn';
    } else {
      verdict = 'All over the place — slow down, breathe, keep the strokes even.';
      cls = 'bad';
    }
    return {
      id: 'steady',
      title: TITLES.steady,
      score: Math.max(5, Math.round(100 - cv * 550)),
      verdict,
      cls,
      raw: { cv: Math.round(cv * 1000) / 1000, bpm: mean > 0 ? Math.round(60 / mean) : null },
    };
  }

  private scoreOnbeat(c: Conductor, elapsed: number): LessonResult {
    const period = 60 / ONBEAT_BPM;
    const offs = c.signedOffsets.map((o) => o.ms);
    // Offsets beyond ±40% of the period fold at the nearest-grid boundary —
    // score those as lost, not as precise numbers (premortem guard 2).
    const usable = offs.filter((ms) => Math.abs(ms) <= period * 400);
    const expected = Math.floor(elapsed / period) - 1;
    const misses = Math.max(0, expected - offs.length) + (offs.length - usable.length);
    const med = usable.length ? median(usable.map(Math.abs)) : null;
    const bias = usable.length ? usable.reduce((a, b) => a + b, 0) / usable.length : 0;

    let verdict: string;
    let cls: LessonResult['cls'];
    let score: number;
    if (med === null) {
      verdict = 'No strokes landed — wave along with the drum.';
      cls = 'bad';
      score = 5;
    } else if (med <= 45) {
      verdict = 'Glued to the drum.';
      cls = 'good';
      score = 95;
    } else if (med <= 85) {
      verdict = 'With it — nice.';
      cls = 'good';
      score = 80;
    } else if (med <= 140) {
      verdict = 'Close — listen one beat ahead.';
      cls = 'warn';
      score = 55;
    } else {
      verdict = 'Chasing it — let the drum carry you.';
      cls = 'bad';
      score = 30;
    }
    // The detector itself lands ~34 ms late on a perfect stroke (measured
    // against a grid-aligned synthetic conductor) — the tendency hint must
    // sit above the instrument's own lag or it nags perfect players.
    // Proper per-mode latency calibration is seeded for gate 5.
    if (med !== null && bias > 55) verdict += ' You land a touch late — strike a hair earlier.';
    if (med !== null && bias < -25) verdict += ' You land a touch early — let it come to you.';
    score = Math.max(5, score - misses * 4);
    return {
      id: 'onbeat',
      title: TITLES.onbeat,
      score,
      verdict,
      cls,
      raw: {
        medianAbsMs: med === null ? null : Math.round(med),
        biasMs: Math.round(bias),
        misses,
        strokes: offs.length,
      },
    };
  }

  private scoreDynamics(c: Conductor): LessonResult {
    const vs = c.velocities.slice(-16).map((v) => v.v);
    const big: number[] = [];
    const small: number[] = [];
    vs.forEach((v, i) => {
      (Math.floor(i / 4) % 2 === 0 ? big : small).push(v);
    });
    const mb = big.length ? median(big) : null;
    const ms = small.length ? median(small) : null;
    const contrast = mb !== null && ms !== null && ms > 0 ? mb / ms : null;

    let verdict: string;
    let cls: LessonResult['cls'];
    let score: number;
    if (contrast === null || vs.length < 12) {
      verdict = 'Not enough strokes to judge — keep waving through the whole lesson.';
      cls = 'bad';
      score = 10;
    } else if (contrast >= 1.9) {
      verdict = 'The drum obeys your size — real dynamics.';
      cls = 'good';
      score = 92;
    } else if (contrast >= 1.4) {
      verdict = 'It hears you — now exaggerate: make BIG huge and small tiny.';
      cls = 'warn';
      score = 68;
    } else {
      verdict = 'Every stroke lands the same — your size IS the volume. Use it.';
      cls = 'bad';
      score = 35;
    }
    return {
      id: 'dynamics',
      title: TITLES.dynamics,
      score,
      verdict,
      cls,
      raw: {
        contrast: contrast === null ? null : Math.round(contrast * 100) / 100,
        bigMedian: mb === null ? null : Math.round(mb * 100) / 100,
        smallMedian: ms === null ? null : Math.round(ms * 100) / 100,
        strokes: vs.length,
      },
    };
  }
}
