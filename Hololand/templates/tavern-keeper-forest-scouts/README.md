# TavernKeeper + Forest Scouts — Hololand NPC Reference World

**Task**: task_1779337565759_7v2x — [hololand-npc][example] Add TavernKeeper plus Caveman Scouts reference world

**Source**: research/2026-05-20-hololand-ai-npc-v1.md (HOLOLAND Growth Strategy seed, score 74)

This is the canonical lightweight reference example for Hololand creators who want living NPCs.

## NPCs

1. **TavernKeeper** — wise conversational personality
   - Uses `@ai_npc_brain` (AINPCBrainTrait)
   - personality: "wise"
   - dialogue_range, memory_size, voice_enabled, idle_behavior
   - Reacts to player proximity, builds relationship over time

2. **ForestScout-Alpha** and **ForestScout-Beta** — embodied drive-reactive cavemen
   - Use `@caveman_drive` + `caveman-npc-brain.hsplus`
   - 5 pure-math drives (hunger, thirst, fatigue, fear, curiosity)
   - 9 action verbs mapped to GLB animation clips via CavemanActionAnimationBridge
   - Target ≥90% drive-only (LLM gate only for rare high-uncertainty moments)
   - Sovereign 1B-class LLM friendly (Gemma 3 1B, Llama 3.2 1B, Phi 3.5 mini)

## Assets

All assets are explicit lightweight placeholders (no external GLB required for the reference build):
- `sphere` for character bodies
- `box` + `panel` for tavern counter and sign
- `orb` for campfire / lantern
- Simple spatial audio emitters for voice and ambient forest sounds

Creators can replace the placeholders with real Mixamo-rigged GLB characters when they have the rig.

## How to use

```holo
include "tavern-keeper-forest-scouts.holo"

world "The Drunken Oak & The Two Scouts" {
  tavern_keeper: TavernKeeper { position: [0, 0, 0] }
  scout_alpha: ForestScoutAlpha { position: [-4, 0, 3] }
  scout_beta: ForestScoutBeta { position: [4, 0, -2] }
}
```

Run the parser / build path — the world and both NPC brains must validate and emit without error.

## Verification

- Parser accepts the world + brains (see `pnpm --filter @holoscript/core test` or the Hololand build pipeline).
- NPC config values match the v1 memo (personality, drives, verbs, LLM gate ratio).
- This file + README are the pointer for creators.

**Status**: Reference world delivered. Closes the P3 example task for the HOLOLAND Growth seed.