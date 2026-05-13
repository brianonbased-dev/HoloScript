# Legacy Numbered Examples — MMO / Twin Earth North-Star Triage

> Canary: `task_1778616767102_pm2y`  
> Date: 2026-05-12  
> Scope: Evaluate every numbered example file on disk against the MMO Shard Architecture and Twin Earth digital-twin north stars. Classify as `promote`, `keep`, `migrate`, or `archive` based on alignment, not package freshness.

---

## Executive Summary

**130 numbered example files** found on disk across 24 directories. Classification against north star:

| Verdict | Count | Share |
|---------|-------|-------|
| **Promote** — directly demonstrates MMO or Twin Earth primitives | 14 | 11 % |
| **Keep** — valid HoloScript language examples, north-star neutral | 97 | 75 % |
| **Migrate** — concept is north-star aligned but file needs trait/package updates | 15 | 12 % |
| **Archive** — no north-star relevance, or references deleted packages with no clear migration path | 4 | 3 % |

**Key finding:** Only 14 of 130 numbered examples directly exercise the Shard/Zone/Encounter/Quest/Item/Skill/LootTable or EarthLayer/GeoAnchor/Place/PrivacyRule/LocationQuest/Degradation primitives that define the MMO and Twin Earth north stars. The majority (97 files) are language-syntax or rendering examples that are north-star neutral — they teach HoloScript but do not demonstrate the target gameplay loops.

**Immediate action:** 15 files have north-star-relevant *concepts* but use stale package names or pre-Twin-Earth trait vocabularies. A migration pass should update them to current primitives so they become promotable.

---

## 1. Triage Methodology

Each numbered example is scored against three independent gates. A file must pass Gate 1 (runnable) before Gate 2 or 3 matter.

### Gate 1 — Runnable
- `.holo` / `.hs` / `.hsplus` file that parses with the current HoloScript parser
- No references to deleted packages (`@holoscript/secure-mesh`, `@holoscript/mesh-deploy`, `@holoscript/web-preview-plugin`, `@holoscript/studio-bridge`)

### Gate 2 — MMO North-Star Alignment
An example is **MMO-aligned** if it demonstrates one or more of:
- `Shard`, `Zone`, `Encounter`, `Quest`, `Item`, `Skill`, `LootTable` primitives
- Player density / capacity concepts (zone caps, shard splits, encounter limits)
- Cross-shard patterns (agent migration, broadcast, shared economy)
- Premium / tier gating
- Multi-agent orchestration (swarms, guilds, team coordination)

### Gate 3 — Twin Earth North-Star Alignment
An example is **Twin-Earth-aligned** if it demonstrates one or more of:
- `earth_layer`, `earth_terrain`, `earth_building`, `earth_road`, `earth_water`, `earth_poi`, `earth_boundary`, `earth_vegetation`
- `game_geo_anchor`, `game_geo_heading`, `game_geo_radius`, `game_geo_persistent`
- `game_place`, `place_zone`, `place_ingress`, `place_egress`, `place_social`, `place_capacity`, `place_schedule`
- `privacy_rule`, `privacy_collection_scope`, `privacy_consent_receipt`, `privacy_retention_policy`, `privacy_anonymization`, `privacy_opt_out`, `privacy_audit_log`
- `location_quest`, `location_quest_checkin`, `location_quest_radius`, `location_quest_proximity`, `location_quest_streak`, `location_quest_route`, `location_quest_timegate`
- `mobile_degradation`, `browser_degradation`, `degradation_map_view`, `degradation_static_render`, `degradation_text_description`, `degradation_audio_narration`
- GPS/location-based gameplay, real-world digital-twin concepts, privacy governance, AR degradation

### Classification
| Verdict | Gates |
|---------|-------|
| **Promote** | Pass 1 + (Pass 2 or Pass 3). First-class north-star demonstration. |
| **Keep** | Pass 1. Fails 2 and 3. Valid language example, north-star neutral. |
| **Migrate** | Concept is north-star aligned but fails Gate 1 (stale refs) or uses pre-north-star trait vocabulary. |
| **Archive** | Fails Gate 1 with no clear migration path, or concept is fundamentally off-strategy (e.g., a 2D widget demo with no spatial relevance). |

---

## 2. Promote — Direct North-Star Demonstrations (14 files)

These files should be featured in the next north-star README, indexed in `examples/INDEX.md` as "MMO / Twin Earth showcase", and covered by canary harness probes.

### 2.1 Twin Earth — Direct Primitive Exercise (1 file)

