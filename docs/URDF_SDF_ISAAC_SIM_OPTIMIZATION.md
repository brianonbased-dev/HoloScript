# URDF/SDF Isaac Sim Optimization Guide

> Compiler targets: `URDFCompiler` and `SDFCompiler` in `packages/core/src/compiler/`
> Last updated: 2026-03-07
> Status: ✅ IMPLEMENTED (Priority 1-2 features complete)

**Implementation Summary:**

- ✅ Isaac Sim extension tags infrastructure (sensors, loop joints, fixed frames)
- ✅ Unique material name generation (prevents Isaac Sim material merging)
- ✅ Isaac Sim-compatible name sanitization (leading underscore handling)
- ✅ `compileForIsaacSim()` convenience function
- ✅ PhysX solver tuning configuration options
- ✅ Example composition: `examples/robotics/isaac-sim-robot-arm.holo`
- 🔄 Gazebo Harmonic plugin migration (partial - Classic plugins still default)
- ⏳ SDF joint articulation (Priority 2 - not yet implemented)
- ⏳ SDF proper inertia calculation (Priority 3 - not yet implemented)

---

## Table of Contents

1. [Current URDF/SDF Output Format and Gaps](#1-current-urdfsdf-output-format-and-gaps)
2. [Isaac Sim-Specific URDF Extensions](#2-isaac-sim-specific-urdf-extensions)
3. [Recommended Compiler Changes for Isaac Sim](#3-recommended-compiler-changes-for-isaac-sim)
4. [SDF World File Generation for Gazebo Harmonic and Isaac Sim](#4-sdf-world-file-generation-for-gazebo-harmonic-and-isaac-sim)
5. [ROS 2 Topic/Service Mapping from HoloScript System Blocks](#5-ros-2-topicservice-mapping-from-holoscript-system-blocks)
6. [Worked Example: Robot Arm Composition to URDF and SDF](#6-worked-example-robot-arm-composition-to-urdf-and-sdf)

---

## 1. Current URDF/SDF Output Format and Gaps

### 1.1 URDFCompiler Current Output

The `URDFCompiler` (`packages/core/src/compiler/URDFCompiler.ts`) generates URDF XML v2.0 with the following features:

| Feature | Status | Notes |
|---------|--------|-------|
| XML declaration and comments | Supported | Includes composition source metadata |
| `base_link` creation | Supported | Always created as root |
| Link visual geometry | Supported | box, sphere, cylinder, mesh (.stl) |
| Link collision geometry | Supported | Requires `@collidable`, `@physics`, or `@rigid` trait |
| Link inertial properties | Supported | Computes inertia tensor from geometry and mass |
| Fixed joints | Supported | Default joint type |
| Revolute joints | Supported | Via `@joint` trait with `hinge`/`revolute` |
| Prismatic joints | Supported | Via `@joint` trait with `slider`/`prismatic` |
| Continuous joints | Supported | Via `@joint` trait |
| Floating/planar joints | Supported | Via `@joint` trait |
| Joint limits | Supported | Degrees-to-radians conversion for revolute |
| Joint dynamics | Supported | Damping and friction |
| Joint mimic | Supported | Reference joint, multiplier, offset |
| Safety controller | Supported | Soft limits, k_position, k_velocity |
| Materials (color) | Supported | Named colors and hex codes |
| Gazebo `<gazebo>` plugins | Supported | Behind `includeGazeboPlugins` flag |
| Gazebo material mapping | Supported | Maps to `Gazebo/Red`, `Gazebo/Blue`, etc. |
| Gazebo friction (mu1, mu2, kp, kd) | Supported | Configurable defaults |
| Sensor plugins (camera, lidar, IMU, etc.) | Supported | Via `@sensor` trait |
| ros2_control hardware interface | Supported | Behind `includeROS2Control` flag |
| Transmissions | Supported | Via `@actuator` trait |
| ROS 2 launch file generation | Supported | `generateROS2LaunchFile()` |
| Controllers YAML generation | Supported | `generateControllersYaml()` |
| Domain block compilation | Supported | v4.2 material/physics/audio/weather blocks |
| Spatial group hierarchy | Supported | Groups become parent links with fixed joints |

### 1.2 SDFCompiler Current Output

The `SDFCompiler` (`packages/core/src/compiler/SDFCompiler.ts`) generates SDF XML v1.8 with:

| Feature | Status | Notes |
|---------|--------|-------|
| World wrapper | Supported | Configurable world name |
| Physics engine config | Supported | ODE with solver/constraints |
| Scene (ambient, background, shadows) | Supported | Skybox-to-background mapping |
| Ground plane | Supported | 100x100 plane with collision |
| Sun directional light | Supported | Default diffuse/specular |
| Custom lights (point, directional, spot) | Supported | Color, intensity, attenuation, spot angles |
| Model creation per object | Supported | Static/dynamic detection |
| Inertial properties | Supported | For dynamic objects only |
| Collision geometry | Supported | For collidable/physics/rigid traits |
| Visual geometry + material | Supported | Ambient, diffuse, specular, emissive |
| Capsule geometry | Supported | SDF-native (unlike URDF) |
| Mesh references | Supported | `model://` prefix |
| Spatial group comments | Supported | Flat model output |
| Domain blocks | Supported | Material/physics/audio/weather |

### 1.3 Gaps vs. Isaac Sim Requirements

#### Critical Gaps

| Gap | Impact | Severity |
|-----|--------|----------|
| **No `sensor.isaac_sim_config` attribute** | Isaac Sim cannot attach RTX LiDAR sensors or reference preconfigured sensor templates | High |
| **No `<loop_joint>` support** | Closed kinematic chains (quadrupeds, parallel robots) cannot be described | High |
| **No `<fixed_frame>` support** | Sensor mounting points and end-effector offsets require extra dummy links | Medium |
| **No PhysX material properties** | Isaac Sim defaults may not match intended friction/restitution behavior | Medium |
| **Gazebo Classic plugins, not gz-sim** | `libgazebo_ros_camera.so` and similar are Gazebo Classic; Gazebo Harmonic uses `gz-sim-*-system` plugins | High |
| **No Isaac Sim drive configuration hints** | No way to suggest natural frequency vs stiffness method, or acceleration vs force drive type | Medium |
| **SDF lacks joint articulation** | SDFCompiler produces per-object models but does not emit `<joint>` elements within or between models | High |
| **SDF inertia is simplified** | Uses `mass * 0.1` for all inertia terms instead of geometry-derived tensor | Medium |
| **No SDF `<plugin>` for ros_gz** | SDF output lacks `ros_gz_bridge` or `gz-sim-*-system` plugin tags | Medium |
| **Material name collision** | Isaac Sim URDF import merges materials with identical names regardless of properties | Low |
| **Special character handling** | Current sanitizer replaces to `_` but does not handle leading-underscore prefix with `a` | Low |

#### Minor Gaps

- No mesh scale units annotation (Isaac Sim assumes meters)
- No `<drake:*>` extensions for Drake physics engine
- No MJCF (MuJoCo) output (referenced in robotics example but not implemented)
- No USD output from URDF compiler (Isaac Sim natively uses USD)

---

## 2. Isaac Sim-Specific URDF Extensions

Isaac Sim's URDF importer (`isaacsim.asset.importer.urdf`) supports three custom XML tags that extend standard URDF. These are ignored by other URDF parsers (treated as unknown elements), so they are safe to include unconditionally.

### 2.1 `sensor` with `isaac_sim_config` Attribute

Attaches an RTX sensor (typically LiDAR) to a link with Isaac Sim-native configuration.

```xml
<!-- Pre-configured sensor from Isaac Sim's built-in library -->
<sensor name="front_lidar" type="ray" isaac_sim_config="Velodyne_VLS128">
    <parent link="sensor_mount_link"/>
    <origin xyz="0 0 0.1" rpy="0 0 0"/>
</sensor>

<!-- User-defined sensor configuration via JSON file -->
<sensor name="custom_lidar" type="ray" isaac_sim_config="../lidar_config/my_lidar.json">
    <parent link="sensor_mount_link"/>
    <origin xyz="0.5 0.5 0" rpy="0 0 0"/>
</sensor>
```

**Supported preconfigured LiDAR sensors:**
- `Velodyne_VLS128`
- `Ouster_OS1_64`
- `HESAI_PandarXT_32`
- (others shipped with Isaac Sim)

**JSON config format** includes fields for scan pattern, range, noise model, and intensity mapping.

### 2.2 `loop_joint`

Defines a spherical joint that closes a kinematic chain loop, critical for parallel mechanisms and quadruped robots.

```xml
<loop_joint name="hip_loop_closure" type="spherical">
    <link1 link="upper_leg" rpy="0 0 0" xyz="0 0.05 -0.2"/>
    <link1 link="lower_leg" rpy="0 0 0" xyz="0 0.05 0.1"/>
</loop_joint>
```

**Key considerations:**
- Only `spherical` type is currently supported by Isaac Sim
- Both `<link1>` elements define the attachment points on each link
- Pose (rpy/xyz) is relative to the respective link frame
- Standard URDF parsers ignore this tag silently

### 2.3 `fixed_frame`

Creates a named reference frame attached to a link without requiring a separate link and fixed joint pair. Ideal for sensor mounting positions, end-effector tool center points (TCP), and calibration reference points.

```xml
<fixed_frame name="camera_mount_point">
    <parent link="end_effector_link"/>
    <origin rpy="0.0 0.0 0.0" xyz="0.05 0.0 0.02"/>
</fixed_frame>

<fixed_frame name="tcp">
    <parent link="tool_link"/>
    <origin rpy="0.0 0.0 0.0" xyz="0.0 0.0 0.15"/>
</fixed_frame>
```

**Constraints:**
- Each `(name, parent link)` pair must be unique
- Replaces the common pattern of creating dummy links with zero mass/inertia

### 2.4 Visual Material Handling

Isaac Sim's URDF importer has a known behavior where **materials with the same name are merged**, regardless of whether their properties differ. This means:

```xml
<!-- PROBLEM: Both use "material_gray" but different colors -->
<material name="material_gray">
    <color rgba="0.5 0.5 0.5 1"/>
</material>
<material name="material_gray">   <!-- Ignored! First definition wins -->
    <color rgba="0.8 0.8 0.8 1"/>
</material>
```

**Recommendation:** The compiler should generate globally unique material names, e.g., `material_{link_name}_{color_hash}`.

### 2.5 Contact and Collision Properties

Isaac Sim uses NVIDIA PhysX for physics simulation. While URDF does not natively support PhysX-specific parameters, Isaac Sim applies defaults during import:

| Property | Isaac Sim Default | Best Practice |
|----------|------------------|---------------|
| Static friction | 0.5 | Set via `<gazebo>` `<mu1>` (mapped at import) |
| Dynamic friction | 0.5 | Set via `<gazebo>` `<mu2>` |
| Restitution | 0.0 | Not directly settable in URDF |
| Collision type | Convex Hull | Configurable in importer UI |
| Self-collision | Disabled | Not recommended unless verified |
| Solver position iterations | 4 | Increase to 8-16 for articulated robots |
| Solver velocity iterations | 1 | Increase to 2-4 for stability |

**PhysX solver tuning** cannot be specified in URDF directly but can be annotated as HoloScript extension comments for post-import configuration scripts.

### 2.6 Joint Drive Configuration

Isaac Sim provides two methods for configuring joint drives:

**Stiffness Method:**
- Directly set stiffness (Kp) and damping (Kd)
- Equivalent to spring-damper system

**Natural Frequency Method:**
- Computes from mass (m), natural frequency (f), and damping ratio (zeta):
  - `Kp = m * f^2`
  - `Kd = 2 * m * zeta * f`

**Drive types:**
- **Acceleration:** Normalizes inertia before applying effort (recommended for most cases)
- **Force:** Applies effort directly

**Target types:** `None`, `Position` (radians for revolute, meters for prismatic), `Velocity` (units/second)

These can be encoded as URDF extension comments or `<gazebo>` tags for post-import scripts.

---

## 3. Recommended Compiler Changes for Isaac Sim

### 3.1 URDFCompiler Changes

#### Priority 1: Isaac Sim Extension Tags

Add new option and emission methods:

```typescript
export interface URDFCompilerOptions {
  // ... existing options ...

  /** Include Isaac Sim-specific extension tags */
  includeIsaacSimExtensions?: boolean;

  /** Isaac Sim drive type: 'acceleration' or 'force' */
  isaacSimDriveType?: 'acceleration' | 'force';

  /** Isaac Sim target type: 'none', 'position', 'velocity' */
  isaacSimTargetType?: 'none' | 'position' | 'velocity';

  /** Isaac Sim PhysX solver iterations */
  isaacSimSolverPositionIterations?: number;
  isaacSimSolverVelocityIterations?: number;
}
```

New IR types:

```typescript
export interface URDFIsaacSimSensor {
  name: string;
  type: string;
  parentLink: string;
  origin?: URDFOrigin;
  /** Isaac Sim preconfigured sensor name or JSON path */
  isaacSimConfig: string;
}

export interface URDFLoopJoint {
  name: string;
  type: 'spherical';
  link1: { link: string; rpy: [number, number, number]; xyz: [number, number, number] };
  link2: { link: string; rpy: [number, number, number]; xyz: [number, number, number] };
}

export interface URDFFixedFrame {
  name: string;
  parentLink: string;
  origin: URDFOrigin;
}
```

New emission methods:

```typescript
private emitIsaacSimSensor(sensor: URDFIsaacSimSensor): void {
  this.emit(`<sensor name="${sensor.name}" type="${sensor.type}" isaac_sim_config="${sensor.isaacSimConfig}">`);
  this.indentLevel++;
  this.emit(`<parent link="${sensor.parentLink}"/>`);
  if (sensor.origin) {
    this.emitOrigin(sensor.origin);
  }
  this.indentLevel--;
  this.emit('</sensor>');
}

private emitLoopJoint(loopJoint: URDFLoopJoint): void {
  this.emit(`<loop_joint name="${loopJoint.name}" type="${loopJoint.type}">`);
  this.indentLevel++;
  this.emit(`<link1 link="${loopJoint.link1.link}" rpy="${loopJoint.link1.rpy.join(' ')}" xyz="${loopJoint.link1.xyz.join(' ')}"/>`);
  this.emit(`<link1 link="${loopJoint.link2.link}" rpy="${loopJoint.link2.rpy.join(' ')}" xyz="${loopJoint.link2.xyz.join(' ')}"/>`);
  this.indentLevel--;
  this.emit('</loop_joint>');
}

private emitFixedFrame(frame: URDFFixedFrame): void {
  this.emit(`<fixed_frame name="${frame.name}">`);
  this.indentLevel++;
  this.emit(`<parent link="${frame.parentLink}"/>`);
  this.emitOrigin(frame.origin);
  this.indentLevel--;
  this.emit('</fixed_frame>');
}
```

#### Priority 2: Unique Material Names

Current behavior generates `material_{linkName}` which can collide. Change to include a color hash:

```typescript
private generateMaterialName(linkName: string, color: string): string {
  const hash = color.replace(/[^a-zA-Z0-9]/g, '');
  return `material_${linkName}_${hash}`;
}
```

#### Priority 3: Name Sanitization for Isaac Sim

Isaac Sim prepends `a` to names that start with `_` after special-character replacement:

```typescript
private sanitizeName(name: string): string {
  let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  if (sanitized.startsWith('_')) {
    sanitized = 'a' + sanitized;
  }
  return sanitized;
}
```

#### Priority 4: Gazebo Harmonic Plugin Migration

Replace Gazebo Classic plugin filenames with Gazebo Harmonic (gz-sim) equivalents:

| Current (Classic) | Replacement (Harmonic) |
|-------------------|----------------------|
| `libgazebo_ros_camera.so` | `gz-sim-sensors-system` |
| `libgazebo_ros_ray_sensor.so` | `gz-sim-sensors-system` |
| `libgazebo_ros_imu_sensor.so` | `gz-sim-imu-system` |
| `libgazebo_ros_bumper.so` | `gz-sim-contact-system` |
| `libgazebo_ros_gps_sensor.so` | `gz-sim-navsat-system` |
| `gz_ros2_control-system` | `gz_ros2_control::GazeboSimROS2ControlPlugin` |

Add option:

```typescript
/** Gazebo version target: 'classic' or 'harmonic' */
gazeboVersion?: 'classic' | 'harmonic';
```

#### Priority 5: Convenience Function for Isaac Sim

```typescript
export function compileForIsaacSim(
  composition: HoloComposition,
  options?: Partial<URDFCompilerOptions>
): string {
  const isaacOptions: URDFCompilerOptions = {
    includeVisual: true,
    includeCollision: true,
    includeInertial: true,
    includeGazeboPlugins: false, // Isaac Sim uses PhysX, not Gazebo plugins
    includeROS2Control: true,
    includeIsaacSimExtensions: true,
    isaacSimDriveType: 'acceleration',
    isaacSimTargetType: 'position',
    ...options,
  };
  const compiler = new URDFCompiler(isaacOptions);
  return compiler.compile(composition);
}
```

### 3.2 SDFCompiler Changes

#### Priority 1: Joint Articulation

The SDFCompiler currently produces per-object `<model>` elements but does not emit `<joint>` elements. For Isaac Sim and Gazebo Harmonic compatibility, models that represent robot links should be grouped under a single `<model>` with proper `<joint>` elements:

```typescript
// New method to emit an articulated robot model
private emitArticulatedModel(
  composition: HoloComposition,
  rootObjects: HoloObjectDecl[]
): void {
  this.emit(`<model name="${this.sanitizeName(composition.name)}">`);
  this.indentLevel++;
  // Emit links
  for (const obj of rootObjects) {
    this.emitLink(obj);
  }
  // Emit joints from @joint traits
  for (const obj of rootObjects) {
    this.emitJointFromTrait(obj);
  }
  this.indentLevel--;
  this.emit('</model>');
}
```

#### Priority 2: Proper Inertia Calculation

Replace simplified `mass * 0.1` with geometry-derived inertia tensors (matching URDFCompiler):

```typescript
private calculateInertia(geometry: string, mass: number, scale: number): void {
  let ixx: number, iyy: number, izz: number;
  switch (geometry) {
    case 'box':
      ixx = iyy = izz = (mass * (scale * scale + scale * scale)) / 12;
      break;
    case 'sphere':
      ixx = iyy = izz = (2 / 5) * mass * (scale / 2) * (scale / 2);
      break;
    case 'cylinder':
      const r = scale / 2, l = scale;
      ixx = iyy = (mass * (3 * r * r + l * l)) / 12;
      izz = (mass * r * r) / 2;
      break;
    default:
      ixx = iyy = izz = mass * 0.1;
  }
  // Emit proper <inertia> block
}
```

#### Priority 3: gz-sim Plugin Tags

Add Gazebo Harmonic system plugins to SDF world output:

```xml
<plugin filename="gz-sim-physics-system" name="gz::sim::systems::Physics">
    <engine><filename>gz-physics-dartsim-plugin</filename></engine>
</plugin>
<plugin filename="gz-sim-user-commands-system" name="gz::sim::systems::UserCommands"/>
<plugin filename="gz-sim-scene-broadcaster-system" name="gz::sim::systems::SceneBroadcaster"/>
<plugin filename="gz-sim-sensors-system" name="gz::sim::systems::Sensors">
    <render_engine>ogre2</render_engine>
</plugin>
```

#### Priority 4: ros_gz_bridge Configuration

Generate a companion `bridge.yaml` for topic bridging between ROS 2 and Gazebo:

```yaml
# Auto-generated by HoloScript SDFCompiler
- ros_topic_name: "/joint_states"
  gz_topic_name: "/world/{world_name}/model/{model_name}/joint_state"
  ros_type_name: "sensor_msgs/msg/JointState"
  gz_type_name: "gz.msgs.Model"
  direction: GZ_TO_ROS
```

---

## 4. SDF World File Generation for Gazebo Harmonic and Isaac Sim

### 4.1 Gazebo Harmonic World Structure

Gazebo Harmonic (gz-sim) uses SDF 1.8+ with system plugins instead of the classic `<plugin filename="lib*.so">` model:

```xml
<?xml version="1.0"?>
<sdf version="1.8">
  <world name="holoscript_world">

    <!-- Required system plugins for Gazebo Harmonic -->
    <plugin filename="gz-sim-physics-system"
            name="gz::sim::systems::Physics">
      <engine>
        <filename>gz-physics-dartsim-plugin</filename>
      </engine>
    </plugin>
    <plugin filename="gz-sim-user-commands-system"
            name="gz::sim::systems::UserCommands"/>
    <plugin filename="gz-sim-scene-broadcaster-system"
            name="gz::sim::systems::SceneBroadcaster"/>

    <!-- Optional: sensor rendering -->
    <plugin filename="gz-sim-sensors-system"
            name="gz::sim::systems::Sensors">
      <render_engine>ogre2</render_engine>
    </plugin>

    <!-- Optional: contact system for bumper sensors -->
    <plugin filename="gz-sim-contact-system"
            name="gz::sim::systems::Contact"/>

    <!-- Physics configuration -->
    <physics name="1ms" type="dart">
      <max_step_size>0.001</max_step_size>
      <real_time_factor>1.0</real_time_factor>
      <real_time_update_rate>1000</real_time_update_rate>
    </physics>

    <!-- Scene rendering -->
    <scene>
      <ambient>0.4 0.4 0.4 1</ambient>
      <background>0.7 0.7 0.7 1</background>
      <shadows>true</shadows>
    </scene>

    <!-- World models, lights, etc. -->
  </world>
</sdf>
```

### 4.2 Isaac Sim SDF Handling

Isaac Sim does **not** natively import SDF world files. Instead, the workflow is:

1. **URDF for robot models** -- Imported via `isaacsim.asset.importer.urdf`
2. **USD for environments** -- Isaac Sim's native format
3. **SDF for Gazebo co-simulation** -- When running Gazebo alongside Isaac Sim

For Isaac Sim workflows, the SDFCompiler output serves as:
- A Gazebo simulation companion (digital twin in Gazebo while training in Isaac Sim)
- A bridge format for `sdformat_urdf` (ROS 2 package that converts SDF to URDF C++ DOM)

### 4.3 Dual-Output Strategy

The recommended approach is to generate **both** URDF (for Isaac Sim) and SDF (for Gazebo Harmonic) from the same HoloScript composition:

```
HoloScript Composition
    |
    +---> URDFCompiler (compileForIsaacSim)  --> .urdf (Isaac Sim import)
    |         |
    |         +---> generateROS2LaunchFile() --> .launch.py
    |         +---> generateControllersYaml() --> controllers.yaml
    |
    +---> SDFCompiler (Gazebo Harmonic mode) --> .sdf (Gazebo world)
              |
              +---> generateBridgeYaml()     --> bridge.yaml (ros_gz_bridge)
```

### 4.4 SDFCompiler Option for Gazebo Version

```typescript
export interface SDFCompilerOptions {
  // ... existing options ...

  /** Target Gazebo version: 'classic' or 'harmonic' */
  gazeboVersion?: 'classic' | 'harmonic';

  /** Include gz-sim system plugins */
  includeSystemPlugins?: boolean;

  /** Physics engine for Gazebo Harmonic: 'dart' or 'bullet' */
  harmonicPhysicsEngine?: 'dart' | 'bullet';

  /** Include ros_gz_bridge configuration comments */
  includeRosGzBridge?: boolean;
}
```

---

## 5. ROS 2 Topic/Service Mapping from HoloScript System Blocks

### 5.1 Standard ROS 2 Topic Mapping

When a HoloScript composition is compiled to URDF/SDF, the following ROS 2 topics are implicitly defined:

| HoloScript Element | ROS 2 Topic | Message Type | Direction |
|---------------------|-------------|--------------|-----------|
| `@joint` trait (any movable) | `/joint_states` | `sensor_msgs/msg/JointState` | Sub (for RSP) |
| `@joint` trait (any movable) | `/tf` | `tf2_msgs/msg/TFMessage` | Pub (from RSP) |
| Fixed joints / spatial groups | `/tf_static` | `tf2_msgs/msg/TFMessage` | Pub (latched) |
| Composition URDF | `/robot_description` | `std_msgs/msg/String` | Pub (latched) |
| `@sensor(type: camera)` | `/{sensor_name}/image_raw` | `sensor_msgs/msg/Image` | Pub |
| `@sensor(type: camera)` | `/{sensor_name}/camera_info` | `sensor_msgs/msg/CameraInfo` | Pub |
| `@sensor(type: depth_camera)` | `/{sensor_name}/depth/image_raw` | `sensor_msgs/msg/Image` | Pub |
| `@sensor(type: depth_camera)` | `/{sensor_name}/points` | `sensor_msgs/msg/PointCloud2` | Pub |
| `@sensor(type: lidar)` | `/scan` or custom topic | `sensor_msgs/msg/LaserScan` | Pub |
| `@sensor(type: imu)` | `/imu/data` or custom topic | `sensor_msgs/msg/Imu` | Pub |
| `@sensor(type: gps)` | `/gps/fix` or custom topic | `sensor_msgs/msg/NavSatFix` | Pub |
| `@sensor(type: force_torque)` | `/{sensor_name}/wrench` | `geometry_msgs/msg/WrenchStamped` | Pub |
| `@sensor(type: contact)` | `/bumper` or custom topic | `gazebo_msgs/msg/ContactsState` | Pub |
| `@actuator` trait | `/{controller}/command` | Various | Sub |
| ros2_control (joint trajectory) | `/joint_trajectory_controller/joint_trajectory` | `trajectory_msgs/msg/JointTrajectory` | Sub |
| ros2_control (state broadcaster) | `/joint_states` | `sensor_msgs/msg/JointState` | Pub |

### 5.2 HoloScript `@ros_node` Trait Mapping

From the robotics example (`packages/plugins/robotics-plugin/examples/robot-arm-complete.holo`), the `@ros_node` trait maps to:

```
@ros_node configuration:
  ros_bridge_url  -->  rosbridge_websocket connection URL
  namespace       -->  ROS 2 node namespace (prefixed to all topics)
  tf_prefix       -->  TF frame prefix for multi-robot disambiguation
```

### 5.3 HoloScript System Block to ROS 2 Service Mapping

| HoloScript Block | ROS 2 Service | Service Type |
|------------------|---------------|--------------|
| `twin_sync.sensors[type: joint_states]` | `/joint_states` subscription | `sensor_msgs/msg/JointState` |
| `twin_sync.sensors[type: tf]` | `/tf` subscription | `tf2_msgs/msg/TFMessage` |
| `drive_controller.type: diff_drive` | `/cmd_vel` subscription | `geometry_msgs/msg/Twist` |
| `vr_control.inverse_kinematics` | `/compute_ik` service | `moveit_msgs/srv/GetPositionIK` |
| `export.urdf` | `/robot_description` parameter | `std_msgs/msg/String` |

### 5.4 Generated Launch File Topic Wiring

The `generateROS2LaunchFile()` function creates a Python launch file that wires:

1. **Robot State Publisher** -- subscribes to `/joint_states`, publishes `/tf`, `/tf_static`, `/robot_description`
2. **Controller Manager** -- loads `joint_state_broadcaster` and `joint_trajectory_controller`
3. **Gazebo/gz-sim spawn** -- `ros_gz_sim create` to spawn the robot model
4. **RViz2** -- visualization with the robot model

### 5.5 Gazebo Harmonic Topic Bridge

For Gazebo Harmonic, topics use the `gz.msgs` namespace and need bridging via `ros_gz_bridge`:

```yaml
# bridge.yaml (generated alongside SDF world)
- ros_topic_name: "/joint_states"
  gz_topic_name: "/world/holoscript_world/model/robot/joint_state"
  ros_type_name: "sensor_msgs/msg/JointState"
  gz_type_name: "gz.msgs.Model"
  direction: GZ_TO_ROS

- ros_topic_name: "/cmd_vel"
  gz_topic_name: "/model/robot/cmd_vel"
  ros_type_name: "geometry_msgs/msg/Twist"
  gz_type_name: "gz.msgs.Twist"
  direction: ROS_TO_GZ

- ros_topic_name: "/scan"
  gz_topic_name: "/world/holoscript_world/model/robot/link/lidar_link/sensor/lidar/scan"
  ros_type_name: "sensor_msgs/msg/LaserScan"
  gz_type_name: "gz.msgs.LaserScan"
  direction: GZ_TO_ROS

- ros_topic_name: "/camera/image_raw"
  gz_topic_name: "/world/holoscript_world/model/robot/link/camera_link/sensor/camera/image"
  ros_type_name: "sensor_msgs/msg/Image"
  gz_type_name: "gz.msgs.Image"
  direction: GZ_TO_ROS
```

---

## 6. Worked Example: Robot Arm Composition to URDF and SDF

### 6.1 HoloScript Source Composition

Based on the existing robotics example in `packages/plugins/robotics-plugin/examples/robot-arm-complete.holo`:

```holoscript
scene "Robotics Lab" {
  background: "#1a1a2e"
  lighting: "industrial"
  camera_position: [2, 1.5, 3]
}

object "Base" @physics @collidable {
  geometry: "cylinder"
  position: [0, 0, 0]
  scale: 0.2
  color: "#404040"
  physics: { mass: 5.0 }
}

object "ShoulderJoint" @physics @joint(
  jointType: "revolute",
  connectedBody: "Base",
  axis: { x: 0, y: 0, z: 1 },
  limits: { min: -180, max: 180, effort: 10.0, velocity: 2.0 },
  damping: 0.5,
  friction: 0.1
) @actuator(
  transmissionType: "transmission_interface/SimpleTransmission",
  hardwareInterface: "hardware_interface/PositionJointInterface"
) {
  geometry: "cylinder"
  position: [0, 0, 0.1]
  scale: 0.08
  color: "#606060"
  physics: { mass: 0.5 }
}

object "UpperArm" @physics @collidable {
  geometry: "box"
  position: [0, 0, 0.35]
  scale: [0.05, 0.05, 0.4]
  color: "#3080C0"
  physics: { mass: 2.0 }
}

object "ElbowJoint" @physics @joint(
  jointType: "revolute",
  connectedBody: "UpperArm",
  axis: { x: 0, y: 1, z: 0 },
  limits: { min: -135, max: 135, effort: 5.0, velocity: 1.5 },
  damping: 0.3,
  friction: 0.05
) @actuator(
  transmissionType: "transmission_interface/SimpleTransmission",
  hardwareInterface: "hardware_interface/PositionJointInterface"
) {
  geometry: "cylinder"
  position: [0, 0, 0.55]
  scale: 0.06
  color: "#606060"
  physics: { mass: 0.3 }
}

object "Forearm" @physics @collidable {
  geometry: "box"
  position: [0, 0, 0.75]
  scale: [0.04, 0.04, 0.3]
  color: "#3080C0"
  physics: { mass: 1.0 }
}

object "EndEffector" @physics @collidable @sensor(
  type: "camera",
  fov: 1.2,
  width: 640,
  height: 480,
  topic: "/wrist_camera/image_raw",
  frameName: "wrist_camera_frame"
) @sensor(
  type: "force_torque",
  topic: "/wrist_ft/wrench"
) {
  geometry: "gripper_v2.stl"
  position: [0, 0, 0.92]
  scale: 0.05
  color: "#808080"
  physics: { mass: 0.5 }
}
```

### 6.2 URDF Output (Isaac Sim Optimized)

The following shows what `compileForIsaacSim(composition)` should produce:

```xml
<?xml version="1.0"?>
<!-- Auto-generated by HoloScript URDFCompiler v2.0 -->
<!-- Source: composition "Robotics Lab" -->
<!-- Target: NVIDIA Isaac Sim / ROS 2 / MoveIt 2 -->

<robot name="RoboticsLabArm">
  <!-- Materials (unique names to avoid Isaac Sim merge) -->
  <material name="material_base_404040">
    <color rgba="0.251 0.251 0.251 1"/>
  </material>
  <material name="material_shoulderjoint_606060">
    <color rgba="0.376 0.376 0.376 1"/>
  </material>
  <material name="material_upperarm_3080c0">
    <color rgba="0.188 0.502 0.753 1"/>
  </material>
  <material name="material_forearm_3080c0">
    <color rgba="0.188 0.502 0.753 1"/>
  </material>
  <material name="material_endeffector_808080">
    <color rgba="0.502 0.502 0.502 1"/>
  </material>

  <!-- Base Link -->
  <link name="base_link">
    <inertial>
      <mass value="0.001"/>
      <inertia ixx="0.001" ixy="0" ixz="0" iyy="0.001" iyz="0" izz="0.001"/>
    </inertial>
  </link>

  <!-- Base -->
  <link name="base">
    <visual>
      <origin xyz="0 0 0" rpy="0.000000 0.000000 0.000000"/>
      <geometry>
        <cylinder radius="0.1" length="0.2"/>
      </geometry>
      <material name="material_base_404040"/>
    </visual>
    <collision>
      <origin xyz="0 0 0" rpy="0.000000 0.000000 0.000000"/>
      <geometry>
        <cylinder radius="0.1" length="0.2"/>
      </geometry>
    </collision>
    <inertial>
      <mass value="5"/>
      <inertia ixx="0.020833" ixy="0" ixz="0" iyy="0.020833" iyz="0" izz="0.050000"/>
    </inertial>
  </link>

  <joint name="base_link_to_base_joint" type="fixed">
    <parent link="base_link"/>
    <child link="base"/>
    <origin xyz="0 0 0" rpy="0.000000 0.000000 0.000000"/>
  </joint>

  <!-- Shoulder Joint -->
  <link name="shoulderjoint">
    <visual>
      <origin xyz="0 0 0.1" rpy="0.000000 0.000000 0.000000"/>
      <geometry>
        <cylinder radius="0.04" length="0.08"/>
      </geometry>
      <material name="material_shoulderjoint_606060"/>
    </visual>
    <inertial>
      <mass value="0.5"/>
      <inertia ixx="0.000373" ixy="0" ixz="0" iyy="0.000373" iyz="0" izz="0.000400"/>
    </inertial>
  </link>

  <joint name="base_to_shoulderjoint_joint" type="revolute">
    <parent link="base"/>
    <child link="shoulderjoint"/>
    <origin xyz="0 0 0.1" rpy="0.000000 0.000000 0.000000"/>
    <axis xyz="0 0 1"/>
    <limit lower="-3.141593" upper="3.141593" effort="10" velocity="2"/>
    <dynamics damping="0.5" friction="0.1"/>
  </joint>

  <!-- Upper Arm -->
  <link name="upperarm">
    <visual>
      <origin xyz="0 0 0.35" rpy="0.000000 0.000000 0.000000"/>
      <geometry>
        <box size="0.05 0.05 0.4"/>
      </geometry>
      <material name="material_upperarm_3080c0"/>
    </visual>
    <collision>
      <origin xyz="0 0 0.35" rpy="0.000000 0.000000 0.000000"/>
      <geometry>
        <box size="0.05 0.05 0.4"/>
      </geometry>
    </collision>
    <inertial>
      <mass value="2"/>
      <inertia ixx="0.027083" ixy="0" ixz="0" iyy="0.027083" iyz="0" izz="0.000833"/>
    </inertial>
  </link>

  <joint name="base_link_to_upperarm_joint" type="fixed">
    <parent link="base_link"/>
    <child link="upperarm"/>
    <origin xyz="0 0 0.35" rpy="0.000000 0.000000 0.000000"/>
  </joint>

  <!-- Elbow Joint -->
  <link name="elbowjoint">
    <visual>
      <origin xyz="0 0 0.55" rpy="0.000000 0.000000 0.000000"/>
      <geometry>
        <cylinder radius="0.03" length="0.06"/>
      </geometry>
      <material name="material_shoulderjoint_606060"/>
    </visual>
    <inertial>
      <mass value="0.3"/>
      <inertia ixx="0.000117" ixy="0" ixz="0" iyy="0.000117" iyz="0" izz="0.000135"/>
    </inertial>
  </link>

  <joint name="upperarm_to_elbowjoint_joint" type="revolute">
    <parent link="upperarm"/>
    <child link="elbowjoint"/>
    <origin xyz="0 0 0.55" rpy="0.000000 0.000000 0.000000"/>
    <axis xyz="0 1 0"/>
    <limit lower="-2.356194" upper="2.356194" effort="5" velocity="1.5"/>
    <dynamics damping="0.3" friction="0.05"/>
  </joint>

  <!-- Forearm -->
  <link name="forearm">
    <visual>
      <origin xyz="0 0 0.75" rpy="0.000000 0.000000 0.000000"/>
      <geometry>
        <box size="0.04 0.04 0.3"/>
      </geometry>
      <material name="material_forearm_3080c0"/>
    </visual>
    <collision>
      <origin xyz="0 0 0.75" rpy="0.000000 0.000000 0.000000"/>
      <geometry>
        <box size="0.04 0.04 0.3"/>
      </geometry>
    </collision>
    <inertial>
      <mass value="1"/>
      <inertia ixx="0.007633" ixy="0" ixz="0" iyy="0.007633" iyz="0" izz="0.000267"/>
    </inertial>
  </link>

  <joint name="base_link_to_forearm_joint" type="fixed">
    <parent link="base_link"/>
    <child link="forearm"/>
    <origin xyz="0 0 0.75" rpy="0.000000 0.000000 0.000000"/>
  </joint>

  <!-- End Effector -->
  <link name="endeffector">
    <visual>
      <origin xyz="0 0 0.92" rpy="0.000000 0.000000 0.000000"/>
      <geometry>
        <mesh filename="package://meshes/gripper_v2.stl"/>
      </geometry>
      <material name="material_endeffector_808080"/>
    </visual>
    <collision>
      <origin xyz="0 0 0.92" rpy="0.000000 0.000000 0.000000"/>
      <geometry>
        <mesh filename="package://meshes/gripper_v2.stl"/>
      </geometry>
    </collision>
    <inertial>
      <mass value="0.5"/>
      <inertia ixx="0.000417" ixy="0" ixz="0" iyy="0.000417" iyz="0" izz="0.000417"/>
    </inertial>
  </link>

  <joint name="base_link_to_endeffector_joint" type="fixed">
    <parent link="base_link"/>
    <child link="endeffector"/>
    <origin xyz="0 0 0.92" rpy="0.000000 0.000000 0.000000"/>
  </joint>

  <!-- Transmissions -->
  <transmission name="shoulderjoint_transmission">
    <type>transmission_interface/SimpleTransmission</type>
    <joint name="base_to_shoulderjoint_joint">
      <hardwareInterface>hardware_interface/PositionJointInterface</hardwareInterface>
    </joint>
    <actuator name="shoulderjoint_actuator">
      <hardwareInterface>hardware_interface/PositionJointInterface</hardwareInterface>
    </actuator>
  </transmission>

  <transmission name="elbowjoint_transmission">
    <type>transmission_interface/SimpleTransmission</type>
    <joint name="upperarm_to_elbowjoint_joint">
      <hardwareInterface>hardware_interface/PositionJointInterface</hardwareInterface>
    </joint>
    <actuator name="elbowjoint_actuator">
      <hardwareInterface>hardware_interface/PositionJointInterface</hardwareInterface>
    </actuator>
  </transmission>

  <!-- ROS 2 Control Hardware Interface -->
  <ros2_control name="roboticslab_arm_ros2_control" type="system">
    <hardware>
      <plugin>gz_ros2_control/GazeboSimSystem</plugin>
    </hardware>
    <joint name="base_to_shoulderjoint_joint">
      <command_interface name="position"/>
      <state_interface name="position"/>
      <state_interface name="velocity"/>
    </joint>
    <joint name="upperarm_to_elbowjoint_joint">
      <command_interface name="position"/>
      <state_interface name="position"/>
      <state_interface name="velocity"/>
    </joint>
  </ros2_control>

  <!-- Isaac Sim Extensions -->
  <fixed_frame name="wrist_camera_frame">
    <parent link="endeffector"/>
    <origin rpy="0.0 0.0 0.0" xyz="0.0 0.0 0.05"/>
  </fixed_frame>

  <fixed_frame name="tcp">
    <parent link="endeffector"/>
    <origin rpy="0.0 0.0 0.0" xyz="0.0 0.0 0.15"/>
  </fixed_frame>

  <!-- Isaac Sim PhysX Tuning (for post-import configuration scripts) -->
  <!-- isaac_sim_config: drive_type=acceleration target_type=position -->
  <!-- isaac_sim_config: solver_position_iterations=8 solver_velocity_iterations=4 -->

  <!-- HoloScript Extensions -->
  <!-- Original composition: "Robotics Lab" -->
  <!-- Sensors: wrist_camera (camera), wrist_ft (force_torque) -->
</robot>
```

### 6.3 SDF Output (Gazebo Harmonic)

```xml
<?xml version="1.0"?>
<!-- Auto-generated by HoloScript SDFCompiler -->
<!-- Source: composition "Robotics Lab" -->
<!-- Target: Gazebo Harmonic (gz-sim) -->

<sdf version="1.8">
  <world name="robotics_lab">

    <!-- Gazebo Harmonic System Plugins -->
    <plugin filename="gz-sim-physics-system"
            name="gz::sim::systems::Physics">
      <engine><filename>gz-physics-dartsim-plugin</filename></engine>
    </plugin>
    <plugin filename="gz-sim-user-commands-system"
            name="gz::sim::systems::UserCommands"/>
    <plugin filename="gz-sim-scene-broadcaster-system"
            name="gz::sim::systems::SceneBroadcaster"/>
    <plugin filename="gz-sim-sensors-system"
            name="gz::sim::systems::Sensors">
      <render_engine>ogre2</render_engine>
    </plugin>
    <plugin filename="gz-sim-contact-system"
            name="gz::sim::systems::Contact"/>

    <physics name="1ms" type="dart">
      <max_step_size>0.001</max_step_size>
      <real_time_factor>1.0</real_time_factor>
      <real_time_update_rate>1000</real_time_update_rate>
    </physics>

    <scene>
      <ambient>0.4 0.4 0.4 1</ambient>
      <background>0.1 0.1 0.18 1</background>
      <shadows>true</shadows>
    </scene>

    <!-- Ground Plane -->
    <model name="ground_plane">
      <static>true</static>
      <link name="link">
        <collision name="collision">
          <geometry>
            <plane>
              <normal>0 0 1</normal>
              <size>100 100</size>
            </plane>
          </geometry>
        </collision>
        <visual name="visual">
          <geometry>
            <plane>
              <normal>0 0 1</normal>
              <size>100 100</size>
            </plane>
          </geometry>
          <material>
            <ambient>0.8 0.8 0.8 1</ambient>
            <diffuse>0.8 0.8 0.8 1</diffuse>
          </material>
        </visual>
      </link>
    </model>

    <!-- Lighting -->
    <light name="sun" type="directional">
      <cast_shadows>true</cast_shadows>
      <pose>0 0 10 0 0 0</pose>
      <diffuse>0.8 0.8 0.8 1</diffuse>
      <specular>0.2 0.2 0.2 1</specular>
      <direction>-0.5 0.1 -0.9</direction>
    </light>

    <!-- Robot Arm Model -->
    <model name="robotics_lab_arm">

      <!-- Base -->
      <link name="base_link">
        <pose>0 0 0 0 0 0</pose>
        <visual name="visual">
          <geometry>
            <cylinder>
              <radius>0.1</radius>
              <length>0.2</length>
            </cylinder>
          </geometry>
          <material>
            <ambient>0.251 0.251 0.251 1</ambient>
            <diffuse>0.251 0.251 0.251 1</diffuse>
            <specular>0.1 0.1 0.1 1</specular>
          </material>
        </visual>
        <collision name="collision">
          <geometry>
            <cylinder>
              <radius>0.1</radius>
              <length>0.2</length>
            </cylinder>
          </geometry>
        </collision>
        <inertial>
          <mass>5.0</mass>
          <inertia>
            <ixx>0.020833</ixx><ixy>0</ixy><ixz>0</ixz>
            <iyy>0.020833</iyy><iyz>0</iyz>
            <izz>0.050000</izz>
          </inertia>
        </inertial>
      </link>

      <!-- Shoulder Joint Link -->
      <link name="shoulderjoint_link">
        <pose relative_to="shoulder_joint">0 0 0 0 0 0</pose>
        <visual name="visual">
          <geometry>
            <cylinder>
              <radius>0.04</radius>
              <length>0.08</length>
            </cylinder>
          </geometry>
          <material>
            <ambient>0.376 0.376 0.376 1</ambient>
            <diffuse>0.376 0.376 0.376 1</diffuse>
          </material>
        </visual>
        <inertial>
          <mass>0.5</mass>
          <inertia>
            <ixx>0.000373</ixx><ixy>0</ixy><ixz>0</ixz>
            <iyy>0.000373</iyy><iyz>0</iyz>
            <izz>0.000400</izz>
          </inertia>
        </inertial>
      </link>

      <!-- Upper Arm Link -->
      <link name="upperarm_link">
        <pose relative_to="shoulderjoint_link">0 0 0.25 0 0 0</pose>
        <visual name="visual">
          <geometry>
            <box><size>0.05 0.05 0.4</size></box>
          </geometry>
          <material>
            <ambient>0.188 0.502 0.753 1</ambient>
            <diffuse>0.188 0.502 0.753 1</diffuse>
          </material>
        </visual>
        <collision name="collision">
          <geometry>
            <box><size>0.05 0.05 0.4</size></box>
          </geometry>
        </collision>
        <inertial>
          <mass>2.0</mass>
          <inertia>
            <ixx>0.027083</ixx><ixy>0</ixy><ixz>0</ixz>
            <iyy>0.027083</iyy><iyz>0</iyz>
            <izz>0.000833</izz>
          </inertia>
        </inertial>
      </link>

      <!-- Elbow Joint Link -->
      <link name="elbowjoint_link">
        <pose relative_to="elbow_joint">0 0 0 0 0 0</pose>
        <visual name="visual">
          <geometry>
            <cylinder>
              <radius>0.03</radius>
              <length>0.06</length>
            </cylinder>
          </geometry>
          <material>
            <ambient>0.376 0.376 0.376 1</ambient>
            <diffuse>0.376 0.376 0.376 1</diffuse>
          </material>
        </visual>
        <inertial>
          <mass>0.3</mass>
          <inertia>
            <ixx>0.000117</ixx><ixy>0</ixy><ixz>0</ixz>
            <iyy>0.000117</iyy><iyz>0</iyz>
            <izz>0.000135</izz>
          </inertia>
        </inertial>
      </link>

      <!-- Forearm Link -->
      <link name="forearm_link">
        <pose relative_to="elbowjoint_link">0 0 0.2 0 0 0</pose>
        <visual name="visual">
          <geometry>
            <box><size>0.04 0.04 0.3</size></box>
          </geometry>
          <material>
            <ambient>0.188 0.502 0.753 1</ambient>
            <diffuse>0.188 0.502 0.753 1</diffuse>
          </material>
        </visual>
        <collision name="collision">
          <geometry>
            <box><size>0.04 0.04 0.3</size></box>
          </geometry>
        </collision>
        <inertial>
          <mass>1.0</mass>
          <inertia>
            <ixx>0.007633</ixx><ixy>0</ixy><ixz>0</ixz>
            <iyy>0.007633</iyy><iyz>0</iyz>
            <izz>0.000267</izz>
          </inertia>
        </inertial>
      </link>

      <!-- End Effector Link -->
      <link name="endeffector_link">
        <pose relative_to="forearm_link">0 0 0.17 0 0 0</pose>
        <visual name="visual">
          <geometry>
            <mesh>
              <uri>model://gripper_v2.stl</uri>
            </mesh>
          </geometry>
          <material>
            <ambient>0.502 0.502 0.502 1</ambient>
            <diffuse>0.502 0.502 0.502 1</diffuse>
          </material>
        </visual>
        <collision name="collision">
          <geometry>
            <mesh>
              <uri>model://gripper_v2.stl</uri>
            </mesh>
          </geometry>
        </collision>
        <inertial>
          <mass>0.5</mass>
          <inertia>
            <ixx>0.000417</ixx><ixy>0</ixy><ixz>0</ixz>
            <iyy>0.000417</iyy><iyz>0</iyz>
            <izz>0.000417</izz>
          </inertia>
        </inertial>

        <!-- Wrist Camera Sensor -->
        <sensor name="wrist_camera" type="camera">
          <always_on>true</always_on>
          <update_rate>30</update_rate>
          <visualize>true</visualize>
          <camera>
            <horizontal_fov>1.2</horizontal_fov>
            <image>
              <width>640</width>
              <height>480</height>
              <format>R8G8B8</format>
            </image>
            <clip>
              <near>0.1</near>
              <far>100</far>
            </clip>
          </camera>
        </sensor>

        <!-- Force-Torque Sensor -->
        <sensor name="wrist_ft" type="force_torque">
          <always_on>true</always_on>
          <update_rate>100</update_rate>
          <force_torque>
            <measure_direction>child_to_parent</measure_direction>
          </force_torque>
        </sensor>
      </link>

      <!-- Joints -->
      <joint name="shoulder_joint" type="revolute">
        <parent>base_link</parent>
        <child>shoulderjoint_link</child>
        <pose relative_to="base_link">0 0 0.1 0 0 0</pose>
        <axis>
          <xyz>0 0 1</xyz>
          <limit>
            <lower>-3.141593</lower>
            <upper>3.141593</upper>
            <effort>10.0</effort>
            <velocity>2.0</velocity>
          </limit>
          <dynamics>
            <damping>0.5</damping>
            <friction>0.1</friction>
          </dynamics>
        </axis>
      </joint>

      <joint name="elbow_joint" type="revolute">
        <parent>upperarm_link</parent>
        <child>elbowjoint_link</child>
        <pose relative_to="upperarm_link">0 0 0.2 0 0 0</pose>
        <axis>
          <xyz>0 1 0</xyz>
          <limit>
            <lower>-2.356194</lower>
            <upper>2.356194</upper>
            <effort>5.0</effort>
            <velocity>1.5</velocity>
          </limit>
          <dynamics>
            <damping>0.3</damping>
            <friction>0.05</friction>
          </dynamics>
        </axis>
      </joint>

    </model>

  </world>
</sdf>
```

### 6.4 Isaac Sim Import Workflow

After generating the URDF and SDF files, the typical Isaac Sim workflow is:

```
1. Generate files:
   holoscript export urdf robot-arm.holo --isaac-sim
   holoscript export sdf robot-arm.holo --gazebo-harmonic

2. Import URDF into Isaac Sim:
   - Open Isaac Sim
   - File > Import Robot > URDF
   - Select robot_arm.urdf
   - Configure:
     * Base Type: Static (for fixed arm) or Moveable (for mobile)
     * Drive Type: Acceleration (recommended)
     * Default Drive Target: Position
     * Collision: Convex Decomposition (for mesh geometries)
   - Import

3. Post-import configuration:
   - Set PhysX solver iterations (8 position, 4 velocity)
   - Adjust joint drive gains if needed
   - Attach RTX sensors (if isaac_sim_config was specified)
   - Configure IsaacLab task environment

4. Parallel Gazebo simulation:
   gz sim robot_lab.sdf &
   ros2 launch ros_gz_bridge bridge.launch.py config:=bridge.yaml
```

### 6.5 Generated ROS 2 Launch File

```python
"""
ROS 2 Launch file for holoscript_robot_arm
Auto-generated by HoloScript URDFCompiler
"""

import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    pkg_share = get_package_share_directory('holoscript_robot_arm')
    urdf_file = os.path.join(pkg_share, 'urdf', 'robot_arm.urdf')

    with open(urdf_file, "r") as f:
        robot_description = f.read()

    # Robot State Publisher
    robot_state_publisher = Node(
        package='robot_state_publisher',
        executable='robot_state_publisher',
        parameters=[{
            'robot_description': robot_description,
            'use_sim_time': True,
        }],
        output='screen',
    )

    # RViz2
    rviz_config = os.path.join(pkg_share, "config", "display.rviz")
    rviz = Node(
        package='rviz2',
        executable='rviz2',
        arguments=['-d', rviz_config],
        parameters=[{'use_sim_time': True}],
        output='screen',
    )

    # Gazebo Harmonic
    gazebo = IncludeLaunchDescription(
        PythonLaunchDescriptionSource([
            FindPackageShare('ros_gz_sim'),
            '/launch/gz_sim.launch.py',
        ]),
        launch_arguments={'gz_args': '-r robot_lab.sdf'}.items(),
    )

    # Spawn robot
    spawn_entity = Node(
        package='ros_gz_sim',
        executable='create',
        arguments=['-topic', 'robot_description', '-name', 'robot_arm'],
        output='screen',
    )

    # Controllers
    joint_state_broadcaster_spawner = Node(
        package='controller_manager',
        executable='spawner',
        arguments=['joint_state_broadcaster'],
        output='screen',
    )

    joint_trajectory_controller_spawner = Node(
        package='controller_manager',
        executable='spawner',
        arguments=['joint_trajectory_controller'],
        output='screen',
    )

    return LaunchDescription([
        robot_state_publisher,
        rviz,
        gazebo,
        spawn_entity,
        joint_state_broadcaster_spawner,
        joint_trajectory_controller_spawner,
    ])
```

### 6.6 Generated controllers.yaml

```yaml
# Auto-generated by HoloScript URDFCompiler
# Robot: RoboticsLabArm

controller_manager:
  ros__parameters:
    update_rate: 50

    joint_state_broadcaster:
      type: joint_state_broadcaster/JointStateBroadcaster

    joint_trajectory_controller:
      type: joint_trajectory_controller/JointTrajectoryController

joint_trajectory_controller:
  ros__parameters:
    joints:
      - base_to_shoulderjoint_joint
      - upperarm_to_elbowjoint_joint
    command_interfaces:
      - position
    state_interfaces:
      - position
      - velocity
```

---

## References

- [Isaac Sim URDF Importer Extension (v6.0.0)](https://docs.isaacsim.omniverse.nvidia.com/6.0.0/importer_exporter/ext_isaacsim_asset_importer_urdf.html)
- [Isaac Sim URDF Import Tutorial (v4.5.0)](https://docs.isaacsim.omniverse.nvidia.com/4.5.0/robot_setup/import_urdf.html)
- [Isaac Sim Physics Simulation Fundamentals](https://docs.isaacsim.omniverse.nvidia.com/5.1.0/physics/simulation_fundamentals.html)
- [Gazebo Harmonic ROS 2 Interoperability](https://gazebosim.org/docs/harmonic/ros2_interop/)
- [Gazebo SDF Worlds Documentation](https://gazebosim.org/docs/latest/sdf_worlds/)
- [Migrating from Gazebo Classic to Gazebo Harmonic](https://gazebosim.org/docs/harmonic/migrating_gazebo_classic_ros2_packages/)
- [ROS 2 robot_state_publisher](https://index.ros.org/p/robot_state_publisher/)
- [Isaac Lab Asset Import Guide](https://isaac-sim.github.io/IsaacLab/main/source/how-to/import_new_asset.html)

---

## Appendix: Implementation Priority Matrix

| Change | Effort | Impact | Priority |
|--------|--------|--------|----------|
| Isaac Sim extension tags (sensor, loop_joint, fixed_frame) | Medium | High | P1 |
| Gazebo Harmonic plugin migration | Low | High | P1 |
| `compileForIsaacSim()` convenience function | Low | High | P1 |
| Unique material names | Low | Medium | P2 |
| Isaac Sim name sanitization (leading underscore) | Low | Low | P2 |
| SDF joint articulation support | High | High | P2 |
| SDF proper inertia calculation | Medium | Medium | P3 |
| SDF gz-sim system plugins | Low | Medium | P3 |
| ros_gz_bridge YAML generation | Medium | Medium | P3 |
| PhysX solver tuning annotations | Low | Low | P4 |
| Isaac Sim drive config hints | Low | Low | P4 |
