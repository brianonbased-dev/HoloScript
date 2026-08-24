/**
 * Companionship Traits — Daimon Embodiment
 *
 * Owner-bound companion presences: the per-soul daimon getting a body.
 * Every trait here is for a presence bound to one owner via ownerScopeKey
 * and a ConversationDaemon identity. They are not general NPC decoration —
 * rapport on a shopkeeper with no owner binding is a design error the
 * linter should flag.
 *
 * Distinct from AFFINITY_TRAITS (simulated relational dynamics between
 * scene entities, ODE-driven) and EMOTION_MOOD_TRAITS (ambient scene
 * moods): companionship traits model the real owner-companion
 * relationship, are owner-scoped, honor unconditional forget, and never
 * transfer across owners. Note that copresence here means one daimon
 * embodied on several devices; the interop-copresence solver profile
 * (engine interoperability) is unrelated.
 *
 * Registration covers parse/validate/list surfaces. Runtime handlers,
 * compiler lowering, and TraitDefinition metadata land with the
 * embodiment slices (see RFC section 7).
 *
 * RFC: proposals/daimon-embodiment-trait-family.md
 * Fold ruling: ai-ecosystem research/2026-08-24_companion-daimon-embodiment-fold.md
 */
export const COMPANIONSHIP_TRAITS = [
  'companion_presence',
  'affect_state',
  'rapport',
  'relational_memory',
  'voice_loop',
  'copresence',
  'flourishing_guard',
] as const;
