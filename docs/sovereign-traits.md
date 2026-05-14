# Sovereign Traits Developer Guide

> **Version**: D.040 (FW-0.6)  
> **Scope**: HoloLand NPCs, Items, and HoloMesh teammates  
> **Reference**: `research/2026-05-11_d040-sovereign-trait-scoping.md`  

## Overview

Sovereign traits are composable HoloScript-core primitives that give NPCs, items, and agents persistent identity, voice, trust, and autonomy. They are **not** runtime plugins — they are first-class traits shipped in `@holoscript/core` and consumed by `@holoscript/framework` (SLF / HoloLand) and `packages/holoscript-agent/` (headless agents).

## The Six Traits

| Trait | File | Population | Purpose |
|-------|------|------------|---------|
| `@verbalFingerprint` | `VerbalFingerprintTrait.ts` | NPCs, Items, Agents | Post-generation text fingerprint — survives model swaps |
| `@autonomousAgenda` | `AutonomousAgendaTrait.ts` | NPCs, Agents | Rolling action agenda with cost-ceiling enforcement |
| `@reputationLedger` | `ReputationLedgerTrait.ts` | NPCs, Items, Agents | Trust + behavior log per world/peer |
| `@vocabularyRegister` | `VocabularyRegisterTrait.ts` | NPCs, Items | Domain vocabulary injection into prompts |
| `@speechAwareEncounter` | `SpeechAwareEncounterTrait.ts` | NPCs | Voice/text encounter engine with ReID speaker attribution |
| `@avatarIntent` | `AvatarIntentTrait.ts` | Avatars | Input-device abstraction → high-level intents |

## Quick Start

### 1. Import a trait config

```typescript
import type { VerbalFingerprintConfig } from '@holoscript/core/traits/VerbalFingerprintTrait';
import type { AutonomousAgendaConfig } from '@holoscript/core/traits/AutonomousAgendaTrait';
```

### 2. Create an NPC with sovereign traits

Use `createHoloLandItem()` from `ItemManifest.ts` (items are character-like entities) or attach traits directly to an `HSPlusNode` via the trait handler.

```typescript
import { createHoloLandItem } from '@holoscript/core/hololand/ItemManifest';

const npc = createHoloLandItem('npc_elara_01', 'elara', {
  displayName: 'Elara the Watcher',
  description: 'A sentinel who speaks only in archaic verse.',
  verbalFingerprint: {
    fingerprint_key: 'elara_voice',
    style: {
      label: 'archaic_verse',
      minSentenceLength: 10,
      maxSentenceLength: 60,
      forbiddenPhrases: ['okay', 'yeah', 'lol'],
      requiredPhrases: ['behold', 'verily'],
      tone: 'formal',
    },
    enforce: true,
    rolling_window: 100,
  },
  vocabularyRegister: {
    active_register: 'medieval-fantasy',
    max_injected_entries: 30,
    prepend_tone_hint: true,
  },
  autonomousAgenda: {
    agent_class: 'npc',
    tick_interval_ms: 60_000, // per in-world hour
    daily_budget_usd: 0.50,
    max_actions_per_tick: 3,
    max_actions_per_day: 20,
    pause_on_ceiling: true,
  },
  reputationLedger: {
    world_id: 'shard_01',
    subject_id: 'npc_elara_01',
    initial_trust: 70,
    max_behavior_facts: 50,
    world_ttl_days: 90,
    emit_world_entry_disclosure: true,
    disclosure_text: 'Elara remembers how you treated her.',
    deletion_modes: ['npc'],
    ttl_breach_alert_rule: 'behavior_fact_ttl_breach',
  },
});
```

### 3. Attach traits to a node at runtime

```typescript
import { avatarIntentHandler } from '@holoscript/core/traits/AvatarIntentTrait';
import { verbalFingerprintHandler } from '@holoscript/core/traits/VerbalFingerprintTrait';

node.attach(avatarIntentHandler, {
  intent_mapping: [
    { devices: ['hand_tracking_right'], predicate: { 'hand_tracking_right:pinch': true }, intent: 'grab', weight: 1.0 },
  ],
  smoothing_window_ms: 150,
  dead_zone: 0.05,
  max_sample_buffer: 20,
});
```

## Trait Reference

### @verbalFingerprint

**Purpose**: Compute a fingerprint OVER generated text (not injected into the prompt). Survives model swaps because it validates output, not input.

**Config**: `VerbalFingerprintConfig`
- `fingerprint_key`: unique voice identifier
- `style`: sentence length bounds, forbidden/required phrases, tone label
- `enforce`: if true, reject text that fails fingerprint check
- `rolling_window`: number of recent utterances to include in fingerprint

**Events**:
- `verbal_fingerprint_verify` — request verification
- `verbal_fingerprint_verified` — passed
- `verbal_fingerprint_rejected` — failed (with reason)
- `verbal_fingerprint_query` — ask for current fingerprint state

**CI Gate**: Attribution test >= 80% accuracy across 3+ model backends.

### @autonomousAgenda

**Purpose**: Rolling agenda of actions with cost-ceiling enforcement. Integrates with `packages/holoscript-agent/` daily-loop runner.

