/**
 * chimes.ts — the second instrument: tubular chimes on a brass frame.
 *
 * Five graduated tubes, bell voices rendered by the engine's SynthEngine
 * (inharmonic partials, long ring). The chimes ride the SAME engine beat
 * events as the timpani — one grid, one dynamics stream — striking on
 * beats 1 and 3. Entrances and exits are QUANTIZED to the bar's downbeat:
 * a cue queues a pending state (acknowledged instantly by a faint glow),
 * and the change lands musically on the next 1.
 */

import { SynthEngine } from '../../../packages/engine/src/audio/SynthEngine';
import { Renderer, Mesh, Material } from './renderer';
import { cylinder, sphere } from './meshes';
import { Mat4, multiply, translation, rotationY, rotationZ } from './math3';

export type ChimesState = 'idle' | 'pending-join' | 'active' | 'pending-leave';

const BRASS: Material = { color: [0.78, 0.62, 0.3], metal: 1, shiny: 110, emissive: 0.02 };
const FRAME: Material = { color: [0.2, 0.19, 0.21], metal: 0.75, shiny: 60, emissive: 0 };

/** Pentatonic ring: A3 C4 D4 E4 G4. */
const PITCHES = [220, 261.63, 293.66, 329.63, 392];
const TUBE_LENGTHS = [1.05, 0.98, 0.92, 0.86, 0.78];

interface TubePart {
  mesh: Mesh;
  model: Mat4;
  mat: Material; // per-tube copy so each can glow independently
}

export class Chimes {
  state: ChimesState = 'idle';
  /** Cue instants (audio clock) — the lesson's raw material. */
  readonly cueLog: number[] = [];
  /** Entrance/exit instants with the state they landed. */
  readonly transitionLog: { at: number; to: ChimesState }[] = [];

  private tubes: TubePart[] = [];
  private frameParts: { mesh: Mesh; model: Mat4 }[] = [];
  private buffers: AudioBuffer[] = [];
  private glows: { tube: number; at: number; vel: number }[] = [];
  private nextTube = 0;
  private ac: AudioContext;
  /** Where chime audio routes (the host points this at the ensemble bus). */
  output: AudioNode;

  constructor(r: Renderer, ac: AudioContext, worldX: number, worldZ: number, yawRad: number) {
    this.ac = ac;
    this.output = ac.destination;
    const place = (local: Mat4): Mat4 =>
      multiply(translation(worldX, 0, worldZ), multiply(rotationY(yawRad), local));

    // Frame: two posts, a top bar, two feet.
    const post = r.createMesh(cylinder(0.02, 0.02, 1.55, 10));
    const bar = r.createMesh(cylinder(0.022, 0.022, 1.0, 10));
    const foot = r.createMesh(sphere(0.045, 8, 12));
    this.frameParts.push({ mesh: post, model: place(translation(-0.48, 0, 0)) });
    this.frameParts.push({ mesh: post, model: place(translation(0.48, 0, 0)) });
    this.frameParts.push({
      mesh: bar,
      model: place(multiply(translation(-0.5, 1.55, 0), rotationZ(-Math.PI / 2))),
    });
    this.frameParts.push({ mesh: foot, model: place(translation(-0.48, 0.03, 0)) });
    this.frameParts.push({ mesh: foot, model: place(translation(0.48, 0.03, 0)) });

    // Tubes hang from the bar, graduated left (long/low) to right.
    for (let i = 0; i < PITCHES.length; i++) {
      const len = TUBE_LENGTHS[i];
      const mesh = r.createMesh(cylinder(0.024, 0.024, len, 14));
      const x = -0.36 + i * 0.18;
      this.tubes.push({
        mesh,
        model: place(translation(x, 1.52 - len, 0)),
        mat: { ...BRASS },
      });
      this.buffers.push(Chimes.renderBell(ac, PITCHES[i]));
    }
  }

  /** World position of the striking zone (for pointing tests). */
  center(worldX: number, worldZ: number): [number, number, number] {
    return [worldX, 1.05, worldZ];
  }

