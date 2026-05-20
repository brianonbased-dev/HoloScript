# DTDL Compiler: Azure Digital Twins

**Target**: `--target dtdl`
**Output**: DTDL JSON-LD model array
**Platform**: Azure Digital Twins, IoT Plug and Play-compatible DTDL tooling
**Positioning**: Azure Digital Twins models state and relationships; HoloScript
simulates physics, emits the DTDL contract, and keeps provenance.

## Enterprise Pitch

Azure Digital Twins is the enterprise graph and integration layer. It models
rooms, equipment, spaces, sensors, relationships, data history, query, event
routes, IoT Hub ingress, and downstream analytics.

HoloScript is the simulation and proof layer above it:

```text
HoloScript composition
  -> physics / behavior / simulation contract
  -> DTDL v3 model export
  -> offline DTDL parser validation
  -> Azure Digital Twins model upload
  -> twin graph, IoT ingress, event routes, query, data history
  -> HoloScript replay / receipt / target-device proof
```

The enterprise story is simple:

> Azure Digital Twins models the state. HoloScript simulates the physics.
> Together, they produce a complete verifiable digital twin.

## Why This Bridge Exists

Microsoft's DTDL is JSON-LD-based and defines model vocabulary with
interfaces, properties, telemetry, commands, relationships, components, and
schemas. Azure Digital Twins supports DTDL v2 and v3, and Microsoft recommends
v3 for new Azure Digital Twins models because of expanded capabilities.

The current HoloScript compiler defaults to DTDL v3:

- composition -> DTDL `Interface`;
- templates -> DTDL `Interface` with `extends`;
- state -> DTDL `Property`;
- `on_*` logic handlers -> DTDL `Command`;
- object hierarchy and spatial groups -> DTDL `Relationship`;
- `sensor` / `observable` traits -> DTDL telemetry;
- selected HoloScript traits -> DTDL `Component`;
- `position` -> DTDL `Property` with `Location` semantic type.

HoloScript should not compete with Azure Digital Twins on enterprise cloud
distribution. It should compile into Azure's open modeling layer while keeping
HoloScript's own differentiators: simulation contracts, units, replay,
multi-target output, and receipts.

## Compile

```bash
holoscript compile factory.holo --target dtdl --output ./out/dtdl/
```

Programmatic use:

```ts
import { DTDLCompiler } from '@holoscript/core';

const compiler = new DTDLCompiler({
  dtdlVersion: 3,
  namespace: 'dtmi:contoso:factory',
  modelVersion: 1,
  includeTraitComponents: true,
});

const dtdlJson = compiler.compile(composition, agentToken);
```

The compiler returns a JSON array of DTDL interfaces. Store the output as one
or more `.json` model files before upload.

## Example

HoloScript source:

```holoscript
composition SmartFactory {
  state {
    lineStatus: "running"
    ambientTemperature: 22.4
  }

  object PumpA {
    position: [2.5, 0, 4.2]
    pressure: 134.2
    flowRate: 18.6
    traits: [physics, sensor, observable]
  }

  logic {
    on_shutdown_requested {
      emit("shutdown_requested")
    }
  }
}
```

Representative DTDL shape:

```json
[
  {
    "@context": "dtmi:dtdl:context;3",
    "@type": "Interface",
    "@id": "dtmi:contoso:factory:SmartFactory;1",
    "displayName": "SmartFactory",
    "contents": [
      {
        "@type": "Property",
        "name": "lineStatus",
        "schema": "string",
        "writable": true
      },
      {
        "@type": "Property",
        "name": "ambientTemperature",
        "schema": "double",
        "writable": true
      },
      {
        "@type": "Command",
        "name": "shutdown_requested"
      },
      {
        "@type": "Relationship",
        "name": "hasPumpA",
        "displayName": "PumpA",
        "target": "dtmi:contoso:factory:PumpA;1",
        "maxMultiplicity": 1
      }
    ]
  }
]
```

