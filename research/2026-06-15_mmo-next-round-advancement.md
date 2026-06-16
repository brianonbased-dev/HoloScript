# HoloScript MMO — Next Round of Advancement (Round 2 Research)

> Date: 2026-06-15 · Author: Joseph Krzywoszyja · Status: research/proposal
> Builds on Round 1 (commits 61907f0cf compiler targets, 1b32168b2 MMO parser primitives)

---

## 1. Executive Summary

Round 1 shipped parser-level MMO primitives across all three HoloScript formats — HoloNPC, HoloWorldChunk, HoloLootTable, HoloGameTrigger in `.holo`; ability declarations, event blocks, authority annotations in `.hs`; brain blocks in `.hsplus` — plus ColyseusCompiler as the first real MMO compile target. The result is a rich AST with zero runtime semantics: `onTick()` is a stub comment, the move handler trusts client position unconditionally, every event block body is an unparsed raw string, and no `.hs` or `.hsplus` node is consumed by any compiler. Round 2 must close the gap between "parsed to AST" and "compiled to running Colyseus Room" by: wiring ImportResolver so the Colyseus compiler sees `.hs`/`.hsplus` imports; establishing tickCount as the canonical authoritative clock; emitting movement validation from `@movement_contract`; emitting TrustReceipt calls from `@receipt_on` event blocks; lowering HoloWorldChunk to ChunkManifest JSON; and wiring HoloBrainDecl to NpcState initialization. The single killer differentiator — impossible to replicate in Unreal, Unity, Colyseus, or SpacetimeDB — is verifiable-by-construction MMO actions: a `@provably_bounded` composition annotation whose ProvenanceBoundsChecker emits compile errors if exploit classes (speedhack, dupe, range-exploit, info-leak) are structurally reachable, backed by TrustReceipt chains on every server-authoritative game event, all derived from the same `.holo`/`.hs` source that simultaneously compiles to Colyseus Room, sovereign `mmo-server`, and Unreal multiplayer configuration.

---

## 2. Where Round 1 Left Us (grounded, honest)

The table below is grounded in files read from the codebase. "Lower" means a compiler consumes the AST node and emits executable output. "Runtime" means the emitted code actually runs a game loop.

| Primitive | Format | AST | Parse | Lower | Runtime |
|-----------|--------|-----|-------|-------|---------|
| HoloNPC | `.holo` | yes | yes | partial (metadata only, no behavior) | no |
| HoloSpawnPoint | `.holo` | yes | yes | no (ColyseusCompiler uses trait scan, not typed field) | no |
| HoloGameTrigger | `.holo` | yes | yes | no | no |
| HoloQuestDef | `.holo` | yes | yes | no | no |
| HoloLootTable / HoloLootEntry | `.holo` | yes | yes | no | no |
| HoloWorldChunk | `.holo` | yes | yes | no | no |
| GameAbilityNode | `.hs` | yes | yes | no | no |
| GameLootTableNode | `.hs` | yes | yes | no | no |
| GameSpawnNode | `.hs` | yes | yes | no | no |
| GameAuthorityNode | `.hs` | yes | yes | no (comment only) | no |
| GameEventBlockNode | `.hs` | yes | yes | no (body is raw string) | no |
| @server_side / @client_side / @replicated | `.hs` | yes | yes | cosmetic comment only | no |
| HoloBrainDecl | `.hsplus` | yes | yes | no consumers | no |
| ColyseusCompiler | — | — | — | yes (Room scaffold) | partial (onTick stub, move handler trusts client) |
| StatTrait / LuckTrait / EncounterTrait / DropTableTrait | `.hsplus` | yes | yes | yes (standalone trait) | yes (53 tests passing) |
| AINPCBrainTrait / CavemanDriveTrait | `.hsplus` | yes | yes | yes (standalone trait) | yes (122+ tests) |
| TrustReceipt / TrustLedger | TypeScript | — | — | — | yes (tested, no MMO binding) |

**Summary**: ColyseusCompiler is the only compiler with MMO lowering, and its `onTick()`, `handlePlayerJoin/Leave/Action`, and move handler are all stubs or unconditionally trust client input. Import resolution between `.holo` compositions and their `.hs`/`.hsplus` imports is not wired into ColyseusCompiler. The gap between parsed AST and running server is total.

---

## 3. The 8 Dimensions (deep)

### 3.1 Network Replication and State Sync

**SOTA**: Industry MMOs use five interlocking systems — spatial AOI grids (WoW ~300m bubble), delta-compressed snapshots (Quake3 XOR-diff at 20Hz, `@colyseus/schema` MessagePack dirty-flag), client-side prediction ring buffers (Valve model: rewind to acked sequence, replay pending inputs, blend on error), lag compensation rewind (per-entity position history keyed by timestamp), and authority transfer (Colyseus is single-server authority; Unreal uses Owner actor + HasNetAuthority; SpacetimeDB makes authority a data-model property via reducers).

**Current state**: `@server_side/@client_side/@replicated` are parsed as `HSPlusTraitDirective` in `HoloScriptCodeParser.ts:1387-1419` but no compiler acts on them. `ColyseusCompiler.emitSchemaSection()` emits `@server_side` nodes as plain TS fields with a comment — no `@type` omission, no validation. The move handler (lines ~499-504) directly assigns `player.x/y/z` from the client message with zero validation. `NetworkedTrait.ts`, `SyncTierTrait.ts`, `ClientPrediction` in `@holoscript/mesh`, `LagCompensation`, and `SnapshotInterpolation` all exist as fully-implemented TypeScript but are disconnected from all three parsers and from ColyseusCompiler output.

**New HoloScript syntax**:

```hs
// .hs — per-field sync tier on an ability
ability fireball {
  @server_side
  @replicated(tier: physics, rate: 20, compression: delta, interpolation: hermite)
  damage_type fire
  @cooldown 3s
  @mana_cost 40

  @client_side
  @replicated(tier: cosmetic, rate: 10, on_change_only: true)
  cast_vfx "fireball_charge"

  on_cast {
    validate_range(caster, target, range: 40)
    deal_damage(target, base: 80, type: fire)
    emit receipt(action: "ability_cast", resource: target.id, outcome: "success")
  }
}
```

```holo
// .holo — per-NPC Area of Interest declaration
NPC wise_keeper {
  model: "keeper_male_01"
  @brain_block { type: behavior_tree, personality: "wise_mentor" }
  @aoi_bubble {
    radius: 120
    position_threshold: 0.5
    chunk_pre_filter: true
    priority: 8
    always_relevant_tags: ["boss_spawn", "world_event"]
  }
}
```

```holo
// .holo — named replication channels
world frontier {
  @sync_group physics {
    rate_hz: 60
    channel: unreliable
    compression: quantized
    fields: [position, velocity, rotation]
  }
  @sync_group game_state {
    rate_hz: 10
    channel: reliable
    compression: delta
    fields: [hp, mana, buffs, faction_standing, quest_flags]
  }
  @sync_group npc_ai {
    rate_hz: 4
    channel: unreliable
    consistency: eventual
    fields: [npc_dialogue_state, npc_agenda, npc_reputation]
  }
}
```

```hs
// .hs — lag-compensated hit validation
ability arrow_shot {
  @server_side
  @lag_compensated {
    rewind_window: 200
    latency_ema_alpha: 0.2
    max_rewind_ms: 350
    emit_receipt: true
  }
  @damage_type ranged_physical
  @cooldown 1.2s

  on_hit(target, hit_data) {
    deal_damage(target, base: 45, type: ranged_physical)
  }
}
```

**Compile targets**: ColyseusCompiler extension — consume `@replicated(tier, rate, compression)` directives to emit per-field `@type` decorators with rate-gating in `onTick()`; consume `@aoi_bubble` to emit per-connection relevancy filter using `OctreeSystem.rangeQuery()`; consume `@lag_compensated` to emit position-history array in `GameRoomState` and rewind step inside compiled `on_hit` handlers. New `ReplicationGraphCompiler` (SOVEREIGN target `replication-graph`) — lowers `HoloWorldChunk.replication_graph` blocks and `@aoi_bubble` to a standalone TypeScript replication-graph module (`SpatialGridNode`, `ConnectionRelevancyDriver`, `DormancyController`).

**Novelty**: Three publishable angles: (1) provenance-receipted game state — every AOI decision, authority transfer, and lag-compensation hit emits a SHA-256-chained TrustReceipt (structurally impossible in WoW/UE/Colyseus); (2) cognition-coupled replication — NPC perception radii and network AOI derived from the same `.holo` source primitive, unifying AI awareness and bandwidth allocation; (3) single-source authority split — one `.hs` file annotated `@server_side/@replicated` compiles to Colyseus server bundle AND R3F/Babylon client bundle with prediction auto-generated.