**Config**: `AutonomousAgendaConfig`
- `agent_class`: `'npc' | 'teammate' | 'service'`
- `tick_interval_ms`: how often the agenda ticks
- `daily_budget_usd`: hard cost ceiling ($0.50/NPC/day, $5/agent/day headless)
- `max_actions_per_tick/day`: rate limits
- `pause_on_ceiling`: stop when budget exhausted

**Events**:
- `agenda_tick`
- `agenda_item_added/completed`
- `agenda_cost_ceiling_breach`
- `agenda_resume`

**CI Gates**: Daily-loop tick test; cost-ceiling test.

### @reputationLedger

**Purpose**: Per-world, per-peer trust score (0–100) + sliding behavior log. Extends x402 attestation with behavioral evidence.

**Config**: `ReputationLedgerConfig`
- `world_id`, `subject_id`: scope
- `initial_trust`: starting score
- `max_behavior_facts`: retention window
- `deletion_modes`: `['npc', 'global']` — who can purge facts

**Note**: Gem 4 capability-scoring substrate integration is a future extension (D.041).

### @vocabularyRegister

**Purpose**: Inject domain-specific vocabulary into LLM prompts/context windows.

**Default Registers** (6 shipped):
1. `medieval-fantasy`
2. `sci-fi-remnant`
3. `modern-corporate`
4. `ancient-formal`
5. `criminal-underworld`
6. `scholarly-archaic`

**Config**: `VocabularyRegisterConfig`
- `active_register`: which register is live
- `max_injected_entries`: token budget guard
- `prepend_tone_hint`: add tone marker to prompt

**Events**:
- `vocabulary_switch`
- `vocabulary_inject`
- `vocabulary_register_load`

### @speechAwareEncounter

**Purpose**: Voice/text encounter engine. v2 uses ReID-backed speaker attribution; v1 falls back to text.

**Config**: `SpeechAwareEncounterConfig`
- `voice_enabled`, `reid_confidence_threshold`
- `fallback_to_text`, `max_turns`
- `reid_backend`: which ReID model to use

**CI Gate**: Attribution test >= 80% accuracy on ReID-backed speaker mapping.

**Pre-condition**: `ReidEmbeddingTrait` must be wired for v2 voice channel.

### @avatarIntent

**Purpose**: Abstraction between raw input devices and high-level avatar intents.

**Supported Devices**: `controller_left/right`, `hand_tracking_left/right`, `eye_tracking`, `voice`, `keyboard`, `bci`

**Intents**: `idle`, `move`, `rotate`, `grab`, `release`, `point`, `select`, `emote`, `speak`, `rest`

**Config**: `AvatarIntentConfig`
- `intent_mapping`: ordered rules (first match wins unless weight overrides)
- `smoothing_window_ms`, `dead_zone`, `max_sample_buffer`

**Pre-condition for prone-bed v3**: `rest` intent maps to lying pose consumed by `AvatarEmbodimentTrait`.

## Integration Points

### ItemManifest.ts

All 5 applicable sovereign trait configs are imported into `ItemManifest.ts` (items use a slower tick cadence than NPCs). `AvatarIntent` is avatar-specific and not included in item manifests.

### Spatial Logic Framework (SLF)

SLF rules can reference sovereign trait state via `metadata` on `SpatialPredicate` and `SpatialAction`. Example: a predicate checking `reputationLedger.initial_trust > 50` to unlock a gated dialogue.

### Headless Agents

`packages/holoscript-agent/` consumes `@autonomousAgenda` and `@reputationLedger` for daily-loop scheduling and peer trust scoring.

## Compose Templates

See `examples/templates/d040-sovereign-npc.holo` and `examples/templates/d040-sovereign-item.holo` for ready-to-use `.holo` compositions demonstrating all six traits in HoloLand scenes.

## CI Verification

Run:
```bash
node scripts/__tests__/d040-sovereign-trait-canary.test.mjs
```

This verifies:
- All 6 trait source files exist and export their config type
- All 6 test files exist
- `traits/index.ts` exports all 6 traits
- `ItemManifest.ts` imports all 5 item-applicable configs
- Compose templates parse without structural errors

## Post-Skeleton Next Steps

1. **VerbalFingerprint**: Replace stub `computeTextHash` with stable hash. Add per-backend accuracy benchmark.
2. **AutonomousAgenda**: Wire to `holoscript-agent` daily-loop runner. Add LLM action-proposal callback.
3. **ReputationLedger**: Wire Gem 4 capability-scoring substrate.
4. **VocabularyRegister**: Add register-composition (merge multiple registers). Add token-budget estimation.
5. **SpeechAwareEncounter**: Wire `ReidEmbeddingTrait` adapter. Implement voice-print confidence model.
6. **AvatarIntent**: Add multi-modal fusion rules (gaze + pinch = select-at-distance). Add BCI signal adapter.

## Changelog

- **2026-05-11**: Skeletons shipped (6 traits, 5 tests, ItemManifest integration)
- **2026-05-13**: Developer guide + compose templates + CI canary shipped (this doc)
