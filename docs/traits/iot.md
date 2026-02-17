# IoT & Integration Traits

> Part of the HoloScript Traits reference. Browse: [Social](/traits/social) · [AI Autonomous](/traits/ai-autonomous) · [All Traits](/traits/)

## IoT/Integration Traits

### @twin_sync

**Category:** IoT/Industrial
**Tags:** iot, twin, synchronization, sensors, industry

Bidirectional synchronization between HoloScript objects and real-world industrial sensors or digital twins.

```hsplus
object IndustrialArm @twin_sync(topic: "factory/cell_01/arm", interval: 100) {
  geometry: "models/arm.glb"
}
```

| Config     | Type   | Default | Description                             |
| ---------- | ------ | ------- | --------------------------------------- |
| `topic`    | string | null    | MQTT/REST endpoint or topic name        |
| `interval` | number | 100     | Sync frequency in milliseconds          |
| `mode`     | string | 'push'  | 'push' (real → virtual), 'pull', 'both' |
| `protocol` | string | 'mqtt'  | 'mqtt', 'opc-ua', 'rest'                |

**State:**

- `lastUpdate` - Timestamp of last sync
- `sensorData` - Raw data from the twin
- `isConnected` - Connection status

**Events:**

- `twin_connect` - Connection established
- `twin_data` - New data received
- `twin_disconnect` - Connection lost
- `twin_error` - Synchronization error

### @twin_actuator

**Category:** IoT/Industrial
**Tags:** actuator, control, physical, bridge

Triggers physical actions from virtual interactions.

```hsplus
object FactorySwitch @twin_actuator(actuator_id: "arm_01_reset") {
  geometry: "models/switch.glb"
  onInteraction: {
    emit "twin_trigger" { action: "reset" }
  }
}
```

| Config        | Type   | Default | Description                        |
| ------------- | ------ | ------- | ---------------------------------- |
| `actuator_id` | string | null    | Unique ID of the physical hardware |
| `protocol`    | string | 'mqtt'  | 'mqtt', 'rest'                     |

**Events:**

- `twin_trigger` - Emitted to target physical hardware
- `twin_actuated` - Confirmed completion from physical hardware

### @mqtt_source

MQTT message subscription.

## See Also
- [Compilers: DTDL](/compilers/iot/dtdl)
- [Compilers: WoT](/compilers/iot/wot)
- [API Reference](/api/)
