# IoT Digital Twin - Smart Factory

A comprehensive IoT digital twin example demonstrating Azure Digital Twins (DTDL) integration for industrial monitoring and predictive maintenance.

## Overview

This example shows how to model a smart factory with multiple IoT devices that stream telemetry, respond to commands, and integrate with cloud platforms like Azure Digital Twins.

**Use Cases:**
- Industrial IoT monitoring and analytics
- Predictive maintenance systems
- Real-time factory visualization
- Device fleet management
- Cloud-based digital twin solutions

## Features

### IoT Devices
- **Conveyor Belt**: Speed monitoring, vibration detection, start/stop control
- **Welding Robot**: Temperature sensing, weld counting, position tracking
- **Environmental Sensors**: Temperature, humidity, air quality monitoring
- **Quality Control Camera**: Defect detection, image capture

### Telemetry Streaming
```holoscript
telemetry {
  speed: { type: "double", unit: "metresPerSecond" }
  vibration: { type: "double", unit: "metersPerSecondSquared" }
  temperature: { type: "double", unit: "degreeCelsius" }
}
```

### Device Commands
```holoscript
commands {
  start: {
    request_schema: { speed: "double" }
    on_execute(params) {
      motor_status = "running"
      target_speed = params.speed
    }
  }

  emergency_stop: {
    on_execute() {
      motor_status = "stopped"
      send_alert: "Emergency stop activated"
    }
  }
}
```

### Predictive Maintenance
```holoscript
maintenance_rule#vibration_monitor {
  condition: conveyor_1.vibration > 2.5

  on_trigger {
    create_work_order: {
      priority: "high"
      description: "Excessive vibration detected"
      schedule_inspection: "next_24_hours"
    }

    notify_operator: {
      message: "Conveyor #1: High vibration"
      severity: "warning"
    }
  }
}
```

## Quick Start

### 1. Compile to DTDL

```bash
holoscript compile smart-factory-twin.holo --target dtdl --output ./build/dtdl/
```

**Output:**
```
build/dtdl/
├── conveyor.dtdl.json
├── welding_robot.dtdl.json
├── env_sensor.dtdl.json
├── quality_camera.dtdl.json
└── factory_model.json
```

### 2. Deploy to Azure Digital Twins

```bash
# Create Azure Digital Twins instance
az dt create --name smart-factory-dt --resource-group my-rg

# Upload models
az dt model create --dt-name smart-factory-dt --models build/dtdl/*.dtdl.json

# Create twins
az dt twin create --dt-name smart-factory-dt --dtmi "dtmi:factory:conveyor;1" --twin-id conveyor-1
az dt twin create --dt-name smart-factory-dt --dtmi "dtmi:factory:robot;1" --twin-id robot-1
```

### 3. Stream Telemetry

**Option A: IoT Hub Integration**
```javascript
const { IoTHubClient } = require('@azure/iot-hub');

const telemetry = {
  speed: 1.2,
  vibration: 0.8,
  temperature: 45.5
};

await iotClient.sendTelemetry('conveyor-1', telemetry);
```

**Option B: Direct Azure DT API**
```bash
# Update telemetry via REST API
curl -X PATCH https://smart-factory-dt.api.wus2.digitaltwins.azure.net/digitaltwins/conveyor-1 \
  -H "Authorization: Bearer $TOKEN" \
  -d '[
    {"op": "replace", "path": "/speed", "value": 1.2},
    {"op": "replace", "path": "/vibration", "value": 0.8}
  ]'
```

### 4. Visualize with 3D

Compile the same .holo file to Unity for real-time 3D visualization:

```bash
holoscript compile smart-factory-twin.holo --target unity --output ./build/unity/
```

Import to Unity and connect to Azure Digital Twins for live data visualization.

## Azure Digital Twins Integration

### DTDL Interface Example

HoloScript automatically generates standard DTDL v2 interfaces:

