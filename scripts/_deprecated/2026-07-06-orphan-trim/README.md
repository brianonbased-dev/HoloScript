# Orphan trim — 2026-07-06

43 orphan scripts moved here (history preserved via `git mv`; recover with `git mv` back), and 12 tracked emitted artifacts (`.js`/`.mjs`/`.d.ts`/`.d.mts` with a source sibling) untracked via `git rm --cached` — `.gitignore` already declares those patterns generated (lines for `scripts/training/*.js`, `scripts/training/*.d.ts`, `scripts/debug/**/*.d.ts`); disk copies were left in place.

## Evidence

- Registry inventory (`ai-ecosystem/registry/scripts/inventory.jsonl`, generated 2026-07-06): every moved file had `discovery_verdict: ORPHAN` / `referenced_by_count: 0`.
- Area staleness (`git log -1`): `scripts/training` and `scripts/debug` last touched 2026-06-08, `scripts/analysis` 2026-04-11, root strays (`audit-traits.ts`, `fix-cwe94.ts`, `fix-source-files.js`, `migrate-compilers-rbac.js`, `_gen_json.py`) March 2026.
- Doctrine: the `training/` generators are the toy synthetic-data lane ruled superseded by D.116 (2026-07-04 — training income is a verified byproduct of production work; the current lane is `foundation-engine.mjs` + HoloTune, see `ai-ecosystem/research/2026-07-04_training-income-papers-hololand-simulations.md`).

## Deliberately NOT moved

- `scripts/training/grpo_rewards.py`, `scripts/training/oplora_wrapper.py` — live dependencies of `scripts/exp-grpo/` (see its README).
- `scripts/training/generate_synthetic_data_unified.py` — the migration target named by `scripts/_deprecated/README.md`.
- 12 files with `HEALTHY` inventory verdicts (`generate-anatomy-biology-knowledge.ts`, `generate-brittney-v3*.ts`, `generate-chemistry-materials-knowledge.ts`, `generate-complete-uaa2-dataset.ts`, `generate-knowledge-compression.ts`, `generate-physics-knowledge.ts`, `generate-uaa2-protocol.ts`, `inference_test.py`, `debug-full-example.mts`, `test-holo-parser.mts`) — the registry counts live references to them; held pending a reference review before any further trim.
- `scripts/debug/archive/*` — already the archive named by CONTRIBUTING.md.
