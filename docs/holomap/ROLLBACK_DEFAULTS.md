# Rollback defaults — dual-path ingest

## Default for paper submissions

- **`HOLOSCRIPT_INGEST_PATH=marble`** (or unset) is the rollback-safe default.
- It preserves compatibility with manifest-driven scenes and historical benchmark narratives.

## When to use `both`

- Generating **comparison** evidence for reviewers.
- Not required for a minimal “numbers only” CI pass close to a deadline.

## When to use `holomap` alone

- Validating native reconstruction fingerprints without doubling harness time.
- CAEL factorial cells that require the **Native scene (HoloMap)** axis only.

## Founder sunset gate (reminder)

Per ecosystem decision memos: do not retire compatibility ingest until stability windows and publication criteria are met. This document does not authorize silent sunset.
