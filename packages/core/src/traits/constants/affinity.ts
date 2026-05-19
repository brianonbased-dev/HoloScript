/**
 * Affinity & Relational Dynamics Traits
 *
 * Social/affective simulation domain — Strogatz-Rinaldi coupled ODEs,
 * Sternberg triangular state [I,P,C], Nash-equilibrium effort control.
 * Solver: AffinityODESolver in @holoscript/engine.
 * Research: research/2026-05-18_integrating-love.md §1.
 */
export const AFFINITY_TRAITS = [
  'affinity_ode',
  'relational_dynamics',
  'love_state',
  'feeling_dynamics',
  'sternberg_triangle',
  'intimacy',
  'passion',
  'commitment',
  'nash_effort',
  'relational_rhythm',
  'attachment_style',
  'emotional_coupling',
  'personality_archetype',
  'affective_mirroring',
  'bond_strength',
] as const;