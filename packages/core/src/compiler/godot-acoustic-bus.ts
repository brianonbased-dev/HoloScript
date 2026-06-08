// =============================================================================
// Godot acoustic-bus emission (Gate 16 / E-G16)
//
// Pure module: maps an acoustic surface trait (@audio_material / @audio_occlusion /
// @audio_portal) to REAL Godot AudioEffect nodes on a dedicated AudioBus — replacing
// the prior comment-only emission. Built module-first (F.077): GodotCompiler composes
// this; it does not inline the logic. Separately unit-testable, deterministic.
//
// Real Godot classes used: AudioEffectReverb, AudioEffectLowPassFilter, plus the
// AudioServer bus API (add_bus / add_bus_effect). Params are derived from the trait
// config so a material/occlusion CHANGE produces a DIFFERENT bus graph (the Gate-16
// negative control), not a constant.
// =============================================================================

export interface AcousticBusEmit {
  /** GDScript lines that build the bus + effects (in order). */
  lines: string[];
  /** Real Godot AudioEffect class names emitted (for verification). */
  effects: string[];
  /** The AudioServer bus name this surface routes through. */
  busName: string;
}

/** Trait names this module models with real DSP. Others stay comments (honest: not modeled). */
export const MODELED_ACOUSTIC_TRAITS = [
  'audio_material',
  'audio_occlusion',
  'audio_portal',
] as const;

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/**
 * Compile one acoustic trait to a real Godot AudioBus + AudioEffect chain.
 * Returns null for traits this module does not model (caller keeps them as comments).
 */
export function compileAcousticTrait(
  traitName: string,
  config: Record<string, unknown>,
  varName: string
): AcousticBusEmit | null {
  const bus = `${varName}_acoustic_bus`;
  const effects: string[] = [];
  const body: string[] = [];

  if (traitName === 'audio_material') {
    // Material acoustics → reverb character. Distinct presets MUST diverge (neg. control):
    // metal = bright, long, low damping; glass = brittle, short, high damping.
    const preset = String((config.preset as string) || 'default');
    const room = preset === 'metal' ? 0.85 : preset === 'glass' ? 0.35 : 0.6;
    const damping = preset === 'metal' ? 0.1 : preset === 'glass' ? 0.55 : 0.3;
    body.push(`var ${varName}_reverb = AudioEffectReverb.new()`);
    body.push(`${varName}_reverb.room_size = ${room}`);
    body.push(`${varName}_reverb.damping = ${damping}`);
    body.push(`AudioServer.add_bus_effect(${bus}_idx, ${varName}_reverb)`);
    effects.push('AudioEffectReverb');
  } else if (traitName === 'audio_occlusion') {
    // Occlusion → low-pass: more attenuation lowers the cutoff (muffled through geometry).
    const attenuation = Math.min(1, Math.max(0, num(config.attenuation, 0.3)));
    const cutoff = Math.round(2000 - attenuation * 1500); // 0→2000Hz open, 1→500Hz muffled
    body.push(`var ${varName}_lowpass = AudioEffectLowPassFilter.new()`);
    body.push(`${varName}_lowpass.cutoff_hz = ${cutoff}`);
    body.push(`AudioServer.add_bus_effect(${bus}_idx, ${varName}_lowpass)`);
    effects.push('AudioEffectLowPassFilter');
  } else if (traitName === 'audio_portal') {
    // Portal → reverb send carrying sound between zones; wet level from config.
    const wet = Math.min(1, Math.max(0, num(config.wet, 0.5)));
    body.push(`var ${varName}_portal = AudioEffectReverb.new()`);
    body.push(`${varName}_portal.wet = ${wet}`);
    body.push(`AudioServer.add_bus_effect(${bus}_idx, ${varName}_portal)`);
    effects.push('AudioEffectReverb');
  } else {
    return null;
  }

  // Real AudioBus creation wrapping the effect chain.
  const lines = [
    `# @${traitName} — real Godot acoustic bus (E-G16)`,
    `AudioServer.add_bus()`,
    `var ${bus}_idx = AudioServer.bus_count - 1`,
    `AudioServer.set_bus_name(${bus}_idx, "${bus}")`,
    ...body,
  ];
  return { lines, effects, busName: bus };
}
