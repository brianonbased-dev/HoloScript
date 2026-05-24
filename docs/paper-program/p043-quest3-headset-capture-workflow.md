# P043 Quest 3 Headset Capture Workflow

Purpose: make the Quest 3 / Adreno 740 row in the P043 SKU matrix executable
without weakening the paper evidence standard. This workflow bridges the matrix
scaffold, the current shared-sort runner, and the headset approval process.

## Current Status

The P043 matrix harness already defines the Quest 3 cells:

```bash
pnpm bench:p043:sku-matrix -- --list-cells --sku quest3-adreno740
```

The shared-sort capture runner already writes the required artifact schema:

```bash
P043_BENCH_COMMAND="node packages/engine/run-p043-shared-sort-capture.mjs --browser-webgpu" \
  pnpm bench:p043:sku-matrix -- --run-cell quest3-adreno740__indoor-500k__n2 \
  --out .bench-logs/p043-sku-matrix/quest3-adreno740/indoor-500k/n2.json
```

That command is valid for a browser-WebGPU artifact, but the current runner
launches Chromium on the host through Playwright. It does not by itself prove
that the code executed inside Quest Browser on Adreno 740. A paper-grade Quest
cell needs a Quest-executed runner or a Quest-opened WebXR page that writes the
same JSON contract.

## Evidence Levels

Use the headset approval terms from the ecosystem handbook:

| Level | P043 meaning |
| --- | --- |
| `local-validated` | The matrix scaffold, artifact validator, and capture runner execute on the host. |
| `browser-validated` | A browser/WebGPU run writes a non-smoke artifact that passes `--check-results`. |
| `headset-reviewed` | Quest Browser executes the capture surface or runner, records headset metadata, and the approval packet names the evidence paths. |
| `paper-ready` | All nine Quest cells pass `--check-results`, the approval packet is complete, and cited artifacts are frozen/anchored if the paper uses them. |

If Quest Browser cannot execute the capture, leave the row at
`blocked-no-headset` or `browser-validated`; do not promote host Chromium
numbers as Quest 3 numbers.

## Required Quest Metadata

Each Quest artifact or approval packet must record:

- Quest model and OS / Horizon version.
- Browser or WebXR shell name and version.
- User agent captured from the Quest session.
- Battery state after each 60 second sample.
- Thermal state after each 60 second sample, or `unknown` with reason.
- Network route used by the headset: LAN URL, tunnel URL, or adb reverse.
- Operator, session time, run id, and evidence paths.

For the JSON artifact, set these fields through the runner environment when the
Quest-executed path delegates to `run-p043-shared-sort-capture.mjs`, or write
equivalent fields directly when a browser page posts the artifact:

```bash
P043_BROWSER_SHELL="Quest Browser <version> / WebXR"
P043_BATTERY_STATE="<level/charging state>"
P043_THERMAL_STATE="<cool|warm|throttling|unknown: reason>"
P043_ADAPTER_VENDOR="Qualcomm"
P043_ADAPTER_DEVICE="Adreno 740"
P043_ADAPTER_ARCHITECTURE="Adreno"
P043_ADAPTER_DESCRIPTION="Meta Quest 3 Snapdragon XR2 Gen 2 Adreno 740"
```

## Capture Route

1. Preflight the matrix from the HoloScript repo:

   ```bash
   pnpm bench:p043:sku-matrix -- --list-cells --sku quest3-adreno740
   pnpm bench:p043:sku-matrix -- --check-results
   ```

2. Start the headset-accessible surface. If using Studio as the transport, run:

   ```powershell
   pnpm --dir C:/Users/josep/Documents/GitHub/HoloScript --filter @holoscript/studio dev
   ```

   The operator must open a LAN or tunnel URL from Quest Browser; `127.0.0.1`
   only counts when the browser runs on the same host.

3. Open the Quest proof surface with a P043 run id before capture:

   ```text
   http://<host-or-tunnel>/quest-proof?runId=YYYY-MM-DD_p043-quest3-sku-matrix
   ```

   Use `/quest-probe` first if the session needs to prove WebXR/WebGPU/device
   access before the benchmark page runs.

4. Execute each Quest cell from a Quest-executed benchmark surface. The nine
   required cells are:

   ```text
   quest3-adreno740__indoor-500k__n2
   quest3-adreno740__indoor-500k__n3
   quest3-adreno740__indoor-500k__n4
   quest3-adreno740__outdoor-1m__n2
   quest3-adreno740__outdoor-1m__n3
   quest3-adreno740__outdoor-1m__n4
   quest3-adreno740__dense-2m__n2
   quest3-adreno740__dense-2m__n3
   quest3-adreno740__dense-2m__n4
   ```

5. Write artifacts under:

   ```text
   .bench-logs/p043-sku-matrix/quest3-adreno740/<scene>/n<N>.json
   ```

6. Validate from the HoloScript repo:

   ```bash
   pnpm bench:p043:sku-matrix -- --check-results
   ```

## Approval Packet

Create the packet:

```text
research/approval-packets/YYYY-MM-DD_p043-quest3-sku-matrix_approval.md
```

Minimum packet fields for this workflow:

```text
artifact_type: benchmark
claim_level: headset-reviewed
source_paths:
  - docs/paper-program/P043-cross-vendor-sku-matrix.md
  - docs/paper-program/p043-quest3-headset-capture-workflow.md
  - scripts/p043-sku-matrix.mjs
  - packages/engine/run-p043-shared-sort-capture.mjs
operator_surface: quest3
required_gates:
  - pnpm bench:p043:sku-matrix -- --check-results
  - Quest Browser evidence path
  - battery and thermal metadata
```

The packet should point to the Quest proof receipts, P043 artifacts, screenshots
or screen recording if available, and any blocked-device notes.

## Closeout Rules

- Smoke artifacts are useful for CI but never paper evidence; the matrix checker
  rejects `captureMode` values containing `smoke`.
- Host Chromium artifacts can unblock runner debugging, but they cannot satisfy
  the Quest 3 SKU row.
- A Quest artifact is complete only when it has `status: "completed"`,
  `requiredRuns: 3`, at least three runs, non-empty frame-time samples, the
  required metrics, and adapter text containing both `adreno` and `qualcomm`.
- The Quest row is paper-ready only after all nine cells pass
  `pnpm bench:p043:sku-matrix -- --check-results` and the approval packet names
  the headset evidence.

## Remaining Implementation Gap

The missing workflow component is the Quest-executed capture writer. Build one
of these before claiming Quest 3 numbers:

- A WebXR/Quest Browser benchmark page that runs the shared-sort workload and
  POSTs the P043 artifact contract to a repo-local API route.
- A remote-control path that executes the existing runner inside Quest Browser
  and writes the same artifact contract back to `.bench-logs/p043-sku-matrix`.

Until one of those exists, the Quest 3 task is ready for process work but still
blocked for measured Adreno 740 paper data.
