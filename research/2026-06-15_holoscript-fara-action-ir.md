# HoloScript as Action IR for Fara-7B Visual Computer-Use Agents

**Date**: 2026-06-15  
**Status**: Research direction — pairs with D.096 (HoloScript token efficiency) and D.010 (17-paper suite)

---

## Core Claim

Fara-7B (Microsoft, Nov 2025) closes the loop between symbolic world description and
visual GUI execution: a `.holo` intent compiles to a Fara-7B action trajectory, which
executes with verifiable `BrowserAbsorptionReceipt` evidence, which feeds back into the
Twin Earth substrate as a signed event. HoloScript becomes the action IR layer between
high-level agent intent and pixel-level computer-use execution.

```
Intent (.holo)
  → HoloScript compiler (safety envelope + action plan)
    → Fara-7B (visual reasoning: screenshot → JSON action)
      → Playwright execution (browser/desktop)
        → BrowserAbsorptionReceipt + coordinateWitness
          → Twin Earth substrate (signed quest/actuator event)
```

Without HoloScript IR, Fara-7B receives a raw natural-language goal and must infer
the full action plan from scratch each step. With `.holo` pre-structure:
- SafetyEnvelope is resolved at compile time, not inferred at runtime
- The action plan is explicitly scoped (allowed domains, max steps, permitted actions)
- Steps can be pre-validated against the substrate's permission model before a single
  screenshot is taken
- Failure modes are bounded and auditable

---

## Experimental Design

**Hypothesis**: `.holo`-structured goals improve Fara-7B multi-step web task performance
versus raw natural-language goals on measurable dimensions.

**Control**: Fara-7B with raw NL goal (standard deployment)  
**Treatment**: Fara-7B with `.holo`-compiled goal (HoloScript IR layer)

**Dependent variables**:

| Metric | Measurement |
|--------|-------------|
| Step count to completion | `receipt.actions.length` |
| Safety violations | Actions blocked by `BrowserAbsorptionPolicy` |
| Task completion rate | `receipt.outcome == 'success'` |
| Token efficiency | Ollama `prompt_eval_count` per completed task |
| Coordinate precision | `coordinateWitness` deviation from target element center |

**Task suite**: 50 multi-step web tasks across 5 categories (booking, form-fill,
navigation, search + summarize, account management). Tasks chosen to require 5-20 steps.
Run each task 3× per condition; measure mean + variance.

**Expected result**: `.holo`-structured goals reduce step count by 15-30% and safety
violations by 40-60% vs raw NL, because the compiler pre-resolves ambiguity and
pre-scopes the safety envelope. Token efficiency should improve proportionally.

---

## HoloScript IR Encoding (Draft)

A `.holo` goal description that the compiler can translate into a Fara session:

```holo
intent BrowserTask {
  goal: "Book a table for 2 at a Thai restaurant near downtown for Friday 7pm"
  
  safety {
    allowed_domains: ["opentable.com", "resy.com", "yelp.com"]
    blocked_domains: ["payment-processor.com"]  // never fill payment forms
    max_steps: 30
    permitted_actions: [navigate, click, type, scroll, web_search]
  }
  
  preconditions {
    session_active: true
    user_authenticated: false  // guest checkout is fine
  }
  
  success_criteria {
    confirmation_visible: true
    emit: twin_earth_receipt("booking_confirmed")
  }
}
```

Compiler output: `FaraRunOptions` with pre-resolved policy, plus a structured
context prefix injected into Fara's goal string that front-loads the safety scope.

---

## Connection to D.096

D.096 (EXP-1): HoloScript IR-prompt lifts 7B models from 52% → 100% on tasks at
0.98× token cost. The mechanism is identical here: a structured IR reduces the search
space the model must explore, yielding higher success rates without token overhead.

Fara-7B is a specialized 7B model — the EXP-1 result generalizes directly to the
computer-use domain. This paper would provide the second empirical data point for
the claim "HoloScript IR improves 7B-class model performance."

---

## Connection to Twin Earth / HoloLand

The `BrowserAbsorptionReceipt` with `coordinateWitness` is a verifiable, reproducible
event: a signed record that an agent clicked at `[x, y]` on a specific screenshot hash
to accomplish a specific goal. This is exactly the evidence format Twin Earth quests
need for real-world task completion — "prove you ordered from this restaurant" →
Fara-7B runs, receipt is the proof.

This closes the quest loop for real-world tasks without requiring an external
verification oracle: the receipt IS the oracle.

---

## Implementation State (2026-06-15)

- `FaraHandsTrait.ts` — AI reasoning layer (faraThink via Ollama)
- `fara-dispatcher.ts` — Playwright execution + receipt generation
- `holoshell_fara_step` MCP tool — loop entry point for agents
- `BrowserAction.coordinateWitness` — coordinate audit field in receipts
- `DispatchBackend: 'fara'` — backend label for receipt trail
- `compositions/skills/fara-hands.hsplus` — brain composition for NPCs/agents

**Next for paper**:
- Implement `.holo` → `FaraRunOptions` compiler pass
- Build 50-task test suite with ground-truth step counts
- Run controlled experiment (control vs treatment, n=150 runs)
- Measure + report on all 5 dependent variables

**Publishable venue**: CHI / UIST (HCI + AI intersection), or IEEE VR (XR computer-use
angle), or AAAI (agentic AI systems track). Alternatively pairs with D.096 for a
journal submission.
