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
import { median, StepTrial } from '../../tempo-latency-probe/src/beatDetector';
import { trialVerdict } from '../../tempo-latency-probe/src/verdict';

export type LessonId = 'steady' | 'onbeat' | 'dynamics' | 'tempo' | 'pattern4' | 'pattern3';

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
  /** When set, the HUD draws the beat-pattern diagram beside the text. */
  pattern?: '4' | '3';
}

const TITLES: Record<LessonId, string> = {
  steady: 'Steady Hand',
  onbeat: 'On the Beat',
  dynamics: 'Louder & Softer',
  tempo: 'Changing Tempo',
  pattern4: 'The Four',
  pattern3: 'The Three',
};

interface PatternCfg {
  bar: number;
  template: ('C' | 'L' | 'R')[];
  glyph: '4' | '3';
  scoredBars: number;
}

const PATTERNS: Record<'pattern4' | 'pattern3', PatternCfg> = {
  // Right-handed, viewer's frame: 4/4 = down(center), in(left), out(right),
  // up(center). 3/4 = down(center), out(right), up(center). Mirrored
  // left-handed templates are seeded, not built.
  pattern4: { bar: 4, template: ['C', 'L', 'R', 'C'], glyph: '4', scoredBars: 5 },
  pattern3: { bar: 3, template: ['C', 'R', 'C'], glyph: '3', scoredBars: 5 },
};

const CARD_SECONDS = 5;
const ONBEAT_BPM = 90;
const ONBEAT_SECONDS = 12;

export class Lessons {
  state: 'idle' | 'running' | 'card' = 'idle';
  current: LessonId | null = null;
  readonly results: LessonResult[] = [];
  /** Current sub-phase, exposed for drivers and debugging ('', 'hold', 'up', 'mid', 'down'). */
  uiPhase = '';
  /** Minimum lateral spread for pattern grading (px on desktop, m in VR — set by the host). */
  spreadFloor = 50;
  private queue: LessonId[] = [];
  private conductor: Conductor | null = null;
  private t0 = 0;
  private baseBeats = 0;
  private cardUntil = 0;
  private pendingCard: LessonResult | null = null;
  private tempoPhase: 'hold' | 'up' | 'mid' | 'down' = 'hold';
  private phaseT0 = 0;
  private trialsBase = 0;
  private upTrial: StepTrial | null = null;
  private downTrial: StepTrial | null = null;

