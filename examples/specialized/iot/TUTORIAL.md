# HoloScript IoT Digital Twin Tutorial

Learn how to model IoT devices with HoloScript and export to Azure Digital Twins (DTDL).

## Key Concepts

### 1. IoT Device Definition

```holoscript
device#conveyor_1 @iot_device @actuator {
  name: "Receiving Conveyor Belt"
  location: { zone: "receiving", floor: 1 }

  specs {
    max_speed: 2.0  // m/s
    belt_length: 5.0  // meters
    motor_power: 1.5  // kW
  }
}
```

**Traits**: `@iot_device` (cloud connectivity), `@actuator` (controllable device)

### 2. DTDL Interface

```holoscript
@dtdl_interface {
  id: "dtmi:factory:conveyor;1"
  displayName: "Receiving Conveyor Belt"
  description: "Industrial conveyor belt with speed control"
}
```

**DTMI Format**: `dtmi:[namespace]:[type];[version]`

### 3. Telemetry (Sensor Data)

```holoscript
telemetry {
  speed: {
    type: "double",
    unit: "metrePerSecond",
    description: "Current belt speed"
  }

  vibration: {
    type: "double",
    unit: "metersPerSecondSquared",
    description: "Vibration acceleration"
  }

  temperature: {
    type: "double",
    unit: "degreeCelsius",
    description: "Motor temperature"
  }

  items_processed: {
    type: "integer",
    description: "Total items counted"
  }
}
```

**DTDL Types**: `double`, `integer`, `string`, `boolean`, `date`, `time`, `dateTime`

**Standard Units**: Use DTDL v2 unit names exactly:
- Temperature: `degreeCelsius`, `degreeFahrenheit`, `kelvin`
- Speed: `metrePerSecond`, `kilometrePerHour`
- Acceleration: `metersPerSecondSquared`
- Power: `watt`, `kilowatt`

### 4. Properties (Device State)

```holoscript
properties {
  motor_status: {
    type: "string",
    writable: false,  // Read-only
    description: "Motor operational status"
  }

  target_speed: {
    type: "double",
    writable: true,  // Can be set remotely
    description: "Desired belt speed"
  }

  maintenance_mode: {
    type: "boolean",
    writable: true,
    description: "Enable/disable maintenance mode"
  }
}
```

**Writable vs Read-Only**:
- `writable: false` → Telemetry or computed state
- `writable: true` → Configuration that can be changed remotely

### 5. Commands (Device Actions)

```holoscript
commands {
  start: {
    description: "Start conveyor belt"
    request_schema: {
      speed: "double"  // Parameter
    }

    on_execute(params) {
      motor_status = "running"
      target_speed = params.speed
      send_telemetry: { speed: params.speed }
    }
  }

  stop: {
    description: "Stop conveyor belt"

    on_execute() {
      motor_status = "stopped"
      target_speed = 0.0
      send_telemetry: { speed: 0.0 }
    }
  }

  emergency_stop: {
    description: "Emergency shutdown"

    on_execute() {
      motor_status = "emergency_stopped"
      target_speed = 0.0

      send_alert: {
        severity: "critical"
        message: "Emergency stop activated"
      }
    }
  }

  reset: {
    description: "Reset after maintenance"

    on_execute() {
      motor_status = "idle"
      items_processed = 0
      last_maintenance_date = now()
    }
  }
}
```

**Command Flow**: Cloud → IoT Hub → Device → Execution → Telemetry update

### 6. Relationships (Device Connections)

```holoscript
device#conveyor_1 {
  relationships {
    feeds_to: "robot_1"  // Conveyor feeds robot
    monitored_by: "sensor_1"  // Sensor monitors conveyor
    located_in: "receiving_zone"  // Physical location
  }
}
```

**Relationship Types**:
- `feeds_to` → Material flow
- `monitored_by` → Sensor coverage
- `located_in` → Physical hierarchy
- `controlled_by` → Control system

### 7. Telemetry Simulation

```holoscript
telemetry_simulator {
  interval: 1000  // ms (1 Hz)

  on_tick {
    // Realistic vibration simulation
    base_vibration = 0.5 + random(0, 0.3)

    if (motor_status == "running") {
      // Higher vibration when running
      vibration = base_vibration + (target_speed * 0.4)
    } else {
      vibration = base_vibration
    }

    // Temperature rises with speed
    temperature = 25 + (target_speed * 10) + random(-2, 2)

    send_telemetry: {
      speed: target_speed,
      vibration: vibration,
      temperature: temperature
    }
  }
}
```

**Simulation Modes**:
- `realistic` → Physics-based values
- `replay` → Historical data playback
- `anomaly` → Inject faults for testing

### 8. Predictive Maintenance Rules

