# HoloShell Expansion Plan — Observer → Consented Operator → Perceivable

**Date:** 2026-06-05 · **Author:** claude · **Status:** PLAN (founder-directed: "plan 1 2 3 and eventually 4")

## Thesis
HoloShell today is a **safety-first observer**: its 8-lane local MCP *observes* (PID/lane/
substrate snapshots) and *plans* (preflight receipts for terminate/delete/mutate) but **never
executes** — the human mutates externally. Its surfaces are scripts + MCP + the S23 mobile
console; there is **no perceivable UI**. The inventive frontier is the move from **advisor →
consented operator** and from **invisible → perceivable**, *without* losing the
observe→consent→receipt→rollback safety doctrine (D.045/D.055). The recurring flashing-windows
bug is the canary: HoloShell *knows about* every task but can only advise a manual healer — it
can neither enforce nor operate. This plan closes that gap in three phases (+ a fourth flagship).

## Current state (grounded, 2026-06-05 inventory)
- **8-lane MCP** (`scripts/holoshell-mcp-stdio.mjs`): 10 tools, 7/8 lanes wired; `browser_operator` spec-only. Observe/plan-only.
- **Automations registry** (`~/.ai-ecosystem/automations/holoshell-team-automations/registry.json`): 23 active rows, dispatched as signed HoloMesh board tasks via a 15-min Windows tick.
- **Custody receipts** (`packages/framework/src/board/holoshell-*-custody-receipt.ts`): run/build/workfile — REAL, shipping.
- **Mobile console** (S23 bridge) + Quest3/HoloTunnel lane — REAL.
- **Gaps:** no consented-execute path (plans never run), no perceivable surface, `browser_operator` unwired, F.101 PID kill-switch absent, task registrars still bake in Interactive logon (4th flashing recurrence 2026-06-05).

---

## Phase 1 — Track B: Self-enforcing background hygiene  *(foundation; clears the recurring pain)*
**Goal:** "windowless + owned + health-checked + kill-switchable" becomes an invariant HoloShell *enforces*, not a manual healer.
**Steps:**
1. `scripts/holoshell-register-task.mjs` — the single sanctioned primitive to register any ecosystem scheduled task; ALWAYS sets `LogonType=S4U`. Reject/auto-correct Interactive.
2. Patch the 3 registrars that baked in Interactive (root cause of the 4th recurrence): `holo-serving-autoscaler` (P.008), `HoloExternalConsumeCheck` (D.081), `HoloFleet-BoardGpuBridge` (W.686) → register via the primitive.
3. Promote `ensure-windowless-tasks.ps1` from manual to a scheduled self-heal (S4U) + repair the sessionstart tripwire (`scratch-reaper-health.mjs`) which did NOT fire this session.
4. Add `check:windowless-tasks` gate (mirror of `check:publish-surface`): exit 1 if ANY ecosystem task is Interactive. Wire to CI floor.
**Acceptance:** `check:windowless-tasks` green; intentionally re-registering an Interactive task fails the gate. **Risk:** low (config-only). **Depends on:** nothing.

## Phase 2 — Track A: Observer → Consented Operator  *(the inventive core)*
**Goal:** HoloShell *executes* approved preflight receipts, closing observe→plan→execute, behind the Founder Gate (D.080), with provenance + rollback.
**Steps:**
1. Consent contract: existing preflight receipt → Founder-Gate classification (reversible→express; irreversible/F.095→sign-off) → consent token.
2. `holoshell_execute_receipt` MCP tool: verify consent token + receipt id, execute the planned action, capture before/after + rollback handle, emit an execution receipt.
3. Start with the lowest-risk lane — stale Grok daemon cleanup (`holoshell_preflight_grok_daemon_cleanup` already plans it) → consented execute. Then process-terminate, file-delete (with backup), legacy-app-mutation (with rollback).
4. The Phase-1 kill-switch's *execute* half lands here (consent-gated).
**Acceptance:** end-to-end — plan stale-daemon cleanup → approve → execute → daemon gone + rollback receipt exists; verified by /journalist. **Risk:** HIGH (mutates the machine) → strictly gated, reversible, receipt-anchored; begin with low-risk lane only. **Depends on:** Phase 1 (clean process inventory), Founder Gate (D.080).

## Phase 3 — Track C: Perceivable HoloShell surface  *(D.073/F.099/F.100 for Operate)*
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
