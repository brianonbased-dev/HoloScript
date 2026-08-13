/**
 * timpani.ts — the first instrument. A concert timpani: copper kettle,
 * steel counterhoop with tuning lugs, taut head, four splayed legs.
 * The conductor's anchor drum — its whole musical job is the beat, so the
 * gate-2 tempo/phase machinery IS its performance.
 */

import { SynthEngine } from '../../../packages/engine/src/audio/SynthEngine';
import { Renderer, Mesh, Material } from './renderer';
import { lathe, disc, cylinder, sphere } from './meshes';
import { Mat4, multiply, translation, rotationY, rotationX, scaling } from './math3';

interface Part {
  mesh: Mesh;
  model: Mat4;
  mat: Material;
  isHead?: boolean;
}

const COPPER: Material = { color: [0.85, 0.5, 0.27], metal: 1, shiny: 90, emissive: 0.03 };
const STEEL: Material = { color: [0.3, 0.3, 0.33], metal: 0.85, shiny: 96, emissive: 0 };
const HEAD: Material = { color: [0.8, 0.76, 0.68], metal: 0.05, shiny: 24, emissive: 0.02 };
const LEG: Material = { color: [0.16, 0.16, 0.18], metal: 0.7, shiny: 48, emissive: 0 };
const FOOT: Material = { color: [0.05, 0.05, 0.05], metal: 0, shiny: 8, emissive: 0 };

export class Timpani {
  private parts: Part[] = [];
  private strikes: { at: number; down: boolean; vel: number }[] = [];
  private headMat: Material = { ...HEAD };

  constructor(r: Renderer, worldX: number, worldZ: number, yawRad = 0) {
    const place = (local: Mat4): Mat4 =>
      multiply(translation(worldX, 0, worldZ), multiply(rotationY(yawRad), local));

    // Copper kettle — outside surface, bottom hub to just under the hoop.
    const bowl = r.createMesh(
      lathe(
        [
          [0.03, 0.5],
          [0.12, 0.507],
          [0.21, 0.532],
          [0.28, 0.578],
          [0.33, 0.648],
          [0.36, 0.732],
          [0.376, 0.822],
          [0.382, 0.884],
        ],
        56
      )
    );
    this.parts.push({ mesh: bowl, model: place(translation(0, 0, 0)), mat: COPPER });

    // Steel counterhoop ring.
    const hoop = r.createMesh(
      lathe(
        [
          [0.382, 0.884],
          [0.401, 0.884],
          [0.405, 0.894],
          [0.405, 0.916],
          [0.401, 0.924],
          [0.383, 0.924],
        ],
        56
      )
    );
    this.parts.push({ mesh: hoop, model: place(translation(0, 0, 0)), mat: STEEL });

    // Tuning lugs around the hoop.
    const lug = r.createMesh(cylinder(0.009, 0.009, 0.055, 12));
    for (let i = 0; i < 6; i++) {
      const th = (i / 6) * Math.PI * 2 + 0.26;
      this.parts.push({
        mesh: lug,
        model: place(translation(Math.cos(th) * 0.408, 0.862, Math.sin(th) * 0.408)),
        mat: STEEL,
      });
    }

    // The head — slightly domed, just inside the hoop.
    const head = r.createMesh(disc(0.376, 0.006, 10, 56));
    this.parts.push({
      mesh: head,
      model: place(translation(0, 0.906, 0)),
      mat: this.headMat,
      isHead: true,
    });

    // Four splayed legs from the bowl hub to the floor, with feet.
    const leg = r.createMesh(cylinder(0.013, 0.016, 0.62, 12));
    const foot = r.createMesh(sphere(0.026, 8, 12));
    for (let k = 0; k < 4; k++) {
      const th = Math.PI / 4 + (k * Math.PI) / 2;
      const tilt = 2.55; // radians: +Y tips down-and-outward
      const model = place(
        multiply(
          rotationY(th),
          multiply(translation(0, 0.5, 0), rotationX(tilt))
        )
      );
      this.parts.push({ mesh: leg, model, mat: LEG });
      const fx = Math.cos(th + Math.PI / 2) * 0; // legs splay along local +Z after rotY
      void fx;
      const endR = 0.347;
      this.parts.push({
        mesh: foot,
        model: place(
          translation(Math.sin(th) * endR, 0.024, Math.cos(th) * endR)
        ),
        mat: FOOT,
      });
    }
  }

  /** Register an audible strike (audio-clock seconds, from the conductor's onClick). */
  strike(atAudioTime: number, isDownbeat: boolean, velocity = 1): void {
    this.strikes.push({ at: atAudioTime, down: isDownbeat, vel: velocity });
  }

  /** Advance glow animation; `nowAudio` on the same clock as strike(). */
  update(nowAudio: number): void {
    let glow = 0;
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      const dt = nowAudio - s.at;
      if (dt > 1.2) {
        this.strikes.splice(i, 1);
        continue;
      }
      if (dt >= 0) glow += (s.down ? 1 : 0.55) * s.vel * Math.exp(-dt / 0.16);
    }
    this.headMat.emissive = 0.02 + 0.34 * Math.min(glow, 1.2);
  }

  draw(r: Renderer): void {
    for (const p of this.parts) r.draw(p.mesh, p.model, p.mat);
  }
}

/**
 * Timpani strike sounds rendered through the engine's SynthEngine: layered
 * near-inharmonic partials (drum modes) + a short noise transient (mallet
 * contact). Attack stays ~2 ms so the strike NEVER feels later than the
 * gate-2 certified schedule.
 */
export function makeTimpaniBuffers(ac: AudioContext): { hi: AudioBuffer; lo: AudioBuffer } {
  const render = (f0: number, gain: number, bright: number): AudioBuffer => {
    const synth = new SynthEngine();
    synth.setMasterVolume(0.55);
    const partials: [number, number, number][] = [
      // [ratio, amplitude, release]
      [1.0, 1.0, 0.95],
      [1.504, 0.5, 0.55],
      [1.742, 0.32 * bright, 0.42],
      [2.0, 0.22 * bright, 0.45],
      [2.245, 0.14 * bright, 0.3],
    ];
    const ids: string[] = [];
    for (const [ratio, amp, rel] of partials) {
      const id = synth.noteOn(f0 * ratio, 'sine', {
        attack: 0.002,
        decay: 0.22,
        sustain: 0.2 * amp,
        release: rel,
      });
      const v = synth.getVoice(id);
      if (v) v.oscillator.amplitude = amp;
      ids.push(id);
    }
    const noiseId = synth.noteOn(1, 'noise', {
      attack: 0.001,
      decay: 0.028,
      sustain: 0,
      release: 0.05,
    });
    const nv = synth.getVoice(noiseId);
    if (nv) nv.oscillator.amplitude = 0.5 * bright;
    ids.push(noiseId);

    const seconds = 1.5;
    const n = Math.floor(seconds * ac.sampleRate);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const ch = buf.getChannelData(0);
    const dt = 1 / ac.sampleRate;
    let released = false;
    for (let i = 0; i < n; i++) {
      const t = i * dt;
      if (!released && t >= 0.055) {
        for (const id of ids) synth.noteOff(id);
        released = true;
      }
      ch[i] = synth.generateSample(t) * gain;
      synth.update(dt);
    }
    return buf;
  };
  return {
    hi: render(87.3, 0.88, 1.25), // downbeat: deeper, harder stroke (0.88 keeps the attack under the clip ceiling)
    lo: render(110.5, 0.72, 1.0),
  };
}
