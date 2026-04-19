# HoloScript Beyond VR — IoT, Digital Twins & Robotics

> **Date**: 2026-03-20 | **Source**: 8 existing example files, 3 industrial compilers, 253+ IoT/robotics traits

HoloScript is not a VR-only tool. The same `.holo` compositions that render in a headset compile to URDF for ROS 2 robots, DTDL for Azure Digital Twins, SDF for Gazebo simulation, and MQTT for IoT device networks. This document indexes the existing non-spatial examples and shows real compilation output.

## Existing Examples

| Example                      | Path                                                              | Lines | Vertical          | Compiles To        |
| ---------------------------- | ----------------------------------------------------------------- | ----- | ----------------- | ------------------ |
| **Smart Home IoT**           | `examples/domain-starters/iot/iot-starter.holo`                   | 357   | Consumer IoT      | R3F, Unity, OpenXR |
| **Smart Factory Twin**       | `examples/specialized/iot/smart-factory-twin.holo`                | 521   | Industrial        | DTDL, Azure IoT    |
| **Smart Building BIM**       | `examples/cross-domain/smart-building.holo`                       | 489   | Architecture+IoT  | R3F, Unity, WebGPU |
| **Robot Arm Simulation**     | `examples/specialized/robotics/robot-arm-simulation.holo`         | 617   | Robotics          | URDF, SDF, ROS 2   |
| **Robot Training Metaverse** | `examples/novel-use-cases/05-robot-training-metaverse.holo`       | —     | Sim-to-Real       | URDF, SDF, Unity   |
| **Industrial Safety**        | `examples/IndustrialExpansionPOC.holo`                            | 117   | Safety Monitoring | DTDL               |
| **Robotics Benchmark**       | `benchmarks/cross-compilation/compositions/15-robotics.holo`      | 86    | Robotics          | URDF, SDF, DTDL    |
| **Manufacturing Benchmark**  | `benchmarks/cross-compilation/compositions/06-manufacturing.holo` | 65    | Assembly Line     | URDF, SDF, DTDL    |

---

## Example 1: Smart Home IoT Dashboard

**File**: `examples/domain-starters/iot/iot-starter.holo` (357 lines)

12 connected devices, MQTT telemetry, energy monitoring — no headset required.

```holo
composition "IoT Starter" {
  metadata {
    category: 'iot'
    platforms: ['r3f', 'unity', 'openxr']
  }

  state HomeState {
    temperature: 21.5
    targetTemperature: 22.0
    humidity: 45
    energyUsage: 2.4              // kWh
    doorStatus: "closed"
    lightBrightness: 80
    motionDetected: false
    hvacMode: "auto"              // "heat" | "cool" | "auto" | "off"
    deviceCount: 12
  }

  template "SensorCard" {
    @sensor
    @billboard
    @anchor
    geometry: "plane"
  }

  object "Thermostat" {
    @sensor
    @actuator
    @telemetry_stream
    behavior "ThermostatControl" {
      protocol: "mqtt"
      topic: "home/climate/thermostat"
    }
  }

  system "MQTTBroker" {
    host: "mqtt://192.168.1.100:1883"
    topics: ["home/#"]
  }

  system "HomeAssistantBridge" {
    endpoint: "http://homeassistant.local:8123/api"
    token: "${HA_TOKEN}"
  }
}
```

**Use case**: Mount a tablet on the wall running the R3F compile target as a smart home dashboard. Or compile to Unity for a 3D building walkthrough showing live sensor data.

---

## Example 2: Smart Factory Digital Twin

**File**: `examples/specialized/iot/smart-factory-twin.holo` (521 lines)

48 connected devices, predictive maintenance, Azure Digital Twins export.

```holo
composition "Smart Factory" {
  metadata {
    category: 'industrial'
    platforms: ['dtdl', 'azure']
  }

  object "ConveyorLineA" {
    @digital_twin
    @collidable
    geometry: "cube"
    position: [-5, 0.5, 0]
    scale: [12, 0.3, 2]

    behavior "ConveyorBelt" {
      speed: 0.5              // m/s
      direction: [1, 0, 0]
      protocol: "opc-ua"
      endpointUrl: "opc.tcp://plc-line-a:4840"
    }
  }

  object "MotorA1" {
    @digital_twin
    @sensor
    position: [-8, 0.8, -1.2]
    behavior "MotorTwin" {
      ratedPower: 7500        // watts
      ratedRPM: 1450
      telemetry: {
        vibration: { unit: "mm/s", threshold: 4.5 }
        temperature: { unit: "°C", threshold: 85 }
        current: { unit: "A", threshold: 15.0 }
      }
    }
  }

  system "AzureDigitalTwins" {
    instanceUrl: "https://factory-dt.api.weu.digitaltwins.azure.net"
    modelId: "dtmi:factory:ConveyorLine;1"
  }

  system "PredictiveMaintenance" {
    model: "isolation_forest"
    features: ["vibration", "temperature", "current"]
    alertThreshold: 0.85
  }
}
```

