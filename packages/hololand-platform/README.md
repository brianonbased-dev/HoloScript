# @holoscript/hololand-platform

HoloLand platform services that consume upstream HoloScript and framework
primitives.

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
