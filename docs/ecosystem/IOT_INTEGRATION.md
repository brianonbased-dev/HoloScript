# HoloScript IoT Integration Guide

> Spatial computing meets the connected world

## Overview

HoloScript's reactive state system and trait composition model map naturally to IoT event-driven architectures. This guide explains how to use HoloScript for IoT spatial triggers, sensor integration, and smart environment control.

## Why HoloScript for IoT?

| HoloScript Feature  | IoT Application              |
| ------------------- | ---------------------------- |
| `@state { }` blocks | Device state management      |
| `@reactive`         | Real-time sensor updates     |
| `@observable`       | Publish/subscribe patterns   |
| Trait composition   | Device capability modeling   |
| Scene graph         | Spatial relationship mapping |

## Core Concepts

### 1. Sensor Traits

```holoscript
// Define a motion sensor
sensor#livingRoomMotion {
  type: "motion"
  location: [5, 0, 3]

  @sensor(
    protocol: "zigbee",
    update_rate: 100,  // ms
    threshold: 0.1
  )

  @state {
    detected: false
    lastTriggered: null
  }

  @on_trigger {
    emit("motion_detected", { room: "living_room" })
  }
}
```

### 2. Spatial Triggers

```holoscript
// Define a spatial zone that triggers automation
zone#entryway {
  bounds: [[0,0,0], [3,3,2]]

  @trigger(
    condition: "presence",
    delay: 500  // debounce ms
  )

  @on_enter {
    call("lights.turnOn", { zone: "entry" })
    call("hvac.setMode", { mode: "home" })
  }

  @on_exit(delay: 300000) {  // 5 min delay
    call("lights.turnOff", { zone: "entry" })
  }
}
```

### 3. Device Digital Twins

```holoscript
// Model a smart thermostat as a digital twin
twin#thermostat {
  model: "nest-learning-3"

  @digital_twin(
    sync_interval: 5000,
    protocol: "mqtt",
    topic: "home/hvac/thermostat"
  )

  @state {
    currentTemp: 72
    targetTemp: 70
    mode: "auto"
    humidity: 45
  }

  @data_binding(source: "api.nest.com/device/123")
}
```

## Protocol Bindings

### MQTT Integration

```holoscript
@mqtt_source(
  broker: "mqtt://localhost:1883",
  topic: "sensors/+/data",
  qos: 1
)

@mqtt_sink(
  broker: "mqtt://localhost:1883",
  topic: "actuators/{device}/command",
  retain: true
)
```

### Zigbee/Z-Wave Bridge

```holoscript
@zigbee_bridge(
  coordinator: "/dev/ttyUSB0",
  network_key: env("ZIGBEE_KEY")
)
```

### W3C Web of Things (WoT)

HoloScript can generate W3C Thing Descriptions automatically:

```holoscript
sensor#temperature {
  @wot_thing(
    title: "Living Room Temperature",
    security: "bearer_token"
  )

  // Generates TD with affordances
}
```

Generated Thing Description:

```json
{
  "@context": "https://www.w3.org/2022/wot/td/v1.1",
  "title": "Living Room Temperature",
  "properties": {
    "temperature": {
      "type": "number",
      "unit": "celsius",
      "observable": true
    }
  }
}
```

## Example: Smart Home Scene

```holoscript
composition SmartHome {
  environment {
    type: "indoor"
    scale: "building"
  }

  // Sensors
  objects {
    sensor#motionFront { ... }
    sensor#motionBack { ... }
    sensor#doorContact { ... }
    sensor#tempLiving { ... }
  }

  // Spatial zones
  zones {
    zone#entry { ... }
    zone#livingArea { ... }
    zone#bedroom { ... }
  }

  // Automation logic
  logic {
    rule#nightMode {
      trigger: time("22:00")
      actions: [
        { call: "lights.setScene", args: { scene: "night" } },
        { call: "thermostat.setTemp", args: { temp: 68 } }
      ]
    }

    rule#awayMode {
      trigger: allZonesEmpty(duration: 1800000)
      actions: [
        { call: "security.arm", args: { mode: "away" } },
        { call: "hvac.setMode", args: { mode: "eco" } }
      ]
    }
  }
}
```

## Architecture Patterns

### Edge Processing

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Sensors   │────▶│  HoloScript │────▶│   Actions   │
│  (Zigbee)   │     │  Runtime    │     │  (Lights)   │
└─────────────┘     │  (Edge)     │     └─────────────┘
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │    Cloud    │
                    │  Dashboard  │
                    └─────────────┘
```

### Headless Runtime

For IoT deployments, use the headless runtime profile:

```bash
holoscript run --headless --config iot.yaml scene.holo
```

## Best Practices

1. **Debounce sensors** - Avoid event storms with threshold/delay configs
2. **Use spatial zones** - Group devices logically, not just by room
3. **State persistence** - Enable `@state(persistent: true)` for critical state
4. **Graceful degradation** - Define fallback behaviors for offline devices
5. **Security** - Never hardcode credentials, use `env()` for secrets

## Next Steps

- [Digital Twins Guide](./DIGITAL_TWINS.md) - Full twin synchronization
- [Cross-Reality Patterns](./CROSS_REALITY.md) - AR overlays for IoT
- [WoT Integration](./WOT_INTEGRATION.md) - W3C standard compliance

## References

- [W3C Web of Things Thing Description 2.0](https://www.w3.org/TR/wot-thing-description11/)
- [Matter Protocol](https://csa-iot.org/all-solutions/matter/)
- [MQTT v5 Specification](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html)
