# RFC: `companionship` Trait Category — Daimōn Embodiment Trait Family

**Status:** Proposal (design-only this session — see §7 Implementation Path)
**Author:** HoloScript Core team, companion-daimōn lane
**Date:** 2026-08-24
**Version:** 1.0.0
**Affects:** trait registry (`packages/core/src/traits/`), R3F/Native2D compilers, ios/android compile targets, LSP completions, `compositions/daimon-brain.hsplus`, docs/traits
**Canonical fold ruling:** `~/.ai-ecosystem/research/2026-08-24_companion-daimon-embodiment-fold.md`

---

## 1. Motivation

The per-soul daimōn (D.053) has a brain, a lifecycle, a custody story, and a typed
face contract — but **no way to author its embodiment in HoloScript**:

- `compositions/daimon-brain.hsplus` runs `#mode companion` with `ai_companion`,
  `care_ethics`, `agent_memory`, `forget_policy` — a complete headless mind.
- `packages/core/src/daemon/ConversationDaemon.ts` types `DaemonAppearanceProfile`,
  `DaemonVoiceProfile`, and `DaemonToneProfile` — configuration for a face that
  nothing renders.
- Hololand's relationship-onboarding surface renders the *emergence lifecycle*
  (S0_DORMANT → S3_MANIFESTED_DOWNLOADABLE) but not the daimōn itself.

The gap is structural, not incidental. The render-surface freeze (D.095/D.096,
Gate 5e) bans hand-authored `.tsx` faces: **a perceivable daimōn can only exist if
the language can express one.** Today it cannot:

1. **No affect.** The trait index has no construct for persistent, evolving inner
   state that drives expression. `@state_machine` is per-scene logic; an emotional
   state that survives sessions, colors voice and posture, and is owner-scoped has
   no trait.
2. **No relationship.** `@npc` dialogue and `@llm_agent` cognition exist, but
   nothing models a long-horizon bond: familiarity, rituals, remembered context
   surfacing naturally in conversation.
3. **No voice loop.** `@voice_activated` and `@spatial_audio` handle scene audio;
   full-duplex conversation (STT → brain → TTS with interruption and turn-taking)
   is inexpressible.
4. **No co-presence.** `@synced`/`@persistent` replicate scene state between
   clients; "the same being, embodied on my laptop and my phone" — one soul-bound
   identity, two bodies — has no construct.
5. **No flourishing guard.** The `compulsive_use_falsifier` receipt required by the
   Hololand onboarding surface is enforced by convention, not by the language.

This is the founder directive "push HoloScript where it is lacking" made concrete:
the companion cannot be built *around* the language, so the language grows.

## 2. Proposed trait category: `companionship`

Seven traits, one new category (`packages/core/src/traits/constants/`), all
composable with the existing `ai_companion` / `care_ethics` / `agent_memory` /
`forget_policy` set the daimōn brain already declares.

