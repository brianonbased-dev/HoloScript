# HoloScript Sprint 3 Plan

**Version:** 2.3.0 Target
**Timeline:** March 2026
**Theme:** Ecosystem Integration & Edge Computing

---

## Executive Summary

Sprint 3 focuses on implementing the ecosystem expansion capabilities identified in Sprint 2 research. The core insight: HoloScript's architecture (scene graph + reactive state + traits) already maps to IoT, robotics, and digital twin patterns - we need to add protocol bindings and runtime options.

## Sprint 3 Priorities

| Priority | Focus                     | Effort | Dependencies      | Status      |
| -------- | ------------------------- | ------ | ----------------- | ----------- |
| **1**    | W3C WoT Thing Description | Medium | Sprint 2 complete | ✅ Complete |
| **2**    | MQTT Protocol Bindings    | Medium | Priority 1        | ✅ Complete |
| **3**    | Headless Runtime Profile  | High   | Core stability    | ✅ Complete |
| **4**    | WASM Compilation Target   | High   | Priority 3        | ✅ Complete |
| **5**    | URDF/SDF Export           | Medium | Parser complete   | ✅ Complete |
| **6**    | Azure DTDL Generation     | Medium | Priority 1        | ✅ Complete |
| **7**    | Real-time Sync Protocol   | High   | Networking        | ✅ Complete |
| **8**    | Edge Deployment Tools     | Medium | Priority 4        | ✅ Complete |

---

## Priority 1: W3C WoT Thing Description Trait

**Goal:** Auto-generate W3C Thing Descriptions from HoloScript objects

### Implementation

```typescript
// New trait: @wot_thing
export interface WoTThingConfig {
  title: string;
  description?: string;
  security: 'nosec' | 'basic' | 'bearer' | 'oauth2';
  base?: string;
}

// Generates TD JSON from HoloScript @state blocks
function generateThingDescription(object: HoloObject): ThingDescription {
  // Map @state properties to TD properties
  // Map @on_* handlers to TD actions
  // Map @observable to TD events
}
```

### Files to Create

- `packages/core/src/wot/ThingDescriptionGenerator.ts`
- `packages/core/src/traits/WoTThingTrait.ts`
- `packages/cli/src/commands/wot-export.ts`

### Acceptance Criteria

- [x] `@wot_thing` trait generates valid TD 1.1 JSON
- [x] Properties mapped from `@state` blocks
- [x] Actions mapped from `@on_*` handlers
- [x] Events mapped from `@observable` directives
- [x] CLI command: `holoscript wot-export scene.holo`

---

## Priority 2: MQTT Protocol Bindings

**Goal:** Native MQTT publish/subscribe for IoT integration

### Implementation

```typescript
// New traits: @mqtt_source, @mqtt_sink
export interface MQTTSourceConfig {
  broker: string;
  topic: string;
  qos: 0 | 1 | 2;
  clientId?: string;
}

export interface MQTTSinkConfig {
  broker: string;
  topic: string;
  retain: boolean;
  qos: 0 | 1 | 2;
}
```

### Runtime Integration

```holoscript
sensor#temperature {
  @mqtt_source(
    broker: "mqtt://localhost:1883",
    topic: "sensors/temp/+",
    qos: 1
  )

  @on_message {
    state.value = message.payload.temperature
  }
}
```

### Files to Create

- `packages/runtime/src/protocols/MQTTClient.ts`
- `packages/core/src/traits/MQTTSourceTrait.ts`
- `packages/core/src/traits/MQTTSinkTrait.ts`

### Acceptance Criteria

