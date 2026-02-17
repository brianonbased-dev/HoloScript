# AI Autonomous Traits

> Part of the HoloScript Traits reference. Browse: [AI & Behavior](/traits/ai-behavior) · [IoT](/traits/iot) · [All Traits](/traits/)

## AI/Autonomous Traits

### @mitosis

**Category:** AI/Sovereignty
**Tags:** mitosis, agent, spawn, delegation

Enables an object or agent to recursively spawn sub-compositions via specialized sub-agents.

```hsplus
object MasterBuilder @mitosis(strategy: "collaborative") {
  onInteraction: {
    mitotic_spawn "lighting" "Create a volumetric scene for this room"
  }
}
```

| Config     | Type   | Default         | Description                            |
| ---------- | ------ | --------------- | -------------------------------------- |
| `strategy` | string | 'collaborative' | 'collaborative', 'autonomous', 'gated' |
| `max_subs` | number | 5               | Maximum allowable sub-compositions     |

**Events:**

- `mitosis_spawned` - Sub-composition successfully loaded
- `mitosis_failed` - Delegation failure
- `mitosis_synced` - Child state merged with parent

```hsplus
object SensorDisplay @mqtt_source {
  broker: 'wss://mqtt.example.com'
  topic: 'sensors/temperature'
}
```

| Config     | Type   | Default | Description         |
| ---------- | ------ | ------- | ------------------- |
| `broker`   | string | ''      | MQTT broker URL     |
| `topic`    | string | ''      | Subscribe topic     |
| `qos`      | number | 0       | QoS level (0, 1, 2) |
| `username` | string | ''      | Auth username       |
| `password` | string | ''      | Auth password       |

**Events:**

- `mqtt_connected` - Connected to broker
- `mqtt_message` - Message received
- `mqtt_disconnected` - Disconnected

---

### @mqtt_sink

MQTT message publishing.

```hsplus
object ControlPanel @mqtt_sink {
  broker: 'wss://mqtt.example.com'
  topic: 'controls/light'
}
```

| Config   | Type    | Default | Description     |
| -------- | ------- | ------- | --------------- |
| `broker` | string  | ''      | MQTT broker URL |
| `topic`  | string  | ''      | Publish topic   |
| `qos`    | number  | 0       | QoS level       |
| `retain` | boolean | false   | Retain messages |

---

### @wot_thing

Web of Things thing description.

```hsplus
object SmartLight @wot_thing {
  thing_id: 'urn:dev:wot:light-001'
  actions: ['toggle', 'dim']
  properties: ['brightness', 'color']
}
```

| Config       | Type   | Default | Description           |
| ------------ | ------ | ------- | --------------------- |
| `thing_id`   | string | ''      | Thing identifier      |
| `td_url`     | string | ''      | Thing Description URL |
| `actions`    | Array  | []      | Available actions     |
| `properties` | Array  | []      | Observable properties |

---

### @digital_twin

Digital twin synchronization.

```hsplus
object FactoryMachine @digital_twin {
  twin_id: 'machine-001'
  sync_interval: 1000
}
```

| Config          | Type    | Default | Description     |
| --------------- | ------- | ------- | --------------- |
| `twin_id`       | string  | ''      | Twin identifier |
| `sync_interval` | number  | 1000    | Sync rate (ms)  |
| `bidirectional` | boolean | false   | Two-way sync    |

**Events:**

- `twin_sync` - State synchronized
- `twin_diverge` - State diverged

---


## See Also
- [AI & Behavior Traits](/traits/ai-behavior)
- [MCP Server Integration](/integrations/)
- [API Reference](/api/)
