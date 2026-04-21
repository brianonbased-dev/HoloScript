# Longitudinal compounding GOLD study (paper-5) — design outline

**Scope:** Empirical study of how GOLD-style agent or platform metrics improve (or plateau) across multiple sessions, releases, or cohorts — not a single-shot benchmark.

## Goals

- **Define compounding** — Primary metrics (e.g., task success rate, time-to-green, regression rate on golden suites) and **secondary** signals (documentation drift, trait reuse).
- **Cohorts** — Explicit groups: baseline tooling, CAEL-on, absorb-on, mixed; same calendar windows where possible to control for upstream model changes.
- **Horizon** — Minimum follow-up duration and session count so “compounding” is distinguishable from noise.

## Design

1. **Preregistration** — Hypotheses, metrics, windows, and stop rules before data collection.
2. **Data collection** — Automated runs from CI + optional manual sessions; store commit SHA, package versions, and hardware profile when hardware-gated.
3. **Analysis** — Mixed-effects or simple panel trends; report confidence intervals; predefine what counts as “compounding” (e.g., sustained slope > 0 over N weeks).
4. **Threats** — Founder/operator turnover, external API drift, selective reporting; mitigate with frozen evaluation harnesses where feasible.

## Verification

- Reproducibility bundle: script revision, dataset snapshot IDs, and anonymized cohort manifests.
- Sensitivity checks: alternate aggregation windows and outlier removal.

## Status

Study protocol / outline — execution depends on scheduled runs and stable harnesses.
