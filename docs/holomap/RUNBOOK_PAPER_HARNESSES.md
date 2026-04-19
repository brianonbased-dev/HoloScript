# Runbook — Paper #2 and Paper #4 harnesses (scene ingest)

## Choose a scene source

1. **Compatibility (default)** — best when a deadline is close; preserves prior benchmark semantics.
2. **Native (HoloMap)** — when you need the SimulationContract-native reconstruction fingerprint in the log.
3. **Both** — when you need a side-by-side table for a figure or reviewer pack.

## How to set (no code changes)

### Option A — environment variable (recommended)

```bash
# Windows PowerShell
$env:HOLOSCRIPT_INGEST_PATH="marble"
pnpm --filter @holoscript/engine exec vitest run src/simulation/__tests__/paper-snn-navigation.test.ts
```

```bash
# macOS / Linux
HOLOSCRIPT_INGEST_PATH=both pnpm --filter @holoscript/engine exec vitest run src/simulation/__tests__/paper-snn-navigation.test.ts
```

Paper #4 (security-sandbox):

```bash
HOLOSCRIPT_INGEST_PATH=both pnpm --filter @holoscript/security-sandbox test
```

### Option B — CLI-style flag on the same command

Vitest forwards `process.argv`; you may pass:

`--ingest-path=marble` | `holomap` | `both`

Example:

```bash
pnpm --filter @holoscript/engine exec vitest run src/simulation/__tests__/paper-snn-navigation.test.ts -- --ingest-path=both
```

### Option C — reconstruction profile

Set:

`HOLOSCRIPT_RECONSTRUCTION_PROFILE=compatibility-marble`

or `native-holomap-v1` or `compare-both` (see `packages/holomap/profiles/*.json`).

## What you should see

At the end of the run, a **Scene ingest comparison** markdown table appears in the console when `both` is selected, or a single-row note for `marble` / `holomap`.

Attach that block to paper artifacts or founder review.
