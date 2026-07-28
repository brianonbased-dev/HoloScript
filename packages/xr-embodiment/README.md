# @holoscript/xr-embodiment

Reusable XR embodiment primitives for HoloScript clients.

This package is for human builders and AI agents that need a shared locomotion,
avatar, and embodiment layer without copying one-off scene code. It is consumed
as a library by laptop, Jetson, and Vast lanes, with optional React and three.js
peer dependencies for richer client surfaces.

## Install

```bash
npm install @holoscript/xr-embodiment
```

## Stewardship

Before publishing or expanding this package, run the checks below to validate this package's release posture:

```bash
pnpm run build:package-release-closure
pnpm run check:npm-v1-release:built
pnpm run check:fleet-utilities
pnpm run check:package-consumption:full
```

## Package boundary & release posture

This is a **v0-preview** embodiment library for external and public HoloScript consumers — human builders and AI agents (an agent framework) building WebXR scenes across laptop, Jetson, and Vast lanes.

It **does not ship** a renderer, a WebXR session, a scene graph, or a backend. You bring your own `THREE.WebGLRenderer` and scene; `AgentAvatarTracker`'s default world-state polling (`fetch('/api/world-state/<entityId>')`) is a convenience default only — pass your own `fetchState` to point it at your own world-state endpoint, or a `bodyFactory` to bring your own mesh. Locomotion tuning (`speed`, `turnRate`, `teleportDistance`, snap-turn) is caller-owned config passed into `XRLocomotionController` / `useXRLocomotion`, not a package default.

**Known limitations:** this package's boundary stops at client-side embodiment logic — it has no opinion on how your world-state endpoint is authenticated, hosted, or secured, and the React wrappers activate only if you separately install the optional `react`, `react-dom`, `@react-three/fiber`, and `@react-three/xr` peer dependencies. Interfaces may change before a v1 release; rollback for existing consumers is pinning the last known-good `6.x` version.