## Validate Before Upload

Do not upload unvalidated generated models directly to a production Azure
Digital Twins instance.

Recommended validation gates:

1. Parse the JSON output locally.
2. Validate with the .NET `DTDLParser` NuGet package.
3. Upload to a dev Azure Digital Twins instance.
4. Create one sample twin for each generated interface.
5. Query the graph and verify relationships.
6. Record an import receipt with model IDs, source hash, compiler version, and
   validation result.

Example CLI upload commands:

```bash
az extension add --name azure-iot
az dt model create -n <instance-or-hostname> --models ./out/dtdl/factory.json
az dt twin create -n <instance-or-hostname> --dtmi "dtmi:contoso:factory:PumpA;1" --twin-id pump-a
az dt twin query -n <instance-or-hostname> -q "select * from digitaltwins"
```

For DTDL v3 specifically, prefer API, SDK, CLI, or import job workflows. Azure
Digital Twins Explorer can view/edit v3 models and twins, but Microsoft
documents limited v3 Explorer support: v3 models do not show in the Model Graph
panel and cannot be imported through Explorer.

## Integration Architecture

### 1. Model Export

Compile HoloScript source to DTDL v3 with a customer-controlled namespace:

```ts
new DTDLCompiler({
  namespace: 'dtmi:acme:plant',
  modelVersion: 1,
  dtdlVersion: 3,
});
```

Use the same namespace across generated model IDs, trait components, and
relationship targets. Treat model ID version changes as migration events.

### 2. Offline Validation

Validate the generated model set with `DTDLParser` before upload. This catches
invalid schemas, dependency errors, relationship target problems, and inheritance
issues before Azure rejects the model.

### 3. Azure Digital Twins Upload

Upload models through Azure CLI, SDK, REST API, or import jobs. Use directory
upload for multi-model ontologies:

```bash
az dt model create -n <instance-or-hostname> --from-directory ./out/dtdl/
```

### 4. Twin Instantiation

Create twins from generated model IDs. For each HoloScript object that becomes
a twin, preserve:

- HoloScript object name;
- DTDL model ID;
- source composition hash;
- initial property snapshot;
- relationship edges;
- simulation contract ID when present.

### 5. Live Data and Simulation Loop

Azure should ingest live operational state. HoloScript should simulate and
verify behavior.

Common loop:

```text
IoT Hub / OPC UA / MQTT / business system
  -> Azure Digital Twins property update or telemetry route
  -> HoloScript runtime subscribes to relevant changes
  -> HoloScript simulation predicts next state or validates anomaly
  -> result written back as twin properties, event route output, or receipt
```

Use Azure for graph state, identity, RBAC, data history, event routes, and
enterprise integration. Use HoloScript for scenario simulation, physics,
multi-target rendering, replay, and provenance.

## What DTDL Carries vs What HoloScript Carries

| Concern | Azure DTDL / Digital Twins | HoloScript |
|---|---|---|
| Asset vocabulary | Interfaces, components, properties, telemetry, relationships | Source composition, templates, objects, traits |
| Live graph | Twins, relationships, query, routes, data history | Runtime state mirror and simulation inputs |
| Physics | Not the core model; represented as state or component metadata | SimulationContract, solvers, units, replay |
| Rendering/XR | Explorer and 3D Scenes Studio, not compiler-wide target proof | Web, WebXR, Unreal, Unity, visionOS, VRChat, USD, HoloTunnel |
| Provenance | Azure resource history and event streams | Source hashes, compiler receipts, target-device receipts |
| Validation | DTDL parser, Azure model APIs | Compiler tests, semantic validation, simulation receipts |

## Known Limits

Current HoloScript DTDL compiler limits to account for in enterprise pilots:

