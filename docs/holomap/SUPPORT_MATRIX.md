# HoloMap v1.0 — Support matrix

| Environment | Status | Notes |
|-------------|--------|--------|
| Node.js (Vitest) | Supported | Used for paper harness probes and contract tests; WebGPU may use SwiftShader / Dawn where available. |
| Chromium / Edge WebGPU | Supported | Primary target for full feed-forward GPU path. |
| Safari WebGPU | Best-effort | Verify `navigator.gpu` before production demos. |
| Firefox WebGPU | Evolving | Treat as preview until stable in your release channel. |

## Failure modes (operator-visible)

| Symptom | Meaning | Action |
|---------|---------|--------|
| `HoloMapRuntime not initialized` | `step()` before `init()` | Call `init()` once per session. |
| WebGPU adapter null | No GPU or blocked context | Use compatibility ingest for the deadline; file environment note. |
| Contract test drift | Golden fingerprint changed | Intended only when HoloMap or core version intentionally bumps; update golden with review. |

## Rollback default

If unsure, use **`marble`** (compatibility). See [ROLLBACK_DEFAULTS.md](./ROLLBACK_DEFAULTS.md).