**Compilation target**: `holoscript compile smart-factory-twin.holo --target dtdl` produces Azure DTDL JSON for import into Azure Digital Twins.

---

## Example 3: Robot Arm with ROS 2

**File**: `benchmarks/cross-compilation/compositions/15-robotics.holo` (86 lines)

6-DOF robot arm with revolute joints, physics simulation, ROS 2 bridge.

```holo
composition "Robotics Benchmark" {
  metadata {
    category: 'robotics'
    platforms: ['urdf', 'sdf', 'openxr', 'unity', 'unreal', 'dtdl']
  }

  environment {
    physics_engine: "ode"
    gravity: [0, 0, -9.81]
  }

  template "RevoluteJoint" {
    @rotatable
    geometry: "cylinder"
    behavior "RevoluteJoint" {
      axis: [0, 0, 1]
      lowerLimit: -3.14159
      upperLimit: 3.14159
      maxVelocity: 2.094
      maxTorque: 150.0
    }
  }

  spatial_group "RobotArm" {
    origin: [0, 0.2, 0]
    object "J1" using "RevoluteJoint" {
      behavior: { axis: [0, 1, 0], maxTorque: 150.0 }
    }
    object "UpperArm" {
      @physics
      geometry: "cube"
      position: [0, 0.2, 0]
      scale: [0.08, 0.4, 0.08]
      physics: { mass: 3.5 }
    }
  }

  system "ROS2Bridge" {
    nodeName: '/robot_benchmark'
    publishRate: 125
    topics: { jointStates: '/joint_states' }
  }
}
```

### Real URDF Output (from benchmark run)

```xml
<?xml version="1.0"?>
<!-- Auto-generated by HoloScript URDFCompiler v2.0 -->
<!-- Target: ROS 2 / Gazebo / MoveIt 2 / RViz2 -->

<robot name="HoloScriptRobot">
  <material name="default">
    <color rgba="0.8 0.8 0.8 1"/>
  </material>

  <link name="base_link">
    <inertial>
      <mass value="0.001"/>
      <inertia ixx="0.001000" ixy="0" ixz="0"
               iyy="0.001000" iyz="0" izz="0.001000"/>
    </inertial>
  </link>
</robot>
```

### Real SDF Output (from benchmark run)

```xml
<?xml version="1.0"?>
<sdf version="1.8">
  <world name="holoscript_world">
    <physics name="default_physics" type="ode">
      <max_step_size>0.001</max_step_size>
      <real_time_factor>1</real_time_factor>
      <real_time_update_rate>1000</real_time_update_rate>
      <ode>
        <solver>
          <type>quick</type>
          <iters>50</iters>
          <sor>1.3</sor>
        </solver>
      </ode>
    </physics>
  </world>
</sdf>
```

---

## Industrial Compilers

### URDF Compiler (`URDFCompiler.ts`, 2,009 lines)

Targets: **ROS 2, Gazebo, MoveIt 2, RViz2, Isaac Sim**

| HoloScript Construct       | URDF Output                                   |
| -------------------------- | --------------------------------------------- |
| `object`                   | `<link>` with visual + collision geometry     |
| `@physics { mass: N }`     | `<inertial>` with mass + inertia tensor       |
| `behavior "RevoluteJoint"` | `<joint type="revolute">` with limits         |
| `@sensor`                  | `<gazebo>` sensor plugin (camera, IMU, lidar) |
| `@actuator`                | `<transmission>` with `ros2_control`          |

### DTDL Compiler (`DTDLCompiler.ts`)

Target: **Azure Digital Twins Definition Language v3**

| HoloScript Construct     | DTDL Output       |
| ------------------------ | ----------------- |
| `state { field: value }` | DTDL Property     |
| `emit("event")`          | DTDL Telemetry    |
| Action handlers          | DTDL Command      |
| Object hierarchy         | DTDL Relationship |
| Traits                   | DTDL Component    |

### SDF Compiler (`SDFCompiler.ts`)

Target: **Gazebo Ignition / Garden simulation**

