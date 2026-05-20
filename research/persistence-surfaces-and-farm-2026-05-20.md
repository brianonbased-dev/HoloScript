# Persistence & Database Surfaces — Scout + Farm (2026-05-20)

**Context**: During the deep synthesis marathon (governing constraint: zero external agent adoption), a dedicated "scout and farm for persistence and database tasks" directive was issued.

**Goal**: Systematically discover, map, and execute concrete improvements on the HoloScript / HoloMesh persistence layer so that agent state, world models, JEPA training, HoloLand NPCs, receipts, and knowledge survive restarts and support distributed operation.

## Key Surfaces Discovered

### 1. PersistentTrait (packages/core/src/traits/PersistentTrait.ts)
- Explicitly labeled "starter for State & Persistence category, p3 board task".
- 2026-03 audit called out **0% coverage** for state/persistence traits.
- Originally pure in-memory Map with TTL.
- **Improvement shipped**: Now supports `backend: 'memory' | 'file'` with real JSON file durability under `.holo-persist/`.
- Pairs with `STATE_PERSISTENCE_TRAITS` constant list (saveable, restorable, synced, versioned, undo_redo, staged, phased, dormant, active, etc.).

### 2. @holoscript/crdt package
- Mature authenticated CRDT library (DID-signed LWWRegister, ORSet, GCounter, OperationLog, WebRTCSync).
- Loro CRDT usage in spatial adapters (LoroSpatialAdapter, Loro Tree for scene graphs).
- Currently under-adopted as the backing store for the main PersistentTrait.
- Strong foundation for distributed HoloLand / multi-agent world models.

### 3. Declared but thin State Traits
- Many names in `constants/state-persistence.ts` (versioned, undo_redo, staged, dormant, cooldown, charged, etc.).
- Only `persistent` has an implementation (now improved).

### 4. Usage in the wider system
- Listed in framework trait registry (`TM_REGISTERED_TRAITS` includes "persistent").
- Loro deltas and frontiers appear in mcp-server Holomesh sync types.
- HoloLand platform uses Loro for spatial blocks.
- No widespread adoption yet in JEPAObjective, NPC controllers, or receipt pipelines.

### 5. Synthesis-aligned needs
- **Paper 26 (P1)**: JEPA training runs need durable checkpoints, experiment versioning, and loss-curve persistence (currently ad-hoc JSON in research/paper26/results).
- **HoloLand JEPA (D.050)**: NPC state (goals, memory, predicted world model) must survive process restarts and support conflict-free merge across agents.
- **D.055 public surface**: Durable profiles, receipts, and trust graphs on the orchestrator side.
- **Knowledge pipeline**: Local MEMORY.md / GOLD durability + CRDT-style merging for agent memories.
- **Receipt anchoring**: WorldModelReceipts should be first-class durable, queryable objects.

## Farmed Slices (this session)

1. **PersistentTrait file backend** (commit 6fd44e39c)
   - Real durable storage option.
   - Restart simulation test added.
   - Ready for immediate use in compositions and HoloLand NPCs.

2. **Surface map** (this document)
   - Single source of truth for future persistence work.

## Next High-Value Farm Targets (recommended order)

- Wire the `@holoscript/crdt` LWWRegister / ORSet as an optional backend for PersistentTrait (or as a higher-level `synced` / `versioned` trait).
- Add checkpointing + resume to the Paper 26 JEPA training harness using the new file backend (or Loro).
- Create a small `JEPAPersistentTrainer` or `PersistentNPCState` example that uses the trait + CRDT.
- Audit + implement 2–3 more of the declared STATE_PERSISTENCE_TRAITS (versioned, undo_redo, staged).
- Receipt store adapter for D.055-style public data (queryable, receipt-anchored).
- Local vs remote knowledge store conflict resolution using CRDT primitives.

## Verification

- `pnpm test` (trait-starters-p3) exercises the new durability path.
- `.holo-persist/` directory appears on first file-backend use (gitignored by default).
- Explicit git commits with scoped paths only.

This farm directly supports the synthesis critical path by making agent state, training runs, and world models durable and ready for external adoption.

**Status**: Active farm. Multiple slices completed. Board remains clear of open high-value items; persistence work derived from code + audit signals.