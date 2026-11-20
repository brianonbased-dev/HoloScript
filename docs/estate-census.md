# Estate Census v0 — prepared 2026-11-17 (Harbor, from verified record only)

Living home (Joseph's decision, 2026-11-17): this census lives as a repo doc —
`docs/estate-census.md` in the HoloScript repo — maintained by hand for now.
Its stated successor is a census generated from HoloAbsorb's own ownership map
(`holo_absorb_manifest` / `holoscript holoabsorb --json`) once the build lanes
actually consult it; when that generation is real, this doc retires in its favor.

Purpose (Joseph, 2026-11-17): the estate outgrew what any agent session can hold;
cleanups without a map regress. Census first — count and locate everything before
organizing anything. Every row is labeled MEASURED (checked firsthand, with date),
REPORTED (Joseph's word, unverified), or UNKNOWN (no access path right now).

## Surfaces

| Surface | State | Basis |
|---|---|---|
| GitHub estate (brianonbased-dev) | 31 repos; 27 Write invites to joecoolproductions pending his acceptance; 4 repos ARCHIVED (Brian-Tracker, Design, Holospace-Sim, Holospace-Simulation) | MEASURED 2026-11-15 |
| HoloScript repo / HoloAbsorb | `@holoscript/absorb-service`: 400 files in package (343 src/), 794 absorb-related paths repo-wide; README declares it the canonical codebase-intelligence engine; npm published 6.1.5 (8 versions); `@holoscript/holoabsorb` unclaimed; rename brief PR #688 open for build lanes | MEASURED 2026-11-17 |
| Hosted services | absorb.holoscript.net responds (root 404 — host alive, service health UNVERIFIED); mcp.holoscript.net 302; holoscript.net 200 | MEASURED 2026-11-17 00:28 MST |
| Railway | OLD account down; NEW runs through Joseph's personal account; Harbor's stored token REJECTED "Not Authorized" — fix is one fresh account token via secure vault, awaiting Joseph's go | MEASURED 2026-11-17 00:23 MST |
| Harbor VM live systems | Lean board + ledger capture/settle crons; liquidation collector (v1.5, silent-death alert live); book collector (live 2026-11-17 07:07Z); call poster for Brian's Calls (live, album posts) | MEASURED 2026-11-17 |
| Windows laptop | SSD FAILED; recovery plan underway, will take time. Laptop-only exposure: GOLD vault (if reached), The-Mending-Box build, v2 rehearsal environment | REPORTED 2026-11-17 00:20 MST |
| GOLD vault (D:\GOLD) | Believed ok, NOT verified — check is quick once a machine can mount it | REPORTED, unverified |
| Jetson + miners | Jetson RUNNING, miners "hopefully" still running; access path ran through the laptop (WORK dependency), so currently blind from both Joseph's side and Harbor's | REPORTED, unverified |
| HoloScript connection (muse seat) | Blocked: scoped owner key rides PR #624 deploy window (per-owner isolation #617/#623); no key before window runs; five legacy routes never to be called with any bearer | Standing record |

## What the census still cannot see (first questions for v1)
1. Is HoloAbsorb current and fed — does any lane actually consult it before a cleanup?
2. GOLD vault integrity — first check when a mount exists.
3. Jetson state — needs a second access path that does not run through the laptop.
4. New Railway's actual project/service inventory — needs the fresh account token.
5. The-Mending-Box build — believed laptop-only; confirm against GOLD/GitHub after recovery.

## Rule going forward (Joseph's doctrine, applied to cleanups)
No deletion or rename without: the item counted here, its dependents named, and a
check that turns red if the change breaks them. The rename brief (PR #688) is the
template: full rename, old names kept working as aliases, central fault test =
a clean install of the OLD name still works after the rename.
