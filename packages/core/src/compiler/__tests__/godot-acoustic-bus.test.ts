import { describe, it, expect } from 'vitest';
import { compileAcousticTrait, MODELED_ACOUSTIC_TRAITS } from '../godot-acoustic-bus';

describe('godot-acoustic-bus (E-G16)', () => {
  it('audio_material emits a real AudioEffectReverb on a dedicated bus', () => {
    const r = compileAcousticTrait('audio_material', { preset: 'metal' }, 'gem');
    expect(r).not.toBeNull();
    expect(r!.effects).toContain('AudioEffectReverb');
    expect(r!.busName).toBe('gem_acoustic_bus');
    expect(r!.lines.join('\n')).toContain('AudioServer.add_bus()');
    expect(r!.lines.join('\n')).toContain('AudioEffectReverb.new()');
  });

  it('NEGATIVE CONTROL: metal and glass presets produce different reverb params', () => {
    const metal = compileAcousticTrait('audio_material', { preset: 'metal' }, 's')!.lines.join(
      '\n'
    );
    const glass = compileAcousticTrait('audio_material', { preset: 'glass' }, 's')!.lines.join(
      '\n'
    );
    expect(metal).toContain('room_size = 0.85');
    expect(glass).toContain('room_size = 0.35');
    expect(metal).not.toEqual(glass); // the preset genuinely changes the bus graph
  });

  it('audio_occlusion lowers the low-pass cutoff as attenuation rises', () => {
    const low = compileAcousticTrait('audio_occlusion', { attenuation: 0.1 }, 's')!.lines.join(
      '\n'
    );
    const high = compileAcousticTrait('audio_occlusion', { attenuation: 0.9 }, 's')!.lines.join(
      '\n'
    );
    expect(low).toContain('AudioEffectLowPassFilter.new()');
    const lowHz = Number(low.match(/cutoff_hz = (\d+)/)![1]);
    const highHz = Number(high.match(/cutoff_hz = (\d+)/)![1]);
    expect(highHz).toBeLessThan(lowHz); // more occlusion → more muffled
  });

  it('audio_portal emits a reverb send with configured wet level', () => {
    const r = compileAcousticTrait('audio_portal', { wet: 0.7 }, 's')!;
    expect(r.effects).toContain('AudioEffectReverb');
    expect(r.lines.join('\n')).toContain('.wet = 0.7');
  });

  it('returns null for traits it does not model (caller keeps them as comments)', () => {
    expect(compileAcousticTrait('ambisonics', {}, 's')).toBeNull();
    expect(compileAcousticTrait('hrtf', {}, 's')).toBeNull();
  });

  it('is deterministic — same input, identical output', () => {
    const a = compileAcousticTrait('audio_material', { preset: 'glass' }, 'x');
    const b = compileAcousticTrait('audio_material', { preset: 'glass' }, 'x');
    expect(a).toEqual(b);
  });

  it('MODELED_ACOUSTIC_TRAITS lists exactly the DSP-backed traits', () => {
    expect([...MODELED_ACOUSTIC_TRAITS].sort()).toEqual([
      'audio_material',
      'audio_occlusion',
      'audio_portal',
    ]);
  });
});