```holoscript
maintenance_rule#vibration_monitor {
  description: "Detect excessive vibration"
  condition: conveyor_1.vibration > 2.5  // m/s²

  on_trigger {
    create_work_order: {
      device: "conveyor_1"
      priority: "high"
      category: "mechanical"
      description: "Excessive vibration detected - check bearings"
      schedule: "next_24_hours"
    }

    notify_operator: {
      channel: "sms"
      message: "Conveyor #1: High vibration ({{ vibration }} m/s²)"
      severity: "warning"
    }

    // Optional: Auto-adjust speed to reduce vibration
    if (conveyor_1.vibration > 3.0) {
      send_command: {
        device: "conveyor_1"
        command: "reduce_speed"
        params: { target_speed: conveyor_1.target_speed * 0.7 }
      }
    }
  }
}

maintenance_rule#temperature_warning {
  condition: conveyor_1.temperature > 70  // °C

  on_trigger {
    notify_operator: {
      message: "Conveyor #1: High temperature"
      severity: "warning"
    }

    // Auto-cool down
    if (conveyor_1.temperature > 80) {
      send_command: {
        device: "conveyor_1"
        command: "emergency_stop"
      }
    }
  }
}

maintenance_rule#usage_counter {
  condition: conveyor_1.items_processed > 10000

  on_trigger {
    create_work_order: {
      priority: "medium"
      category: "preventive"
      description: "Scheduled maintenance - 10k items processed"
      schedule: "next_week"
    }
  }
}
```

**Rule Patterns**:
- **Threshold Alerts**: Simple value checks
- **Trend Analysis**: Rate of change detection
- **Predictive**: ML model predictions
- **Usage-Based**: Counters and timers

### 9. Cloud Integration

```holoscript
cloud_integration#azure_iot {
  platform: "azure"

  connection {
    iot_hub: "smart-factory-hub.azure-devices.net"
    digital_twins_instance: "smart-factory-dt.api.wus2.digitaltwins.azure.net"
  }

  authentication {
    method: "sas_token"  // or "x509_certificate"
  }

  data_routing {
    telemetry_endpoint: "telemetry-route"
    alerts_endpoint: "alerts-route"
    work_orders_endpoint: "maintenance-route"
  }

  retention {
    telemetry_days: 90
    alerts_days: 365
    work_orders_days: 1095  // 3 years
  }
}
```

**Supported Platforms**:
- Azure Digital Twins + IoT Hub
- AWS IoT TwinMaker + IoT Core
- Google Cloud IoT Core
- ThingWorx, PTC Thingworx
- Generic MQTT brokers

### 10. DTDL Export

```holoscript
export#dtdl_export @azure_compatible {
  target: "dtdl"
  output_directory: "./build/dtdl/"

  options {
    dtdl_version: "v2"  // or "v3"
    include_relationships: true
    generate_sample_data: true
    validation: "strict"
  }
}
```

**Generates**:
```
build/dtdl/
├── dtmi_factory_conveyor-1.json
├── dtmi_factory_robot-1.json
├── dtmi_factory_sensor-1.json
└── sample_telemetry.json
```

**DTDL JSON Output Example**:
```json
{
  "@context": "dtmi:dtdl:context;2",
  "@id": "dtmi:factory:conveyor;1",
  "@type": "Interface",
  "displayName": "Receiving Conveyor Belt",
  "contents": [
    {
      "@type": "Telemetry",
      "name": "speed",
      "schema": "double",
      "unit": "metrePerSecond"
    },
    {
      "@type": "Property",
      "name": "motor_status",
      "schema": "string",
      "writable": false
    },
    {
      "@type": "Command",
      "name": "start",
      "request": {
        "name": "speed",
        "schema": "double"
      }
    }
  ]
}
```

## Workflow

1. **Define Devices** - IoT devices with telemetry, properties, commands
2. **Add Relationships** - Connect devices in factory topology
3. **Configure Rules** - Predictive maintenance triggers
4. **Export DTDL** - Compile to Azure Digital Twins
5. **Deploy Cloud** - Upload to Azure/AWS/GCP
6. **Stream Telemetry** - Connect real devices or simulators
7. **Visualize** - 3D factory twin (Unity/Unreal)

## Best Practices

### Telemetry Design
- **Sample Rate**: Match physics (vibration: 10 Hz, temperature: 0.1 Hz)
- **Units**: Always use DTDL standard units
- **Precision**: `double` for measurements, `integer` for counts
- **Batching**: Group related telemetry for efficiency

### Command Design
- **Idempotent**: Safe to call multiple times
- **Timeout**: Include execution timeout
- **Validation**: Check parameters before execution
- **Feedback**: Send telemetry update after command

### Rule Design
- **Hysteresis**: Avoid alert spam (use rising/falling thresholds)
- **Debounce**: Wait for sustained condition (5+ seconds)
- **Escalation**: Low → Medium → High → Critical
- **Auto-Recovery**: Clear alerts when condition resolves

### Security
- **Authentication**: Use X.509 certificates (not SAS tokens) in production
- **Encryption**: TLS 1.2+ for all connections
- **Authorization**: Role-based access control (RBAC)
- **Secrets**: Store connection strings in Key Vault

## Next Steps

- Add computer vision (camera telemetry)
- Integrate SCADA systems (OPC UA)
- Build mobile operator dashboard
- Add ML anomaly detection
- Multi-factory federation

---

**IoT made declarative.** Define once, deploy to Azure/AWS/GCP Digital Twins.
