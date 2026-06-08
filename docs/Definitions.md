# Definitions (research, fleet & room)

**Purpose:** Align HoloScript contributors on **room**, **board**, and **fleet** so paper work, mesh jobs, agent sessions, and native-agent product work do not use the same words to mean different things.

**Full glossary:** the founder `ai-ecosystem` clone holds the complete **`DEFINITIONS.md`** (all products, acronyms, protocols). This file is the **research / fleet / utilization slice** for the monorepo and stays coupled to that source.

---

## Room and board (same team, two angles)

| Term                | Meaning here                                                                                                                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Board**           | The HoloMesh **API task queue** for a team: `GET /api/holomesh/team/{id}/board`, tasks in `open` / `claimed` / `done`. **Source of truth is always the live API** — not a static JSON in git unless labeled as a snapshot.                    |
| **Room (workflow)** | **How** agents and humans **use** that team: `team-connect`, `scout`, claim → work → `done` with a commit hash, `TEAM_MODES`, `docs/TEAM_PEER_PROTOCOL.md`. _Room_ is not a second product; it is the **coordination habit** around HoloMesh. |
| **Scout**           | `ai-ecosystem/hooks/scout.mjs` (and `POST .../board/scout`) to **feed** the board from TODOs and line harvests — _input_ to the board, not the board itself.                                                                                  |

---

## Fleet: three senses (product vs research vs operations)

| Term                                             | Meaning here                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Fleet (product - native agents + worlds)**     | The product-level meaning from `ai-ecosystem/DEFINITIONS.md` and `INTENT.md`: a population of native HoloScript agents embodied in worlds, identity-bearing, sharing the trait library, operating in HoloLand as the embodied testbed, and carrying receipts. Mesh/Vast workers are substrate underneath this population, not the definition of the product. |
| **Fleet (research — what we _mean_ for papers)** | **Experimental instances** configured to **replicate production** (same deploy path, security posture, and observability expectations as live systems) so **gated papers** can report on **real** stack behavior. Prefer this meaning in paper specs and memos unless a document explicitly says "smoke / stub only."                                        |
| **Fleet (operations)**                           | The **running mesh** (workers, Vast-style instances, harness scripts under `scripts/fleet-*`, corpus collectors) plus **aggregates** like `GET /api/holomesh/fleet/status?team=...` — _where_ work runs and _how_ health is observed. This does **not** replace the board: it does not list "what to build next" by itself.                                  |
| **Production replica (paper cell)**              | A **documented** mapping for a paper or phase: which **code paths** (e.g. engine, `packages/snn-webgpu`, `packages/llm-provider`), which **GPU/LLM** profile, and which **agent** templates (`agents-template.json`–class configs) are in scope for **evidence** — belongs in preregistration / memos, not only in a script comment.                         |
| **Underutilized asset**                          | Packages or configs that **exist** in the repo but are **not** on the **hot path** of any current production-replica or paper-committed **fleet** job. The response is: thread into an experiment, **defer in writing**, or **remove** — not silent drift.                                                                                                   |
| **Shared GPU**                                   | Pool-scheduled or fleet-labeled **WebGPU / SNN / bench** work so utilization and paper numbers are **attributable** to a job profile, not only a single developer machine.                                                                                                                                                                                   |

### Shared GPU utilization (operating rule)

**Goal:** keep pool GPUs _busy with experiments_, not sitting idle while someone finds the next command.

| Habit        | What to do                                                                                                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Queue**    | Maintain a **FIFO** of jobs (see `scripts/gpu-jobs.example.json` → copy to `scripts/gpu-jobs.local.json`, not committed). Run `node scripts/gpu-job-queue.mjs` so the next job starts when the last exits. |
| **Time box** | Every job gets **`timeBoxSec`** so a stuck run is killed and the queue advances—GPUs are not held for hour-long hung processes.                                                                            |
| **Label**    | Set **`label`** and env like **`PAPER`**, **`PROFILE`** on each job so log lines are attributable to a paper or harness.                                                                                   |
| **Log**      | Appends to **`gpu-job-log.jsonl`** (gitignored) by default, or set **`GPU_JOB_LOG`**.                                                                                                                      |
| **Weekly**   | On shared machines: each day should have either **GPU hours in the log** for new science, or an explicit **“blocked on X”** in the handoff—silence = wasted pool time.                                     |

**Run:** from repo root: **bash** `GPU_JOB_QUEUE=scripts/gpu-jobs.local.json node scripts/gpu-job-queue.mjs` — **PowerShell** `$env:GPU_JOB_QUEUE="scripts/gpu-jobs.local.json"; node scripts/gpu-job-queue.mjs`. Use `--dry-run` to print the plan without executing.

---

## How this ties together

1. **Product meaning** -> **native agents in worlds** (the fleet as population).
2. **Work selection** -> **HoloMesh board** (and skills that drive claim/done).
3. **Execution** -> **fleet** cells and scripts, configured as **prod replica** when the paper requires it.
4. **Gap-finding** -> periodic review of **underutilized** code and **shared** GPU / agent **configs** against active paper cells.

**Paper → production-replica mapping (v1):** [prod-replica-paper-matrix.md](research-ops/prod-replica-paper-matrix.md).

When you add a new overloaded term, update **`ai-ecosystem/DEFINITIONS.md`** first, then keep this file in sync for the **fleet / room** columns.

---

## 2026-05-23 Under-Claim Sweep Sync

| Bucket               | Safe to merge here                                                                                        | Founder approval required                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fleet disambiguation | Product/research/operations split, board-vs-fleet wording, and source-of-truth links.                     | External product wording that turns "fleet" into a public brand promise.                                                                                     |
| Glossary coupling    | Pointing to `ai-ecosystem/DEFINITIONS.md` and mirroring internal terms needed by HoloScript contributors. | Public-claim phrasing for Universal Platform / Universal Semantic Platform, Trust by Construction, Native VM, roadmap claims, or simulation-fidelity claims. |

---

**Maintenance:** If you change paper–fleet assumptions (e.g. "production only" vs "sandbox"), update the relevant research memo _and_ one line in the **Fleet (research)** row above so agents do not split definitions.
