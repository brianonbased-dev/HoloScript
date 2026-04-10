# HoloScript Digital Twins Guide

> Real-time spatial synchronization between physical and virtual

## Overview

HoloScript's reactive state system provides the foundation for digital twins - live virtual representations of physical assets. This guide covers twin synchronization, data binding, and industrial applications.

## Why HoloScript for Digital Twins?

| HoloScript Feature    | Digital Twin Application  |
| --------------------- | ------------------------- |
| Scene graph           | Asset hierarchy modeling  |
| `@state` reactive     | Real-time sync            |
| `@digital_twin` trait | Twin lifecycle management |
| `@data_binding`       | External data connection  |
| Templates             | Asset type definitions    |

## Core Concepts

### 1. Twin Definition

```holoscript
// Define a digital twin of a manufacturing machine
twin#cnc_machine_001 {
  asset_id: "CNC-001"
  model: "assets/haas_vf2.gltf"
  position: [10, 0, 5]

  @digital_twin(
    sync_mode: "realtime",
    sync_interval: 100,  // ms
    conflict_resolution: "physical_wins"
  )

  @state {
    // Operational state
    status: "running"
    currentProgram: "part_a_v2.nc"
    progress: 0.45

    // Sensor data
    spindleRpm: 8500
    feedRate: 200
    toolNumber: 3

    // Alerts
    alerts: []
  }

  @data_binding(
    source: "opcua://192.168.1.100:4840",
    mappings: {
      "ns=2;s=Spindle.RPM": "state.spindleRpm",
      "ns=2;s=Feed.Rate": "state.feedRate",
      "ns=2;s=Status": "state.status"
    }
  )
}
```

### 2. Hierarchical Twins

```holoscript
composition FactoryFloor {
  environment {
    type: "indoor"
    scale: "industrial"
  }

  // Factory is a twin of the physical building
  twin#building {
    @digital_twin(level: "aggregate")

    children: [
      twin#productionLine1,
      twin#productionLine2,
      twin#warehouse
    ]
  }

  // Production line aggregates machine twins
  twin#productionLine1 {
    @digital_twin(level: "aggregate")

    @computed {
      oee: calculateOEE(children)
      throughput: sum(children, "output")
    }

    children: [
      twin#cnc_001,
      twin#cnc_002,
      twin#robot_001
    ]
  }
}
```

### 3. Historical Data & Replay

```holoscript
twin#asset {
  @time_series(
    retention: "30d",
    resolution: "1s",
    fields: ["state.temperature", "state.vibration"]
  )

  @replay_mode(
    enabled: true,
    controls: ["play", "pause", "seek", "speed"]
  )
}
```

## Data Binding Protocols

### OPC UA

```holoscript
@data_binding(
  protocol: "opcua",
  source: "opc.tcp://server:4840",
  security: "SignAndEncrypt",
  auth: { type: "certificate", cert: env("OPCUA_CERT") }
)
```

### MQTT/Sparkplug B

```holoscript
@data_binding(
  protocol: "sparkplug_b",
  broker: "mqtt://broker:1883",
  group_id: "Factory1",
  edge_node_id: "Line1"
)
```

### Azure Digital Twins (DTDL)

```holoscript
@dtdl_model(
  id: "dtmi:com:factory:CNCMachine;1",
  extends: "dtmi:com:factory:Machine;1"
)

// Generates DTDL model automatically
```

Generated DTDL:

```json
{
  "@context": "dtmi:dtdl:context;3",
  "@id": "dtmi:com:factory:CNCMachine;1",
  "@type": "Interface",
  "extends": "dtmi:com:factory:Machine;1",
  "contents": [
    {
      "@type": "Property",
      "name": "spindleRpm",
      "schema": "double"
    },
    {
      "@type": "Telemetry",
      "name": "vibration",
      "schema": "double"
    }
  ]
}
```

## Example: Factory Digital Twin

