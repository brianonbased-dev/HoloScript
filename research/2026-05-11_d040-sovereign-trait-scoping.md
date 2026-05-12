# D.040 Sovereign Trait Scoping — Spec + Skeletons

> **Status**: Skeletons shipped. Full implementation is multi-week.  
> **Ratified**: D.040 + D.041, 2026-05-10.  
> **Reference**: research/2026-05-10_shangri-la-frontier-npc-feel-EVOLVED.md §Five Sovereign Traits + EXTENSION + UAA2-TIE-IN.

## Overview

Scope 6 sovereign traits as composable HoloScript-core primitives serving three populations:
- HoloMesh teammates
- HoloLand NPCs
- uaa2-orchestrated services

## The 6 Traits

### 1. @verbalFingerprint — Post-Generation Constraint
- **What**: Computes a fingerprint OVER generated text, not injected INTO the prompt.
- **Why**: Survives model swaps (same prompt to different LLMs produces different text; fingerprint catches drift).
- **Config**: `fingerprint_key`, `style` (min/max sentence length, forbidden/required phrases, tone), `enforce`, `rolling_window`.
- **Events**: `verbal_fingerprint_verify`, `verbal_fingerprint_verified`, `verbal_fingerprint_rejected`, `verbal_fingerprint_query`.
- **CI gate**: Attribution test >= 80% accuracy across at least 3 model backends.
- **Skeleton**: `packages/core/src/traits/VerbalFingerprintTrait.ts`

### 2. @autonomousAgenda — Daily-Loop Daemon
- **What**: Manages a rolling agenda of actions with cost-ceiling enforcement.
- **Shared with**: `packages/holoscript-agent/` — trait provides schedule/budget primitives; agent runtime provides LLM-based action selection.
- **Config**: `agent_class` (npc/teammate/service), `tick_interval_ms`, `daily_budget_usd`, `max_actions_per_tick/day`, `pause_on_ceiling`.
- **Events**: `agenda_tick`, `agenda_item_added/completed`, `agenda_cost_ceiling_breach`, `agenda_resume`.
- **CI gates**: Daily-loop tick test; cost-ceiling test ($0.50/NPC/day default, $5/agent/day headless per D.031).
- **Skeleton**: `packages/core/src/traits/AutonomousAgendaTrait.ts`

### 3. @reputationLedger — Trust + Behavior Log
- **What**: Already shipped as `ReputationLedgerTrait.ts`. Extends x402 attestation + per-pair Trust 0-100 + sliding behavior log.
- **Note**: Gem 4 capability-scoring substrate integration (per Tie 4) is a future extension.
- **Skeleton**: `packages/core/src/traits/ReputationLedgerTrait.ts` (existing, verified)

### 4. @vocabularyRegister — LLM Context Middleware
- **What**: Injects domain-specific vocabulary registers into prompts/context windows.
- **Default registers** (6 shipped):
  1. medieval-fantasy
  2. sci-fi-remnant
  3. modern-corporate
  4. ancient-formal
  5. criminal-underworld
  6. scholarly-archaic
- **Config**: `active_register`, `max_injected_entries`, `prepend_tone_hint`.
- **Events**: `vocabulary_switch`, `vocabulary_inject`, `vocabulary_register_load`.
- **Skeleton**: `packages/core/src/traits/VocabularyRegisterTrait.ts`

### 5. @speechAwareEncounter — Voice/Text Encounter Engine
- **What**: v2 voice-channel with ReID-backed speaker attribution; v1 text fallback.
- **ReID**: Consumes `ReidEmbeddingTrait` embeddings. Maps acoustic/voice-print to persistent speaker IDs.
- **Config**: `voice_enabled`, `reid_confidence_threshold`, `fallback_to_text`, `max_turns`, `reid_backend`.
- **Events**: `speech_detected`, `encounter_turn_recorded`, `speech_channel_switched`.
- **CI gate**: Attribution test >= 80% accuracy on ReID-backed speaker mapping.
- **Skeleton**: `packages/core/src/traits/SpeechAwareEncounterTrait.ts`

### 6. @avatarIntent — Input-Device Abstraction Layer
- **What**: Abstraction between raw input devices (controllers, hand/eye tracking, voice, BCI) and high-level avatar intents (move, grab, emote, speak, rest).
- **Pre-condition**: For prone-bed v3 — "rest" intent maps to lying pose consumed by `AvatarEmbodimentTrait`.
- **Config**: `intent_mapping` (ordered rules), `smoothing_window_ms`, `dead_zone`, `max_sample_buffer`.
- **Events**: `avatar_input_sample`, `intent_mapped`, `avatar_intent_query`.
- **Skeleton**: `packages/core/src/traits/AvatarIntentTrait.ts`

## Files Added / Modified

### New trait skeletons
- `packages/core/src/traits/VerbalFingerprintTrait.ts`
- `packages/core/src/traits/AutonomousAgendaTrait.ts`
- `packages/core/src/traits/VocabularyRegisterTrait.ts`
- `packages/core/src/traits/SpeechAwareEncounterTrait.ts`
- `packages/core/src/traits/AvatarIntentTrait.ts`

### New tests
- `packages/core/src/traits/__tests__/VerbalFingerprintTrait.test.ts`
- `packages/core/src/traits/__tests__/AutonomousAgendaTrait.test.ts`
- `packages/core/src/traits/__tests__/VocabularyRegisterTrait.test.ts`
- `packages/core/src/traits/__tests__/SpeechAwareEncounterTrait.test.ts`
- `packages/core/src/traits/__tests__/AvatarIntentTrait.test.ts`

### Modified
- `packages/core/src/traits/index.ts` — exports for all 5 new traits + existing `ReputationLedgerTrait`

## Next Steps (Post-Skeleton)

1. **VerbalFingerprint**: Replace stub `computeTextHash` with stable hash. Add per-backend accuracy benchmark suite.
2. **AutonomousAgenda**: Integrate with `packages/holoscript-agent/` daily-loop runner. Add LLM action-proposal callback hook.
3. **ReputationLedger**: Wire Gem 4 capability-scoring substrate for automated trust-delta computation.
4. **VocabularyRegister**: Add register-composition (merge multiple registers). Add runtime vocabulary token-budget estimation.
5. **SpeechAwareEncounter**: Wire `ReidEmbeddingTrait` adapter. Implement voice-print confidence model.
6. **AvatarIntent**: Add multi-modal fusion rules (gaze + pinch = select-at-distance). Add BCI signal adapter.