  startAll(conductor: Conductor, now: number, ids?: LessonId[]): void {
    this.results.length = 0;
    this.queue = ids ?? ['steady', 'onbeat', 'dynamics', 'tempo', 'pattern4', 'pattern3'];
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
    this.tempoPhase = 'hold';
    this.phaseT0 = now;
    this.upTrial = null;
    this.downTrial = null;
    this.uiPhase = '';
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

    if (id === 'dynamics') {
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

    if (id === 'tempo') return this.tickTempo(c, now, beats);

    // pattern4 / pattern3
    const cfg = PATTERNS[id as 'pattern4' | 'pattern3'];
    const totalBeats = (1 + cfg.scoredBars) * cfg.bar; // 1 settle bar
    if (beats >= totalBeats) return this.finish(this.scorePattern(c, cfg), now);
    const beatInBar = (Math.max(beats, 0) % cfg.bar) + 1;
    return {
      prompt: `Lesson · ${TITLES[id]}`,
      sub:
        beats < cfg.bar
          ? `Follow the numbers on the panel — a bar of ${cfg.bar}. First bar is practice.`
          : `Keep the shape going — you're on ${beatInBar}.`,
      progress: `${Math.min(beats, totalBeats)} / ${totalBeats} beats`,
      card: null,
      pattern: cfg.glyph,
    };
  }

  private tickTempo(c: Conductor, now: number, beats: number): LessonUi {
    const trials = c.detector.trials;
    if (this.tempoPhase === 'hold') {
      this.uiPhase = 'hold';
      if (beats >= 6) {
        this.tempoPhase = 'up';
        this.phaseT0 = now;
        this.trialsBase = trials.length;
      }
      return {
        prompt: 'Lesson 4 · Changing Tempo',
        sub: 'Start a steady beat — any speed.',
        progress: `${Math.min(beats, 6)} / 6 beats`,
        card: null,
      };
    }
    if (this.tempoPhase === 'up') {
      this.uiPhase = 'up';
      const fresh = trials.slice(this.trialsBase).find((tr) => tr.toBpm > tr.fromBpm);
      if (fresh) {
        this.upTrial = fresh;
        this.tempoPhase = 'mid';
        this.phaseT0 = now;
      } else if (now - this.phaseT0 > 12) {
        this.tempoPhase = 'mid';
        this.phaseT0 = now;
      }
      return {
        prompt: 'Lesson 4 · Changing Tempo',
        sub: 'Now clearly SPEED UP — and hold the new speed.',
        progress: `${Math.ceil(Math.max(0, 12 - (now - this.phaseT0)))} s`,
        card: null,
      };
    }
    if (this.tempoPhase === 'mid') {
      this.uiPhase = 'mid';
      if (now - this.phaseT0 > 2.5) {
        this.tempoPhase = 'down';
        this.phaseT0 = now;
        this.trialsBase = trials.length;
      }
      return {
        prompt: 'Lesson 4 · Changing Tempo',
        sub: this.upTrial ? 'Good — hold this speed.' : 'Hold your speed a moment.',
        progress: '',
        card: null,
      };
    }
    // down
    this.uiPhase = 'down';
    const fresh = trials.slice(this.trialsBase).find((tr) => tr.toBpm < tr.fromBpm);
    if (fresh) {
      this.downTrial = fresh;
      return this.finish(this.scoreTempo(), now);
    }
    if (now - this.phaseT0 > 12) return this.finish(this.scoreTempo(), now);
    return {
      prompt: 'Lesson 4 · Changing Tempo',
      sub: 'Now clearly SLOW DOWN — and hold it.',
      progress: `${Math.ceil(Math.max(0, 12 - (now - this.phaseT0)))} s`,
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

  private scoreTempo(): LessonResult {
    const sub = (tr: StepTrial | null): { pts: number; line: string } => {
      if (!tr || tr.latencyBeats === null) return { pts: 10, line: 'no clear change heard' };
      const v = trialVerdict(tr);
      const b = (tr.latencyBeats as number).toFixed(1);
      if (v === 'good') return { pts: 95, line: `${b} beats — crisp` };
      if (v === 'warn') return { pts: 65, line: `${b} beats — a bit slow` };
      return { pts: 30, line: `${b} beats — sluggish` };
    };
    const up = sub(this.upTrial);
    const down = sub(this.downTrial);
    const score = Math.round((up.pts + down.pts) / 2);
    const cls: LessonResult['cls'] = score >= 75 ? 'good' : score >= 45 ? 'warn' : 'bad';
    return {
      id: 'tempo',
      title: TITLES.tempo,
      score,
      verdict: `Speeding up: ${up.line}. Slowing down: ${down.line}.`,
      cls,
      raw: {
        upBeats: this.upTrial?.latencyBeats ?? null,
        upMs: this.upTrial?.latencyMs ?? null,
        downBeats: this.downTrial?.latencyBeats ?? null,
        downMs: this.downTrial?.latencyMs ?? null,
      },
    };
  }

  private scorePattern(c: Conductor, cfg: PatternCfg): LessonResult {
    const start = this.baseBeats + cfg.bar; // skip the practice bar
    const xs = c.detector.beatXs.slice(start, this.baseBeats + (1 + cfg.scoredBars) * cfg.bar);
    const valid = xs.filter((x) => Number.isFinite(x));
    const id = cfg.glyph === '4' ? 'pattern4' : ('pattern3' as LessonId);
    if (valid.length < cfg.bar * 2) {
      return {
        id: id as 'pattern4' | 'pattern3',
        title: TITLES[id],
        score: 10,
        verdict: 'No sideways movement seen — this shape needs left and right, not just up and down.',
        cls: 'bad',
        raw: { bars: 0, matched: 0, spread: null },
      };
    }
    const sorted = [...valid].sort((a, b) => a - b);
    const spread = sorted[Math.floor(sorted.length * 0.85)] - sorted[Math.floor(sorted.length * 0.15)];
    if (spread < this.spreadFloor) {
      return {
        id: id as 'pattern4' | 'pattern3',
        title: TITLES[id],
        score: 15,
        verdict: 'Make the shape BIGGER — sweep clearly to the left and right corners.',
        cls: 'bad',
        raw: { bars: 0, matched: 0, spread: Math.round(spread * 100) / 100 },
      };
    }
    const mid = median(valid);
    const classify = (x: number): 'C' | 'L' | 'R' =>
      x < mid - 0.25 * spread ? 'L' : x > mid + 0.25 * spread ? 'R' : 'C';
    let matched = 0;
    let bars = 0;
    for (let b = 0; b + cfg.bar <= xs.length; b += cfg.bar) {
      bars++;
      let hits = 0;
      for (let i = 0; i < cfg.bar; i++) {
        const x = xs[b + i];
        if (Number.isFinite(x) && classify(x) === cfg.template[i]) hits++;
      }
      if (hits === cfg.bar) matched += 1;
      else if (hits === cfg.bar - 1) matched += 0.5;
    }
    const score = bars ? Math.round((matched / bars) * 100) : 0;
    let verdict: string;
    let cls: LessonResult['cls'];
    if (score >= 80) {
      verdict = `You're drawing a real ${cfg.bar}-pattern — a conductor's hand.`;
      cls = 'good';
    } else if (score >= 55) {
      verdict = 'The shape is emerging — hit the corners harder.';
      cls = 'warn';
    } else {
      verdict = 'The shape isn’t there yet — follow the numbers, big and deliberate.';
      cls = 'bad';
    }
    return {
      id: id as 'pattern4' | 'pattern3',
      title: TITLES[id],
      score,
      verdict,
      cls,
      raw: { bars, matched, spread: Math.round(spread * 100) / 100 },
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
