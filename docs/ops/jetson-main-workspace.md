# Jetson Primary Workspace Readiness

Jetson can become the primary HoloScript workspace host only after a target-node
receipt proves the storage and agent-safety contract. GitHub remains source
truth; the Jetson workspace is an owned-metal operational checkout, not a new
source of truth by itself.

## Storage Contract

- NVMe2 owns the primary HoloScript workspace and service data lane.
- NVMe1 owns model ops and HoloLlama/model-runtime assets.
- Laptop remains the frontier authoring and staging lane until the Jetson target
  receipt passes.
- Do not move or delete main repositories during readiness work. Cutover is a
  separate step after peer work is idle or the target worktree is clean enough
  for explicit-path staging.

Default target paths:

```bash
JETSON_WORKSPACE_ROOT=/mnt/nvme2/holo-workspaces/HoloScript
JETSON_SERVICE_DATA_ROOT=/mnt/nvme2/holo-volumes
JETSON_MODEL_OPS_ROOT=/mnt/nvme1/holo-model-ops
```

## Readiness Gate

Laptop-side planning check:

```bash
pnpm run check:jetson-main-workspace-readiness
```

Target-node proof on Jetson:

```bash
pnpm run check:jetson-main-workspace-readiness -- --require-jetson --require-existing --json
```

Optional live HoloLlama probe when the Jetson endpoint is configured:

```bash
HOLOLLAMA_JETSON_ENDPOINT=http://127.0.0.1:18080 \
pnpm run check:jetson-main-workspace-readiness -- --require-jetson --require-existing --probe-holollama --json
```

The gate checks Linux arm64/Jetson markers, NVMe lane placement, required root
presence, free-space floor, repo-local package/agent files, git readability, and
optional HoloLlama endpoint health. A non-Jetson run can pass only as
`planning-only-not-on-jetson`; it must not be used as cutover proof.

## Cutover Rule

Promotion is allowed only when these receipts exist:

1. `check:jetson-main-workspace-readiness -- --require-jetson --require-existing`
   passes on Jetson.
2. HoloLlama live lifecycle passes for `jetson-orin` with systemd and footprint
   checks when the appliance claim is being made.
3. The target worktree is either clean or peer work has been explicitly parked
   with receipt-backed handoff.
4. Package stewardship remains green for MCP, HoloLlama, uAAL, and PyPI-facing
   utilities.

Failure mode is intentionally conservative: if the checker cannot prove the
target-node state, the correct status is blocked, not assumed ready.
