# NETCODE: THE GOLD GAME — human + agent co-presence in one vault session

Authored by the /netcode discipline (marathon round 1). This is the technical underside of the
/gamedev Gate-3 dual-population proof: a human Curator and an AI AgentCurator in the *same* session,
affecting each other's curation. Built on the real foundation; honest about the gaps.

## Authority model — per-inhabitant, not per-type
HumanCurator (`@controllable`) and AgentCurator (`@ai_agent`) are the *same entity kind* (D.040), so
authority is decided by *who inhabits it*, not the class. Use `@holoscript/mesh` **EntityAuthority**
(ownership, transfer, lock semantics):

| Entity / state | Authority owner | Transfer / lock |
|---|---|---|
| HumanCurator avatar | the human's client | non-transferable while connected |
| AgentCurator avatar | the agent's runtime (uaa2/JEPA) | non-transferable while the agent runs |
| A knowledge-entry being graduated | **server-authoritative**, locked to whoever started the graduation | `EntityAuthority` lock; released on commit/abandon/timeout |
| Shared vault state (tier of each entry, lineage) | server-authoritative | replicated to all; no client owns it |

## What syncs, and at what `SyncTier`
| State | SyncTier | Rate | Interpolated? |
|---|---|---|---|
| Curator positions/poses | high | per-frame-ish | yes — `NetworkInterpolation` (snapshot buffer + client-side prediction) |
| Which entry is being graduated / progress | mid | on-change | no — authoritative event |
| Entry tier changes (a graduation lands) | mid | on-change | no — authoritative broadcast (`ReplicationManager`) |
| Reputation / standing | low | on-change / batched | no |
| Ambient props / spires | minimal | rarely | n/a |

Latency hiding: `NetworkInterpolation` for remote curators (buffer + interpolate so the other inhabitant
moves smoothly between updates); client-side prediction for the local curator. `DistributedTransformGraph`
provides CRDT-*merged* transform hashes for reconciling multi-node transform state.

## The conflict case — both try to graduate the same entry
Resolved by the entry's **`EntityAuthority` lock**: first to start the graduation takes the lock; the
second sees it locked and is offered a different entry or a "co-sign" assist (turning a race into
collaboration — fitting the co-op vault theme). On disconnect/timeout the lock releases to authority.

## Reconciliation & determinism
When clients disagree, resolve to the server authority. Where deterministic replay/rollback is needed,
lean on **`SimulationContract`** (fixed-timestep, replay-from-provenance) — that determinism is the seam
a real rollback codec would build on, and it lets a contested graduation be re-derived from provenance
rather than guessed.

## PROVE — two-participant agreement (not "it syncs")
The gate is not passed on assertion. The test: run **two clients** — one human-sim + one agent — in the
same session; have each graduate entries; then assert **both clients agree on the synced vault state**
(same set of entries at the same tiers, same lock history). Model it on the existing
`packages/core/src/__tests__/Multiplayer.test.ts` (EntityAuthority / NetworkInterpolation / ReplicationManager,
Cycle 108). Hand the agreement evidence to `/journalist` for an independent re-run. No two-participant
agreement → not done.

## Honest gaps (build targets — NOT claimed present, verified 2026-05-22)
- **EntityAuthority + NetworkInterpolation + ReplicationManager are REAL** in `@holoscript/mesh`
  (exercised by `Multiplayer.test.ts`). `SyncTierTrait`/`OfflineSyncTrait` ship. This co-presence design
  is buildable on them.
- **Loro CRDT is design-not-integrated** — `CRDTProtocolHandler.ts` defines the interface and there are
  "Loro-inspired" diffs, but there is **no actual Loro binding**. So CRDT-converged shared vault state is
  a build target, not a claim.
- **No lockstep/rollback codec, no host-migration (authority handoff for dropped players), no
  physics-determinism gate.** Today: authority + interpolated replication of game state. Not: deterministic
  lockstep or graceful host migration. Flag these; don't assert them.

## HANDOFF
- to **/gamedev**: this is the Gate-3 plan (the dual-population proof, as a sync problem). Gate 2 (the
  graduate verb) must land first — co-presence needs a verb to share.
- to **/game-design**: the conflict→co-sign mechanic is a design hook (competition vs collaboration on
  a shared entry).
