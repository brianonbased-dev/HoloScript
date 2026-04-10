# visualizer-client

**Internal tool** — HoloScript scene visualizer and debugger.

A React + Three.js/R3F client used internally for previewing and debugging HoloScript scene graphs. Not published to npm (`private: true`).

## Stack

- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [@react-three/fiber](https://docs.pmnd.rs/react-three-fiber) (R3F)
- [@react-three/drei](https://github.com/pmndrs/drei)
- [Vite](https://vite.dev/) dev server with HMR

## Usage

```bash
# From repo root
pnpm --filter visualizer-client dev

# Or directly
cd packages/visualizer-client
pnpm dev
```

Opens at `http://localhost:5173` by default.

## Purpose

Used for:

- Live preview of compiled HoloScript scene graphs
- Debugging trait bindings and entity hierarchies
- Validating compiler output before targeting a production platform

For the public-facing playground, see [`packages/playground`](../playground/).