---

### 3.2 World Scale: Streaming, Sharding, Zoning, Instancing

**SOTA**: WoW uses 2D grid chunk streaming with load-radius/unload-radius hysteresis and priority queues ordered by distance + movement-predicted intercept. Cross-shard handoff: sealed tamper-evident handoff envelope → coordination service → destination shard. SpacetimeDB treats the world as a distributed DB where entity migration is a CRDT merge across partition boundaries. WoW Layering + Destiny phasing use `phase_mask` bitmasks per scene object; server evaluates client quest flags per-frame and suppresses mismatched objects.

**Current state**: `HoloWorldChunk` AST (with `bounds/biome/lodDistances/npcRoster/streaming` sub-block) is fully parsed by `parseWorldChunk()` at `HoloCompositionParser.ts:5476` but has zero compiler lowering anywhere. `WorldStreamer.ts` (packages/engine/src/world/) implements a real ChunkState FSM with load/unload hysteresis — but it is browser-native (depends on `requestAnimationFrame`, line 189) and is never fed from a `.holo` source. The parse-but-never-lower gap is total.

**New HoloScript syntax**:

```holo
// .holo — server shard partition
world_shard frontier_overworld {
  zone_refs: ["oasis_market", "desert_canyon", "harbor_district"]
  max_players: 500
  tick_rate: 20
  handoff_authority: @server_side
  time_dilation {
    trigger_player_count: 400
    min_rate: 0.25
    recovery_rate: 0.05
  }
  shard_edges {
    edge north_border {
      bounds: ((-500, 0, 490), (500, 200, 510))
      transfer_to: "frontier_northern_reach"
      handoff_type: seamless
    }
  }
}
```

```holo
// .holo — world chunk with streaming policy and replication hints
world_chunk dockside {
  @streaming_chunk
  @chunked_lod
  chunk_key: (2, 0, 4)
  bounds: ((-200, 0, -200), (200, 100, 200))
  priority: high
  biome: "coastal_urban"
  lod_distances: [50, 150, 400]
  lod_mesh_detail: [1.0, 0.5, 0.2]
  npc_roster: ["merchant_alva", "harbor_guard_01"]
  neighbour_refs: ["chunk:2,0,3", "chunk:2,0,5", "chunk:1,0,4"]
  streaming {
    load_radius: 300
    unload_radius: 500
    budget_kb: 32768
    prefetch_priority: movement_predicted
    aoi_radius: 150
    max_concurrent_loads: 4
  }
  replication_graph {
    grid_node: true
    always_relevant: false
    pre_hydrate_on_proximity: true
    idle_on_empty: true
    dormant_when_idle: true
  }
}
```

```holo
// .holo — on-demand instanced dungeon
dungeon_instance sunken_archive {
  template: "dungeon_sunken_archive_v1"
  party_size: 1..5
  time_limit: 3600
  on_provision {
    seed_loot_tables: ["archive_chest_rare", "archive_boss_drops"]
    npc_roster: ["archivist_golem", "shade_scribe_01"]
    scale_difficulty_to: party_size
  }
  on_complete {
    emit_receipt: true
    reward: "loot_table:archive_completion"
    return_shard: "frontier_overworld"
    return_position: (12, 0, 88)
  }
  entry_trigger {
    object: "portal_sunken_archive"
    range: 2.5
    requires_party: true
  }
}
```

```holo
// .holo — phased world layer
world_layer pre_awakening {
  predicate: quest_flag("main_story_chapter_1") == false
  objects {
    npc abandoned_keeper {
      model: "npc_keeper_ghost.glb"
      position: (5, 0, 12)
      @personality: "mournful_warden"
    }
  }
}
world_layer post_awakening {
  predicate: quest_flag("main_story_chapter_1") == true
  objects {
    npc restored_keeper {
      model: "npc_keeper_restored.glb"
      position: (5, 0, 12)
      @personality: "vigilant_archivist"
      @faction_alignment: "oasis_council"
    }
  }
}
```

**Compile targets**: `WorldChunkManifestCompiler` (new SOVEREIGN or ColyseusCompiler pass) — reads `HoloComposition.worldChunks[]`, emits one `.chunk.json` per chunk and one `lod-config.json`; consumer: `WorldStreamer.setChunkGenerator()`. Note: WorldStreamer must first be extracted to a Node-safe headless module (currently RAF-dependent — blocker). `ShardRegistryCompiler` — reads `world_shard` declarations, emits `shard-manifest.json`. `WorldLayerCompiler` — computes `phase_mask` bitmasks, emits `PhaseRegistry.json`; ColyseusCompiler adds `phase_flags` to `PlayerState` and a `phaseFilter()` in AOI loop. `DungeonInstancePoolCompiler` — emits `RoomPool` config and `InstanceManager` service with TrustReceipt on completion.

**Novelty**: Provenance-sealed cross-shard handoff (structural property of `.hs` compilation output, not an optional audit hook). Phasing as a typed verifiable predicate (undefined quest-flag reference is a compile error; phase transition emits `DomainSimulationReceipt`). Semantic AOI driving both multiplayer relevance and NPC gossip eligibility from the same spatial declaration.

---

### 3.3 Combat and Ability Systems

**SOTA**: WoW introduced the 1.5s Global Cooldown. FFXIV separates GCD (2.5s weaponskills) from oGCD (instant, ~0.7s animation lock). Unreal GAS uses Gameplay Tags for ability gating, `GameplayEffect` for cost/cooldown, and prediction handles for client-side prediction with server correction. WoW Diminishing Returns: first CC application full duration → 50% → 25% → immune (18s window). Damage resolution is always server-authoritative in Colyseus; the client submits intent, never state.

**Current state**: `GameAbilityNode` (types/base.ts:145) captures `name`, `properties: Record<string,unknown>`, and `eventBlocks[]` with `body: string`. Parser correctly tokenizes `@cooldown/@mana_cost/@damage_type/@range` as directives and `on_cast/on_hit/on_combat/on_death` sub-blocks as raw strings. Zero compiler lowering — every ability is a dead AST node. `StatTrait.ts` is production-grade additive modifier stack directly reusable as the attribute layer. `DropTableTrait.ts` xorshift32 is the seeded PRNG for deterministic damage-roll replay.

**New HoloScript syntax**:

```hs
// .hs — GCD-gated spell with damage formula and server authority
ability Fireball {
  @gcd 1.5s
  @cooldown 8s
  @mana_cost 80
  @damage_type fire
  @range 30
  @server_side
  @emit_receipt ability_cast

  damage_formula {
    base: 120
    scaling: 0.85 * caster.spell_power
    crit_multiplier: 2.0
    crit_chance: caster.crit_rating / 2200
    resist_school: fire
  }

  on_cast(target) {
    check_gcd(caster)
    check_cooldown(caster, "Fireball")
    consume_mana(caster, mana_cost)
    apply_damage(target, roll_damage(damage_formula, caster, target))
    start_cooldown(caster, "Fireball", cooldown)
    start_gcd(caster, gcd)
  }
}

// .hs — oGCD defensive cooldown
ability BloodShield {
  @oGCD
  @cooldown 45s
  @server_side

  on_cast(self) {
    apply_buff(self, "blood_shield", duration: 8s, magnitude: 0.3 * self.max_hp)
  }
}

// .hs — CC with diminishing returns
ability FrostNova {
  @oGCD
  @cooldown 25s
  @damage_type frost
  @range 10
  @server_side

  crowd_control {
    cc_type: root
    @dr_family Root
    base_duration: 8s
    immunity_after: 4
    reset_window: 18s
  }

  on_cast(target) {
    apply_cc(target, cc_type, dr_reduced_duration(target, "Root", base_duration))
  }
}

// .hs — AoE cone with target selector
ability Cleave {
  @gcd 1.5s
  @damage_type physical
  @server_side

  target_selector {
    shape: cone
    angle: 120
    radius: 5
    max_targets: 3
    faction_filter: enemy
  }

  damage_formula {
    base: 80
    scaling: 0.70 * caster.attack_power
  }

  on_cast(targets) {
    for t in targets {
      apply_damage(t, roll_damage(damage_formula, caster, t))
    }
  }
}

// .hs — chain lightning
ability ChainLightning {
  @gcd 1.5s
  @cooldown 6s
  @damage_type lightning
  @range 30
  @server_side

  target_selector {
    shape: chain
    chain_length: 4
    chain_range: 8
    bounce_falloff: 0.70
    faction_filter: enemy
    no_repeat: true
  }

  damage_formula {
    base: 200
    scaling: 1.0 * caster.spell_power
  }
}
```

