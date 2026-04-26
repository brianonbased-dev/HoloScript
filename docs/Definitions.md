# Definitions (research, fleet & room)

**Purpose:** Align HoloScript contributors on **room**, **board**, and **fleet** so paper work, mesh jobs, and agent sessions do not use the same words to mean different things.

**Full glossary:** the founder `ai-ecosystem` clone holds the complete **`DEFINITIONS.md`** (all products, acronyms, protocols). This file is the **research / fleet / utilization slice** for the monorepo.

---

## Room and board (same team, two angles)

| Term | Meaning here |
|------|----------------|
| **Board** | The HoloMesh **API task queue** for a team: `GET /api/holomesh/team/{id}/board`, tasks in `open` / `claimed` / `done`. **Source of truth is always the live API** — not a static JSON in git unless labeled as a snapshot. |
| **Room (workflow)** | **How** agents and humans **use** that team: `team-connect`, `scout`, claim → work → `done` with a commit hash, `TEAM_MODES`, `docs/TEAM_PEER_PROTOCOL.md`. *Room* is not a second product; it is the **coordination habit** around HoloMesh. |
| **Scout** | `ai-ecosystem/hooks/scout.mjs` (and `POST .../board/scout`) to **feed** the board from TODOs and line harvests — *input* to the board, not the board itself. |

---

## Fleet: two senses (research vs operations)

| Term | Meaning here |
|------|----------------|
| **Fleet (research — what we *mean* for papers)** | **Experimental instances** configured to **replicate production** (same deploy path, security posture, and observability expectations as live systems) so **gated papers** can report on **real** stack behavior. Prefer this meaning in paper specs and memos unless a document explicitly says "smoke / stub only." |
| **Fleet (operations)** | The **running mesh** (workers, Vast-style instances, harness scripts under `scripts/fleet-*`, corpus collectors) plus **aggregates** like `GET /api/holomesh/fleet/status?team=...` — *where* work runs and *how* health is observed. This does **not** replace the board: it does not list "what to build next" by itself. |
| **Production replica (paper cell)** | A **documented** mapping for a paper or phase: which **code paths** (e.g. engine, `packages/snn-webgpu`, `packages/llm-provider`), which **GPU/LLM** profile, and which **agent** templates (`agents-template.json`–class configs) are in scope for **evidence** — belongs in preregistration / memos, not only in a script comment. |
| **Underutilized asset** | Packages or configs that **exist** in the repo but are **not** on the **hot path** of any current production-replica or paper-committed **fleet** job. The response is: thread into an experiment, **defer in writing**, or **remove** — not silent drift. |
| **Shared GPU** | Pool-scheduled or fleet-labeled **WebGPU / SNN / bench** work so utilization and paper numbers are **attributable** to a job profile, not only a single developer machine. |

---

## How this ties together

1. **Work selection** → **HoloMesh board** (and skills that drive claim/done).
2. **Execution** → **fleet** cells and scripts, configured as **prod replica** when the paper requires it.
3. **Gap-finding** → periodic review of **underutilized** code and **shared** GPU / agent **configs** against active paper cells.

When you add a new overloaded term, update **`ai-ecosystem/DEFINITIONS.md`** first, then keep this file in sync for the **fleet / room** columns.

---

**Maintenance:** If you change paper–fleet assumptions (e.g. "production only" vs "sandbox"), update the relevant research memo *and* one line in the **Fleet (research)** row above so agents do not split definitions.