```json
{
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

### Relationships

HoloScript defines device relationships that map to Azure DT relationships:

```holoscript
device#conveyor_1 {
  relationships {
    feeds_to: "robot_1"
    monitored_by: "sensor_1"
  }
}
```

Compiles to:
```bash
az dt twin relationship create \
  --dt-name smart-factory-dt \
  --relationship feeds_to \
  --twin-id conveyor-1 \
  --target robot-1
```

## Predictive Maintenance Workflow

1. **Telemetry Collection**: Devices stream vibration, temperature, usage data
2. **Rule Evaluation**: Maintenance rules check thresholds in real-time
3. **Alert Generation**: Anomalies trigger work orders and notifications
4. **Operator Response**: Technicians receive alerts via mobile/desktop
5. **Preventive Action**: Issues resolved before equipment failure

### Example Alert Flow

```
Conveyor vibration = 3.2 m/s² (threshold: 2.5)
  ↓
Maintenance rule triggers
  ↓
Work order created (Priority: High)
  ↓
Operator notified (SMS/Email/Dashboard)
  ↓
Inspection scheduled within 24 hours
  ↓
Issue resolved, telemetry returns to normal
```

## Cloud Platform Support

### Azure Digital Twins
- ✅ Full DTDL v2/v3 support
- ✅ IoT Hub integration
- ✅ Time Series Insights
- ✅ ADX for analytics

### AWS IoT TwinMaker
- ✅ Compatible via DTDL → TwinMaker conversion
- ✅ S3 data storage
- ✅ Grafana dashboards

### Google Cloud IoT
- ✅ Cloud IoT Core integration
- ✅ BigQuery analytics
- ✅ Looker visualization

## Real-Time Visualization

The same HoloScript file compiles to Unity/Unreal for 3D visualization:

**Features:**
- Live telemetry display on 3D factory model
- Color-coded device status (green/yellow/red)
- Historical trend charts
- Predictive maintenance alerts
- VR walkthrough mode

## Performance & Scalability

### Telemetry Rates
- **Conveyor Belt**: 1 Hz (1 message/sec)
- **Welding Robot**: 10 Hz (10 messages/sec)
- **Environmental Sensors**: 0.1 Hz (1 message/10 sec)
- **Quality Camera**: Event-driven (on defect detection)

### Scaling
- Single factory: 10-50 devices
- Multi-factory: 1,000+ devices
- Enterprise: 100,000+ devices (Azure DT supports millions)

## Troubleshooting

### DTDL Compilation Errors
- Ensure device IDs are unique
- Check telemetry schema types match DTDL v2 spec
- Verify unit names are DTDL-compliant (e.g., `degreeCelsius`, not `celsius`)

### Azure DT Connection Issues
- Verify Azure credentials: `az login`
- Check Azure DT instance exists: `az dt show --name smart-factory-dt`
- Ensure models uploaded: `az dt model list --dt-name smart-factory-dt`

### Telemetry Not Updating
- Check IoT Hub connection string
- Verify device twin exists in Azure DT
- Monitor Azure DT diagnostics logs

## Next Steps

1. **Add More Devices**: Expand to packaging, shipping zones
2. **Machine Learning**: Integrate Azure ML for anomaly detection
3. **Mobile Dashboard**: Build mobile app with Power BI integration
4. **Multi-Site**: Replicate model for multiple factories
5. **OPC UA Integration**: Connect to existing industrial automation systems

## Resources

- [Azure Digital Twins Documentation](https://learn.microsoft.com/en-us/azure/digital-twins/)
- [DTDL v2 Specification](https://github.com/Azure/opendigitaltwins-dtdl/blob/master/DTDL/v2/dtdlv2.md)
- [IoT Hub Documentation](https://learn.microsoft.com/en-us/azure/iot-hub/)
- [HoloScript DTDL Compiler](../../docs/compilers/DTDL.md)

---

**Ready to digitize your factory?** Compile to DTDL and deploy to Azure Digital Twins in minutes.