- It emits DTDL v3 by default and supports v2 by option.
- Only handled environment keys are `skybox`, `ambient_light`, and `fog`.
- Object sub-interfaces are generated for complex object properties or
  `networked`, `sensor`, `observable`, or `state` traits. Simple scalar-only
  objects may only appear as relationships from the main composition.
- `sensor` and `observable` traits generate a generic `sensorReading`
  telemetry entry today.
- Trait components currently cover selected interaction, network, physics,
  collision, sensor, and observable concepts.
- Azure Digital Twins supports only one level of component nesting and has
  service-specific DTDL limitations. Do not assume every DTDL feature is
  accepted by Azure Digital Twins.

These limits are acceptable for a bridge guide, but every customer pilot should
include generated-model parser validation and a dev-instance upload test.

## Enterprise Sales Motion

### One-Liner

Azure Digital Twins gives the enterprise graph. HoloScript gives the physics,
multi-target simulation, and proof.

### Buyer Pain

Enterprise digital twin teams often have graph state, live telemetry, and BI
dashboards, but the simulation layer is separate from the model layer. That
creates translation drift: DTDL says what exists; simulation tools decide what
happens elsewhere.

### HoloScript Counterposition

HoloScript makes simulation the source artifact, then compiles the Azure model
contract from that source. The DTDL model is no longer hand-maintained drift.
It is an export from the same semantic object that can run, render, replay, and
produce receipts.

### Partner / Marketplace Listing Draft

Title:

```text
HoloScript Verifiable Digital Twin Bridge for Azure Digital Twins
```

Short description:

```text
Compile HoloScript simulation scenes into DTDL v3 models for Azure Digital
Twins, then preserve physics, replay, provenance, and target-device receipts
outside the graph. Azure models the live state; HoloScript simulates and proves
behavior.
```

Ideal Azure Samples repository shape:

```text
azure-digital-twins-holoscript-bridge/
  README.md
  models/
    smart-factory.generated.dtdl.json
  holoscript/
    smart-factory.holo
  receipts/
    smart-factory.import-receipt.json
  scripts/
    validate-dtdl.csx
    upload-models.sh
    create-sample-twins.sh
    query-graph.sh
```

Submission checklist:

- sample `.holo` source;
- generated DTDL v3 JSON;
- DTDLParser validation evidence;
- Azure CLI upload commands;
- sample twin creation/query commands;
- HoloScript receipt showing source hash, compiler version, model IDs, and
  validation result;
- positioning copy: "Azure Digital Twins models state; HoloScript simulates
  physics."

## Verification

Compiler tests:

```bash
pnpm --filter @holoscript/core test -- src/compiler/DTDLCompiler.test.ts src/compiler/__tests__/DTDLCompiler.test.ts src/compiler/__tests__/DTDLCompiler.prod.test.ts
```

Doc sources:

- [Azure Digital Twins DTDL models](https://learn.microsoft.com/en-us/azure/digital-twins/concepts-models)
- [Parse and validate models with the DTDL parser](https://learn.microsoft.com/en-us/azure/digital-twins/how-to-parse-models)
- [Manage DTDL models in Azure Digital Twins](https://learn.microsoft.com/en-us/azure/digital-twins/how-to-manage-model)
- [DTDL v3 language description](https://azure.github.io/opendigitaltwins-dtdl/DTDL/v3/DTDL.v3.html)
- [Azure Digital Twins product page](https://azure.microsoft.com/en-us/products/digital-twins/)
- [Azure CLI az dt model reference](https://learn.microsoft.com/en-us/cli/azure/dt/model)
- [Azure CLI az dt twin reference](https://learn.microsoft.com/en-us/cli/azure/dt/twin)
- [DTDLParser NuGet package](https://www.nuget.org/packages/DTDLParser)

## See Also

- [WoT Compiler](/compilers/iot/wot)
- [HoloScript Digital Twins Guide](/ecosystem/DIGITAL_TWINS)
- [Verifiable Digital Twin positioning](/strategy/positioning-verifiable-digital-twin)
