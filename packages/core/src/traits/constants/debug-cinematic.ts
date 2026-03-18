/**
 * Debug / Cinematic Traits
 * @version 1.0.0
 */
export const DEBUG_CINEMATIC_TRAITS = [
  'time_travel_debug',  // Time-travel debugging
  'spatial_profiler',   // Spatial performance profiler
  'cinematic_seq',      // Cinematic sequencing / timeline
  'ai_camera',          // AI-driven camera director
] as const;

export type DebugCinematicTraitName = (typeof DEBUG_CINEMATIC_TRAITS)[number];
