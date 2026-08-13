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

import { Chimes } from './chimes';

export type LessonId =
  | 'steady'
  | 'onbeat'
  | 'dynamics'
  | 'tempo'
  | 'pattern4'
  | 'pattern3'
  | 'downbeat'
  | 'cue'
  | 'hold';

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
  downbeat: 'The Downbeat',
  cue: 'The Cue',
  hold: 'The Hold & the Cut',
};

const HOLD_MIN_SEC = 1.5;

const DOWNBEAT_TARGET_BPM = 90;
const DOWNBEAT_TRIALS = 3;
const CUE_BPM = 90;
const CUE_TRIALS = 3;
/** The chimes enter on the downbeat two bars after the count-in starts. */
const CUE_ENTRANCE_CLICKS = 8;

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
  private dbPhase: 'demo' | 'still' | 'go' = 'demo';
  private dbCountSnap = 0;
  private dbTrials: { bpm: number | null; casual: boolean; hesitations: number }[] = [];
  /** The chimes instance (set by the host so the cue lesson can drive them). */
  chimes: Chimes | null = null;
  private cuePhase: 'sync' | 'count' = 'sync';
  private cueClickSnap = 0;
  private cueI0 = 0;
  /** Audio-clock time of the entrance downbeat, exposed for drivers. */
  cueTargetTime = 0;
  private cueLogSnap = 0;
  private cueTrials: { deltaBeats: number | null; entered: boolean }[] = [];
  private holdPhase: 'conduct' | 'raise' | 'holding' | 'restart' = 'conduct';
  private holdEnteredT = 0;
  private holdSnap = { holds: 0, cuts: 0, downbeats: 0 };
  private holdTrials: { code: string; holdSec: number | null }[] = [];

  startAll(conductor: Conductor, now: number, ids?: LessonId[]): void {
    this.results.length = 0;
    this.queue = ids ?? [
      'steady',
      'onbeat',
      'dynamics',
      'tempo',
      'pattern4',
      'pattern3',
      'downbeat',
      'cue',
      'hold',
    ];
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
    } else if (id === 'downbeat') {
      c.followMode = 'lead';
      this.dbPhase = 'demo';
      this.dbTrials = [];
      if (c.seq.state !== 'playing') c.seq.start();
      c.seq.setTempoAnchored(DOWNBEAT_TARGET_BPM);
    } else if (id === 'hold') {
      c.followMode = 'follow';
      this.holdPhase = 'conduct';
      this.holdTrials = [];
      this.holdSnap = { holds: c.holdCount, cuts: c.cutoffCount, downbeats: c.downbeatCount };
      if (c.seq.state !== 'playing') c.seq.start();
    } else if (id === 'cue') {
      c.followMode = 'lead';
      this.cueTrials = [];
      this.cuePhase = 'sync';
      this.cueClickSnap = c.clickCount;
      this.chimes?.reset('idle');
      if (c.seq.state !== 'playing') c.seq.start();
      c.seq.setTempoAnchored(CUE_BPM);
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
    if (id === 'downbeat') return this.tickDownbeat(c, now);
    if (id === 'cue') return this.tickCue(c, now);
    if (id === 'hold') return this.tickHold(c, now, beats);

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

  private tickDownbeat(c: Conductor, now: number): LessonUi {
    const trialNo = this.dbTrials.length + 1;
    if (this.dbPhase === 'demo') {
      this.uiPhase = 'demo';
      if (now - this.phaseT0 > 2.8) {
        c.armDownbeat();
        this.dbCountSnap = c.downbeatCount;
        this.dbPhase = 'still';
        this.phaseT0 = now;
      }
      return {
        prompt: 'Lesson 7 · The Downbeat',
        sub: 'LISTEN — this is the speed you will start them at.',
        progress: `trial ${trialNo} / ${DOWNBEAT_TRIALS}`,
        card: null,
      };
    }
    if (this.dbPhase === 'still') {
      this.uiPhase = 'still';
      if (now - this.phaseT0 > 1.0) {
        this.dbPhase = 'go';
        this.phaseT0 = now;
      }
      return {
        prompt: 'Lesson 7 · The Downbeat',
        sub: 'Silence. Be perfectly still…',
        progress: `trial ${trialNo} / ${DOWNBEAT_TRIALS}`,
        card: null,
      };
    }
    // go
    this.uiPhase = 'go';
    const struck = c.downbeatCount > this.dbCountSnap;
    const timedOut = now - this.phaseT0 > 10;
    if (struck || timedOut) {
      if (struck && c.lastDownbeat) {
        this.dbTrials.push({
          bpm: c.lastDownbeat.casual ? null : c.lastDownbeat.bpm,
          casual: c.lastDownbeat.casual,
          hesitations: c.lastDownbeat.hesitations,
        });
      } else {
        this.dbTrials.push({ bpm: null, casual: false, hesitations: 0 });
      }
      if (this.dbTrials.length >= DOWNBEAT_TRIALS) return this.finish(this.scoreDownbeat(), now);
      this.dbPhase = 'demo';
      this.phaseT0 = now;
      c.followMode = 'lead';
      if (c.seq.state !== 'playing') c.seq.start();
      c.seq.setTempoAnchored(DOWNBEAT_TARGET_BPM);
      return this.tickDownbeat(c, now);
    }
    return {
      prompt: 'Lesson 7 · The Downbeat',
      sub: 'Breathe UP — and strike the downbeat. Your breath sets the speed.',
      progress: `${Math.ceil(10 - (now - this.phaseT0))} s`,
      card: null,
    };
  }

  private tickCue(c: Conductor, now: number): LessonUi {
    const trialNo = this.cueTrials.length + 1;
    const period = 60 / CUE_BPM;

    if (this.cuePhase === 'sync') {
      this.uiPhase = 'sync';
      const lc = c.lastClick;
      if (lc && lc.index > this.cueClickSnap && lc.beatInBar === 0) {
        this.cueI0 = lc.index;
        this.cueTargetTime = lc.scheduledAt + CUE_ENTRANCE_CLICKS * period;
        this.cueLogSnap = this.chimes?.cueLog.length ?? 0;
        this.cuePhase = 'count';
      }
      return {
        prompt: 'Lesson 8 · The Cue',
        sub: 'The chimes wait in the dark. They enter on bar 3, beat 1 — point at them ON it.',
        progress: `trial ${trialNo} / ${CUE_TRIALS}`,
        card: null,
      };
    }

    // count
    this.uiPhase = 'count';
    const n = c.clickCount - this.cueI0;
    const bar = Math.floor(n / 4) + 1;
    const beat = (n % 4) + 1;

    if (now > this.cueTargetTime + 2 * period) {
      const cues = (this.chimes?.cueLog ?? []).slice(this.cueLogSnap);
      let best: number | null = null;
      for (const ct of cues) {
        const d = (ct - this.cueTargetTime) / period;
        if (best === null || Math.abs(d) < Math.abs(best)) best = d;
      }
      const entered = best !== null && Math.abs(best) <= 1;
      if (!entered) this.chimes?.reset('idle'); // no reward for a missed invitation
      this.cueTrials.push({ deltaBeats: best, entered });
      if (this.cueTrials.length >= CUE_TRIALS) return this.finish(this.scoreCue(), now);
      this.chimes?.reset('idle');
      this.cuePhase = 'sync';
      this.cueClickSnap = c.clickCount;
      return this.tickCue(c, now);
    }

    return {
      prompt: 'Lesson 8 · The Cue',
      sub:
        bar < 3
          ? 'Count with the drum — they enter on bar 3, beat 1.'
          : 'NOW — point at the chimes.',
      progress: `bar ${Math.min(bar, 4)} · beat ${beat}   (trial ${trialNo}/${CUE_TRIALS})`,
      card: null,
    };
  }

  private tickHold(c: Conductor, now: number, beats: number): LessonUi {
    const trialNo = this.holdTrials.length + 1;
    const ui = (sub: string, progress = `trial ${trialNo} / 3`): LessonUi => ({
      prompt: 'Lesson 9 · The Hold & the Cut',
      sub,
      progress,
      card: null,
    });

    if (this.holdPhase === 'conduct') {
      this.uiPhase = 'conduct';
      if (beats >= 6 + this.holdTrials.length * 2) {
        // rough per-trial floor; beats accumulate across the lesson
        this.holdPhase = 'raise';
        this.phaseT0 = now;
        this.holdSnap.holds = c.holdCount;
        this.holdSnap.cuts = c.cutoffCount;
      }
      return ui('Conduct steadily — a few beats.');
    }

    if (this.holdPhase === 'raise') {
      this.uiPhase = 'raise';
      if (c.holdCount > this.holdSnap.holds) {
        this.holdPhase = 'holding';
        this.holdEnteredT = now;
        return this.tickHold(c, now, beats);
      }
      if (now - this.phaseT0 > 8) {
        this.holdTrials.push({ code: 'no-hold', holdSec: null });
        return this.nextHoldTrial(c, now, beats);
      }
      return ui('Now RAISE your hand… and FREEZE it. Hold them.');
    }

    if (this.holdPhase === 'holding') {
      this.uiPhase = 'holding';
      const held = now - this.holdEnteredT;
      if (c.cutoffCount > this.holdSnap.cuts) {
        this.holdTrials.push({
          code: held >= HOLD_MIN_SEC ? 'clean' : 'early-cut',
          holdSec: Math.round(held * 10) / 10,
        });
        this.holdPhase = 'restart';
        this.phaseT0 = now;
        this.holdSnap.downbeats = c.downbeatCount;
        return this.tickHold(c, now, beats);
      }
      if (held > HOLD_MIN_SEC + 6) {
        this.holdTrials.push({ code: 'left-hanging', holdSec: Math.round(held * 10) / 10 });
        c.seq.start(); // recover the transport; no cutoff ever came
        return this.nextHoldTrial(c, now, beats);
      }
      return held < HOLD_MIN_SEC
        ? ui('Frozen… keep it there…', `${held.toFixed(1)} s`)
        : ui('NOW — one decisive flick. CUT them off.', `${held.toFixed(1)} s`);
    }

    // restart — the silence must be broken by a real prepared downbeat
    this.uiPhase = 'restart';
    if (c.downbeatCount > this.holdSnap.downbeats) {
      return this.nextHoldTrial(c, now, beats);
    }
    if (now - this.phaseT0 > 10) {
      c.seq.start(); // recover; the trial keeps its grade, restart just failed
      return this.nextHoldTrial(c, now, beats);
    }
    return ui('Silence. Breathe up — and give the downbeat to begin again.');
  }

  private nextHoldTrial(c: Conductor, now: number, beats: number): LessonUi {
    if (this.holdTrials.length >= 3) return this.finish(this.scoreHold(), now);
    this.holdPhase = 'conduct';
    this.phaseT0 = now;
    return this.tickHold(c, now, beats);
  }

  private scoreHold(): LessonResult {
    const per = this.holdTrials.map((tr) => {
      switch (tr.code) {
        case 'clean':
          return { pts: 95, line: `held ${tr.holdSec} s, clean cut` };
        case 'early-cut':
          return { pts: 55, line: `the hold broke early (${tr.holdSec} s)` };
        case 'left-hanging':
          return { pts: 35, line: 'held, but never cut — they were left hanging' };
        default:
          return { pts: 10, line: 'no hold — the hand never froze' };
      }
    });
    const score = Math.round(per.reduce((s, p) => s + p.pts, 0) / Math.max(per.length, 1));
    const cls: LessonResult['cls'] = score >= 80 ? 'good' : score >= 50 ? 'warn' : 'bad';
    const verdict =
      cls === 'good'
        ? `Total command — you froze them and released them at will. (${per
            .map((p) => p.line)
            .join('; ')}.)`
        : cls === 'warn'
          ? `The power is there — hold until the moment is FULL, then cut once, decisively. (${per
              .map((p) => p.line)
              .join('; ')}.)`
          : `The silence never obeyed — raise, FREEZE, then one sharp flick. (${per
              .map((p) => p.line)
              .join('; ')}.)`;
    return {
      id: 'hold',
      title: TITLES.hold,
      score,
      verdict,
      cls,
      raw: {
        t1: this.holdTrials[0]?.holdSec ?? null,
        t2: this.holdTrials[1]?.holdSec ?? null,
        t3: this.holdTrials[2]?.holdSec ?? null,
        clean: this.holdTrials.filter((t) => t.code === 'clean').length,
      },
    };
  }

  private scoreCue(): LessonResult {
    const per = this.cueTrials.map((tr) => {
      if (tr.deltaBeats === null) return { pts: 10, line: 'no cue' };
      const a = Math.abs(tr.deltaBeats);
      const dir = tr.deltaBeats > 0 ? 'late' : 'early';
      if (a <= 0.5) return { pts: 95, line: `on it (${tr.deltaBeats.toFixed(2)} beats)` };
      if (a <= 1) return { pts: 75, line: `${a.toFixed(2)} beats ${dir} — they still made it` };
      if (a <= 2) return { pts: 45, line: `${a.toFixed(2)} beats ${dir} — entrance lost` };
      return { pts: 20, line: `${a.toFixed(2)} beats ${dir}` };
    });
    const score = Math.round(per.reduce((s, p) => s + p.pts, 0) / Math.max(per.length, 1));
    const cls: LessonResult['cls'] = score >= 80 ? 'good' : score >= 50 ? 'warn' : 'bad';
    const verdict =
      cls === 'good'
        ? `You brought them in like an old friend. (${per.map((p) => p.line).join('; ')}.)`
        : cls === 'warn'
          ? `The invitation wavered — cue ON their first note, not around it. (${per
              .map((p) => p.line)
              .join('; ')}.)`
          : `The chimes never felt invited — count the bars, point on their 1. (${per
              .map((p) => p.line)
              .join('; ')}.)`;
    return {
      id: 'cue',
      title: TITLES.cue,
      score,
      verdict,
      cls,
      raw: {
        d1: this.cueTrials[0]?.deltaBeats ?? null,
        d2: this.cueTrials[1]?.deltaBeats ?? null,
        d3: this.cueTrials[2]?.deltaBeats ?? null,
        entered: this.cueTrials.filter((t) => t.entered).length,
      },
    };
  }

  private scoreDownbeat(): LessonResult {
    const per = this.dbTrials.map((tr) => {
      if (tr.bpm === null && !tr.casual) return { pts: 10, line: 'no downbeat' };
      if (tr.casual) return { pts: 15, line: 'strike without a breath' };
      const err = Math.abs((tr.bpm as number) - DOWNBEAT_TARGET_BPM) / DOWNBEAT_TARGET_BPM;
      let pts = err <= 0.08 ? 95 : err <= 0.15 ? 75 : err <= 0.25 ? 50 : 25;
      pts = Math.max(10, pts - 10 * tr.hesitations);
      return { pts, line: `started at ${Math.round(tr.bpm as number)}` };
    });
    const score = Math.round(per.reduce((a, b) => a + b.pts, 0) / Math.max(per.length, 1));
    const cls: LessonResult['cls'] = score >= 80 ? 'good' : score >= 50 ? 'warn' : 'bad';
    const verdict =
      cls === 'good'
        ? `You start an orchestra like you mean it — on your beat, at your speed. (${per
            .map((p) => p.line)
            .join(', ')}; target ${DOWNBEAT_TARGET_BPM}.)`
        : cls === 'warn'
          ? `Clean enough starts — now make the breath PROMISE the speed. (${per
              .map((p) => p.line)
              .join(', ')}; target ${DOWNBEAT_TARGET_BPM}.)`
          : `The downbeat needs authority — one calm breath up, one decisive strike. (${per
              .map((p) => p.line)
              .join(', ')}.)`;
    return {
      id: 'downbeat',
      title: TITLES.downbeat,
      score,
      verdict,
      cls,
      raw: {
        t1Bpm: this.dbTrials[0]?.bpm ?? null,
        t2Bpm: this.dbTrials[1]?.bpm ?? null,
        t3Bpm: this.dbTrials[2]?.bpm ?? null,
        hesitations: this.dbTrials.reduce((a, b) => a + b.hesitations, 0),
        casuals: this.dbTrials.filter((t) => t.casual).length,
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
