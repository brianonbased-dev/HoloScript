/**
 * hud.ts — the world-space panel: live tempo, beats, latest trial verdict.
 * Drawn to a canvas, uploaded as a texture, shown as a floating quad.
 */

export interface HudState {
  youBpm: number | null;
  ensembleBpm: number | null;
  beats: number;
  source: string;
  lastTrial: { ms: number; beats: number; cls: 'good' | 'warn' | 'bad' } | null;
  offsetMs: number | null;
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
}
