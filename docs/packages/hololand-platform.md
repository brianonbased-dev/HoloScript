# @hololand/platform-services

`@hololand/platform-services` is the HoloLand VR-world services package. It
packages world-state services, affective memory, collaboration primitives,
device-lab receipts, headset sharing, HoloTunnel sharing, NPC memory, portal
entry receipts, and adversarial trajectory tooling for HoloLand consumers.

## Install

```bash
npm install @hololand/platform-services
```

## Use

```ts
import {
  AffectiveMemory,
  buildHoloTunnelSharePacket,
  stewardTick,
} from '@hololand/platform-services';
```

## CLIs

| Binary                            | Purpose                                     |
| --------------------------------- | ------------------------------------------- |
| `hololand-device-lab`             | Hardware-native HoloLand readiness receipts |
| `hololand-evidence-envelope`      | Reproducibility manifest generation         |
| `hololand-adversarial-trajectory` | Failure-scene and trajectory report tooling |
| `hololand-headset-share`          | Owned headset share transport               |
| `holo-tunnel`                     | Local-to-cloud HoloTunnel sharing primitive |

## Strategy Role

This package is the HoloLand services substrate. Keep it separate from
`@holoscript/xr-embodiment`, which owns reusable client-side body, locomotion,
avatar, and WebXR integration. Keep lower-level sync/network primitives in
`@holoscript/mesh` and general runtime scene execution in `@holoscript/runtime`.

Promote it into fleet consumption only when laptop, Jetson, or Vast workloads
need HoloLand world services or device receipts directly.

## Validation

```bash
corepack pnpm --filter @hololand/platform-services run test
corepack pnpm run check:publish-surface
corepack pnpm run check:package-architecture
corepack pnpm run package:opportunity-map
```
