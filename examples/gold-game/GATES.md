# THE GOLD GAME — Gate Ledger (single source of truth)

> **This file is authoritative for gate status.** Do not reconstruct gate status from
> commit messages, receipts, or memory — read this ledger and re-derive it live with
> `node examples/gold-game/verify-all.mjs`. Reconstructing status ad-hoc is what caused
> two false "done" reports (the Oasis-vs-flagship conflation). See "Why this file exists".

## The one rule that prevents the drift

There are **two tracks** that share gate numbers. **An Oasis Gate-N PASS NEVER satisfies a
flagship Gate-N.** They are different games. Only the **flagship** counts as "the GOLD game."

| Track | What it is | Where |
|-------|------------|-------|
| **flagship** (canonical) | the GOLD knowledge-curation system turned into a game; play-actions are real vault curation ops | `gold-vault-game.holo` + this directory |
| **oasis (fixture, retired)** | abstract compass demo; kept ONLY as the cited proof that the AI↔human connection *mechanics* are real | `connection-mechanics-proof/` |

## Flagship gates (the canonical ladder)

| Gate | Name | Status | Verifier (re-derive) | Receipt | Landed commit |
|------|------|--------|----------------------|---------|---------------|
| 0 | parse clean | **PASS** | `parseHolo(gold-vault-game.holo)` (run via verify-all) | `GOLD-VAULT-gate0-receipt.json` | `6b281ecdd` |
| 1 | R3F Drive render | **PASS\*** | artifact `drive-build/index.html` + headless render (manual) | `GOLD-VAULT-gate1-receipt.json` + `GATE-1-drive-render.png` | `6b281ecdd` |
| 2 | curation graduate verb | **PASS** | `node gate-2-graduate-verify.cjs` (10/10) | `GATE-2-graduate-receipt.json` | `6b281ecdd` |
| 3 | curation co-session (AI↔human, real graduate verb) | **PASS** | `tsx gate-3-curation-verify.mjs` (15/15) | `GATE-3-CURATION-cosession-receipt.json` | `62024addc` |
| 4 | content / world evolution (CausalWorldModel do-calculus unlock + NPC memory across sessions) | **PASS** | `tsx gate-4-causal-memory-verify.mjs` (14/14) | `GATE-4-CAUSAL-MEMORY-receipt.json` | _this commit_ |
| 5 | live operator + trained policy + Quest projection | **OPEN** | — | — | — |

`*` Gate 1 is artifact/receipt-backed; the full WebGL render is headless/manual (needs a browser), so the runner checks the committed artifact exists rather than re-rendering.

## Modalities (one `.holo` → many devices — D.007)

The flagship `gold-vault-game.holo` is the single source; it renders in multiple modalities,
each built by walking the *identical* parsed scene (proven by a shared `sceneDigest`).

| Modality | Status | Builder | Artifact | Receipt |
|----------|--------|---------|----------|---------|
| 3D (R3F / three.js Drive build) | **PASS** | `node drive-build.mjs` | `drive-build/index.html` | `GOLD-VAULT-gate1-receipt.json` |
| retro 2D (HTML5 canvas, pixel/scanline) | **PASS** | `tsx gold-2d-build.mjs` | `2d-build/index.html` + `2d-build/GOLD-2D-render.png` | `GOLD-VAULT-2D-receipt.json` |

Cross-modality proof: `tsx modality-verify.mjs` (10/10) — same `.holo` → one `sceneDigest`
(`b1cb9df0…` via the real `computeStateDigest`); both builds exist and embed that scene; 2D is
a pixel canvas (no WebGL), 3D is WebGL. Full pixel render verified by opening `index.html`
(2D headless render captured at `2d-build/GOLD-2D-render.png`, 0 console errors).

## Oasis fixture (retired — connection-mechanics proof only)

| Gate | Name | Status | Verifier | Receipt | Digest provenance |
|------|------|--------|----------|---------|-------------------|
| 3 | compass co-session (mechanics proof) | **PASS** | `tsx connection-mechanics-proof/gate-3-verify.mjs` (12/12) | `connection-mechanics-proof/GATE-3-cosession-receipt.json` | `sharedWorldDigest=a4c1072b…` / `wmrDigest=d7ee5d31…` (orig commit `7cf8ef3eb`) |

Oasis Gate 0/1/2 were uncited scaffolding — **retired** (founder-approved 2026-05-22); recover from git history if needed.

## Canonical records

- GOLD vault: **W.GOLD.537** (`D:/GOLD/wisdom/w_gold_537.md`)
- Team knowledge: `W.team.1779434394145.lhq` (mechanics) + `W.team.1779436746889.kg7` (flagship Gate 3)

## Re-derive everything

```
node examples/gold-game/verify-all.mjs    # prints this table live; exit 0 iff all runnable gates PASS
```

## Why this file exists

Before this ledger, gate status was scattered across commit messages, eight receipt JSONs, a
GOLD entry, and two knowledge entries. Each marathon cycle reconstructed status from scratch
and reconstructed it wrong — twice mapping the Oasis compass Gate 3 onto the flagship's
curation Gate 3 and reporting an unbuilt gate as "done". The fix is structural: one ledger,
one runner, one hard cross-track rule. Read the ledger; trust the runner; never let an Oasis
PASS satisfy a flagship gate.
