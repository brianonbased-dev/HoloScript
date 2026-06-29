# Native Renderer Contract

HoloScript native rendering is the chain:

```text
.holo / .hsplus / .hs source -> semantic IR -> HoloRuntime or HoloVM -> backend adapter
```

The backend adapter may translate a proven runtime receipt to WebGPU, Canvas2D,
Looking Glass, Quest, R3F, or another target. It must not invent scene behavior.
Camera, scene graph, light, geometry, material, transform, interaction, event,
timing, animation, input, asset, XR, and lifecycle semantics must already be
declared in native source, lowered through semantic IR, and enforced by the
runtime before an adapter runs.

The R3F baseline is explicit in `R3F_BASELINE_RENDER_SEMANTICS`: camera, light,
geometry, material, transform, event, animation, and lifecycle. The positive
`r3f-baseline-source-owned` fixture permits React Three Fiber only at the
backend-adapter stage; a matching negative test rejects JSX-owned geometry.

The contract also tracks renderer capabilities that were previously easy to
hide inside R3F components:

- camera
- light
- geometry
- material
- transform
- event
- animation
- scene lifecycle

The executable contract lives in
`packages/holo-vm/src/render/native-render-contract.ts`. Golden fixtures live in
`packages/holo-vm/src/render/golden-fixtures/`.

Run the gate:

```bash
pnpm check:native-render-contract
```

The fixture suite includes source-owned positive fixtures and rejected
adapter-only fixtures for interaction, timing, XR, and R3F-owned baseline
semantics. Those negative fixtures are deliberate: if an agent adds behavior by
handwriting a target adapter, the contract runner must fail before that behavior
can be treated as HoloScript capability.

The `r3f-baseline-native-parity` fixture pins the current R3F baseline against
native source and semantic IR. It cites the R3F files that define today's
behavior, but only as adapter evidence:

- `packages/r3f-renderer/src/components/holoshell/HoloShellScene.tsx`
- `packages/r3f-renderer/src/components/MeshNode.tsx`
- `packages/r3f-renderer/src/utils/materialUtils.tsx`
- `packages/r3f-renderer/src/runtime/compiledMaterial.ts`
- `packages/r3f-renderer/src/components/CompiledTraitMesh.tsx`
- `packages/r3f-renderer/src/components/ProceduralMesh.tsx`
- `packages/r3f-renderer/src/components/holoshell/phenomena/SceneDoor.tsx`
- `packages/r3f-renderer/src/components/holoshell/phenomena/GlowField.tsx`
- `packages/r3f-renderer/src/components/holoshell/phenomena/FireSource.tsx`
- `packages/r3f-renderer/src/components/holoshell/scenes/WarmLibraryScene.tsx`

For that fixture, the source of truth is
`fixtures/native-render/r3f-baseline-parity.holo` and the native lowering receipt
is `fixtures/native-render/r3f-baseline-parity.semantic-ir.json`. If a future
baseline needs more than those native receipts can express, that is a
HoloScript language/runtime gap, not permission to add TSX behavior.
