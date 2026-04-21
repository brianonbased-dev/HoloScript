# Research tracker — CAEL agent contracts (AAMAS Oct 2026)

**Board:** `task_1776383022431_h3un`  
**Venue:** AAMAS (Oct 2026) — *living draft, pre-submission*  
**Checklist discipline:** `docs/paper-program/D011_FOUR_GATE_CHECKLIST.md` · `docs/NUMBERS.md` (no unverified counts).

## D.011 criteria — status (rolling)

| Criterion | Notes |
|-----------|--------|
| Run the product like a user (Studio, MCP, holosim) | Sign-off owner: founder /Release — repeat before submission freeze. |
| Refresh benchmarks (hardware + code drift; e.g. RTX 3060 class) | Bind claims to **dated** bench logs + Vitest bench names. |
| Recorded full-loop demo (capstone) | Pending; link recording + artifact hash when captured. |
| Absorb provider re-run as models change | On major model or engine semver jumps, re-run absorb and diff W/P/G. |
| Preempt reviewers (user study *N*, determinism ε) | CAEL hash-chain modes (`CAELTrace` / `SimulationContract`) + separate user-study plan. |

## Codebase anchors (contract + trace)

| Area | Path | Role |
|------|------|------|
| CAEL agent loop (perception → cognition → action → physics) | `packages/engine/src/simulation/CAELAgent.ts` | `CAELAgentLoop` + `logInteraction` stages |
| Trace schema + hash chain | `packages/engine/src/simulation/CAELTrace.ts` | JSONL events, `hashMode`, verification |
| Recorder + `ContractedSimulation` | `packages/engine/src/simulation/CAELRecorder.ts` | Canonical append path, replay coupling |
| Simulation contract | `packages/engine/src/simulation/SimulationContract.ts` | Geometry hash, provenance, replay |
| Sandbox mirror (tests / reduced env) | `packages/security-sandbox` (local CAEL trace) | Parity for trust story — cite **scope** in paper |

## Paper posture (draft)

- **“Agent contracts”** in prose should map to **typed obligations**: `ContractedSimulation` invariants + trace verifiability (`verifyCAELHashChain` family in CAEL trace module), not metaphor-only.
- Separate **cryptographic** vs **fast** hash mode claims (`HashMode` / Option C notes in `CAELTrace.ts` header).

## Next steps (child tasks when funded)

1. “AAMAS — CAEL bench refresh” with explicit command lines + date.
2. “AAMAS — Studio demo script” with one CAEL run export path.
3. Close this tracker when a `docs/paper-program/*` draft cites this file as the live pointer.