Produces full world files with physics config, ground plane, lighting, sensors, and model hierarchy.

---

## IoT Trait Library (253+ traits)

### Consumer IoT (`iot-autonomous-agents.ts`)

```
@sensor  @digital_twin  @twin_sync  @twin_actuator  @data_binding
@alert   @heatmap_3d    @telemetry  @iot_bridge     @matter_device
@bluetooth_device  @usb_device  @octoprint_device  @home_assistant
@device_registry   @smart_light @smart_plug  @smart_speaker
@smart_display     @smart_lock  @climate_control
```

### Industrial Protocols

```
@mqtt  @opc_ua  @modbus  @profinet  @ethercat  @canopen  @rest_api
@ros_compatible  @ros2_dds
```

### Robotics (`robotics-industrial.ts`, [see NUMBERS.md] )

**Joint types**: `@joint_revolute`, `@joint_prismatic`, `@joint_continuous`, `@joint_fixed`, `@joint_planar`, `@joint_floating`, `@joint_ball`

**Sensors**: `@force_sensor`, `@torque_sensor`, `@camera_rgb`, `@camera_depth`, `@lidar_2d`, `@lidar_3d`, `@imu`, `@gps`, `@ultrasonic`

**Actuators**: `@servo_motor`, `@stepper_motor`, `@bldc_motor`, `@hydraulic_actuator`, `@pneumatic_actuator`

**End effectors**: `@gripper`, `@parallel_gripper`, `@suction_gripper`, `@soft_gripper`, `@welding_torch`, `@spray_gun`

### Trait Implementations

| Trait            | File                                 | Description                   |
| ---------------- | ------------------------------------ | ----------------------------- |
| `@mqtt` (sink)   | `core/src/traits/MQTTSinkTrait.ts`   | Publish state to MQTT topics  |
| `@mqtt` (source) | `core/src/traits/MQTTSourceTrait.ts` | Subscribe to MQTT topics      |
| `@wot`           | `core/src/traits/WoTThingTrait.ts`   | W3C Web of Things integration |

---

## Non-Spatial Use Cases

These examples demonstrate that HoloScript is a **backend scripting platform**, not just a VR previewer:

| Use Case                 | What It Does                                    | Key Traits                                  | Deploy To           |
| ------------------------ | ----------------------------------------------- | ------------------------------------------- | ------------------- |
| **Smart home dashboard** | 12 devices, MQTT telemetry, energy tracking     | `@sensor`, `@actuator`, `@telemetry_stream` | R3F (tablet), Unity |
| **Factory digital twin** | 48 devices, predictive maintenance, Azure sync  | `@digital_twin`, `@sensor`                  | DTDL, Azure IoT     |
| **Smart building BIM**   | 42 sensors, HVAC, occupancy, energy heatmaps    | `@sensor`, `@bim_model`, `@heatmap`         | R3F, Unity, WebGPU  |
| **Robot arm sim**        | 6-DOF arm, ROS 2 bridge, physics                | `@physics`, `@rotatable`                    | URDF, SDF, Gazebo   |
| **Industrial safety**    | Vibration monitoring, autonomous agent response | `@digital_twin`, `@llm_agent`               | DTDL                |
| **Assembly line QC**     | Vision inspection, product tracking             | `@sensor`, `@digital_twin`                  | DTDL, URDF          |
| **Sim-to-real transfer** | Train robot in sim, deploy to hardware          | `@digital_twin`, `@agent_portal`            | URDF, SDF, Unity    |

### The Key Insight

A single `.holo` file describes a system. The **compiler target** determines whether it becomes:

- A **web dashboard** (R3F) for monitoring
- A **VR walkthrough** (Unity/OpenXR) for training
- A **robot description** (URDF) for ROS 2 deployment
- A **digital twin model** (DTDL) for Azure cloud sync
- A **physics simulation** (SDF) for Gazebo testing

No code rewrite needed. Same source, different compiler target.

---

## Running the Examples

```bash
# Smart home → web dashboard
holoscript compile examples/domain-starters/iot/iot-starter.holo --target r3f

# Factory → Azure Digital Twins
holoscript compile examples/specialized/iot/smart-factory-twin.holo --target dtdl

# Robot → ROS 2 URDF
holoscript compile examples/specialized/robotics/robot-arm-simulation.holo --target urdf

# Robot → Gazebo SDF
holoscript compile benchmarks/cross-compilation/compositions/15-robotics.holo --target sdf

# Same robot → Unity (for visualization)
holoscript compile benchmarks/cross-compilation/compositions/15-robotics.holo --target unity
```
