# Brittney vs Baselines — benchmark harness

> Gate 3 of three for declaring Brittney as Paper 26.
> Founder ruling: `research/2026-04-27_brittney-paper-scoping.md`.

## What this does

Runs a 30-task spatial-creation benchmark through 4 configurations:

| Configuration          | Model              | Tools                                  | Scene context |
|------------------------|--------------------|----------------------------------------|---------------|
| `brittney-prod`        | Opus 4.7           | BRITTNEY + STUDIO_API + MCP + SIM      | yes (prod)    |
| `cursor-baseline`      | Sonnet 4.6         | synthetic FS (read/write/edit/list)    | no            |
| `claude-code-baseline` | Opus 4.7           | synthetic FS (read/write/edit/list)    | no            |
| `vanilla-baseline`     | Opus 4.7           | none                                   | no            |

Each `(task, config)` cell runs `N=3` independent trials. Outputs are judged by
Opus 4.7 against per-task rubrics via structured-output tool use.

## Metrics per cell

- `creation_completion` — boolean, all required rubric criteria pass
- `sim_contract_pass_rate` — fraction of scene mutations passing SimulationContract
  (only meaningful for `brittney-prod` after Gate 1; baselines record 0)
- `tool_rounds_to_completion` — int (or `null` if never completed)
- `token_cost_usd` — total token cost from this cell's config call (judge cost
  is tracked separately against the budget)
- `wall_clock_seconds` — float

## Outputs

Per run, written to `results/<run-id>/`:

- `results.json` — full per-cell outcomes with rubric verdicts
- `results.md` — Pareto frontier (cost vs completion) + per-task matrix + errors

`results/` is git-ignored; periodic snapshots get S.ANC dual-anchored manually
when published.

## Running

```bash
cd packages/studio
export ANTHROPIC_API_KEY=...
export BRITTNEY_PROD_URL=https://studio.holoscript.net/api/brittney   # optional
export HARNESS_FOUNDER_GO=1                                            # required for full run

# Smoke test (3 tasks × 4 configs × 1 trial = 12 cells, ~$2 cap)
pnpm tsx src/__benchmarks__/brittney-vs-baselines/run.ts --quick

# Full run (30 × 4 × 3 = 360 cells, $50 cap, founder go-ahead required)
pnpm tsx src/__benchmarks__/brittney-vs-baselines/run.ts

# Subset
pnpm tsx src/__benchmarks__/brittney-vs-baselines/run.ts \
  --configs brittney-prod,vanilla-baseline \
  --tasks T01,T02,M01 \
  --trials 1 --budget 1
```

## Cost gate

Per Q1 founder ruling ($5/agent/day informal cap), the full 360-run benchmark
crosses the threshold. The runner enforces `HARNESS_FOUNDER_GO=1` env var as
the explicit go-ahead — otherwise it refuses with exit code 3.

## What is NOT in scope

- Human user study (gate 4, future memo)
- Brittney thinking-on vs thinking-off ablation (single-axis first)
- Public results — internal evidence only until Paper 26 is declared
- Cherry-picked prompts — task corpus is meant to be representative, fairness
  reviewed by founder before full runs

## Layout

```
brittney-vs-baselines/
├── tasks/                  # 30 tasks across 3 tiers
│   ├── trivial-scene.json
│   ├── multi-object-scene.json
│   ├── agentic-multi-step.json
│   └── index.ts            # loader
├── configs/
│   ├── brittney-prod.ts
│   ├── cursor-baseline.ts
│   ├── claude-code-baseline.ts
│   ├── vanilla-baseline.ts
│   ├── fs-sandbox.ts       # synthetic FS for baselines
│   ├── run-with-fs-tools.ts
│   └── index.ts
├── types.ts
├── cost-tracker.ts         # Anthropic pricing
├── judge.ts                # Opus 4.7 rubric judge
├── pareto.ts               # Pareto frontier ASCII viz
├── runner.ts               # task × config × trial orchestration
├── reporter.ts             # results.json + results.md emission
├── run.ts                  # CLI entrypoint
├── results/                # git-ignored output dir
└── __tests__/
    ├── harness.test.ts
    └── golden/
        └── golden-judge-cases.json
```
