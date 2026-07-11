# @holoscript/hololand-platform

HoloLand platform services that consume upstream HoloScript and framework
primitives.

## Install

```bash
npm install @holoscript/hololand-platform
```

## Use

```ts
import {
  AffectiveMemory,
  buildHoloTunnelSharePacket,
  stewardTick,
} from '@holoscript/hololand-platform';
```

## Device Lab

Run the hardware-native readiness probe before claiming HoloLand device support:

```bash
pnpm --filter @holoscript/hololand-platform run device-lab -- --task task_1778188462361_2597
```

The command writes a receipt under `.holoscript/device-lab/` and checks:

- local runtime and GPU inventory
- WASM SIMD support
- browser WebGPU smoke via `scripts/probe-webgpu.mjs` when available
- optional Quest/headset report from Studio `/quest-probe`
- optional replay, trace, or validation receipt hash

Attach headset and replay evidence when available:

```bash
pnpm --filter @holoscript/hololand-platform run device-lab -- \
  --task task_1778188462361_2597 \
  --headset-report path/to/observations.md \
  --replay path/to/replay-or-validation-receipt.json
```

`WARN` means the receipt is useful but incomplete. `FAIL` means HoloLand hardware
readiness is not proven on this device.

## Evidence Envelope

Generate the Paper 12 HoloLand calibration/setup/reproducibility manifest:

```bash
pnpm --filter @holoscript/hololand-platform run evidence-envelope -- \
  --preset paper-12-hololand \
  --out docs/public/evidence/paper-12-hololand-envelope.json
```

The envelope records runtime environment hash, hardware tier, seed, harness
command, artifact paths, and one-command rerun. Papers cite the public JSON path
instead of restating those fields by hand.

## Boundary

Use this package for HoloLand world services and device receipts. Use
`@holoscript/xr-embodiment` for reusable WebXR embodiment, `@holoscript/mesh`
for lower-level collaboration/network primitives, and `@holoscript/runtime` for
general HoloScript scene execution.

## Package boundary & release posture

This is a **v0-preview** package of HoloLand platform services for external,
public, and operator/founder consumers who are building or validating a
HoloLand deployment. It **does not ship** any private workspace, headset
fixture, or founder-local device inventory — you bring your own `--task` id
and point it at your own optional `--headset-report` / `--replay` paths, and
every receipt is written under your own `.holoscript/device-lab/` directory,
not a package default.

**Known limitations:** device-lab coverage depends on what hardware and
WebGPU/Quest probes are actually reachable from the calling machine — a `WARN`
receipt means the check ran but is incomplete, not that the platform is
broken. Interfaces may change before the v1 release; treat receipts as
evidence to attach to a task, not a guarantee of hardware support.
