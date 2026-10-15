/**
 * Visual Effects Traits
 */
export const VISUAL_EFFECTS_TRAITS = [
  'transparent',
  'reflective',
  'emissive',
  'spinning',
  'floating',
  'pulsing',
  'blinking',
  'fading',
  'color_shifting',
  'holographic',
  'holographic_mesh',
  'outlined',
  'x_ray',
  'neon_glow',
  'iridescent',
  'frosted',
  'luminous',
  'camouflaged',
  'mirrored',
  'pixelated',
  'dissolving',
  'crystalline',
  'ethereal',
  'smoky',
  'fiery',
  'electric_arc',
  'ghostly',
  'rainbow',
  'metallic_sheen',
  'ink_wash',
  'cel_shaded',
  // Runtime handlers registered by packages/runtime/src/browser/BrowserRuntime.ts, used in examples/
  'particle_system', // packages/runtime/src/traits/AdvancedTraits.ts ParticleSystemTrait
  'outline', // packages/runtime/src/traits/InteractionTraits.ts OutlineTrait
] as const;
