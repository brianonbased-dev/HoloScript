/**
 * hud.ts — the world-space panel: live tempo, beats, latest trial verdict.
 * Drawn to a canvas, uploaded as a texture, shown as a floating quad.
 */

export interface HudLesson {
  prompt: string;
  sub: string;
  progress: string;
  card: {
    title: string;
    score: number;
    verdict: string;
    cls: 'good' | 'warn' | 'bad';
  } | null;
}

export interface HudState {
  youBpm: number | null;
  ensembleBpm: number | null;
  beats: number;
  source: string;
  lastTrial: { ms: number; beats: number; cls: 'good' | 'warn' | 'bad' } | null;
  offsetMs: number | null;
  lesson?: HudLesson | null;
}

export class Hud {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private lastKey = '';

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 640;
    this.canvas.height = 320;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.render({
      youBpm: null,
      ensembleBpm: null,
      beats: 0,
      source: '—',
      lastTrial: null,
      offsetMs: null,
    });
  }

  /** Returns true when the canvas changed (texture needs re-upload). */
  render(s: HudState): boolean {
    const key = JSON.stringify(s);
    if (key === this.lastKey) return false;
    this.lastKey = key;

    const c = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(12, 10, 8, 0.88)';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = '#d2a94e';
    c.lineWidth = 3;
    c.strokeRect(1.5, 1.5, W - 3, H - 3);

    if (s.lesson) {
      this.renderLesson(s.lesson);
      return true;
    }

    c.fillStyle = '#a8987d';
    c.font = '600 26px "Segoe UI", sans-serif';
    c.fillText('YOU', 48, 64);
    c.fillText('ENSEMBLE', 328, 64);

    c.fillStyle = '#f0e8d6';
    c.font = '700 92px "Segoe UI", sans-serif';
    c.fillText(s.youBpm ? String(Math.round(s.youBpm)) : '—', 44, 156);
    c.fillText(s.ensembleBpm ? String(Math.round(s.ensembleBpm)) : '—', 324, 156);

    c.fillStyle = '#a8987d';
    c.font = '500 24px "Segoe UI", sans-serif';
    c.fillText(`beats ${s.beats}   ·   ${s.source}`, 48, 208);
    if (s.offsetMs !== null) {
      c.fillText(`with your hand: ${Math.round(s.offsetMs)} ms`, 48, 244);
    }

    if (s.lastTrial) {
      const col =
        s.lastTrial.cls === 'good' ? '#6fbf6a' : s.lastTrial.cls === 'warn' ? '#d2a94e' : '#d96b5c';
      c.fillStyle = col;
      c.font = '700 30px "Segoe UI", sans-serif';
      c.fillText(
        `tempo change: ${Math.round(s.lastTrial.ms)} ms · ${s.lastTrial.beats.toFixed(2)} beats`,
        48,
        292
      );
    } else {
      c.fillStyle = '#6b5f4f';
      c.font = '500 26px "Segoe UI", sans-serif';
      c.fillText('change speed clearly and hold it…', 48, 292);
    }
    return true;
  }

  private renderLesson(l: HudLesson): void {
    const c = this.ctx;
    const W = this.canvas.width;
    if (l.card) {
      const col =
        l.card.cls === 'good' ? '#6fbf6a' : l.card.cls === 'warn' ? '#d2a94e' : '#d96b5c';
      c.fillStyle = '#a8987d';
      c.font = '600 28px "Segoe UI", sans-serif';
      c.fillText(l.card.title, 48, 62);
      c.fillStyle = col;
      c.font = '700 110px "Segoe UI", sans-serif';
      c.fillText(String(l.card.score), 48, 178);
      c.font = '600 34px "Segoe UI", sans-serif';
      c.fillText('/ 100', 210, 178);
      c.fillStyle = '#f0e8d6';
      c.font = '500 27px "Segoe UI", sans-serif';
      this.wrap(l.card.verdict, 48, 232, W - 96, 34);
      return;
    }
    c.fillStyle = '#d2a94e';
    c.font = '700 40px "Segoe UI", sans-serif';
    c.fillText(l.prompt, 48, 84);
    c.fillStyle = '#f0e8d6';
    c.font = '500 30px "Segoe UI", sans-serif';
    this.wrap(l.sub, 48, 148, W - 96, 40);
    c.fillStyle = '#a8987d';
    c.font = '600 46px "Segoe UI", sans-serif';
    c.fillText(l.progress, 48, 282);
  }

  private wrap(text: string, x: number, y: number, maxW: number, lineH: number): void {
    const c = this.ctx;
    const words = text.split(' ');
    let line = '';
    for (const w of words) {
      const trial = line ? `${line} ${w}` : w;
      if (c.measureText(trial).width > maxW && line) {
        c.fillText(line, x, y);
        line = w;
        y += lineH;
      } else {
        line = trial;
      }
    }
    if (line) c.fillText(line, x, y);
  }
}
