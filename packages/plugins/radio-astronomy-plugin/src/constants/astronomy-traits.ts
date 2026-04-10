/**
 * Specific traits representing properties for Radio Astrophysics.
 */
export const RADIO_ASTRONOMY_TRAITS = [
  'radio_emitter', // Signals a 3D construct as an origin point for specific radio wavelengths
  'synchrotron',   // Determines emission behavior via magnetic fields and relativistic electrons
  'interferometer', // Marks a multi-nodal virtual sensor
  'em_wave',       // Represents an electromagnetic wave primitive
  'pulsar_timing', // Represents pulsar timing array signals
  'spectral_line'  // Maps to particular spectral line signals (e.g., 21cm HI line)
] as const;

export type RadioAstronomyTraitName = (typeof RADIO_ASTRONOMY_TRAITS)[number];
