/**
 * GAPS Physics Traits — Phase 1
 *
 * New traits from the GAPS feature roadmap (2026-03-21).
 * Covers unified physics engine, weather hub, and world state.
 */
export const GAPS_PHYSICS_TRAITS = [
  // Pillar A: Unified Physics
  'fluid', // MLS-MPM GPU fluid (v3.0, replaces SPH default)
  'soft_body_pro', // PBD deformation with parametric tearing
  'crowd_sim', // GPU spatial hash + bitonic sort, 10K+ agents
  'deformable_terrain', // GPU hydraulic erosion, @weather-driven
  'volumetric_clouds', // Raymarching + Beer-Lambert, reads @weather
  'god_rays', // Screen-space volumetric light scattering

  // Weather Hub
  'weather', // Hub trait: day-night, auto-cycle, blackboard state

  // Pillar B: Persistent World
  'world_state', // Loro CRDT persistent objects/terrain/NPC/inventory
  'spatial_voice', // WebRTC + HRTF spatialization
  'lip_sync', // WebAudio → viseme → morph targets

  // Pillar C: Living Economy
  'ai_companion', // PPA + RAG + SNN hybrid NPC
  'token_gated', // Wallet + NFT ownership check
  'moderation', // AI content moderation
  'anti_grief', // Behavioral griefing detection
] as const;
