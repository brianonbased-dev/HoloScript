# In-House Validation

GitHub Actions is no longer the default build farm for HoloScript. The normal
quality path is local hardware, HoloMesh agents, self-hosted runners, deployment
provider receipts, and checked-in artifacts.

## Default Local Gate

Pick the narrowest command set that matches the touched surface. Common gates:

```bash
pnpm --filter @holoscript/core run build
pnpm --filter @holoscript/cli run build
pnpm --filter @holoscript/mcp-server run build
pnpm --filter @holoscript/studio run build
pnpm test
pnpm lint
```

Run package-specific tests for focused changes, and include the exact command in
the handoff or task completion note.

## Hardware And XR Proofs

Codex/local hardware owns GPU, WebGPU, WASM, browser, and headset-adjacent proof.
Use the hardware baseline before claiming local capability:

```powershell
pnpm --dir C:/Users/josep/.ai-ecosystem check:codex-hardware
```

Quest, HoloTunnel, WebXR, rendering, simulation, and stress-pass work should
attach local or HoloMesh receipts instead of spending GitHub-hosted minutes.

## Manual GitHub Escapes

Workflows under `.github/workflows/` are intentionally `workflow_dispatch` only.
Use them when an external GitHub receipt is specifically needed. Heavy surfaces
such as multi-platform release, Docker image publishing, CodeQL, benchmark
matrices, video rendering, Playwright, WASM, and Studio builds should default to
local/self-hosted/HoloMesh execution.

Dependabot automatic PR creation is also disabled. Dependency sweeps should be
batched by HoloMesh/local agents with focused receipts instead of weekly hosted
CI fan-out across the whole ecosystem.

## Receipt Standard

Every in-house validation handoff should include:

- commit SHA
- machine or agent surface
- command list
- pass/fail summary
- artifact paths or production health URLs
- any skipped expensive checks and why
