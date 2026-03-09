# WoT (W3C Web of Things)

Compile HoloScript compositions to **W3C Web of Things Thing Descriptions** — the open standard for IoT device interoperability.

## Overview

The WoT compiler generates Thing Description (TD) JSON-LD documents conforming to the W3C WoT standard. Compatible with all WoT-compliant platforms and runtimes.

## Quick Start

```bash
holo compile --target wot scene.holo --out thing-description.jsonld
```

## HoloScript IoT → WoT Mapping

| HoloScript      | WoT                      |
| --------------- | ------------------------ |
| `@iot_sensor`   | WoT Property (read-only) |
| `@actuator`     | WoT Action               |
| `@digital_twin` | WoT Thing with shadow    |
| `@telemetry`    | WoT Event                |
| `@mqtt_bridge`  | WoT Form (MQTT binding)  |

## Example

```holo
composition "SmartLight" {
  object "Light" {
    @iot_sensor
    @actuator
    @digital_twin

    properties {
      brightness: number  // 0-100
      color: string       // hex color
      on: boolean
    }

    actions {
      turn_on() {}
      turn_off() {}
      set_brightness(level: number) {}
    }
  }
}
```

Compiles to:

```json
{
  "@context": "https://www.w3.org/2019/wot/td/v1",
  "@type": "Thing",
  "id": "urn:holoscript:SmartLight:Light",
  "title": "Light",
  "properties": {
    "brightness": { "type": "number", "minimum": 0, "maximum": 100 },
    "color": { "type": "string" },
    "on": { "type": "boolean" }
  },
  "actions": {
    "turn_on": {},
    "turn_off": {},
    "set_brightness": {
      "input": { "type": "number" }
    }
  }
}
```

## Supported Bindings

- HTTP/REST
- MQTT
- CoAP
- WebSocket

## See Also

- [DTDL (Azure IoT)](/compilers/iot/dtdl) — Azure Digital Twins format
- [IoT Traits](/traits/iot) — All IoT/sensor traits
