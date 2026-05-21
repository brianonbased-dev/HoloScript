# Structural Causal Model (SCM) Compiler

Compiles HoloScript compositions to **Structural Causal Model (SCM)** DAG JSON — enabling HoloScript scenes to be used as visual authoring tools for causal AI research, do-calculus experiments, and machine learning causal discovery.

## Overview

The SCM compiler (`--target scm`) extracts the causal structure of a HoloScript composition — which objects affect which others, through which actions — and serializes it as a Directed Acyclic Graph (DAG) compatible with Pearl's `do-calculus` framework.

```bash
holoscript compile model.holo --target scm --output ./causal/
```

This positions HoloScript as a **visual causal model editor**: researchers draw causal structures as spatial objects and connections, then export to ML-ready DAG format.

## What is a Structural Causal Model?

An SCM is a mathematical framework for reasoning about cause and effect. It consists of:

- **Variables** — the quantities in your system
- **Functions** — how each variable is determined by its causes
- **Interventions** — `do(X = x)` operator to "cut" edges and test counterfactuals

HoloScript objects become variables; `action` blocks become structural equations; `logic` flows become causal edges.

## Example

```holo
composition "TreatmentEffect" {

  // Variables as spatial objects
  object "Treatment" {
    state { assigned: false }
  }

  object "Outcome" {
    state { recovered: false }
  }

  object "Confounder" {
    state { severity: 0.5 }
  }

  // Causal structure as logic
  logic {
    // Confounder → Treatment
    on_change("Confounder.severity") {
      Treatment.assigned = Confounder.severity > 0.7
    }

    // Treatment + Confounder → Outcome (structural equation)
    on_change("Treatment.assigned", "Confounder.severity") {
      Outcome.recovered = Treatment.assigned AND Confounder.severity < 0.8
    }
  }
}
```

**Output** (`causal/model.scm.json` — actual SCMDAG from SCMCompiler):

```json
{
  "metadata": {
    "model_name": "TreatmentEffect",
    "generated_at": "2026-05-21T...",
    "affective_context": { "valence": 0, "arousal": 0, "dominantEmotion": "calm" }
  },
  "nodes": [
    { "id": "Treatment", "type": "mechanism_variable", "do_capable": true, "properties": { "context_group": "global", "assigned": false } },
    { "id": "Outcome", "type": "mechanism_variable", "do_capable": true, "properties": { "context_group": "global", "recovered": false } },
    { "id": "Confounder", "type": "static_variable", "do_capable": false, "properties": { "context_group": "global", "severity": 0.5 } }
  ],
  "edges": [
    { "source": "global", "target": "Treatment", "relation": "dictates_context", "weight": 1.0 },
    ...
  ]
}
```

(Note: `do_capable` flags identify intervention targets for `do(X)`; `type` distinguishes mechanisms vs. static/background variables.)

## Integration with Causal ML Libraries

The SCM JSON output is directly consumable by:

| Library                      | Language | Usage                         |
| ---------------------------- | -------- | ----------------------------- |
| `causallearn`                | Python   | `from_json('model.scm.json')` |
| `DoWhy`                      | Python   | Load as `CausalGraph`         |
| `CausalNex`                  | Python   | Import DAG edges              |
| `dagitty`                    | R        | Import via JSON adapter       |
| `Judea Pearl's CausalFusion` | Web      | Direct DAG import             |

```python
# Python example
import dowhy
from holoscript_scm import load_scm

model = load_scm("causal/model.scm.json")
causal_model = dowhy.CausalModel(
    data=df,
    graph=model.to_gml()
)
identified = causal_model.identify_effect()
```

## Compiler Options

| Option            | Default | Description                                    |
| ----------------- | ------- | ---------------------------------------------- |
| `--scm-format`    | `json`  | Output format: `json`, `gml`, `dot`, `dagitty` |
| `--scm-exogenous` | auto    | Comma-separated list of exogenous variables    |
| `--scm-validate`  | `true`  | Check for cycles (DAG validity)                |
| `--scm-annotate`  | `true`  | Include HoloScript source positions in output  |

## Use Cases

- **Epidemiology** — model treatment effects with confounders, visualize in 3D
- **Economics** — causal inference for policy analysis
- **AI safety** — visual authoring of causal world models for alignment research
- **Education** — teach causal inference by building models in VR
- **Digital twins** — causal layer for IoT/VRR digital twin data flows

## Causal Training Data Generation (farm/CG-056)

HoloScript positions as an **undocumented causal training data generator** for the DoWhy / CausalML niche:

- **Visual authoring surface**: Researchers build 3D spatial causal graphs (objects + traits + logic = mechanisms/variables + edges) instead of editing text GML or JSON by hand.
- **Physically grounded provenance**: SCM DAGs inherit verifiable simulation history (rigid-body steps, trait firings, spatial constraints) from the HoloScript runtime — unlike purely statistical causal graphs.
- **Simulation → SCM → Causal Inference handoff**:
  1. Author/run a HoloScript rigid-body or multi-agent simulation (e.g., treatment/confounder/outcome scene with physics).
  2. `holoscript compile scene.holo --target scm-dag --output causal/scene.scm.json`
  3. Load the resulting `SCMDAG` (nodes with `do_capable`, edges, metadata + affective_context for provenance) into Python:
     ```python
     import json, dowhy
     from dowhy import CausalModel
     with open("causal/scene.scm.json") as f:
         dag = json.load(f)
     # nodes -> variables; edges -> graph; do_capable flags identify intervention targets
     model = CausalModel(
         data=observed_df,  # from simulation traces or real observations
         graph=dag,         # or convert nodes/edges to GML
         treatment="Treatment",
         outcome="Outcome"
     )
     identified_estimand = model.identify_effect()
     estimate = model.estimate_effect(identified_estimand, method_name="backdoor.linear_regression")
     ```
- **Paper candidate**: Pairs with Papers 17-20 (ML experiments / trait inference) — "Physically grounded causal training data with verifiable provenance from executable simulations."

This fills the gap where pure causal-inference libs lack authoring UX and sim-grounded data generation.

## Use Cases

- **Epidemiology** — model treatment effects with confounders, visualize in 3D
- **Economics** — causal inference for policy analysis
- **AI safety** — visual authoring of causal world models for alignment research
- **Education** — teach causal inference by building models in VR
- **Digital twins** — causal layer for IoT/VRR digital twin data flows
- **ML training data farms** — generate large batches of SCM DAGs + labeled intervention traces from varied HoloScript sim seeds (CG-056)

## See Also

- [VR Reality Compiler](/compilers/vr-reality) — Digital twin output target
- [AI & Behavior Traits](/traits/ai-behavior) — Agent behavior in spatial scenes
- [Agents Overview](/agents/) — Multi-agent causal systems
- Compiler source: `packages/core/src/compiler/SCMCompiler.ts`
- Test: `packages/core/src/compiler/__tests__/SCMCompiler.test.ts`
