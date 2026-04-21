# Experimental design: does the `@snn` neuromorphic path confabulate *less*? (draft)

**Date:** 2026-04-25  
**Scope:** The board asked whether the **@snn** (neuromorphic) subsystem produces **less confabulation** than baseline generation in comparable tasks. This memo defines a **falsifiable** protocol; it does not report results.

## Hypothesis (example)

- **H1:** For **fixed** token / step budgets on short-answer or structured-output tasks, SNN-influenced decoders **reduce** ungrounded claims vs a matched baseline, measured by an **external verifier** (retrieval hit rate, tool-check pass rate, or human rubric).

*If the implementation is not a drop-in replacement for the LLM’s final layer, the experiment must name the **exact** integration point (latent gating, penalty logits, or separate critic).*

## Variables

- **Independent:** SNN on vs off (or “strength” knob), same prompts and temperature policy.  
- **Controlled:** model family, context window, allowed tools, random seed, prompt set.  
- **Dependent:** (1) **verifiable** error rate, (2) **refusal** / abstention rate, (3) **latency** and **power** (SNN may trade quality for cost).

## Confounders to block

- **Retrieval** differences (if SNN path changes RAG timing).  
- **Temperature** or **top_p** side effects.  
- **Test contamination** (prompts too close to training).

## Minimum acceptance criteria

- **n ≥ 200** task instances per arm for a *directional* read; report **Wilson** or **bootstrap** CIs.  
- **Pre-registration** of prompts and scoring script in-repo (`packages/core` or `experiments/`) before eyeballing results.

## Outcome

- If **H1** fails: SNN is still defensible on **efficiency** or **latency**, not on honesty alone.  
- If **H1** holds: repeat with **adversarial** prompt suite before product claims.

## Related: inhibition, “backfire,” and safety (analogy)

Biological **inhibition** and ML **anti-scheming** are not the same mechanism. Strengthening inhibitory dynamics can move a network to new regimes; alignment mitigations for deceptive behavior rely on **evals, monitoring, and capability limits**—not a single knob. If SNN and language models are **combined**, run **jailbreak** and **tool-escape** suites on every change to the interaction path, and do not market “inhibition = honesty” without **measured** outcomes.

## Related

- `research/2026-04-24_confabulation-minimum-agents-cross-validation.md` — **independent** checks, not n-of-LLM alone.
