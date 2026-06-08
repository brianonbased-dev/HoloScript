# HoloShell Expansion Plan — Observer → Consented Operator → Perceivable

**Date:** 2026-06-05 · **Author:** claude · **Status:** PLAN v2 (founder-directed)

---

## v2 — PAPER-SPINE REFRAME (founder direction, 2026-06-05)

> "HoloShell should be utilizing everything HoloScript has to offer, including our 35+ papers.
> Completed all through the HoloLand repo and HoloScript as the spine."

**Key realization:** HoloShell is not adjacent to the paper program — it is the **integration
capstone** where the paper-backed capabilities compose into something a user operates. Two papers
ARE HoloShell: **Paper 12** (HoloLand spatial-OS = the intent→approval→receipt ladder) and the
**UIST Capstone** (HoloShell custody dashboard, N=12 study). Phase A below is, verbatim, Paper 12's
ladder. So the phases below do not change — they get RE-ANCHORED to papers and RELOCATED.

**Home (founder-directed):** build HoloShell as **`Hololand/packages/holoshell/`** (sibling to
`brittney/`, `platform/`), riding HoloScript via the EXISTING `file:` spine
(`@holoscript/core|framework|engine` + 23 transitive overrides in Hololand/package.json). NOT
scattered in ai-ecosystem scripts. HoloScript is the spine; HoloLand is the repo; HoloShell is the
consumption surface.

**Capability surface HoloShell exercises (verified 2026-06-05):** 32 compile targets · 52 compilers ·
295 traits · ~664 MCP tools · 50 receipt types · thermal/structural/fairness solvers · CAEL provenance.

**Paper → HoloShell capability anchor (the load-bearing set):**
| Paper | Capability | How HoloShell uses it |
|---|---|---|
| 12 (HoloLand) | intent→approval→receipt ladder | the operate doctrine itself (= Phase A) |
| 1 (MCP Trust) | origin verification | trust every tool/trait/component before it plugs |
| 4 (Sandbox) | capability containment | restrict every trait/service to declared capabilities |
| 8 / TVCG (SimContract) | verified prediction | verify a sim/behavior before acting on it |
| 0c (CAEL) | causal audit trail | every operation leaves a causal receipt |
| 13 (DumbGlass) | perceptual provenance | anchor a perception/decision to a provenance chain |
| 11 (HSPlus) | trait composition | compose verified traits with semantic constraints |
| 22 (Mechanized SimContract, Lean) | formal proof | machine-verify the highest-assurance operations |

**Re-anchored phases (same work, paper-spined, built in `Hololand/packages/holoshell/`):**

- **Phase B (DONE)** — windowless hygiene = Paper 4 sandbox-discipline applied to the process layer. Shipped in ai-ecosystem (the OS-task layer correctly lives at machine scope); all _new_ HoloShell capability code below lands in the HoloLand repo.
- **Phase A** — consented operator = **Paper 12 ladder** + Paper 8/0c receipts + Paper 1 trust on the executed component.
- **Phase C** — perceivable operate-room = **UIST Capstone**, compiled via Native2DCompiler (dogfooding 1 of the 32 compile targets).
- **Phase D** — flagship custody app + a **capability catalog** surfacing the 295 traits + 32 compilers as discoverable, composable operator catalogs (the "everything HoloScript offers" breadth).

The phases below remain the execution spine; this section is the authoritative framing + home.

---

## Thesis

HoloShell today is a **safety-first observer**: its 8-lane local MCP _observes_ (PID/lane/
substrate snapshots) and _plans_ (preflight receipts for terminate/delete/mutate) but **never
executes** — the human mutates externally. Its surfaces are scripts + MCP + the S23 mobile
console; there is **no perceivable UI**. The inventive frontier is the move from **advisor →
consented operator** and from **invisible → perceivable**, _without_ losing the
observe→consent→receipt→rollback safety doctrine (D.045/D.055). The recurring flashing-windows
bug is the canary: HoloShell _knows about_ every task but can only advise a manual healer — it
can neither enforce nor operate. This plan closes that gap in three phases (+ a fourth flagship).

## Current state (grounded, 2026-06-05 inventory)

- **8-lane MCP** (`scripts/holoshell-mcp-stdio.mjs`): 10 tools, 7/8 lanes wired; `browser_operator` spec-only. Observe/plan-only.
- **Automations registry** (`~/.ai-ecosystem/automations/holoshell-team-automations/registry.json`): 23 active rows, dispatched as signed HoloMesh board tasks via a 15-min Windows tick.
- **Custody receipts** (`packages/framework/src/board/holoshell-*-custody-receipt.ts`): run/build/workfile — REAL, shipping.
- **Mobile console** (S23 bridge) + Quest3/HoloTunnel lane — REAL.
- **Gaps:** no consented-execute path (plans never run), no perceivable surface, `browser_operator` unwired, F.101 PID kill-switch absent, task registrars still bake in Interactive logon (4th flashing recurrence 2026-06-05).

