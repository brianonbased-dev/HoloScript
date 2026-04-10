/**
 * SharePlay Multi-User AR Traits (M.010.12)
 *
 * Shared holographic sessions through FaceTime using
 * Apple's GroupActivities framework. CRDT sync via Loro.
 *
 * Categories:
 *   - Session (create, join, leave)
 *   - Sync (state replication, anchor mapping)
 *   - Audio (spatial voice in shared scene)
 */
export const SHAREPLAY_TRAITS = [
  // --- Session ---
  'shareplay_session', // enable SharePlay session for .holo scene
  'shareplay_host', // designate host who controls scene state
  'shareplay_join', // join existing SharePlay session

  // --- Sync ---
  'shareplay_sync', // sync scene state across participants (Loro CRDT)
  'shareplay_anchor_local', // each participant anchors scene to their own space
  'shareplay_entity_ownership', // per-entity ownership for conflict resolution
  'shareplay_late_join', // full state sync for late-joining participants

  // --- Audio ---
  'shareplay_voice_spatial', // spatial audio for participant voices in shared scene
  'shareplay_mute_zone', // define zones where spatial audio is attenuated
] as const;

export type SharePlayTraitName = (typeof SHAREPLAY_TRAITS)[number];