```hs
// .hs — buff with stack rule
buff BloodlustAura {
  @category haste
  @stack_rule exclusive_highest
  @duration 40s
  @magnitude 0.30
  @stat haste
  @refresh_on_reapply false
  @server_side
}

// .hs — boss phase state machine
boss_fight DragonRavager {
  @server_side
  @max_participants 25

  boss_phase "Phase1" {
    entry_condition: hp_ratio <= 1.0
    abilities: ["basic_attack"]
  }
  boss_phase "Phase2" {
    entry_condition: hp_ratio < 0.5
    abilities: ["claw_slash", "wing_buffet"]
    on_enter {
      spawn NPC DragonAdd_01 at position: [5, 0, 0]
    }
  }
  boss_phase "Enrage" {
    entry_condition: hp_ratio < 0.2
    abilities: ["tail_sweep", "breath_weapon"]
    enrage_timer_seconds: 60
    on_cast "breath_weapon" {
      @damage_type fire
      @range 15.0
      @cooldown 8.0
      emit_receipt: true
    }
  }
}
```

```holo
// .holo — NPC with attached ability set
npc GoblinShaman {
  model: "goblin_shaman_v2"
  faction: goblin_clan
  hp: 380
  ability_set: GoblinShamanAbilities
  brain: GoblinShamanAI
  @npc
}

ability_set GoblinShamanAbilities {
  abilities: [HexBolt, HealingWave, TotemHurl]
  gcd: 1.5s
  animation_lock: 0.6s
}
```

**Compile targets**: `CombatPassCompiler` (ColyseusCompiler mixin) — reads `GameAbilityNode[]`, generates per-ability cooldown map on `GameRoomState`, `gcdExpiry` on `PlayerState`, typed `onMessage('cast')` handler validating range/cooldown/GCD/mana, damage formula resolution using `DropTableTrait` xorshift32. New `AuthoritativeCombatCompiler` (SOVEREIGN target `mmo-combat-server`) using `SpatialEngine` as authoritative tick (after Node-safe extraction). `TargetSelectorPass` for sphere/cone/chain/cleave spatial queries using `OctreeSystem`. `DamageFormulaPass` emitting `rollDamage_<AbilityName>()` TypeScript functions. `BossPhaseCompiler` lowering `boss_fight` blocks to phase-state-machine class alongside the Room.

**Novelty**: Verifiable combat via provenance semiring — every server-authoritative ability execution emits a TrustReceipt whose `algebraicTrust.layer1Strategy` is `authority_weighted`, linking actor's `passportDid`, ability name, and evidence hashes over pre-combat state snapshot. D.044 Minab structural impossibility applied to MMO exploit prevention: certain action sequences (damage > `ability.damage_formula.max`, cast_time < server-verified GCD) become structurally impossible at the compiler level. LLM-native NPC threat response via `CavemanDriveTrait` routed to Jetson qwen3:4b at $0 marginal cost.

---

### 3.4 AI at Scale and LLM-Native NPCs

**SOTA**: Industry MMOs use layered approximation — most NPCs run 3-state FSMs, mid-tier run behavior trees (Unreal 5 BehaviorTree + Blackboard), LLM involvement is absent from shipped MMOs. Load-shedding: spatial culling (only NPCs within ~100m run full AI), LOD-gating (beyond 200m: 1Hz FSM). Inworld AI proved the latency problem: 300ms LLM per utterance is tolerable for one NPC in conversation, catastrophic for 50 simultaneous. HoloScript's CavemanDriveTrait `shouldCallLLM()` (<10% of ticks) is the correct gate — but see feasibility note: the 20-tick safety valve (line 95) fires unconditionally at 1s intervals, which breaks MMO-scale math.

**Current state**: `CavemanDriveTrait.ts` (154 LOC), `AINPCBrainTrait.ts` (152 LOC, 122 tests), `PerceptionTrait.ts` (full sight/hearing/proximity sensing), `SpatialHash.ts` (uniform-grid broadphase), `BehaviorTreeTrait.ts` (full BT: sequence/selector/parallel/inverter), `NavmeshSolverTrait.ts`, `FactionTrait.ts`, `AgentMemoryTrait.ts` — all production-grade. `HoloBrainDecl` parsed at `HoloScriptPlusParser.ts:2794` with full `@behavior_tree/@personality/@faction_alignment/@flee_threshold` fields. `LocalInferenceTrait.ts` + `LocalLLMAdapter` wired (W.733: Jetson at 192.168.0.119:11434 running qwen3:4b with tool-calls verified). Critical gap: `HoloBrainDecl` has zero consumers in ColyseusCompiler — confirmed by zero references in `packages/core/src/compiler/`.

**New HoloScript syntax**:

```hsplus
// .hsplus — brain block with local LLM wiring and SLF sovereign traits
brain WiseKeeperAI : @behavior_tree {
  @personality wise
  @faction_alignment lawful_good
  @memory_persistence true
  @local_llm_brain(
    model: "qwen3:4b",
    endpoint: "env:JETSON_OLLAMA_URL",
    llm_gate_threshold: 0.8,
    context_tokens: 4096,
    tool_calling: true
  )
  @flee_threshold 0.15
  @patrol_speed 1.2

  @verbal_fingerprint {
    speech_register: "oblique_proud"
    avoids: ["direct_answers", "modern_slang"]
    lore_leak_words: ["before the Divinity fell", "the program beneath"]
  }

  @autonomous_agenda {
    goals: [
      { id: "train_worthy_candidate", priority: 0.9, trigger: "player_embodies_virtue" },
      { id: "guard_secrets", priority: 0.7, trigger: "always" }
    ]
    initiation_threshold: 0.6
    agenda_durable: true
  }

  @reputation_ledger {
    tracked_players: true
    npc_to_npc: true
    ttl_days: 90
    cael_signed: true
  }

  state Idle {
    on_enter { action: "greet_nearby" }
    transition to: Combat when: threat_level > 0.7
    transition to: Patrol when: idle_timer > 30
  }
  state Patrol {
    on_tick { action: "follow_waypoints" }
    transition to: Idle when: player_proximity < 5.0
  }
  state Combat {
    on_enter { action: "draw_weapon" }
    on_tick { action: "engage_threat", llm_decide: true }
    transition to: Flee when: hp_ratio < 0.15
  }
  state Flee {
    on_enter { action: "flee_to_spawn" }
    transition to: Idle when: threat_level < 0.1
  }
}
```

```hsplus
// .hsplus — aggro table on NPC brain
brain GoblinWarriorAI : @behavior_tree {
  @personality aggressive
  @faction_alignment goblin_clan
  @flee_threshold 0.10

  aggro_table {
    @target_priority threat_weighted
    @switch_threshold 1.10
    @leash_radius 40
    @deaggro_on_leash true
    @threat_reset_on_death true
  }

  state patrol {
    transition to combat @when { aggro_table.top_threat > 0 }
  }
  state combat {
    transition to patrol @when { aggro_table.top_threat == 0 }
  }
}
```

```holo
// .holo — NPC with LOD-gated AI and perception
NPC GoblinScout {
  model: "goblin_scout.glb"
  @ai_npc_brain
  @faction alignment: "goblin_clan"
  @stat(name: "hp", value: 80, min: 0, max: 80)

  perception {
    sight_range: 18.0
    sight_angle: 110
    hearing_range: 12.0
    memory_duration_ms: 8000
    detection_layers: ["player", "hostile"]
    los_check: true
  }

  @lod_ai {
    inner_radius: 20.0
    inner_tick_hz: 10
    mid_radius: 60.0
    mid_tick_hz: 2
    outer_radius: 150.0
    outer_tick_hz: 0.5
    beyond_outer: "fsm_only"
  }
}
```

```holo
// .holo — pack AI coordination
zone GoblinCamp {
  bounds: { min: [100, 0, 100], max: [140, 8, 140] }

  spatial_group GoblinPatrol {
    leader: "GoblinCaptain"
    members: ["GoblinScout_A", "GoblinScout_B"]
    formation: "wedge"
    formation_spacing: 3.0
    threat_map_share: true
    threat_map_ttl_seconds: 15
    pack_alert_radius: 25.0
    pack_retreat_threshold: 0.3
    coordination_tick_hz: 2
  }
}
```

```holo
// .holo — gossip channel for cross-NPC knowledge transfer (D.043 substrate)
zone TavernDistrict {
  gossip_channel GoblinAlert {
    topic: "threat_sighting"
    ttl_seconds: 300
    max_entries: 20
    subscriber_factions: ["goblin_clan"]
    merge_on_hydrate: true
  }
  NPC GoblinScout_A { @gossip_publisher channel: "GoblinAlert" }
  NPC GoblinScout_B { @gossip_subscriber channel: "GoblinAlert" }
}
```

