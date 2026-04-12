# TetGen WASM Placement

Runtime lookup order for TetGen binary:

1. `/wasm/tetgen.wasm` (preferred)
2. `/assets/tetgen.wasm` (fallback)

To enable high-fidelity surface-to-volume meshing at runtime, place the production `tetgen.wasm` binary at one of the paths above.

In this repo, the preferred location is:

- `packages/studio/public/wasm/tetgen.wasm`

At runtime, `TetGenWasmMesher` attempts both paths and throws an actionable error if neither is found.
