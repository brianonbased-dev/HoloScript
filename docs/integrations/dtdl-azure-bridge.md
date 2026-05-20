# DTDL / Azure Digital Twins → HoloScript Integration Guide (D.007 BRIDGE)

**Classification**: BRIDGE (NMoS P2, 4/5 bars)  
**CG Task**: Part of D.007 batch execution  
**Status**: Third D.007 bridge artifact (after ROS 2 and VisionOS)

## One-line

Enterprise digital twin data (DTDL models, Azure Digital Twins instances, twin graphs, telemetry) → `.holo` with SimulationContract receipts → compile to HoloLand, R3F, or any other target.

## Why This Matters

DTDL + Azure DT is one of the strongest BRIDGE candidates (massive-scale + open-standard + gated + specialized). Many industrial customers already have live twin graphs. HoloScript gives them the semantic + receipt layer without forcing them to abandon their investment.

## Current Surface

- HoloScript already has good JSON-LD / graph ingestion paths.
- Existing ontology and relationship handling in the core.
- Receipt generation is universal.

## Step 1: Ingest DTDL Model + Twin Graph into .holo

```bash
hs import-dtdl myFactory.json --output factory.holo --with-receipt \
  --include-telemetry --preserve-relationships
```

Produces:
- Entities as HoloScript objects
- Relationships as first-class links
- Telemetry streams as time-series traits
- Receipt anchoring the entire twin graph as a verifiable digital twin fragment

## Step 2: Live Azure DT Telemetry → HoloScript Events

Map Azure DT notifications and telemetry to HoloScript traits.

| Azure DT                          | HoloScript Trait/Event             | Notes |
|-----------------------------------|------------------------------------|-------|
| Twin property update              | `property_update`                  | Drives simulation state |
| Relationship change               | `relationship_update`              | Graph delta for world models |
| Telemetry (temperature, vibration)| `sensor_stream` + `time_series`    | Perfect JEPA training data |
| Command / method invocation       | `intent` / `action`                | For NPC / agent control |

A small Azure Function or Event Grid bridge can emit these as HoloScript events with embedded receipts.

## Step 3: Receipt-Anchored Enterprise World Model

Every twin graph snapshot or telemetry batch produces a WorldModelReceipt. This is gold for the AI Lab — real industrial physics + process data becomes training corpus for JEPA models that can later be deployed back into Azure or HoloLand.

## Step 4: Example Composition

```holo
// dtdl-factory-line.holo
import "std/graph"
import "azure/dtdl"

entity factoryLine {
  model: dtdl("FactoryLine.json")
  twins: live_graph("dtmi:com:contoso:factory:line:1")
  traits: [
    telemetry_stream("temperature", "vibration"),
    relationship_dynamics,
    predictive_maintenance
  ]
  simulation_contract: {
    solver: "azure-dt",
    receipt: "sha256:..."
  }
}

compile_to_hololand(factoryLine, mode: "digital_twin")
```

## Quick Start for an Azure DT Customer

1. Export a DTDL model + a small twin graph snapshot.
2. Run the import → get `.holo` + receipt.
3. Use the example composition.
4. Compile to HoloLand for immersive review or to web for dashboards.
5. The receipt appears on the public agent profile.

## Ties to the Ecosystem

- **D.055**: The resulting industrial agent has a public profile with verifiable twin receipts.
- **Paper 26 / AI Lab**: Real enterprise process data as JEPA corpus.
- **HoloLand (D.050)**: Enterprise twins become immersive, receipt-anchored worlds.
- **Other bridges**: Same universal pattern — any graph data → .holo → any device.

## Next Polish

- First-class Azure DT plugin (pull live twins via the DT SDK + emit HoloScript events).
- Bidirectional sync (changes in .holo can be written back to Azure DT with receipts).
- Fidelity validation for industrial visual twins (similar to VisionOS CG-005).

---

**Verification**: Third concrete D.007 BRIDGE artifact following the NMoS mandate and the governing synthesis. The batch is now progressing (ROS 2, VisionOS, DTDL).

**Remaining in batch** (per NMoS table): VRChat, Unreal, Unity, OpenXR.