```holo
// .holo — durable NPC seed in WorldChunk (D.043 lifecycle)
WorldChunk TavernChunk {
  npc_seed WiseKeeper {
    handle: "wise_keeper_01"
    brain_ref: "WiseKeeperAI.hsplus"
    durable_fields: ["reputation_ledger", "agenda_state", "verbal_fingerprint"]
    losable_fields: ["current_dialogue_context", "combat_target", "patrol_position"]
    hydrate_budget_ms: 80
    episode_merge_on_unload: true
  }
}
```

**Compile targets**: ColyseusCompiler `onTick()` AI pass — consume `HoloNPC.perception` sub-block, emit `SpatialHash.queryRadius()` calls, feed results into BT blackboard per NPC, emit LOD bucket logic from `@lod_ai`. ColyseusCompiler brain-lowering pass — when `HoloBrainDecl` present: emit `brainType` field on `NpcState`, emit `initializeBrain()` in `onCreate()`, emit per-NPC BT tick in LOD-gated `onTick()`. ColyseusCompiler gossip channel lowering — emit `GossipStore` class with TTL; NPC hydration replays recent entries. ColyseusCompiler `npc_seed` lifecycle wiring — emit `hydrate()`/`destroy()` lifecycle from `AgentSeed` / `HoloScriptAgentRuntime`.

**Novelty (strong)**: Budget-gated LLM NPCs at MMO scale with typed durable/losable state split — first language-level expression of D.043, `@durable/@ephemeral/@session` field annotations catch reference errors at compile time. `gossip_channel` for cross-NPC awareness when agents have non-overlapping activity windows is specifically novel — no prior NPC architecture paper addresses this. Safety valve tuning (20 ticks → 200 ticks minimum) is a prerequisite before any scaling claim is valid.

---

### 3.5 Social Systems

**SOTA**: MMO social systems: persistent social graph (adjacency list + DID), role-slot LFG matching (Gale-Shapley-inspired deferred acceptance over tank/healer/DPS slots), server-authoritative 2-party trade escrow (WoW: both parties confirm before server commits atomic swap, preventing duplication via race condition), chat as topic pub-sub (WoW channels as named topics). SpacetimeDB models the social graph as tables with reducer-enforced access control.

**Current state**: `FactionTrait.ts` (production-grade reputation system) and `HolomeshSocialTraits.ts` (13 trait handlers, 1697 LOC — agent/HoloMesh social traits, NOT MMO social primitives) exist. `LinearTypeChecker.ts` already maps `@tradeable` to `InventoryItem` with move semantics — directly usable for compile-time trade escrow correctness. `execute_economic_contract` MCP tool is a stub returning `no_x402_facilitator`. No guild, party, raid, chat_channel, trade_window, or LFG primitive exists in any parser. Social systems are **round 3 minimum** — see feasibility section.

**New HoloScript syntax (specifying for round 3, not round 2)**:

```holo
// .holo — guild charter as world content
guild "Ironclad Covenant" {
  charter: "Defenders of the Frontier"
  min_level: 10
  max_members: 500
  ranks [
    { name: "Initiate",    permissions: ["guild_chat"] }
    { name: "Member",      permissions: ["guild_chat", "bank_tab_1"] }
    { name: "Officer",     permissions: ["guild_chat", "bank_tab_1", "invite", "kick_member"] }
    { name: "Guildmaster", permissions: ["all"] }
  ]
  founding_cost: 500
  founding_signatures_required: 4
}

// .holo — server-authoritative trade escrow
trade_window "PlayerTrade" {
  broker: none
  max_items_per_side: 6
  escrow_duration: 30s
  confirm_required: both_parties
  double_confirm_window: 5s
  receipt_on_commit: true
}

// .holo — LFG content declaration
lfg_content "Ember Keep (Normal)" {
  content_ref: "ember_keep_normal"
  min_level: 30
  party_template: "Standard Party"
  role_queue {
    tank:   { min: 1, max: 1 }
    healer: { min: 1, max: 2 }
    dps:    { min: 2, max: 4 }
  }
  cross_shard: true
}
```

**Compile targets (round 3)**: ColyseusCompiler `SocialStateSchema` pass — emit `GuildState`, `PartyState`, `ChatChannelState` schema classes. `TradeEscrowCompiler` — lower `trade_window` to `onMessage('trade_*')` handlers implementing the idle→confirm→commit state machine, with `LinearTypeChecker` InventoryItem move semantics proving compile-time escrow correctness. `LFGMatchmakingCompiler` — emit Node.js matchmaking service from `lfg_content` blocks using role-slot satisfaction algorithm.

**Novelty**: Receipt-anchored social contracts with linear-type-enforced trade escrow. Same `guild` block lowered by ColyseusCompiler → Colyseus GuildState, by UnrealCompiler → UE5 GameMode player roster, by R3FCompiler → React lobby UI — single-source IR that retargets across engine runtimes.

---

### 3.6 Persistence and Economy

**SOTA**: WoW uses `item_template` (shared, immutable) / `item_instance` (per-owner: durability, enchants, soul-bind) split. Diablo 3/4 procedural affixes: AffixPool filtered by item_type + level + tag; per-family roll prevents duplicate families; T1-T6 tiers weighted by item level. EVE's economy is double-entry ledger — every ISK transfer is a two-row atomic insert with no ISK created outside defined faucets. SpacetimeDB: the database IS the game server; reducers are transactional triggers. `DropTableTrait.ts` xorshift32 is already production-grade for weighted loot selection.

**Current state**: `DropTableTrait` (53 tests) exists as a standalone trait — not wired to `HoloLootTable` AST nodes. `EconomyPrimitivesTrait` is scoped to **agent compute credits**, not game currency. `ItemManifest.ts` (HoloLandItem with ancestry, state, trajectory, constraint) is TypeScript, not `.holo` syntax. `CraftingSystem.ts` has recipes but no affix system. `LinearTypeChecker.ts` maps `@tradeable` to `InventoryItem` with move semantics. No `item_def` block, no `affix_pool`, no `economy_zone`, no `craft_recipe` in any parser. x402 bridge is a stub.

**New HoloScript syntax (P1 for round 2, P0 for round 3)**:

```holo
// .holo — item definition with persistent instance fields
item_def shadow_amulet {
  display_name: "Amulet of Shattered Calm"
  rarity: epic
  category: accessory
  base_stats {
    magic_power: 42
    cooldown_reduction: 0.12
  }
  affix_pool: dark_jewelry_affixes
  max_affix_slots: 3
  @persistent instance_fields {
    durability: Float = 1.0
    awakened: Bool = false
    soul_bound_to: PlayerId?
    affix_rolls: AffixInstance[]
  }
  @versioned(1) migration {
    add_field curse_depth: Float = 0.0
  }
}

// .holo — procedural affix pool (Diablo 4 model)
affix_pool dark_jewelry_affixes {
  item_types: [ring, amulet]
  item_level_min: 10
  affix increased_damage {
    family: damage
    category: prefix
    tiers {
      T6 { value: 3..8   weight: 500 }
      T5 { value: 9..15  weight: 200 }
      T3 { value: 23..30 weight: 30  }
      T1 { value: 39..45 weight: 3   }
    }
    @luck tier_weight_multiplier: 0.3
  }
}

// .holo — economy zone with faucets, sinks, and market
economy_zone frontier_economy {
  currency: "gold"
  initial_player_balance: 100
  faucets {
    mob_kill      { rate: "1..8 gold"    source: bounty_system }
    quest_reward  { rate: "50..500 gold" source: quest_system  }
  }
  sinks {
    ah_listing_fee     { rate: "0.05 * item_value"  sink_type: destroy }
    ah_transaction_fee { rate: "0.05 * sale_price"  sink_type: destroy }
    repair_cost        { rate: "durability_loss * item_tier * 2" sink_type: destroy }
  }
  market {
    type: auction_house
    listing_duration_hours: [12, 24, 48]
    max_listings_per_player: 10
    @server_side price_validation: true
  }
}
```

```hs
// .hs — loot roll and craft built-in event functions
on_death(goblin_boss, killer) {
  @server_side
  @idempotent

  let drops = loot_roll(goblin_boss_drops, luck: killer.luck_bonus, count: 1..3)
  for drop in drops {
    let instance = instantiate_item(drop.item_id, affix_seed: drop.seed)
    grant_item(killer, instance)
  }
  grant_gold(killer, amount: dungeon_boss.faucet_rate)
}
```

```hsplus
// .hsplus — brain field lifecycle annotations (D.043)
@behavior_tree WiseKeeperBrain {
  @durable trust_map: Map<PlayerId, Float>
  @durable knowledge_fragments: Set<LoreFragmentId>
  @ephemeral current_dialogue_state: DialogueState?
  @ephemeral combat_threat_list: List<EntityId>
  @session new_behavior_facts: List<BehaviorFact>
  @session dialogue_turns: Int = 0
}
```

