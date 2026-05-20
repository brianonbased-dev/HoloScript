# CG-056: SCMCompiler — Physically Grounded Causal Training Data

**Date**: 2026-05-20 (grok1-x402 farm documentation)  
**Task**: task_1779307138688_cvm5  
**Vertical**: Causal ML / simulation-for-ML (vs DoWhy / CausalML / EconML)

---

## The Undocumented Niche

HoloScript has a production **SCMCompiler** (`packages/core/src/compiler/SCMCompiler.ts`) that turns any physically simulated scene into a **Structural Causal Model (SCM) DAG** with:

- Nodes = objects + their properties + affective state
- Edges = spatial proximity, explicit behavioral traits, logic blocks, physics interactions
- `do_capable` flags on every node (ready for do-calculus interventions)
- Affective context (valence/arousal/emotion) as additional variables

This is **physically grounded causal training data with verifiable provenance** — something pure statistical causal frameworks cannot generate on their own.

---

## What the SCMCompiler Produces

From a HoloScript composition it emits a JSON DAG suitable for:

- DoWhy / CausalML `CausalModel`
- Intervention queries (`do(X)`)
- Counterfactuals
- Causal effect estimation on simulated data that actually obeys real physics and agent behavior

The provenance (SimulationContract receipts) travels with the data — every causal variable has a traceable history back to the original .holo source and the exact simulation step that produced it.

---

## Usage (Local Validation)

```ts
import { SCMCompiler } from '@holoscript/core';

const compiler = new SCMCompiler({
  modelName: 'physics-ball-causal',
  affectiveContext: { valence: 0.2, arousal: 0.8, dominantEmotion: 'engaged' },
});

const scmDAG = compiler.compile(composition); // or from .holo source

// Feed directly to DoWhy
// from dowhy import CausalModel
// model = CausalModel(data=scmDAG, ...)
```

The output is a clean, typed SCM DAG with `do_capable` nodes and affective variables — ready for real causal inference papers.

---

## Why This Matters (Positioning)

Current causal ML research is bottlenecked by:

- Synthetic data that doesn't obey real physics
- No provenance on how the data was generated
- No easy way to run interventions in a grounded simulator

HoloScript + SCMCompiler solves all three:

- Every scene is a real physics simulation (rigid bodies, particles, agents, timelines).
- Every variable carries SimulationContract provenance.
- The same source that produces the causal DAG can also produce the Godot/Unreal/Isaac Sim version for closed-loop validation.

**Paper candidate** — pairs perfectly with the ML experiments track (Papers 17-20).

---

## Concrete Follow-ups (split)

- End-to-end demo: rigid body physics scene → SCMCompiler → DoWhy causal effect estimation → validate against the same scene running in Isaac Sim.
- Publish the "Physically Grounded Causal Training Data" guide + notebook.
- Target the causal inference / ML systems research community (NeurIPS, ICML, UAI workshops).

**This doc + the existing production SCMCompiler is the local farmable slice.**

*Produced by grok1-x402 during the 18th marathon cycle (final farm positioning tasks).*