```holoscript
composition SmartFactory {
  environment {
    type: "industrial"
    floor_plan: "assets/factory_floor.svg"
  }

  // Define machine template
  template CNCMachine {
    model: "assets/cnc_generic.gltf"

    @digital_twin(sync_mode: "realtime")
    @physics(collision: true)

    @state {
      status: "idle"
      spindleRpm: 0
      alerts: []
    }

    @alert(
      condition: state.spindleRpm > 10000,
      severity: "warning",
      message: "Spindle RPM exceeds threshold"
    )

    @heatmap_3d(
      field: "state.temperature",
      colormap: "thermal",
      range: [20, 100]
    )
  }

  objects {
    // Instantiate twins from template
    cnc#machine_001 extends CNCMachine {
      position: [5, 0, 2]
      @data_binding(source: "opcua://10.0.1.101:4840")
    }

    cnc#machine_002 extends CNCMachine {
      position: [5, 0, 6]
      @data_binding(source: "opcua://10.0.1.102:4840")
    }

    // Conveyor system
    conveyor#line1 {
      path: [[0,0,0], [20,0,0]]

      @digital_twin
      @state {
        speed: 0.5  // m/s
        itemsOnBelt: []
      }
    }

    // Environmental sensors
    sensor#temp_zone1 {
      position: [10, 3, 4]
      @data_binding(source: "mqtt://sensors/temp/zone1")
    }
  }

  // KPI dashboard data
  logic {
    @computed {
      factoryOEE: calculateOEE(objects.filter(o => o.template == "CNCMachine"))
      totalOutput: sum(objects, "state.partsProduced")
      activeAlerts: objects.flatMap(o => o.state.alerts)
    }
  }

  ui {
    dashboard#main {
      @panel(title: "Factory KPIs") {
        metric(label: "OEE", value: logic.factoryOEE, format: "percent")
        metric(label: "Output", value: logic.totalOutput, format: "number")
        alertList(alerts: logic.activeAlerts)
      }
    }
  }
}
```

## Visualization Patterns

### 3D Heatmaps

```holoscript
@heatmap_3d(
  field: "temperature",
  colormap: "thermal",  // or "viridis", "plasma"
  range: [0, 100],
  interpolation: "bilinear"
)
```

### Flow Visualization

```holoscript
@flow_visualization(
  source: "sensor.flow_rate",
  particle_count: 1000,
  color_by: "velocity"
)
```

### Time-Lapse Animation

```holoscript
@time_lapse(
  field: "state.position",
  trail_length: 100,
  speed: 10  // 10x realtime
)
```

## Sync Patterns

### Optimistic Updates

```holoscript
@digital_twin(
  sync_mode: "optimistic",
  rollback_on_conflict: true
)
```

### Event Sourcing

```holoscript
@digital_twin(
  sync_mode: "event_sourced",
  event_store: "kafka://events:9092"
)
```

### Batch Updates

```holoscript
@digital_twin(
  sync_mode: "batch",
  batch_interval: 5000,  // 5 seconds
  batch_size: 100
)
```

## Best Practices

1. **Define clear sync boundaries** - Not everything needs real-time
2. **Use templates for asset types** - Maintain consistency
3. **Implement alerts proactively** - Catch issues before failures
4. **Version your DTDL models** - Track schema evolution
5. **Test with historical data** - Replay past incidents

## Next Steps

- [IoT Integration](./IOT_INTEGRATION.md) - Sensor data sources
- [Robotics Guide](./ROBOTICS_GUIDE.md) - Robot digital twins
- [Cross-Reality Patterns](./CROSS_REALITY.md) - AR twin overlays

## References

- [Azure Digital Twins](https://docs.microsoft.com/azure/digital-twins/)
- [DTDL v3 Specification](https://github.com/Azure/opendigitaltwins-dtdl)
- [OPC UA Specification](https://opcfoundation.org/developer-tools/documents/)
- [Siemens Digital Twin](https://www.siemens.com/digital-twin)