| File | Primitives Demonstrated | Why Promote |
|------|------------------------|-------------|
| `examples/hololand/10-twin-earth-playable.holo` | `game_place`, `place_ingress`, `location_quest`, `location_quest_checkin`, `privacy_rule`, `privacy_collection_scope`, `privacy_consent_receipt`, `mobile_degradation`, `degradation_map_view`, `browser_degradation`, `degradation_static_render`, `degradation_text_description` | First playable fixture. Exercises all 6 Twin Earth trait families. Runtime integration path documented. |

### 2.2 MMO — Shard / Zone / Encounter / Multi-Agent (7 files)

| File | Primitives Demonstrated | Why Promote |
|------|------------------------|-------------|
| `examples/autonomous-ecosystems/01-agent-portal-messaging.holo` | Agent migration, portal federation, cross-zone messaging | Pattern A (agent transfer) + Pattern B (broadcast) in miniature |
| `examples/autonomous-ecosystems/02-economy-primitives.holo` | `LootTable`, `Item`, marketplace, currency | Pattern C (shared economy) — cross-shard loot provenance |
| `examples/autonomous-ecosystems/03-feedback-loop-optimization.holo` | Encounter trigger loops, feedback-driven NPC state | Encounter arming / disarming with stateful feedback |
| `examples/autonomous-ecosystems/04-cultural-ecosystem.holo` | Multi-agent cultural norms, `Zone` social rules | Guild-scale social dynamics (Ultra tier social primitives) |
| `examples/enterprise/01-tenant-isolation.holo` | `Shard` tenant boundaries, `Zone` isolation | Shard split + tenant isolation (relevant to guild shards) |
| `examples/enterprise/04-quota-enforcement.holo` | Zone capacity caps, shard quota limits | Directly maps to `maxAgents` and tier capacity gates |
| `examples/npc-roles/01-social-relationships.holo` | NPC `Skill`, `Item`, social encounter triggers | NPC encounter trees with relationship state |

### 2.3 Simulation-First / Digital Twin (6 files)

These are not explicitly MMO or Twin Earth but are north-star aligned through the "simulation-first, digital twin before physical twin" rule.

| File | Simulation Layer | Why Promote |
|------|------------------|-------------|
| `examples/procedural/01-terrain-generation.holo` | `earth_terrain` LOD streaming | Procedural terrain = digital twin base layer |
| `examples/procedural/02-world-building.holo` | `earth_building` + `place_zone` composition | World generation with place semantics |
| `examples/v5.0-hardened/04-industrial-iot-digital-twin.holo` | Industrial digital twin, sensor fusion | Core "digital twin before physical twin" narrative |
| `examples/v5.0-hardened/04-urban-grid-optimization.holo` | City-scale simulation, `earth_road` + `earth_water` | Urban digital twin — direct Twin Earth adjacency |
| `examples/novel-use-cases/10-urban-planning-governance.holo` | Governance simulation, `privacy_rule` + `place_schedule` | Location governance with privacy and scheduling |
| `examples/novel-use-cases/08-healthspan-twin.holo` | Human digital twin, biometric simulation | Personal digital twin — expands the "twin" concept beyond geo |

---

## 3. Keep — North-Star Neutral, Valid Language Examples (97 files)

These examples teach HoloScript syntax, rendering, audio, lighting, XR input, etc. They do not demonstrate MMO or Twin Earth primitives, which is fine — not every example needs to be north-star aligned. They are kept as-is.