**Compile targets**: Wire `DropTableTrait` to `HoloLootTable` AST nodes (highest-value economy task, pure wire-job). Extend ColyseusCompiler to lower `item_def @persistent instance_fields` into `@colyseus/schema ItemInstanceState` class. New `EconomyCompiler` (SOVEREIGN `mmo-economy`) — lowers `economy_zone` to `EconomyZoneController` wrapping `EconomyPrimitivesTrait` with game-currency semantics, `SinkLedger`, `AuctionHouseService`. `AffixPoolCompiler` — lowers `affix_pool` to typed `AffixPool<T>` backed by `DropTableTrait` two-stage weighted draw.

**Novelty (strong)**: Provenance-receipted item economy — every item carries a SHA-256-linked provenance chain (drop → craft → AH trade → shard transfer) via `TrustReceipt.links.parentReceiptIds`. LinearTypeChecker proves trade escrow correctness at compile time (InventoryItem cannot be simultaneously in player inventory and escrow). Same `economy_zone` declaration compiles to Colyseus Room, Unreal GameMode, and x402/USDC settlement from one source. `@durable/@ephemeral/@session` field annotations give the compiler lifecycle-type checking for NPC state.

---

### 3.7 Server Authority and Verifiable Anti-Cheat

**SOTA**: Valve's Source engine: clients send intents, never state. Server validates speed (deltaPosition/deltaTime ≤ max_speed × leniency), cooldowns (per-player Map<abilityId, lastCastMs>), and range (Euclidean distance ≤ ability.range + epsilon). SpacetimeDB reducers: all writes via named reducers, structural impossibility of duplication because the reducer is the only write path. EAC/BattlEye/VAC: kernel-mode scanners and pattern databases — behavioral detection, not structural prevention.

**Current state**: Move handler in ColyseusCompiler (lines ~499-504) directly assigns `player.x/y/z` from client message — trivial speedhack. `@server_side/@client_side/@replicated` parsed but produce only cosmetic comments. `TrustReceipt.ts` and `TrustLedger.ts` are real tested infrastructure with `authority_weighted` strategy and `NdjsonTrustStorage` backend — zero MMO binding. `EffectChecker.ts` and `EffectInference.ts` already map `@networked` to effect rows — seed of a compile-time authority checker. `PhysicsBoundsRegistry.ts` wraps PhysicsService to clamp forces to `RiskTier` envelopes — the runtime pattern anti-cheat needs. `LinearTypeChecker.ts` implements move semantics for `InventoryItem`.

**New HoloScript syntax**:

```hs
// .hs — server-side validation envelope on ability
ability fireball {
  @damage_type fire
  @cooldown 3s
  @mana_cost 40
  @range 30
  @authority_envelope {
    max_range: 30
    cooldown_enforced: server
    mana_check: server
    damage_authority: server_only
    client_prediction: animation_only
  }
  on_cast(caster, target) { }
}
```

```holo
// .holo — movement constraint on zone
zone Frontier {
  @movement_contract {
    max_speed: 6.0
    max_acceleration: 18.0
    teleport_allowed: false
    leniency_factor: 1.25
    authority: server_reconcile
  }
}
```

```hs
// .hs — receipt emission on game event
on_combat(attacker, defender, outcome) {
  @receipt_on {
    event: "combat_resolution"
    actor_binding: attacker.passportDid
    resource: defender.id
    layer1_strategy: authority_weighted
    evidence_fields: [attacker.id, defender.id, outcome, timestamp]
  }
  if outcome == "kill" {
    trigger_loot_roll(defender.loot_table)
    award_xp(attacker, xp: defender.xp_value)
  }
}
```

```holo
// .holo — composition-level proof obligation
world FrontierMMO {
  @provably_bounded {
    guarantee_classes: [
      speedhack,
      ability_spam,
      range_exploit,
      dupe_exploit,
      info_leak
    ]
    audit_backend: ndjson
    receipt_schema: "holoscript.mmo-event-receipt.v1"
  }
}
```

```hs
// .hs — server-only state declaration
authority CombatAuthority {
  @server_only {
    cooldown_registry: Map<string, number>
    rng_seed: number
    respawn_queue: Array<EntityId>
    loot_roll_results: Map<string, LootRoll>
  }
  @replicated {
    hp: number
    faction: string
    position: Vec3
  }
}
```

**Compile targets**: ColyseusCompiler extension — authority-aware `onMessage` pass: reads `@authority_envelope` on `GameAbilityNode`, emits validation blocks (cooldown registry lookup, range distance check, mana check) before applying ability effect. Emits `deltaPosition` magnitude check vs `max_speed * deltaTime * leniency_factor` in move handler from `@movement_contract`. ColyseusCompiler receipt emitter pass — reads `@receipt_on` on `GameEventBlockNode`, emits `emitGameReceipt()` helper using `TrustReceipt.ts` after event body. New compile-time pass: `ProvenanceBoundsChecker` (extend `EffectChecker`) — validates `@provably_bounded` compositions, emits compile errors on violations. `ServerAuthorityBundleSplitter` — post-process ColyseusCompiler output into `server-bundle.ts` and `client-schema.ts`. New `GameEventReceiptSchema` — `DomainSimulationReceipt` subtype with schema `holoscript.mmo-event-receipt.v1`.

**Novelty (strongest claim)**: Structural impossibility of exploit classes by compile-time proof obligation. The `@provably_bounded` annotation with `ProvenanceBoundsChecker` makes speedhack/ability-spam/range-exploit/dupe-exploit/info-leak impossible in the emitted server artifact, not merely "hard to exploit." Every game action emits a TrustReceipt proving server validation occurred. This is the D.044 Minab principle extended from robotics to MMO griefing — no existing anti-cheat system (EAC, BattlEye, VAC, SpacetimeDB reducers) provides compile-time structural guarantees across the full action surface.

---

### 3.8 Single-Source Client/Server Compile

**SOTA**: Unreal: single C++ source, `NetMode` enum at runtime selects server vs client binary. Unity NGO: Roslyn source-gen from `NetworkVariable<T>` attributes. SpacetimeDB (closest analogue): one Rust source → server WASM module + client TypeScript SDK. No existing system allows one source to retarget across three heterogeneous server substrates (Colyseus/Node.js, SpacetimeDB/Rust-WASM, sovereign TypeScript game loop) from the same IR.

**Current state**: `@server_side/@replicated/@authority` annotations parsed to `HSPlusTraitDirective` in `HoloScriptCodeParser.ts:1387-1419`. `ExportTarget` union is exhaustiveness-checked in `sovereign-targets.ts`. Adding `mmo-server` requires: add to `ExportTarget` union, implement compiler class, add to `SOVEREIGN_TARGETS`, register in `ExportManager.ts` — scaffolding is clean and enforced. Critical blocker: `SpatialEngine` is RAF-based (line 189 confirmed) — cannot run in Node.js. `@spacetimedb_module` requires Rust codegen backend — does not exist, 6+ months minimum.

**New HoloScript syntax**:

```hs
// .hs — authority block grouping server/replicated/predicted fields
authority PlayerMovement {
  model: server_authoritative
  sync_rate: 20
  server_reconcile: true

  @server_side {
    position: Vec3
    velocity: Vec3
    hp: f32
    last_validated_tick: u32
  }
  @replicated {
    animation_state: string
    faction: string
  }
  @client_predicted {
    move_input: Vec3
    look_yaw: f32
  }
  @validation {
    max_speed: 10.0
    max_delta_per_tick: 2.0
    cooldown_enforced: ["fireball", "blink"]
  }
}

// .hs — reducer declaration (SpacetimeDB-style, compiled to Colyseus onMessage in round 2)
@server_side
@reducer
on_cast fireball(caster_id: string, target_pos: Vec3) {
  let caster = server.get_player(caster_id)
  assert caster.cooldowns["fireball"] <= 0, "cooldown active"
  assert vec3.distance(caster.position, target_pos) <= 25.0, "out of range"
  let damage = roll(caster.stats.spell_power, 0.8, 1.2)
  server.apply_aoe_damage(target_pos, radius: 5.0, damage: damage, type: fire)
  server.set_cooldown(caster_id, "fireball", 8.0)
  @emit receipt { action: "ability_cast", layer1Strategy: authority_weighted }
}

// .hs — client-predicted shadow of the reducer
@client_predicted(reconcile_with: fireball)
on_cast_client fireball_predict(caster_id: string, target_pos: Vec3) {
  client.play_vfx("fireball_cast", origin: local_player.position)
  client.set_animation("cast_spell")
  client.predict_position_freeze(300ms)
}
```

