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

**Output** (`causal/model.scm.json`):

```json
{
  "variables": [
    { "name": "Treatment",  "type": "binary",     "exogenous": false },
    { "name": "Outcome",    "type": "binary",     "exogenous": false },
    { "name": "Confounder", "type": "continuous", "exogenous": true  }
  ],
  "edges": [
    { "from": "Confounder", "to": "Treatment", "weight": 1.0 },
    { "from": "Confounder", "to": "Outcome",   "weight": 1.0 },
    { "from": "Treatment",  "to": "Outcome",   "weight": 1.0 }
  ],
  "structural_equations": {
    "Treatment": "f(Confounder)",
    "Outcome":   "f(Treatment, Confounder)"
  },
  "do_calculus_compatible": true
}
```

## Integration with Causal ML Libraries

The SCM JSON output is directly consumable by:

| Library         | Language | Usage                                  |
| --------------- | -------- | -------------------------------------- |
| `causallearn`   | Python   | `from_json('model.scm.json')`          |
| `DoWhy`         | Python   | Load as `CausalGraph`                  |
| `CausalNex`     | Python   | Import DAG edges                       |
| `dagitty`       | R        | Import via JSON adapter                |
| `Judea Pearl's CausalFusion` | Web | Direct DAG import |

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

| Option               | Default   | Description                                    |
| -------------------- | --------- | ---------------------------------------------- |
| `--scm-format`       | `json`    | Output format: `json`, `gml`, `dot`, `dagitty` |
| `--scm-exogenous`    | auto      | Comma-separated list of exogenous variables    |
| `--scm-validate`     | `true`    | Check for cycles (DAG validity)                |
| `--scm-annotate`     | `true`    | Include HoloScript source positions in output  |

## Use Cases

- **Epidemiology** — model treatment effects with confounders, visualize in 3D
- **Economics** — causal inference for policy analysis
- **AI safety** — visual authoring of causal world models for alignment research
- **Education** — teach causal inference by building models in VR
- **Digital twins** — causal layer for IoT/VRR digital twin data flows

## See Also

- [VR Reality Compiler](/compilers/vr-reality) — Digital twin output target
- [AI & Behavior Traits](/traits/ai-behavior) — Agent behavior in spatial scenes
- [Agents Overview](/agents/) — Multi-agent causal systems