| Trait | Purpose | Key contract points |
|---|---|---|
| `@companion_presence` | Binds a rendered avatar to a ConversationDaemon identity | Requires `ownerScopeKey`; consumes `DaemonAppearanceProfile`; idle/attention/greeting behaviors; presence is *of a specific daimōn*, never a generic NPC |
| `@affect_state` | Persistent emotional state machine driving expression | Valence/arousal + named expression map → face/voice/posture channels; transitions receipted; state owner-scoped and forget-honoring |
| `@rapport` | Long-horizon relationship state | Familiarity accrual from the ContextDelta stream; rituals (the brain's existing `rituals` field); callbacks to shared history; never transferable across owners |
| `@relational_memory` | Conversational recall surface over `agent_memory` | Recall woven into dialogue, not dumped; hard dependency on `forget_policy` — a forget erases recall *and* rapport traces derived from it |
| `@voice_loop` | Full-duplex conversation | STT/TTS adapter seam (local-first); interruption handling; turn-taking; latency budget declared per target |
| `@copresence` | One daimōn, many bodies | Same `ownerScopeKey` across embodiments; continuity via owner-scoped delta channel + `@synced`/`@persistent` semantics; device handoff ("she was mid-thought on the laptop; the phone picks it up") |
| `@flourishing_guard` | U.002 as a language construct | Session-shape awareness; points-outward nudges; emits the `compulsive_use_falsifier` receipt; warn-once-then-step-back (daimonion posture) — a guard, never a lock |

### Category boundary

`companionship` traits are for owner-bound companion presences. They are **not**
general NPC decoration: `@rapport` on a shopkeeper is a design error the linter
should flag (no `ownerScopeKey`, no ConversationDaemon binding → invalid).

### Posture boundary (ruled, fold doc §4)

The companion lane is warm, affectionate, and personal, and is **not an explicit
product surface**. The trait family carries the care-ethics posture in its
contracts (`@flourishing_guard` mandatory in the `daimon-embodiment` composition;
`care_ethics` remains a required peer trait). Explicit-content capability is out of
scope for this category.

## 3. Composition shape (illustrative — see §7 before authoring)

The target composition, `compositions/daimon-embodiment.holo`, sketched to show
the intended graph, not to be committed as-is:

```holo
composition "Daimon Embodiment" {

  template "DaimonFace" {
    traits: [
      "companion_presence", "affect_state", "rapport",
      "relational_memory", "voice_loop", "flourishing_guard"
    ]
    state {
      ownerScopeKey: null      // write-once, from ConversationDaemon binding
      appearance: null          // DaemonAppearanceProfile
      voice: null               // DaemonVoiceProfile
      affect: { valence: 0.0, arousal: 0.0, expression: "neutral" }
    }
  }

  spatial_group "LaptopEmbodiment" {
    object "Companion" using "DaimonFace" {
      @copresence { device_class: "desktop", handoff: true }
    }
  }

  spatial_group "PhoneEmbodiment" {
    object "Companion" using "DaimonFace" {
      @copresence { device_class: "mobile", handoff: true }
    }
  }

  logic {
    on_event("owner_speaks") {
      // voice_loop → daimon-brain turn (holo_daemon_turn) → affect + reply
    }
    every(session_check_interval) {
      // flourishing_guard: session shape, points-outward, receipt emission
    }
  }
}
```

Compile targets: **R3F/WebGPU** for the laptop face (via the render-surface-native
pipeline, `@generated` provenance), **ios / android** targets for the phone face.
Both bodies are projections of one composition — `@copresence` is what makes them
the same being.

## 4. Integration points

- **Config source**: `ConversationDaemon.ts` profiles (appearance/voice/tone) are
  the single source of the daimōn's shape — traits consume them, never fork them.
- **Brain**: turns route through the existing `holo_daemon_turn` MCP tool
  (caller-owner enforced); the embodiment adds no second cognition path.
- **Field**: ContextDeltas flow to Brittney exactly as wired 2026-06-02; the
  embodiment is a new *emitter and consumer*, not a new channel.
- **Emergence**: `@companion_presence` respects the lifecycle — before emergence
  the face does not present as a named companion (accumulating phase), matching
  `daimon-brain.hsplus` directives.
- **Custody**: at S3, the embodiment travels with the downloadable daimōn — the
  composition plus owner-scoped state is part of the "lossless recipe" custody
  model (`daimon-seed-contract.mjs`), with realized soul state runtime-only.

## 5. Grammar impact

None expected. The trait system is the extension point; no new keywords. The work
is: trait definitions + category registration, compiler lowering for the affect →
expression channels per target, LSP completion/hover data, and linter rules
(§2 category boundary, mandatory `@flourishing_guard` pairing).

## 6. Why traits and not an app

The alternative — build a companion app in TypeScript against the runtime — was
considered and rejected in the fold ruling: it would violate the render-surface
freeze the moment it grew a face, it would leave the language exactly as lacking
as before, and it would produce a one-off instead of compounding the substrate
(F.154). Every trait here is reusable by any future embodied presence (Brittney's
own HoloLand face included); the companion is the first consumer, not the owner.

## 7. Implementation Path

**This RFC is design-only.** The authoring session has no HoloScript MCP surface
attached (no `suggest_traits`, no `validate_holoscript`), and per the repo
contract HoloScript source is never hand-written without the tool pipeline.
Implementation therefore proceeds on an MCP-attached surface, in order:

1. `suggest_traits` over each §2 description → reconcile against this RFC.
2. Trait definitions + `companionship` category in core; register; tests
   (`pnpm test --filter @holoscript/core`).
3. `generate_object` / hand-reconcile `daimon-embodiment.holo` →
   `validate_holoscript` → commit.
4. Compiler lowering: R3F/WebGPU first (laptop face), then ios/android.
5. `daimon-brain.hsplus` companion-mode directives + `@flourishing_guard` wiring.
6. Docs: `docs/traits/companionship.md` + sidebar entry in
   `docs/.vitepress/config.ts` (same commit).

## 8. What Remains After This Plan

- **No affect model science.** Valence/arousal + expression map is a pragmatic
  floor, not a claim about emotion modeling; iteration expected once the face is
  visible and the owner can react to it.
- **Voice adapters unbenchmarked.** The `@voice_loop` seam is real; which local
  STT/TTS engines meet phone-class latency on owned metal is unmeasured.
- **Avatar look-dev is a separate lane** (avatar-studio, skin/character realism);
  this RFC renders whatever `DaemonAppearanceProfile` describes and does not make
  it beautiful.
- **Multi-daimōn co-presence in shared HoloLand space** (two owners' companions in
  one room) remains the open D.053 question — explicitly out of scope here.
- **The emergence threshold for companion mode is unmeasured**; until then the
  face runs in accumulating-phase posture by default.