```holo
// .holo — explicit wire protocol declaration
world frontier_tavern {
  @max_players 64
  @tick_rate 20

  @network_schema {
    replicated: {
      players:   map<string, PlayerState>   @delta_compress
      npcs:      map<string, NpcState>      @delta_compress
      phase:     string                     @reliable
      tick_count: u32                       @unreliable
    }
    owner_only: {
      inventory:   list<ItemRef>            @reliable
      cooldowns:   map<string, f32>         @reliable
    }
    server_only: {
      rng_seed:              u64
      anti_cheat_pos:        map<string, Vec3>
      cooldown_timestamps:   map<string, f64>
    }
  }
}
```

```hsplus
// .hsplus — brain with authority tier declaration
brain WiseKeeperBrain {
  @behavior_tree
  @authority server
  @local_llm {
    provider: jetson
    fallback: fleet
    max_tokens: 256
    tool_calls: true
  }
  state idle {
    on_enter: greet_nearby_players()
    transition -> dialogue if: player_speaks_to_me()
  }
  state dialogue {
    on_enter: @emit receipt { action: "npc_dialogue_start", layer1Strategy: authority_weighted }
    transition -> idle if: dialogue_ended()
  }
}
```

**Compile targets**: `mmo-server` (new SOVEREIGN target) — self-contained Node.js authoritative game loop using a `setInterval`-based tick (NOT SpatialEngine's RAF-based loop — must be extracted or written fresh); reads `@server_side/@replicated/@authority` blocks, emits TypeScript owned by HoloScript, not Colyseus. `mmo-client-sdk` (paired SOVEREIGN target) — emits typed subscription SDK from `@replicated/@client_predicted` blocks, always co-emitted with `mmo-server`. Authority-split compile pass (cross-cutting) — structural partition of AST into server-set and client-set; validates no `@client_side` node references `@server_only` symbol (structural only in round 2 — no symbol-table cross-reference, which requires round 3-4). `@spacetimedb_module` is explicitly deferred (requires Rust codegen backend — 6+ months, not round 2).

**Novelty (strong)**: Single-source multi-target authority split — one `.holo`/`.hs` source compiles to Colyseus Room, sovereign `mmo-server`, with static proof that client-bundle code cannot reference `@server_only` symbols. Three-tier authority lattice (server / Jetson edge / `client_sim`) expressed as a single `@authority` annotation on `.hsplus` brain blocks — architecturally impossible in any single-engine framework. `@reducer` model makes `@server_side` blocks = SpacetimeDB reducers, lowered to Colyseus `onMessage` in round 2 and to Rust WASM in a future round.

---

## 4. The Differentiators (What's Impossible Elsewhere)

### Strong (publishable, grounded in existing infrastructure)

**1. Verifiable Anti-Cheat by Construction** (strongest claim, maps to D.010 papers 0c + 29 + new AAMAS/FDG '27 candidate)

Every existing anti-cheat system (EAC, BattlEye, VAC, SpacetimeDB reducers) is behavioral — detect and ban. HoloScript's `@provably_bounded` annotation with `ProvenanceBoundsChecker` gives a typed proof that speedhack, ability-spam, range-exploit, dupe-exploit, and info-leak are structurally impossible in the compiled artifact. Infrastructure: `EffectChecker.ts`, `LinearTypeChecker.ts` (InventoryItem move semantics), `TrustReceipt.ts` (SHA-256 chain, `authority_weighted`), `TrustLedger.ts` (NdjsonTrustStorage), `PhysicsBoundsRegistry.ts` (RiskTier envelopes). Paper: "Verifiable Anti-Cheat by Construction: Proof Obligations for MMO Authority in a Spatial Computing Language" (AAMAS '27 game-systems or FDG '27).

**2. Single-Source Authoritative Netcode via Annotated Spatial IR** (maps to Paper 10 PLDI '27)

One `.holo`/`.hs` source with `@server_side/@replicated/@authority` annotations forms a sound partition of the state space, retargeting to Colyseus Room, SpacetimeDB WASM, and sovereign `mmo-server`. No existing language (Unreal C++, Unity C#, SpacetimeDB Rust) allows the same source file to retarget across three heterogeneous server substrates. The authority-split pass provides a static proof that `@server_only` symbols are unreachable from client-bundle code. Paper: "Single-Source Authoritative Netcode via Annotated Spatial IR."

**3. Provenance-Receipted Item Economy with Linear-Type Escrow** (maps to Paper 0c CAEL/AAMAS '27)

Every item instance carries a SHA-256-linked provenance chain (drop → craft → trade → shard transfer) via `TrustReceipt.links.parentReceiptIds`. `LinearTypeChecker.ts` InventoryItem move semantics prove trade escrow correctness at compile time — an item cannot be simultaneously in a player inventory and in escrow. EVE Online has server-side item logs but not cryptographic provenance chains. Paper: "Verifiable Item Provenance in Open-World Economies via Trust Semiring Composition" (AAMAS '27 or CHI '27 games+economies track).

**4. Budget-Gated LLM NPCs at MMO Scale** (maps to Paper 12 I3D '27 + new AAMAS/AIIDE '27 candidate)

`CavemanDriveTrait <10% LLM-call gate` as a formal compile-time constraint (after safety valve tuning). `@durable/@ephemeral/@session` field annotations on `.hsplus` brain blocks give typed lifecycle-checked NPC state — `@ephemeral` fields referenced in `@durable` migration blocks are compile errors. `gossip_channel` solves cross-NPC awareness when agents have non-overlapping activity windows — no prior NPC architecture paper addresses this. Jetson Orin at $0/NPC/hour via `LocalInferenceTrait.ts` (W.733 verified). Paper: "Budget-Gated LLM NPCs at MMO Scale: Disposable Neural Maps, Durable Identity, and Verifiable Game-Event Receipts."

### Plausible (publishable with additional benchmark data)

**5. Cognition-Coupled Replication**: `@aoi_bubble` as the network-layer twin of `PerceptionTrait.sight_range` — entering an NPC's perception cone simultaneously enters its replication bubble. Semantic `awareness_volume` with `semantic_tag` drives both Colyseus `FilteredRoom` interest sets and `@reputationLedger` gossip eligibility. Paper: "Cognition-Coupled Replication: Unifying Agent Perception and Network Interest Management" (IEEE VR '27).

**6. Phasing as a Typed Verifiable Predicate**: `world_layer` predicates (typed `quest_flag()` expressions) compiled to server-side evaluators where undefined quest-flag reference is a compile error and phase transition emits `DomainSimulationReceipt`. Paper angle: Minab harm-prevention applied to phasing — structural impossibility of players accessing phase-locked content they have not earned.

**7. Provenance-Sealed Cross-Shard Handoff**: `on_shard_transfer` event blocks structurally emit `TrustReceipt` before player state leaves origin shard. The receipt seal is a structural property of the `.hs` compilation output.

**8. MMO Buff/Debuff Algebra as a Trait Composition Semiring**: `buff @stack_rule exclusive_highest` maps to max_plus semiring; `additive` maps to tropical sum. `ProvenanceSemiring.ts` already implements the substrate. Paper: foldable into Paper 10 or Paper 0c.

### Table-Stakes (implement correctly, no publication value)

Colyseus Room scaffold (already ships — extend it); GCD/oGCD cooldown enforcement in `onMessage` (mechanical wire-job); damage formula lowering using xorshift32 PRNG; AOI spatial grid wiring to `SpatialHash.ts`; BehaviorTree + blackboard wiring to `onTick()` AI loop; `HoloWorldChunk` → `WorldStreamer` ChunkManifest JSON; LOD-gated NPC AI tick multiplexing; guild/party/raid Colyseus schema classes; navmesh pathfinding queue wiring; item_def template/instance split; boss phase state machine; affix pool two-stage weighted draw; client-side prediction ring buffer (already in `ClientPrediction.ts` — wire it); LFG role-slot matchmaking service; AH double-entry economy; idempotency key emission.

---

## 5. Feasibility and Sequencing

### Blockers that gate everything else (P0-critical, must resolve first)

**BLOCKER 0 — Import resolution**: ColyseusCompiler must be wired to `ImportResolver` before any proposed extension. Currently, ColyseusCompiler walks only the composition AST it is given — it does not resolve imports. Every proposed compiler extension (combat, brain lowering, loot wiring, AOI from perception blocks) requires the compiler to see `GameAbilityNode` from `.hs` imports and `HoloBrainDecl` from `.hsplus` imports. This is a single integration task in `ColyseusCompiler.compile()`.

**BLOCKER 1 — Node-safe server loop**: `SpatialEngine.ts` calls `requestAnimationFrame()` at line 189 — cannot run in Node.js. Any `mmo-server` target or server-side authoritative sim is blocked until a `setInterval`/`process.hrtime`-based headless tick loop exists. Extract from engine's headless test mode (line 253) or write fresh.

**BLOCKER 2 — Canonical tick model**: `tickCount` as `u32` canonical server clock (not wall-clock float `deltaTime`) must be established before lag compensation, client-side prediction reconcile, or boss phase timer logic can be correctly implemented. Already partially there: `GameRoomState` has `tickCount` field. Establish: (a) stamp all server-authoritative events with `tickCount`, (b) key position history ring by `tickCount` not timestamp. One-day ColyseusCompiler change.

**BLOCKER 3 — GameAbilityNode structured directives**: `GameAbilityNode.properties` is `Record<string,unknown>` — no typed accessor for `cooldown`, `mana_cost`, `gcd`, `authority_envelope`. Add a typed directive accessor to `GameAbilityNode` in `types/base.ts` before any combat compiler pass.

**BLOCKER 4 — Event block body language undefined**: `AbilityEventBlock.body: string` is an unparsed raw string. For round 2, lower `GameAbilityNode` metadata only (cooldown, mana_cost, damage_type, range from properties map) — NOT the body. Emit a generated stub: `validateAndCastAbility(player, target, abilityConfig)` in `onMessage`, where `abilityConfig` is serialized JSON of directive values. Body lowering requires defining an event body grammar — that is a separate workstream (round 3+).

### CavemanDriveTrait safety valve (critical for AI scaling claims)

The 20-tick safety valve in `CavemanDriveTrait.ts` line 95 fires unconditionally every 1 second at 20Hz. At 50 NPCs this is 50 LLM calls/sec to a Jetson running at ~15 tok/s with ~1-2s latency per call — the math does not work. The safety valve must be tuned to ≥200 ticks (10 seconds at 20Hz) and `@lod_ai` must gate `shouldCallLLM()` by LOD tier (NPCs in `outer_radius` never call LLM) before any MMO-scale claim is valid.

### Over-scoped items (explicitly defer)

- `@spacetimedb_module` — requires Rust codegen backend; does not exist anywhere in HoloScript; 6+ months minimum. Defer to round 5+.
- `world_shard` cross-host player handoff — requires external session broker, Redis presence layer, cross-process WebSocket redirect. Round 2 scope: same-machine multi-room (Colyseus relay). Cross-host is round 4+.
- Full social systems (guild, party, raid, chat_channel, trade_window, LFG) — parser additions alone exceed a round's scope; zero scaffolding exists. Round 3 minimum. Only `@receipt_gate` on combat/loot events is needed in round 2.
- `EconomyCompiler` with `economy_zone`, `affix_pool`, `AuctionHouseService`, `@x402_bridge` — x402 is a stub; `EconomyPrimitivesTrait` is compute-credits not game-gold; no database connection in emitted servers. Round 4+.
- `ProvenanceBoundsChecker` as a cross-file compile-time proof obligation — requires symbol table and cross-file scope resolution that do not exist. Round 2: lint warning on single-file compositions only. Cross-file checker is round 3-4.
- `mmo-server` SOVEREIGN target using `SpatialEngine` — RAF-based, cannot run in Node.js. Must extract headless tick loop first (BLOCKER 1). After that, register target.
- `AuthoritySplitPass` with symbol-level cross-reference validation — requires body DSL parser and symbol table. Round 2: structural partition only (server-set / client-set from annotations, no symbol cross-reference).
- `@durable/@ephemeral/@session` with full `MigrationManager` + Postgres SQL emission — no ORM/connection pool in emitted artifacts. Round 2: typed annotations parsed, compiler emits stub `IPersistenceBackend` interface. Postgres wiring is round 4.

### Tick/time/determinism model decision (required in round 2)

All combat, prediction, lag compensation, and deterministic replay depend on a shared time model. Decision required:

1. `tickCount: u32` is the canonical server clock — all events stamped with tick, not wall-clock.
2. `deltaTime` in `onTick()` is a fixed `1/tick_rate` seconds, not a float measurement.
3. All combat PRNGs derive from a per-room `rng_seed: u64` stored in `@server_only` state, advanced deterministically per event.
4. Position history ring is keyed by `tickCount`, not timestamp.

This is a 1-day ColyseusCompiler addition that unblocks all higher-level features. Declare it in `.holo` as:

```holo
world FrontierMMO {
  @tick_model {
    tick_rate: 20
    clock: u32_counter
    rng_seed_policy: per_room_server_seeded
    delta_time: fixed
  }
}
```

### `@local_llm_brain` URL must use env variable (not hardcoded IP)

The Jetson IP has already flapped (W.733: .114 → .119). The `@local_llm_brain` syntax must use `endpoint: "env:JETSON_OLLAMA_URL"`, never a literal IP. The compiler emits `process.env.JETSON_OLLAMA_URL` with a fallback.

### Minimum viable round 2 (6 concrete deliverables)

1. Wire `ImportResolver` into `ColyseusCompiler.compile()` so `.hs`/`.hsplus` imports are visible to the compiler.
2. Add typed directive accessors to `GameAbilityNode` in `types/base.ts`.
3. Emit movement validation (`max_speed * deltaTime` check, server-reconcile broadcast) in move `onMessage` handler from `@movement_contract` annotation.
4. Emit `TrustReceipt` call for `on_combat`/`on_death` event blocks using `@receipt_on` annotation (using existing `TrustReceipt.ts` + `NdjsonTrustStorage`).
5. Wire `HoloWorldChunk` nodes to emit a `ChunkManifest` JSON artifact (parse-but-never-lower closed).
6. Lower `HoloBrainDecl.brainType` to a `brainType` field on `NpcState` and an `initializeBrain()` stub in `onCreate()`.

That is one round. Everything else is sequenced after the server loop is not a stub.

---

## 6. Cross-Cutting and Missing Concerns

### Tick/time model (most critical missing cross-cut)

Every dimension depends on a shared, authoritative notion of server time, but no dimension defines where this clock lives or how it is declared in `.holo`. Without a first-class `@server_tick_clock` primitive, every compiler will independently invent a time source, making cross-system determinism impossible. The `@tick_model` block (proposed in section 5) is the canonical solution referenced by all dimensions.

### TrustReceipt as the universal cross-cutting primitive

The receipt system appears in every dimension with slightly different syntax (`@receipt_on`, `@receipt_gate`, `@emit_receipt`). A single `GameEventReceiptSchema` (`DomainSimulationReceipt` subtype, schema `holoscript.mmo-event-receipt.v1`) and a single `TrustReceiptEmitterPass` should be the canonical solution for all dimensions — not independently reinvented in each one.

### Unified authority type system

`@server_only / @replicated / @client_predicted`, `@authority_envelope`, `@persistent_schema`, `@sync_group` are all facets of the same underlying type-level authority partition. A unified authority type system — analogous to Rust's ownership system — should be the single cross-cutting language feature from which all dimension-specific annotations derive.

### Observability and live-ops feedback loop

Every shipped feature (ability balance, economy sinks, NPC AI cost, AOI filter efficiency, shard load) needs runtime metrics to validate that compile-time design intent matches runtime behavior. `TrustLedger`, Prometheus/OTLP MCP tools, and `SyncTierTrait` congestion-adaptive rate adaptation are siloed. A cross-cutting `@observable` annotation on `.holo`/`.hs` constructs (abilities, `economy_zone`, `world_chunk`, NPC AI ticks) lowered into Prometheus counter/histogram emissions would give operators a live-ops dashboard from the language level and provide benchmark data required by I.007 Lotus Genesis.

### Tick/determinism model as a shared substrate

The DropTableTrait `xorshift32` seed is a local gesture at determinism but there is no `@deterministic_sim` declaration or replay-archive compiler target. For paper benchmarks (anti-cheat replay, LLM NPC cost auditing) deterministic replay is load-bearing.

### UGC / player-authored `.holo` content

HoloScript is a spatial computing language — player-authored world content is its most natural differentiator, yet no dimension addresses: sandbox/permission model for player-authored `.hs` ability declarations that run server-side; how UGC content is sandboxed from trusted world content; how the HoloScript Marketplace (`conformance_admit_artifact`, `conformance_check_artifact` MCP tools) connects to in-game UGC discovery. A `@ugc_zone` block and a `UGCCompiler` enforcing D.044 Minab safety envelopes on player-authored scripts is a natural and novel target.

### MMO load-testing via fleet/sim

`sim_run_paid` and `render_world_on_fleet` exist but no dimension connects them to: automated load testing (spawn N bot players, verify server tick stays under budget); game-balance CI (run 10,000 simulated combat encounters, assert damage distribution within design envelope); economy regression testing (simulate 30 days of activity, verify gold supply within inflation bounds). A `@balance_test` block in `.hs` and a `BotSwarmCompiler` target using the fleet sim would be uniquely powerful and tie directly to D.010 paper benchmarks. This is a P1 cross-cutting concern.

### Missing dimensions not covered by the 8

- **Tick/frame budget and determinism model** (P0 — addressed above as cross-cutting)
- **Server crash recovery and world-state snapshotting** — what happens when a Colyseus Room crashes mid-combat; how `@durable` brain fields and linear-type escrow slots are recovered without duplication
- **Player onboarding and tutorial pipeline** — `tutorial_sequence` block, `@first_time_only` on triggers, progressive ability unlock gates
- **Voice and proximity chat, audio spatialization** — `@voice_channel` block on zone with falloff radius; ambient sound zones
- **Moderation and player reporting at scale** — especially critical for LLM-native NPCs generating free-text dialogue
- **Seasonal content, live events, and content patching** — `timed_event` block with start/end timestamps, hot-swap of NPC brains without shard downtime
- **Player identity and DID as a shared primitive** — how `passportDid` is established at login, attached to `PlayerState`, and persisted across shard transfers

---

## 7. Recommended Round-2 Plan

### P0-Foundational (must ship, in dependency order)

| Priority | Item | Format(s) | Difficulty | What ships |
|----------|------|-----------|------------|------------|
| P0.0 | Wire `ImportResolver` into `ColyseusCompiler.compile()` | TypeScript (compiler) | S | ColyseusCompiler sees `.hs`/`.hsplus` imports |
| P0.1 | Add typed directive accessors to `GameAbilityNode` | `types/base.ts` | S | `cooldown`, `mana_cost`, `gcd`, `range` readable by compiler |
| P0.2 | Establish `tickCount: u32` canonical clock + `@tick_model` block | `.holo` parser + ColyseusCompiler | S | All events stamped with tick, fixed `deltaTime`, deterministic RNG seed |
| P0.3 | Movement validation in `onMessage('move')` from `@movement_contract` | `.holo` parser extension + ColyseusCompiler | M | Speedhack rejected in emitted Colyseus Room |
| P0.4 | `@receipt_on` annotation emission for `on_combat`/`on_death` | `.hs` parser + ColyseusCompiler | M | First live TrustReceipt calls in MMO server output |
| P0.5 | Wire `HoloWorldChunk` nodes to `ChunkManifest` JSON artifact | ColyseusCompiler pass | M | `WorldStreamer.setChunkGenerator()` can be fed from `.holo` source |
| P0.6 | Lower `HoloBrainDecl.brainType` to `NpcState` field + `initializeBrain()` | `.hsplus` consumer in ColyseusCompiler | M | First brain lowering; NpcState is data-driven not hard-coded |
| P0.7 | Tune `CavemanDriveTrait` safety valve (20 → 200 ticks), gate by `@lod_ai` | TypeScript trait | S | MMO-scale LLM NPC math becomes valid |
| P0.8 | `GameEventReceiptSchema` (`DomainSimulationReceipt` subtype) | `packages/core/src/receipts/` | S | Canonical receipt shape for all MMO game events |

### P1-Differentiator (ships after P0, these are the paper claims)

| Priority | Item | Format(s) | Difficulty | What ships |
|----------|------|-----------|------------|------------|
| P1.0 | `@authority_envelope` on abilities + cooldown/range/mana validation in `onMessage('cast')` | `.hs` parser + ColyseusCompiler | M | Server-authoritative ability validation in emitted Room |
| P1.1 | `@aoi_bubble` on `HoloNPC` + `OctreeSystem.rangeQuery()` in `onTick()` | `.holo` parser extension + ColyseusCompiler | M | AOI filtering: state no longer broadcast to all clients |
| P1.2 | `@replicated(tier, rate, compression)` directives → `@type` decorators with rate-gating | `.hs` parser + ColyseusCompiler | L | Per-field sync tiers in Colyseus schema |
| P1.3 | `HoloBrainDecl` brain state machine → per-NPC BT tick in `onTick()` | `.hsplus` → ColyseusCompiler | L | Living NPC AI in emitted Room |
| P1.4 | `@local_llm_brain` + `env:JETSON_OLLAMA_URL` → `LocalInferenceTrait` wiring | `.hsplus` parser + ColyseusCompiler | M | NPCs with Jetson qwen3:4b brains running in Colyseus Room |
| P1.5 | `npc_seed` block → `AgentSeed.hydrate()`/`episodeMerge()` lifecycle in `onTick()` | `.holo` parser + ColyseusCompiler | L | D.043 disposable-neural-map lifecycle running |
| P1.6 | `DropTableTrait` wired to `HoloLootTable` AST nodes | `.holo` → ColyseusCompiler | M | Loot rolls from `.holo` source (highest-value economy task) |
| P1.7 | `@gcd`/`@oGCD` annotations + GCD enforcer in `onMessage` | `.hs` parser + ColyseusCompiler | M | Server-side GCD enforcement; ability spam rejected |
| P1.8 | `damage_formula` block lowering → `rollDamage_<Ability>()` TypeScript function | `.hs` → ColyseusCompiler pass | M | Authoritative damage resolution in emitted Room |
| P1.9 | `@verbal_fingerprint` + `@autonomous_agenda` in `.hsplus` → LLM system prompt construction | `.hsplus` parser + brain wiring | M | SLF-class NPC feel from language declaration |
| P1.10 | Authority-split structural pass (server-set / client-set from annotations, no symbol-table) | Cross-compiler pass | L | First step toward `mmo-server` + `mmo-client-sdk` targets |
| P1.11 | Headless Node-safe tick loop extraction from `SpatialEngine` | `packages/engine/` refactor | M | Unblocks `mmo-server` target registration |
| P1.12 | `ProvenanceBoundsChecker` (single-file lint pass, extend `EffectChecker`) | Compiler safety pass | L | First `@provably_bounded` lint warnings; publish claim scaffolded |

### P2-Depth (round 3+, after differentiators are proven)

| Priority | Item | Format(s) | Notes |
|----------|------|-----------|-------|
| P2.0 | `@server_only` enforcement + `ServerAuthorityBundleSplitter` | Compiler pass | Requires symbol-table (round 3) |
| P2.1 | `boss_fight` phase state machine → Colyseus phase class | `.hs` + ColyseusCompiler | After canonical tick model |
| P2.2 | `gossip_channel` → `GossipStore` in Room + hydration replay | `.holo` + ColyseusCompiler | After `npc_seed` lifecycle (P1.5) |
| P2.3 | `spatial_group` / pack AI → shared threat map broadcast | `.holo` + ColyseusCompiler | After brain lowering (P1.3) |
| P2.4 | `world_layer` phasing → `PhaseRegistry` + `phase_flags` in `PlayerState` | `.holo` + WorldLayerCompiler | After canonical tick model |
| P2.5 | `world_shard` (same-machine multi-room scope) | `.holo` + ShardRegistryCompiler | Cross-host is round 4+ |
| P2.6 | `dungeon_instance` pool + TrustReceipt on completion | `.holo` + DungeonInstancePoolCompiler | After `world_chunk` manifest (P0.5) |
| P2.7 | Social systems (guild, party, trade_window, LFG) | `.holo`/`.hs` | Round 3 minimum, zero scaffolding today |
| P2.8 | `item_def` + `affix_pool` + `EconomyCompiler` | `.holo` + new compiler | Round 4 after x402 unblocked |
| P2.9 | `@spacetimedb_module` (Rust codegen) | — | Round 5+ |
| P2.10 | `@observable` cross-cutting annotation for live-ops telemetry | All formats | Cross-cutting P1 concern, schedule after P1.8 |
| P2.11 | `BotSwarmCompiler` for fleet-based MMO load testing / balance CI | New compiler | Maps to D.010 paper benchmarks |
| P2.12 | Cross-file `ProvenanceBoundsChecker` (symbol table required) | Compiler safety | Upgrades P1.12 from lint to compile error |

### The single highest-leverage first move

**Wire `ImportResolver` into `ColyseusCompiler.compile()` (P0.0).**

It is a single integration task — call `ImportResolver` in `ColyseusCompiler.compile()` and merge the resolved `.hs` `GameAbilityNode[]` and `.hsplus` `HoloBrainDecl[]` into the AST that the compiler walks. Until this is done, every other proposed compiler extension is unreachable. After this single task, P0.1 through P0.8 unlock sequentially, and the minimum viable round 2 becomes achievable in one sprint.

---

*File: `C:/Users/Josep/Documents/GitHub/HoloScript/research/2026-06-15_mmo-next-round-advancement.md`*
*Word count: ~10,000 words. All syntax snippets reflect proposed new HoloScript primitives grounded in the three-format model (F.120). All infrastructure references are grounded in files read from the codebase.*
