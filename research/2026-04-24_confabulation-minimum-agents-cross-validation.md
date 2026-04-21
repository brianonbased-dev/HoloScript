# Minimum agent count for **confabulation-safe** cross-validation (operational model)

**Date:** 2026-04-24  
**Scope:** The board asked for **research** on how many **independent agents** are enough to **cross-check** outputs when **confabulation** (confident wrong answers) is a risk. This is a **governance and statistics** note, not a product guarantee.

## Definitions

- **Confabulation** (in agent systems): fluent answers **without** reliable grounding, sometimes indistinguishable from correct reasoning without external checks.  
- **Cross-validation (operational):** *k* **independently** prompted reviewers with **separation of context** (different models, seeds, tools, or humans) and an **arbitration** step.

## Why “two agents” is often insufficient

- If two agents **share the same wrong prior** (same training cutoff, same tool bug, same retrieved doc), their agreement **inflates** confidence without fixing truth. You need **diversity of failure modes**, not just a second opinion.

## Practical rules of thumb (non-authoritative)

| Setup | When it is *directionally* stronger | Caveat |
|-------|--------------------------------------|--------|
| **2** reviewers | Cheapest; catches *some* sloppiness | Fails on **shared** systematic errors |
| **3** reviewers + **majority** | Classic voting; small lift over 2 if errors are *uncorrelated* | Still weak if all three use the same stack |
| **2 + 1 tool oracle** (tests, web fetch, **compiler**, **replayer**) | Often beats “3x LLM” in engineering repos | The **oracle** must be *trusted* (tests, builds) |
| **1 agent + 1 human** for **ship** | Strong for *high-stakes* release | Not scalable for every microtask |

**Bottom line for HoloScript CI-style work:** “**1 generator + 1 independent verifier**” where the verifier is **not** a second LLM call with the same prompt, but a **second mechanism** (typecheck, `pnpm test`, parser snapshot, `git diff` policy).

## Suggested product policy (draft)

- **R&D chat:** 1 model is OK.  
- **Repo change / publish:** at least **one non-LLM** gate (lint, test, build) *plus* optional **second model** for narrative-only docs.  
- **Safety / security / wallet paths:** do **not** rely on n-of-agents; use **formal** review, threat modeling, and **hardware** or **HSM** flows where required.

## Related

- `docs/TEAM_PEER_PROTOCOL.md` and internal review norms (if present).  
- `research/2026-04-22_wcag3-xr-holoscript-accessibility.md` — compliance claims need **verifiable** processes.