---

## Phase 1 — Track B: Self-enforcing background hygiene _(foundation; clears the recurring pain)_

**Goal:** "windowless + owned + health-checked + kill-switchable" becomes an invariant HoloShell _enforces_, not a manual healer.
**Steps:**

1. `scripts/holoshell-register-task.mjs` — the single sanctioned primitive to register any ecosystem scheduled task; ALWAYS sets `LogonType=S4U`. Reject/auto-correct Interactive.
2. Patch the 3 registrars that baked in Interactive (root cause of the 4th recurrence): `holo-serving-autoscaler` (P.008), `HoloExternalConsumeCheck` (D.081), `HoloFleet-BoardGpuBridge` (W.686) → register via the primitive.
3. Promote `ensure-windowless-tasks.ps1` from manual to a scheduled self-heal (S4U) + repair the sessionstart tripwire (`scratch-reaper-health.mjs`) which did NOT fire this session.
4. Add `check:windowless-tasks` gate (mirror of `check:publish-surface`): exit 1 if ANY ecosystem task is Interactive. Wire to CI floor.
   **Acceptance:** `check:windowless-tasks` green; intentionally re-registering an Interactive task fails the gate. **Risk:** low (config-only). **Depends on:** nothing.

## Phase 2 — Track A: Observer → Consented Operator _(the inventive core)_

**Goal:** HoloShell _executes_ approved preflight receipts, closing observe→plan→execute, behind the Founder Gate (D.080), with provenance + rollback.
**Steps:**

1. Consent contract: existing preflight receipt → Founder-Gate classification (reversible→express; irreversible/F.095→sign-off) → consent token.
2. `holoshell_execute_receipt` MCP tool: verify consent token + receipt id, execute the planned action, capture before/after + rollback handle, emit an execution receipt.
3. Start with the lowest-risk lane — stale Grok daemon cleanup (`holoshell_preflight_grok_daemon_cleanup` already plans it) → consented execute. Then process-terminate, file-delete (with backup), legacy-app-mutation (with rollback).
4. The Phase-1 kill-switch's _execute_ half lands here (consent-gated).
   **Acceptance:** end-to-end — plan stale-daemon cleanup → approve → execute → daemon gone + rollback receipt exists; verified by /journalist. **Risk:** HIGH (mutates the machine) → strictly gated, reversible, receipt-anchored; begin with low-risk lane only. **Depends on:** Phase 1 (clean process inventory), Founder Gate (D.080).

## Phase 3 — Track C: Perceivable HoloShell surface _(D.073/F.099/F.100 for Operate)_

**Goal:** a live HoloShell operate-room the non-dev founder can SEE and DRIVE.
**Steps:**

1. Define the operate-room `.holo` scene: panels for running processes + health, 8-lane status, automations (next-fire/last-result), **pending consents** (from Phase 2), substrate pressure.
2. Feed it the existing observe-tool JSON (`runtime_truth_report`, `run_registry_snapshot`) — data already exists.
3. Compile via Native2DCompiler (I.017, complete) → live surface; make pending consents **approvable from the surface** (the "drive" — wires to Phase 2's consent path).
4. Render on desktop + S23 mobile console.
   **Acceptance:** rendered dashboard showing live state; founder approves a pending consent from it; screenshot (F.099). **Depends on:** Phase 1 (clean inventory), Phase 2 (consents to show/approve).

## Phase 4 (eventual) — Track D: Flagship custody app + browser_operator

**Goal:** ship the prototyped photo-backup custody room as the first human-facing HoloShell app the founder USES; complete the 8th lane.
**Steps:** integrate `experiments/holoshell-human-os-frontier/family-photo-backup-custody-room.holo` (6 gates, rollback drawer) wired to Phase-2 consented-execute (restore-proof-before-delete); register `holoshell_browser_probe` for `browser_operator`.
**Acceptance:** founder backs up real photos with restore-proof-before-delete; `browser_operator` VERIFIED. **Depends on:** Phases 2 + 3.

---

## Sequencing rationale

B → A → C → D. **B** is the foundation: A's execute loop and C's surface both assume a clean,
enforced process inventory. **A** is the inventive core (advisor→operator). **C** makes A+B
perceivable to a non-dev founder. **D** is the flagship proof, built on A's execute path + C's
surface — hence "eventually."

## Cross-cutting invariants

Every phase emits **custody receipts**; every mutation is **consent-gated + reversible**; the
**windowless** invariant (F.101) holds throughout; nothing reaches the founder's headset except
through the Founder Gate (D.080) and as a **rendered surface, not a commit hash** (F.099).
