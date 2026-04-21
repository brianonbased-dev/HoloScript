# F.023 — Vault ID reference scan (2026-04-21)

Scope: `docs/**/*.md` in this repo (no root `MEMORY.md` here; canonical memory lives in the ai-ecosystem `memory/` tree).

## Summary

| File | IDs cited | Status | Notes |
|------|-----------|--------|--------|
| `docs/strategy/battlecards/babylon-js-9.md` | W.GOLD.037, W.GOLD.044 | **Stale → fixed** | Proof column tied tropical semiring to W.GOLD.044; vault-aligned title for **W.GOLD.044** is *Affective Causality*, not tropical/CAEL. Cite **W.GOLD.037** for semiring stack. |
| `docs/strategy/positioning-spatial-sovereignty.md` | W.GOLD.037, W.GOLD.044 | **Stale → fixed** | Same conflation removed from Pillar 4. |
| `docs/strategy/claude-api-migration-checklist.md` | W.GOLD.041, W.GOLD.044 | **Confirmed** | Already labels W.GOLD.044 as Affective Causality. |
| `docs/strategy/*` (other battlecards, positioning-verifiable-digital-twin, drug-discovery-flagship, domain-registration-plan) | W.GOLD.013, 015, 014, 034, etc. | **Ambiguous** | Not cross-checked to `graduate.py` in this pass; consistent internal use. Re-verify before external citation. |
| `packages/hologram-worker/README.md` | W.GOLD.034 | **Ambiguous** | Operational placeholder; confirm when service ID exists. |

## Rule (F.023)

Before citing **W.GOLD.XXX** in customer-facing or paper text, confirm title + tier against the live vault index (`graduate.py list` / vault INDEX), not from recall.