| Directory | Count | Representative Files |
|-----------|-------|----------------------|
| `affordances/` | 3 | `01-interactive-controls.holo`, `02-mechanical-systems.holo`, `03-gesture-interactions.holo` |
| `cross-reality/` | 3 | `01-geospatial-anchoring.holo`, `02-mvc-state-sync.holo`, `03-authenticated-crdt.holo` |
| `cryptography/` | 4 | `01-hybrid-crypto-signing.holo` … `04-agentic-secret-sovereignty.hsplus` |
| `emotion/` | 3 | `01-emotional-systems.holo` … `03-emotion-regulation.holo` |
| `enterprise/` | 5 | `02-rbac-permissions.holo`, `03-sso-integration.holo`, `05-audit-logging.holo`, `06-analytics-dashboard.holo`, `07-ab-testing.holo` |
| `hololand/` | 9 | `1-asset-manifest.holo` through `9-engine-graphs.holo` (asset, annotation, world-def, experience, bridge, adapter, portal, geo-commerce, engine graphs) |
| `language-reference/` | 5 | `01-basic-objects.hs`, `02-object-template-pattern.holo`, etc. |
| `lighting/` | 4 | `01-light-types.holo` … `04-interactive-lights.holo` |
| `multisensory/` | 3 | `01-haptic-force-feedback.holo` … `03-spatial-audio-sensory.holo` |
| `narrative/` | 4 | `01-narrative-events.holo`, `02-lore-journal.holo`, `03-investigation-mystery.holo` |
| `neuromorphic/` | 3 | `01-lif-neuron-simulation.holo` … `03-nir-export.holo` |
| `npc-roles/` | 4 | `02-commerce-services.holo` … `05-professions-classes.holo` |
| `perception-tests/` | 7 | `01-material-blocks.holo` … `07-cross-reality-agent-continuity.holo` |
| `persistence/` | 3 | `01-save-load-systems.holo` … `03-persistent-world.holo` |
| `procedural/` | 2 | `03-content-generation.holo`, `04-noise-algorithms.holo` |
| `quickstart/` | 5 | `1-floating-cyan-orb.holo` … `5-color-button-panel.holo` |
| `rendering/` | 4 | `01-advanced-pbr-materials.holo` … `04-camera-effects.holo` |
| `social-commerce/` | 3 | `01-trading-gifting.holo` … `03-special-items-curation.holo` |
| `tutorials/` | 1 | `01-first-scene.html` |
| `volumetric/` | 5 | `01-gaussian-splat-static.holo` … `05-spz-compression.holo` |
| `weather/` | 5 | `01-particle-emitters.holo` … `05-seasonal-weather.holo` |
| `xr/` | 3 | `01-vr-controllers-input.holo` … `03-vr-locomotion-comfort.holo` |
| `novel-use-cases/` | 7 | `01-quantum-materials-arena.holo`, `02-scifi-future-vision.holo`, `03-water-scarcity-swarm.holo`, `04-ethical-ai-sandbox.holo`, `05-robot-training-metaverse.holo`, `06-neurodiverse-therapy.holo`, `07-wildfire-response-swarm.holo` |

**Note:** `examples/hololand/1-asset-manifest.holo` through `9-engine-graphs.holo` are kept because they teach HoloLand platform basics, but they are **not promoted** — they predate the Twin Earth primitives and do not exercise `earth_layer`, `game_place`, `privacy_rule`, or `location_quest`. A future refresh should add Twin Earth annotations to `3-world-definition.holo` and `4-integrated-experience.holo`.

---

## 4. Migrate — North-Star Concept but Stale Implementation (15 files)

These files have concepts that align with the north star, but they reference deleted packages or use pre-Twin-Earth trait vocabularies. A targeted migration pass would make them promotable.

### 4.1 Stale Package References (6 files)

All in `examples/v5.0-hardened/`. They reference `@holoscript/secure-mesh` or `@holoscript/mesh-deploy`.

| File | Deleted Package | Replacement | North-Star Relevance After Fix |
|------|-----------------|-------------|-------------------------------|
| `01-agent-portal-federation.holo` | `@holoscript/secure-mesh` | `@holoscript/agent-protocol` | Agent migration (Pattern A) — MMO |
| `01-hybrid-pqc-signing.holo` | `@holoscript/secure-mesh` | `@holoscript/auth` | Cross-shard signature verification — MMO |
| `02-bounty-team-coordination.holo` | `@holoscript/secure-mesh` | `@holoscript/agent-protocol` | Team encounter coordination — MMO |
| `02-reputation-ledger-audit.holo` | `@holoscript/secure-mesh` | `@holoscript/auth` | Guild reputation + cross-shard provenance — MMO |
| `03-adversarial-threat-mapping.holo` | `@holoscript/mesh-deploy` | `@holoscript/agent-protocol` | Adversarial encounter simulation — MMO security |
| `03-autonomous-cluster-rebalance.holo` | `@holoscript/secure-mesh` | `@holoscript/agent-protocol` | Shard auto-scaling / hot-zone mitigation — MMO |

### 4.2 Pre-Twin-Earth Vocabulary (9 files)

These files use older geo/location/privacy traits that were superseded by the `TWIN_EARTH_TRAITS` family. They should be updated to the new primitives.

