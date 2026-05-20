# DTDL / Azure Digital Twins → HoloScript Integration Guide (D.007 BRIDGE)

**Classification**: BRIDGE (NMoS P2, 2026-05-20)  
**CG Task**: CG-056  
**MCP tool**: `compile_to_dtdl`  
**Status**: First draft — bridge artifacts + receipt pattern for Azure IoT targets

## One-line

Any `.holo` digital twin composition → DTDL v3 interface models for Azure Digital Twins /
Azure IoT Hub, with SimulationContract receipts preserving semantic provenance.

## Why this exists (D.007 + NMoS)

DTDL (Digital Twins Definition Language) is the open standard powering Azure IoT, Azure Digital
Twins, and the broader Microsoft industrial IoT ecosystem. It has massive scale and real-world
deployment reach. HoloScript bridges it so industrial IoT developers can:

1. Author twins in `.holo` (physics + behavior + semantic metadata)
2. Compile to DTDL v3 for Azure registration and telemetry
3. Keep the HoloScript representation as the authoritative simulation source
4. Attach `SimulationContract` receipts to every twin change

Cross-cutting rule (NMoS): every DTDL artifact produced **must** carry a receipt linking it
back to the original `.holo` composition so the semantic graph remains intact.

## Prerequisites (already in tree)

- `compile_to_dtdl` MCP tool (packages/mcp-server/src/compiler-tools.ts)
- DTDL compiler (packages/core) — targets Azure Digital Twins v3 schema
- SimulationContract + WorldModelReceipt (packages/core)

## Step 1: Author the twin in HoloScript

```holo
composition "FactoryArm" {
  trait PhysicsRigidBody { mass: 12.5, friction: 0.4 }
  trait Temperature { unit: "celsius", range: [-10, 85] }
  trait Telemetry { rate: 10 }

  object "UpperArm" {
    geometry: "cylinder"
    scale: [0.06, 0.4, 0.06]
    trait PhysicsRigidBody
    trait Temperature
    trait Telemetry
  }
}
```

## Step 2: Compile to DTDL v3

```json
{
  "tool": "compile_to_dtdl",
  "code": "<holo composition above>"
}
```

Returns a DTDL v3 interface JSON:

```json
{
  "@context": "dtmi:dtdl:context;3",
  "@id": "dtmi:holoscript:FactoryArm;1",
  "@type": "Interface",
  "displayName": "FactoryArm",
  "contents": [
    { "@type": "Property", "name": "mass", "schema": "double" },
    { "@type": "Telemetry", "name": "temperature", "schema": "double" },
    ...
  ]
}
```

## Step 3: Register in Azure Digital Twins

```bash
az dt model create --dt-name <your-adt-instance> --models dtdl-output.json
```

## Step 4: Attach a SimulationContract receipt

Every DTDL registration from HoloScript must be paired with a `SimulationContract` receipt
so downstream queries can verify which `.holo` version produced this model:

```typescript
import { SimulationContractReceipt } from '@holoscript/core';
// receipt.verify() → anchored hash matches DTDL output
```

## Receipt pattern

| Field | Value |
|-------|-------|
| `sourceCompositionHash` | SHA-256 of the `.holo` source |
| `targetFormat` | `dtdl/v3` |
| `dtdlInterfaceId` | `dtmi:holoscript:<name>;1` |
| `bridgeVersion` | `holoscript-dtdl-compiler/v1` |

## Integration with HoloLand and Paper 26

- **HoloLand**: A factory-floor DTDL twin compiled from `.holo` can be re-ingested as a
  HoloLand simulation environment — the same semantic graph drives both IoT telemetry and
  embodied NPC simulation.
- **Paper 26**: The receipt-per-twin-update pattern is evidence for the "verified world model"
  claim: every state transition in Azure Digital Twins corresponds to an anchored receipt.

## Verified compilation targets

Check which DTDL targets are live:
```bash
find packages -name "DTDLCompiler.ts" | xargs head -3
```

## Open Questions / Next Polish

- Bi-directional sync: Azure Digital Twins telemetry events → `.holo` state updates
- DTDL Relationship types (cross-twin edges) in the HoloScript composer
- End-to-end test: `.holo` factory scene → DTDL registration → HoloLand digital twin

---

**Next CG- bridges in queue**: VisionOS/RealityKit, VRChat, Unreal (in `docs/compilers/`).
