# Archived GitHub Actions workflows

**Archived 2026-05-31 (F.107 / executioner KILL-003).** These 25 workflows are
**dormant husks** — GitHub Actions is retired for this org: the runner queues
jobs indefinitely (runs sat `queued` for 66h+ with no execution), so none of
these run. They were moved here (not deleted) so they're recoverable.

## What replaced them (the LIVE mechanisms)

| Old Actions workflow(s) | Live replacement |
|---|---|
| `ci.yml`, `test.yml`, `e2e-smoke.yml`, `studio-ci.yml`, `mcp-quality-gate.yml`, `docs-quality.yml`, `paper26-gates.yml`, `daemon-gate.yml`, `canary.yml`, `benchmarks.yml`, `security.yml`, `test-snapshot.yml` | **HoloCI** — `ai-ecosystem/scripts/holo-ci/gates.mjs` (fleet-executed via `dispatch.mjs` / `run-floor-scheduled.cmd`, lane `ci`). Gates: lint, secrets (gitleaks), build, test, security. |
| `deploy-railway.yml`, `deploy-studio.yml`, `deploy-docs.yml` | **`/deploy` skill → Railway directly** (Railway CLI/API). F.102: deploys are deliberate + GOLD-gated, NOT triggered by Actions. |
| `publish.yml`, `publish-pypi.yml`, `publish-mcp-image.yml`, `release-compliance.yml`, `release-multi-platform.yml` | **Manual clean-room publish** (npm/PyPI/image) — see W.669/W.672. |
| `wasm-build.yml`, `preview-3d.yml`, `render-videos.yml`, `refresh-manifests.yml`, `self-healing-ci.yml` | local/fleet scripts as needed |

## To restore (if the Actions runner/billing recovers)

`git mv .github/workflows/_archived/<name>.yml .github/workflows/` — GitHub only
runs workflows in `.github/workflows/` (not subdirectories), so they stay inert
here until moved back. Revival thread:
`ai-ecosystem/idea-seeds/2026-06-01_restore-holoscript-github-actions-workflows-*.md`.

**Do not add new CI as Actions YAML** — add gates to HoloCI `gates.mjs` (F.107).
