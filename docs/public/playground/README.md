# HoloScript Interactive Playground

This directory contains the HoloScript Interactive Playground - a live demo showcasing the Runtime Integration features.

## Current Status

The playground is currently deployed as a **landing page** that directs users to the full demo in the examples directory.

## Why Not Fully Interactive?

The advanced earthquake demo requires:

- TypeScript compilation and bundling
- Three.js and HoloScript core dependencies
- WebGL 2.0 support
- Build tools (Vite/Webpack)

A fully bundled version would add ~2MB to the docs deployment. Instead, we provide:

1. A polished landing page explaining the features
2. Clear instructions for running locally
3. Direct links to the source code

## Running the Full Demo Locally

```bash
# Clone the repository
git clone https://github.com/brianonbased-dev/HoloScript.git
cd HoloScript

# Install dependencies
pnpm install

# Build packages
pnpm build

# Run the demo
cd examples
open advanced-earthquake-demo.html
```

## Features Showcased

The full demo includes:

- **EarthquakeRuntimeExecutor** - Richter 7.5 seismic simulation
- **GPU Instancing** - 100x performance improvement (10K+ objects in 10 draw calls)
- **Post-Processing** - SSAO, Bloom, TAA, Vignette (AAA quality)
- **Optimized Shaders** - 5x faster particle rendering
- **Scene Inspector** - Real-time FPS, memory, and performance monitoring

## Source Code

- Landing page: `docs/public/playground/index.html`
- Full demo: `examples/advanced-earthquake-demo.html`
- TypeScript source: `examples/advanced-earthquake-demo.ts`
- Runtime executors: `packages/core/src/runtime/executors/`
- Advanced rendering: `packages/core/src/runtime/rendering/`

## Future Enhancement

To create a fully bundled playground:

1. Create `examples/playground/vite.config.ts`
2. Add build script: `"build:playground": "vite build examples/playground"`
3. Update deploy-docs workflow to run playground build
4. Copy built assets to `docs/public/playground/demo/`

This would enable a full WebGL demo deployed to GitHub Pages.