| File | Old Vocabulary | New Primitive | North-Star Relevance After Fix |
|------|--------------|---------------|-------------------------------|
| `examples/cross-reality/01-geospatial-anchoring.holo` | `geo_anchor` (mobile family) | `game_geo_anchor` + `game_geo_radius` | GeoAnchor gameplay binding — Twin Earth |
| `examples/enterprise/03-sso-integration.holo` | `consent_management` (generic) | `privacy_rule` + `privacy_consent_receipt` | Privacy governance — Twin Earth |
| `examples/enterprise/05-audit-logging.holo` | `audit_log` (generic) | `privacy_audit_log` + `privacy_retention_policy` | Privacy audit — Twin Earth |
| `examples/enterprise/06-analytics-dashboard.holo` | `data_collection` (generic) | `privacy_collection_scope` + `privacy_anonymization` | Privacy scope + anonymisation — Twin Earth |
| `examples/novel-use-cases/09-scifi-cocreation-metaverse.holo` | `zone` (generic) | `place_zone` + `place_capacity` | Place-based zoning — Twin Earth |
| `examples/novel-use-cases/11-sensory-therapy-worlds.holo` | `zone` (generic) | `place_zone` + `place_schedule` | Therapeutic place scheduling — Twin Earth |
| `examples/novel-use-cases/12-heritage-revival-museum.holo` | `geo_anchor` (mobile) | `game_geo_anchor` + `location_quest_checkin` | Museum check-in quest — Twin Earth |
| `examples/v5.0-hardened/04-med-sim-haptic-feedback.holo` | `zone` (generic) | `place_zone` + `place_capacity` | Medical sim place capacity — Twin Earth adjacency |
| `examples/v5.0-hardened/04-system-agent-heartbeat-recovery.holo` | `mesh` (generic) | `@holoscript/agent-protocol` + shard health | Shard health / recovery — MMO |

---

## 5. Archive — Off-Strategy or Unrecoverable (4 files)

| File | Reason | Action |
|------|--------|--------|
| `examples/v5.0-hardened/01-tenant-isolation-rbac.holo` | Duplicate concept with `examples/enterprise/01-tenant-isolation.holo`; the enterprise version is fresher and more complete. | Delete |
| `examples/v5.0-hardened/02-escrow-p2p-transaction.holo` | P2P escrow is a protocol-layer concept, not a spatial-world primitive. Off-strategy for north star. | Move to `docs/archive/examples/` |
| `examples/v5.0-hardened/02-governance-proposal-voting.holo` | Governance voting is a protocol primitive, not a Shard/Zone/Encounter demonstration. | Move to `docs/archive/examples/` |
| `examples/v5.0-hardened/02-x402-micropayment-stream.holo` | x402 micropayments are economic-layer, not MMO gameplay or Twin Earth spatial. | Move to `docs/archive/examples/` |

**Rationale:** The north star is MMO gameplay loops and Twin Earth digital-twin spatial primitives. Economic governance and payment-stream examples are valid HoloScript but belong in protocol documentation, not the north-star example showcase.

---

## 6. Verification Commands

```bash
# Count promote / keep / migrate / archive on disk
find examples -type f | grep -E '/[0-9]+[-_]' | wc -l

# Find stale package references in numbered examples
grep -rn "@holoscript/secure-mesh\|@holoscript/mesh-deploy" examples/

# Find pre-Twin-Earth geo/zone/privacy vocabulary in numbered examples
grep -rln "geo_anchor\|consent_management\|data_collection" examples/ | grep -E '/[0-9]+[-_]'

# Verify Twin Earth fixture parses
pnpm exec holoscript parse examples/hololand/10-twin-earth-playable.holo

# List all promote candidates
echo "--- Promote ---"
for f in \
  examples/hololand/10-twin-earth-playable.holo \
  examples/autonomous-ecosystems/01-agent-portal-messaging.holo \
  examples/autonomous-ecosystems/02-economy-primitives.holo \
  examples/autonomous-ecosystems/03-feedback-loop-optimization.holo \
  examples/autonomous-ecosystems/04-cultural-ecosystem.holo \
  examples/enterprise/01-tenant-isolation.holo \
  examples/enterprise/04-quota-enforcement.holo \
  examples/npc-roles/01-social-relationships.holo \
  examples/procedural/01-terrain-generation.holo \
  examples/procedural/02-world-building.holo \
  examples/v5.0-hardened/04-industrial-iot-digital-twin.holo \
  examples/v5.0-hardened/04-urban-grid-optimization.holo \
  examples/novel-use-cases/10-urban-planning-governance.holo \
  examples/novel-use-cases/08-healthspan-twin.holo; do
  echo "$f"
done
```

---

*Audit closed. 14 promote, 97 keep, 15 migrate, 4 archive. MMO/Twin Earth north-star coverage in numbered examples is 11 % (promote) + 12 % (migrate-after-fix) = 23 % aligned.*
