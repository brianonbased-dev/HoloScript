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

Before publishing or expanding this package, run:

```bash
pnpm run build:package-release-closure
pnpm run check:npm-v1-release:built
pnpm run check:fleet-utilities
pnpm run check:package-consumption:full
```

