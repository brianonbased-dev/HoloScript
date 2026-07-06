# @holoscript/xr-embodiment

`@holoscript/xr-embodiment` is the reusable WebXR and VR embodiment package for
HoloScript clients. It keeps user locomotion, agent-NPC avatars, and shared
Three.js embodiment primitives in one package that laptop, Jetson, and Vast
fleet consumers can install without inheriting MCP or model-serving concerns.

## Install

```bash
npm install @holoscript/xr-embodiment three
```

React and React Three Fiber clients should also install the optional peer stack:

```bash
npm install react react-dom @react-three/fiber @react-three/xr
```

## Entry Points

| Entry point                         | Purpose                                      |
| ----------------------------------- | -------------------------------------------- |
| `@holoscript/xr-embodiment`         | Shared package API                           |
| `@holoscript/xr-embodiment/three`   | Framework-light Three.js embodiment helpers  |
| `@holoscript/xr-embodiment/react`   | React and React Three Fiber convenience APIs |

## Fleet Role

This package is part of the v1 fleet lane. Laptop, Jetson, and Vast consumers
use it as the portable XR client embodiment layer:

- laptop: local HoloShell and Studio XR previews.
- Jetson: owned-metal spatial clients and edge embodiment experiments.
- Vast: GPU-backed rendered XR sessions and agent-avatar preview workloads.

It is not the control plane and it does not own model serving.
`@holoscript/mcp-server` owns authenticated agent tools and fleet dispatch,
while `@holoscript/holollama` owns llama.cpp serving plans.
`@holoscript/xr-embodiment` owns the client-side body, locomotion, avatar, and
WebXR integration surface.

## Validation

Run the package checks before publishing or promoting downstream consumers:

```bash
corepack pnpm --filter @holoscript/xr-embodiment run build
corepack pnpm --filter @holoscript/xr-embodiment run test
corepack pnpm run check:package-consumption:test
corepack pnpm run check:fleet-utilities
```

Run `corepack pnpm run check:package-consumption:full` before a publish cut to
prove the packed artifact is consumable across the laptop, Jetson, and Vast
lanes.