  /** Register a cue (pointing held) — toggles pending join/leave. */
  cue(now: number): ChimesState {
    this.cueLog.push(now);
    if (this.state === 'idle' || this.state === 'pending-leave') this.state = 'pending-join';
    else this.state = 'pending-leave';
    return this.state;
  }

  /** Force a state (lessons reset between trials). */
  reset(state: ChimesState): void {
    this.state = state;
    this.glows.length = 0;
  }

  /**
   * Engine beat event. Pending states resolve ON the downbeat; active
   * chimes strike beats 1 and 3 with the conductor's dynamics.
   */
  onBeat(scheduledAt: number, beatInBar: number, velocity: number): void {
    if (beatInBar === 0) {
      if (this.state === 'pending-join') {
        this.state = 'active';
        this.transitionLog.push({ at: scheduledAt, to: 'active' });
      } else if (this.state === 'pending-leave') {
        this.state = 'idle';
        this.transitionLog.push({ at: scheduledAt, to: 'idle' });
      }
    }
    if (this.state !== 'active') return;
    if (beatInBar !== 0 && beatInBar !== 2) return;

    const tube = this.nextTube % this.tubes.length;
    this.nextTube++;
    const src = this.ac.createBufferSource();
    src.buffer = this.buffers[tube];
    const g = this.ac.createGain();
    g.gain.value = 0.75 * velocity;
    src.connect(g);
    g.connect(this.output);
    src.start(Math.max(scheduledAt, this.ac.currentTime));
    const audibleAt =
      Math.max(scheduledAt, this.ac.currentTime) +
      (this.ac.outputLatency || this.ac.baseLatency || 0);
    this.glows.push({ tube, at: audibleAt, vel: velocity });
  }

  update(nowAudio: number): void {
    const base =
      this.state === 'active'
        ? 1
        : this.state === 'pending-join'
          ? 0.45 + 0.15 * Math.sin(nowAudio * 6) // breathing acknowledgment
          : this.state === 'pending-leave'
            ? 0.8
            : 0.3;
    for (let i = 0; i < this.tubes.length; i++) {
      let glow = 0;
      for (let k = this.glows.length - 1; k >= 0; k--) {
        const s = this.glows[k];
        if (nowAudio - s.at > 2.4) {
          this.glows.splice(k, 1);
          continue;
        }
        if (s.tube === i && nowAudio >= s.at) {
          glow += s.vel * Math.exp(-(nowAudio - s.at) / 0.5);
        }
      }
      const m = this.tubes[i].mat;
      m.color = [0.78 * base, 0.62 * base, 0.3 * base];
      m.emissive = (this.state === 'pending-join' ? 0.1 : 0.02) + 0.3 * Math.min(glow, 1);
    }
  }

  draw(r: Renderer): void {
    for (const p of this.frameParts) r.draw(p.mesh, p.model, FRAME);
    for (const t of this.tubes) r.draw(t.mesh, t.model, t.mat);
  }

  /** Tubular-bell voice: inharmonic partials, fast attack, long ring. */
  static renderBell(ac: AudioContext, f0: number): AudioBuffer {
    const synth = new SynthEngine();
    synth.setMasterVolume(0.5);
    const partials: [number, number, number][] = [
      [1.0, 1.0, 2.2],
      [2.0, 0.55, 1.4],
      [2.76, 0.4, 1.0],
      [5.4, 0.12, 0.4],
    ];
    const ids: string[] = [];
    for (const [ratio, amp, rel] of partials) {
      const id = synth.noteOn(f0 * ratio, 'sine', {
        attack: 0.002,
        decay: 0.25,
        sustain: 0.16 * amp,
        release: rel,
      });
      const v = synth.getVoice(id);
      if (v) v.oscillator.amplitude = amp;
      ids.push(id);
    }
    const seconds = 2.8;
    const n = Math.floor(seconds * ac.sampleRate);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const ch = buf.getChannelData(0);
    const dt = 1 / ac.sampleRate;
    let released = false;
    for (let i = 0; i < n; i++) {
      const t = i * dt;
      if (!released && t >= 0.04) {
        for (const id of ids) synth.noteOff(id);
        released = true;
      }
      ch[i] = synth.generateSample(t) * 0.85;
      synth.update(dt);
    }
    return buf;
  }
}
