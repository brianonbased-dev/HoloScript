import { describe, it, expect } from 'vitest';
import { SpatialAudioCompiler } from './SpatialAudioCompiler';
import type { HoloComposition, HoloObjectDecl } from '../parser/HoloCompositionTypes';

const prop = (key: string, value: unknown) => ({ key, value });
const trait = (name: string, config: Record<string, unknown> = {}) => ({ name, config });
const obj = (
  name: string,
  props: Array<{ key: string; value: unknown }>,
  traits: Array<{ name: string; config?: Record<string, unknown> }> = []
): HoloObjectDecl => ({ type: 'Object', name, properties: props, traits }) as unknown as HoloObjectDecl;

const comp = (objects: HoloObjectDecl[], name = 'AudioScene'): HoloComposition =>
  ({ type: 'HoloComposition', name, objects }) as HoloComposition;

describe('SpatialAudioCompiler — sovereign Web Audio graph target', () => {
  it('reads an @audio_listener trait into the HRTF listener', () => {
    const model = new SpatialAudioCompiler().compileToModel(
      comp([obj('Seat', [prop('position', [0, 1.6, 2])], [trait('audio_listener', { hrtf: true, speed_of_sound: 343 })])])
    );
    expect(model.listener.position).toEqual([0, 1.6, 2]);
    expect(model.listener.hrtf).toBe(true);
    expect(model.listener.speedOfSound).toBe(343);
  });

  it('reads @audio_source traits into positional sources with directivity + clip', () => {
    const model = new SpatialAudioCompiler().compileToModel(
      comp([
        obj('Piano', [prop('position', [-2, 1, -3])], [trait('audio_source', { clip: 'piano.wav', volume: 0.8, loop: true, directivity: 'cardioid' })]),
      ])
    );
    expect(model.sources).toHaveLength(1);
    const s = model.sources[0];
    expect(s.name).toBe('Piano');
    expect(s.position).toEqual([-2, 1, -3]);
    expect(s.clip).toBe('piano.wav');
    expect(s.volume).toBe(0.8);
    expect(s.loop).toBe(true);
    expect(s.directivity).toBe('cardioid');
  });

  it('reads an algorithmic @reverb_zone (rt60-driven) and a convolution one (ir_file)', () => {
    const model = new SpatialAudioCompiler().compileToModel(
      comp([
        obj('Hall', [], [trait('reverb_zone', { type: 'algorithmic', rt60_mid: 2.0, room_volume: 15000 })]),
        obj('Chapel', [], [trait('reverb_zone', { type: 'convolution', ir_file: 'chapel.wav', rt60_mid: 3.1 })]),
      ])
    );
    expect(model.zones).toHaveLength(2);
    expect(model.zones[0]).toMatchObject({ kind: 'algorithmic', rt60: 2.0 });
    expect(model.zones[1]).toMatchObject({ kind: 'convolution', irFile: 'chapel.wav' });
  });

  it('collects acoustic surfaces, occlusion and portals from their traits', () => {
    const model = new SpatialAudioCompiler().compileToModel(
      comp([
        obj('Floor', [], [trait('audio_material', { absorption_low: 0.05, absorption_mid: 0.08, absorption_high: 0.1, scattering: 0.15 })]),
        obj('Wall', [], [trait('audio_occlusion', { transmission_loss: 35, frequency_dependent: true })]),
        obj('Door', [], [trait('audio_portal', { source_zone: 'Hall', target_zone: 'Backstage', cutoff_hz: 800, opening_factor: 0.6 })]),
      ])
    );
    expect(model.surfaces[0].absorption).toEqual([0.05, 0.08, 0.1]);
    expect(model.occlusions[0].transmissionLoss).toBe(35);
    expect(model.portals[0]).toMatchObject({ sourceZone: 'Hall', targetZone: 'Backstage', cutoffHz: 800 });
  });

  it('walks scene objects (composition.scenes[].objects), not just top-level', () => {
    const scene = { type: 'Scene', name: 'S', objects: [obj('Src', [], [trait('audio_source', { clip: 'x.wav' })])] };
    const c = { type: 'HoloComposition', name: 'Scened', objects: [], scenes: [scene] } as unknown as HoloComposition;
    const model = new SpatialAudioCompiler().compileToModel(c);
    expect(model.sources).toHaveLength(1);
    expect(model.sources[0].name).toBe('Src');
  });

  it('emits a self-contained sovereign Web Audio graph module (HRTF panner + convolver, no third-party engine)', () => {
    const out = new SpatialAudioCompiler().compile(
      comp([
        obj('Seat', [prop('position', [0, 1.6, 0])], [trait('audio_listener', { hrtf: true })]),
        obj('Piano', [prop('position', [-2, 1, -3])], [trait('audio_source', { clip: 'piano.wav', directivity: 'cardioid' })]),
        obj('Hall', [], [trait('reverb_zone', { type: 'algorithmic', rt60_mid: 2.0 })]),
      ])
    );
    expect(out).toContain('export function createAudioGraph(ctx');
    expect(out).toContain('ctx.createPanner()');
    expect(out).toContain('p.panningModel = "HRTF"');
    expect(out).toContain('ctx.createConvolver()');
    expect(out).toContain('function hsBuildImpulse(ctx, rt60, absorption)');
    // cardioid directivity → cone angles
    expect(out).toContain('p.coneInnerAngle = 90; p.coneOuterAngle = 180;');
    // no third-party audio engine referenced
    expect(out).not.toMatch(/FMOD|Wwise|Resonance|Howler|Tone\.js/i);
  });

  it('an audio-less scene still yields a valid graph with default listener and no sources', () => {
    const model = new SpatialAudioCompiler().compileToModel(comp([obj('Box', [prop('mesh', 'cube')])]));
    expect(model.sources).toEqual([]);
    expect(model.zones).toEqual([]);
    expect(model.listener.hrtf).toBe(true);
    expect(model.format).toBe('holoscript.audio.v1');
  });
});
