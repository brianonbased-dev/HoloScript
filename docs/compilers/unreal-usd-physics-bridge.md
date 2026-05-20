# Unreal USD Physics Bridge

Use HoloScript as the simulation and world-logic IR, then use Unreal Engine for
rendering, lighting, cinematics, and project-specific gameplay polish. This is
the bridge path for teams that want Unreal visual fidelity without making
Unreal-only assets the source of truth.

The short version:

```text
.holo source
  -> HoloScript SimulationContract receipt
  -> USDPhysicsCompiler targetContext="generic" or "omniverse"
  -> .usda stage with PhysicsScene, schemas, semantic AST, provenance hash
  -> Unreal USD Importer / USD Stage
  -> Unreal-native visual polish, Nanite/Lumen, Sequencer, packaging
```

## When to Use This Path

Choose the USD bridge when the source scene must remain portable across Unreal,
Omniverse, Isaac Sim, WebGPU, Unity, Godot, VRChat, and other HoloScript targets.
Unreal becomes a high-end rendering destination, not the canonical authoring
format.

Use the direct Unreal compiler when you need generated `AActor` C++ and
Blueprint-callable scaffolding. Use the USD bridge when physics, provenance,
robot/factory articulation, or cross-tool interchange matters more than native
Unreal class generation.

## Author Once

Keep behavior and simulation intent in `.holo`:

```holo
world FactoryCell {
  object Conveyor {
    geometry: cube
    scale: [6, 1, 0.4]
    position: [0, 0, 0.2]
    @physics { mass: 0, static: true }
  }

  object Tote {
    geometry: cube
    scale: [0.6, 0.4, 0.25]
    position: [0, 0, 1.2]
    @physics { mass: 8, friction: 0.7 }
    @collidable
  }
}
```

That composition remains the semantic source. Unreal artists can replace meshes,
materials, lights, cameras, Niagara systems, and Sequencer shots after import,
but physics intent and receipt linkage stay attached to the HoloScript output.

## Preserve the SimulationContract

Run the simulation or verification pipeline first and capture the
`SimulationContract` receipt hash for the exact composition state being exported.
Then pass that hash into `USDPhysicsCompiler`:

```typescript
import { USDPhysicsCompiler } from '@holoscript/core/compiler';

const receiptHash = process.env.SIMULATION_CONTRACT_HASH ?? '';

const compiler = new USDPhysicsCompiler({
  targetContext: 'generic',
  provenanceHash: receiptHash,
  embedSemanticAST: true,
});

const usda = compiler.compile(composition, agentToken, 'FactoryCell.usda');
```

The emitted USDA carries two pieces Unreal teams should keep with the asset:

- `# Provenance Hash: <hash>` near the file preamble, linking the stage to the
  SimulationContract receipt.
- `holoscript:*` custom data on the root Xform when `embedSemanticAST` is true,
  preserving composition name, objects, traits, spatial groups, and target
  context.

Treat the `.usda` file plus the receipt as the audit source. If the Unreal
project later bakes the stage into native assets, keep the original `.usda` and
receipt in source control and copy the hash into project metadata or an asset
registry entry.

## Import into Unreal

1. Enable Unreal's USD tooling for the project, including the USD Importer and
   USD Stage workflow available in Unreal Engine 5.x.
2. Import or open the HoloScript-generated `.usda` stage.
3. Verify the root layer still includes `customLayerData`, `holoscript:*`
   metadata, and the provenance hash comment in the source USDA.
4. Keep physics-authoritative edits in HoloScript. Use Unreal for rendering,
   materials, lighting, camera work, platform packaging, and game-specific
   adapter code.
5. When changing simulation logic, regenerate the SimulationContract receipt and
   re-export the USDA instead of hand-editing the imported Unreal scene.

## Unreal Responsibilities

Unreal should own:

- Nanite and Lumen render treatment
- level streaming and packaging
- Sequencer, cameras, and cinematics
- final materials and effects
- platform-specific interaction adapters

HoloScript should own:

- source world logic
- physics intent and portable traits
- SimulationContract receipts
- USD semantic AST metadata
- multi-target compilation

That division is the competitive point: Unreal remains excellent at rendering,
while HoloScript stays above it as the portable, verifiable world IR.

## Verification Checklist

Before calling the bridge ready for a production scene:

- The `.holo` source validates.
- The SimulationContract receipt hash is generated from the same source state
  that produced the USDA.
- `USDPhysicsCompiler` emits `provenanceHash` and `embedSemanticAST: true`.
- Unreal import preserves the source USDA as a tracked artifact, even if the
  project also bakes native assets.
- Any Unreal-side edits are rendering/adaptation edits, not hidden simulation
  rewrites.

## See Also

- [Unreal Engine compiler](/compilers/unreal)
- [USD Physics compiler](/compilers/usd-physics)
- [USD Physics Export - Omniverse and Isaac Sim](../targets/usd-omniverse)
- [`UnrealCompiler.ts`](../../packages/core/src/compiler/UnrealCompiler.ts)
- [`USDPhysicsCompiler.ts`](../../packages/core/src/compiler/USDPhysicsCompiler.ts)
