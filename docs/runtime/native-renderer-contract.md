# Native Renderer Contract

HoloScript native rendering is the chain:

```text
.holo / .hsplus / .hs source -> semantic IR -> HoloRuntime or HoloVM -> backend adapter
```

The backend adapter may translate a proven runtime receipt to WebGPU, Canvas2D,
Looking Glass, Quest, R3F, or another target. It must not invent scene behavior.
Camera, scene graph, material, interaction, timing, input, asset, and XR
semantics must already be declared in native source, lowered through semantic IR,
and enforced by the runtime before an adapter runs.

The executable contract lives in
`packages/holo-vm/src/render/native-render-contract.ts`. Golden fixtures live in
`packages/holo-vm/src/render/golden-fixtures/`.

Run the gate:

```bash
pnpm check:native-render-contract
```

The fixture suite includes one source-owned positive fixture and rejected
adapter-only fixtures for interaction, timing, and XR. Those negative fixtures
are deliberate: if an agent adds behavior by handwriting a target adapter, the
contract runner must fail before that behavior can be treated as HoloScript
capability.