- [x] Connect to MQTT 3.1.1 and 5.0 brokers
- [x] Wildcard topic subscriptions (+, #)
- [x] QoS 0, 1, 2 support
- [x] Automatic reconnection
- [x] Message payload parsing (JSON, binary)

---

## Priority 3: Headless Runtime Profile

**Goal:** Run HoloScript without rendering dependencies for server/edge

### Implementation

```typescript
// Runtime profile configuration
export interface RuntimeProfile {
  rendering: 'full' | 'minimal' | 'headless';
  physics: 'full' | 'collision_only' | 'none';
  audio: boolean;
  network: boolean;
}

// Headless profile
const headlessProfile: RuntimeProfile = {
  rendering: 'headless',
  physics: 'collision_only',
  audio: false,
  network: true,
};
```

### CLI Usage

```bash
# Run in headless mode
holoscript run --profile headless scene.holo

# Or via config
holoscript run --config iot-edge.yaml scene.holo
```

### Files to Modify

- `packages/runtime/src/HoloScriptRuntime.ts` - Add profile support
- `packages/cli/src/cli.ts` - Add --profile flag
- `packages/runtime/src/profiles/` - Profile definitions

### Acceptance Criteria

- [x] Headless mode runs without GPU/display
- [x] Memory footprint < 50MB for simple scenes
- [x] Startup time < 500ms
- [x] All state management works
- [x] Network/MQTT bindings work

---

## Priority 4: WASM Compilation Target

**Goal:** Compile HoloScript to WASM for edge deployment

### Implementation

```typescript
// WASM compiler configuration
export interface WASMCompilerConfig {
  target: 'wasm32-wasi' | 'wasm32-unknown';
  runtime: 'wasmtime' | 'wasmedge' | 'browser';
  optimize: boolean;
  debug: boolean;
}
```

### CLI Usage

```bash
# Compile to WASM
holoscript compile scene.holo --target wasm -o scene.wasm

# Run with WasmEdge
wasmedge scene.wasm
```

### Files to Create

- `packages/compiler/src/targets/WASMTarget.ts`
- `packages/runtime-wasm/` - Minimal WASM runtime

### Acceptance Criteria

- [x] Generate valid WASM module
- [x] Run on WasmEdge runtime
- [x] State management works
- [x] MQTT bindings via WASI sockets
- [x] Module size < 1MB for simple scenes

---

## Priority 5: URDF/SDF Export

**Goal:** Export HoloScript scenes to robot description formats

### Implementation

```typescript
// URDF exporter
export class URDFExporter {
  export(composition: HoloComposition): string {
    // Convert scene graph to URDF XML
    // Map @collidable to collision geometry
    // Map @physics to inertial properties
  }
}

// SDF exporter (Gazebo)
export class SDFExporter {
  export(composition: HoloComposition): string {
    // Similar but for SDF format
  }
}
```

### CLI Usage

```bash
holoscript compile workspace.holo --target urdf -o robot.urdf
holoscript compile workspace.holo --target sdf -o world.sdf
```

### Files to Create

- `packages/compiler/src/targets/URDFTarget.ts`
- `packages/compiler/src/targets/SDFTarget.ts`

### Acceptance Criteria

- [x] Valid URDF XML output
- [x] Valid SDF XML output
- [x] Collision geometry preserved
- [x] Joint definitions from constraints
- [x] Compatible with ROS 2 / Gazebo

---

## Priority 6: Azure DTDL Generation

**Goal:** Generate Digital Twin Definition Language models

### Implementation

```typescript
// DTDL generator
export class DTDLGenerator {
  generate(composition: HoloComposition): DTDLInterface {
    // Map @state to DTDL Properties
    // Map @on_* to DTDL Commands
    // Map emit() to DTDL Telemetry
    // Map template inheritance to extends
  }
}
```

### Files to Create

- `packages/compiler/src/targets/DTDLTarget.ts`
- `packages/core/src/traits/DTDLModelTrait.ts`

### Acceptance Criteria

- [x] Generate DTDL v3 compliant JSON
- [x] Property types mapped correctly
- [x] Telemetry from state changes
- [x] Commands from action handlers
- [x] Relationships from scene graph

---

## Priority 7: Real-time Sync Protocol

**Goal:** Efficient state synchronization for multi-device XR

### Implementation

```typescript
// Sync protocol
export interface SyncProtocol {
  transport: 'webrtc' | 'websocket' | 'quic';
  serialization: 'msgpack' | 'cbor' | 'protobuf';
  compression: boolean;
  deltaEncoding: boolean;
}

// Optimizations
export interface SyncOptimizations {
  interestManagement: boolean; // Only sync visible objects
  distanceCulling: number; // Don't sync far objects
  updateThrottle: number; // Max updates per second
}
```

### Files to Create

- `packages/core/src/network/SyncProtocol.ts` ✅
- `packages/core/src/network/InterestManager.ts` ✅ (in SyncProtocol.ts)
- `packages/core/src/network/DeltaEncoder.ts` ✅ (in SyncProtocol.ts)

### Acceptance Criteria

- [x] < 50ms latency for local network
- [x] Support 10+ concurrent users
- [x] Bandwidth < 100 KB/s per user (delta encoding)
- [x] Graceful degradation on packet loss
- [x] Conflict resolution strategies (last-write-wins, server-authority, merge, custom)

---

## Priority 8: Edge Deployment Tools

**Goal:** Package and deploy HoloScript to edge devices

### Implementation

```bash
# Package for edge deployment
holoscript package scene.holo --platform linux-arm64 -o deployment/

# Deploy to device
holoscript deploy deployment/ --target 192.168.1.100

# Monitor remotely
holoscript monitor 192.168.1.100 --dashboard
```

### Files to Create

- `packages/cli/src/edge.ts` ✅ (contains package, deploy, monitor functions)

### Acceptance Criteria

- [x] Single-file deployment package
- [x] Support ARM64 (Raspberry Pi, Jetson)
- [x] SSH-based deployment
- [x] Remote monitoring dashboard
- [x] OTA update support

---

## Architecture Changes

### Runtime Modularity

```
┌─────────────────────────────────────────────────────┐
│                  HoloScript Runtime                  │
├─────────────┬─────────────┬─────────────┬───────────┤
│   Parser    │   Compiler  │    State    │  Network  │
│   (core)    │   (core)    │   (core)    │  (opt)    │
├─────────────┼─────────────┼─────────────┼───────────┤
│  Renderer   │   Physics   │    Audio    │   MQTT    │
│   (opt)     │    (opt)    │    (opt)    │   (opt)   │
└─────────────┴─────────────┴─────────────┴───────────┘

Full Runtime: All modules
Headless:     Parser + Compiler + State + Network + MQTT
Edge WASM:    Parser + Compiler + State + MQTT
```

### Dependency Graph

```
Priority 1 (WoT) ──┬── Priority 2 (MQTT)
                   │
                   └── Priority 6 (DTDL)

Priority 3 (Headless) ── Priority 4 (WASM) ── Priority 8 (Edge Deploy)

Priority 5 (URDF) ── Standalone

Priority 7 (Sync) ── Requires networking refactor
```

---

## Success Metrics

| Metric                   | Target         |
| ------------------------ | -------------- |
| Headless memory usage    | < 50MB         |
| WASM module size         | < 1MB          |
| MQTT message latency     | < 10ms         |
| WoT TD validation        | 100% compliant |
| URDF ROS 2 compatibility | Verified       |
| Edge deployment time     | < 30s          |

---

## Timeline

| Week | Priorities | Milestone             |
| ---- | ---------- | --------------------- |
| 1-2  | 1, 2       | WoT + MQTT protocols  |
| 2-3  | 3          | Headless runtime      |
| 3-4  | 4, 5       | WASM + URDF export    |
| 4-5  | 6, 7       | DTDL + Sync protocol  |
| 5-6  | 8          | Edge deployment tools |

---

## References

- [W3C WoT Thing Description 2.0](https://www.w3.org/TR/wot-thing-description11/)
- [Azure DTDL v3](https://github.com/Azure/opendigitaltwins-dtdl)
- [WasmEdge Runtime](https://wasmedge.org/)
- [URDF Specification](http://wiki.ros.org/urdf)
- [MQTT v5 Specification](https://docs.oasis-open.org/mqtt/mqtt/v5.0/)

---

**Document Version:** 1.0.0
**Created:** 2026-02-05
**Based on:** Sprint 2 uAA2++ Ecosystem Research
