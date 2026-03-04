# HoloScript SimulationLab — Hypothesis Testing for Spatial Computing

> Run N simulations. Sweep parameters. Measure outcomes. Prove or disprove hypotheses.
> **The universe gets one sample. HoloScript gives you infinite.**

## Vision

Every HoloScript composition can become a scientific experiment. Attach `@simulation_lab` to any scene, economy, agent system, or physics simulation to:

1. **Define a hypothesis** — "Fibonacci spacing produces more stable structures than random"
2. **Set parameters** — sweep `spacing_ratio` from 1.0 to 2.0 in 0.1 increments
3. **Run N epochs** — 10,000 simulations with different seeds
4. **Collect metrics** — structural integrity, energy efficiency, collapse rate
5. **Get statistical results** — p-value, confidence interval, effect size

Results are exportable and sellable on the marketplace as verified simulation data.

---

## Use Cases

### Economy Stress Testing
```holoscript
scene "Economy Stress Test" {
  @simulation_lab(
    hypothesis: "PID controller maintains <10% variance under 5x player surge",
    epochs: 1000,
    sweep: { player_count: range(100, 500, step: 50) },
    metrics: ["currency_variance", "gini_coefficient", "inflation_rate"],
    confidence: 0.95
  )
  @pid_controlled(target_per_capita: 1000)
  @bonding_curved(curve_type: "exponential", reserve_ratio: 1.0)
}
```

### Fibonacci in Nature
```holoscript
scene "Fibonacci vs Random Growth" {
  @simulation_lab(
    hypothesis: "Fibonacci spiral packing is >20% more space-efficient than random",
    epochs: 5000,
    sweep: { angle: [137.508, uniform(0, 360)] },  // golden angle vs random
    metrics: ["packing_density", "overlap_count", "coverage_ratio"]
  )
  // Procedurally generate seed arrangements
  for i in 0..500 {
    sphere(radius: 0.1, position: spiral(i, angle))
  }
}
```

### Younger Dryas Flooding
```holoscript
scene "Coastline Submersion Model" {
  @simulation_lab(
    hypothesis: "20m sea rise submerges >60% of pre-13000BP coastal settlements",
    epochs: 100,
    sweep: { sea_level_rise: range(5, 30, step: 5), rise_duration_years: range(100, 500) },
    metrics: ["settlements_submerged_pct", "habitable_coast_km", "refugee_displacement"]
  )
  terrain(heightmap: "earth_12800bp", sea_level: -120 + sea_level_rise)
  settlements(distribution: "coastal_preference", count: 1000)
}
```

### Agent Culture Emergence
```holoscript
scene "Emergent Social Norms" {
  @simulation_lab(
    hypothesis: "Agents develop consistent behavioral norms within 10000 interactions",
    epochs: 50,
    sweep: { agent_count: [100, 500, 1000], memory_capacity: [10, 50, 100] },
    metrics: ["norm_convergence", "cooperation_rate", "defection_penalty_emergence"]
  )
  for i in 0..agent_count {
    agent(memory: memory_capacity, strategy: "learned")
  }
}
```

---

## Architecture

```
@simulation_lab trait
    │
    ├── Hypothesis (null + alternative, expected direction)
    ├── ParameterSweep (ranges, steps, distributions)
    ├── Epoch Runner (N runs per parameter combination)
    │     └── Each run: seed → init → tick N frames → collect metrics
    ├── Statistical Engine
    │     ├── t-test (compare means)
    │     ├── chi-squared (categorical outcomes)
    │     ├── Mann-Whitney U (non-parametric)
    │     └── Effect size (Cohen's d)
    └── Results Export
          ├── JSON summary
          ├── Marketplace package (sellable)
          └── Training data (for DataForge)
```

### Trait Composition

| Composes With | What It Enables |
|---|---|
| `@pid_controlled` | Test economic stability under stress |
| `@bonding_curved` | Test price discovery convergence |
| `@taxable_wealth` | Test Gini reduction effectiveness |
| `@depreciating` | Test sink mechanics over time |
| `@tradeable` | Test marketplace dynamics with N agents |

### Compiler Integration

The HoloScript compiler detects `@simulation_lab` and:
1. Generates a batch runner (worker thread pool)
2. Expands parameter sweeps into job queue
3. Collects metrics via instrumented scene tick
4. Aggregates results after all epochs complete
5. Emits `on_simulation_complete` event with `StatisticalResult`

---

## Marketplace Integration

Simulation results are a new marketplace content type:
- **Verified results** — hash of composition + parameters + outcomes
- **Reproducible** — anyone can re-run with the same seed
- **Sellable** — researchers sell proven hypotheses
- **Training data** — results feed into DataForge pipeline

---

*Part of HoloScript Standard Library v4.3+*
