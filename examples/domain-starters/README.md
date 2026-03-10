# Domain Starters

Minimal working HoloScript templates for vertical industry domains. Each starter is a single `.holo` file that compiles out of the box and demonstrates the core patterns for its vertical.

## Available Starters

| Domain             | File                                         | Key Features                                                                   | Primary Targets           |
| ------------------ | -------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------- |
| **Healthcare**     | `healthcare/healthcare-starter.holo`         | Patient vitals dashboard, AR anatomy viewer, guided procedures, hand tracking  | iOS, Android, OpenXR      |
| **Industrial IoT** | `industrial-iot/industrial-iot-starter.holo` | Digital twin sync, sensor telemetry, predictive maintenance, SCADA dashboard   | DTDL, OpenXR, WebGPU      |
| **Robotics**       | `robotics/robotics-starter.holo`             | 3-DOF arm, joint kinematics, safety zones, ROS 2 bridge                        | URDF, SDF, OpenXR, WebGPU |
| **IoT (Smart Home)** | `iot/iot-starter.holo`                    | Thermostat, smart lights, door sensors, energy meter, MQTT telemetry           | R3F, Unity, OpenXR        |
| **Music**          | `music/music-starter.holo`                   | Spatial audio, MIDI instruments, frequency visualizer, mixing console          | R3F, Unity, Godot         |
| **Navigation**     | `navigation/navigation-starter.holo`         | Waypoints, route planning, compass HUD, POI markers, turn-by-turn guidance     | iOS, Android, OpenXR      |
| **Web3**           | `web3/web3-starter.holo`                     | NFT gallery, wallet connection, token-gated zones, x402 payments               | R3F, Unity, OpenXR        |
| **DataViz**        | `dataviz/dataviz-starter.holo`               | 3D bar charts, scatter plots, heatmaps, data binding, interactive filtering    | R3F, Unity, OpenXR        |
| **Education**      | `education/education-starter.holo`           | Lesson boards, quizzes, 3D annotations, progress tracking, LMS integration    | R3F, Unity, OpenXR        |
| **Architecture**   | `architecture/architecture-starter.holo`     | BIM walkthrough, floor plan overlay, sun path analysis, material sampler       | Unity, OpenXR, R3F        |
| **Input**          | `input/input-starter.holo`                   | Hand tracking, eye gaze, voice commands, gesture recognition, haptic feedback  | OpenXR, Unity, R3F        |
| **Rendering**      | `rendering/rendering-starter.holo`           | PBR material gallery, custom shaders, volumetric fog, post-processing stack    | R3F, Unity, Godot         |
| **Procedural**     | `procedural/procedural-starter.holo`         | Terrain generation, L-system trees, noise fields, vegetation, cloud layers     | R3F, Unity, Godot         |

## Quick Start

```bash
# Pick a starter and compile to your target platform
holoscript compile examples/domain-starters/healthcare/healthcare-starter.holo --target ios
holoscript compile examples/domain-starters/industrial-iot/industrial-iot-starter.holo --target dtdl
holoscript compile examples/domain-starters/robotics/robotics-starter.holo --target urdf
```

## How to Use These Templates

1. **Copy** the starter file into your project directory.
2. **Rename** the composition and metadata to match your application.
3. **Replace placeholder models** (geometries like `"sphere"` or `"cube"`) with your actual 3D assets (`.usdz`, `.glb`, `.fbx`).
4. **Connect data sources** -- WebSocket, MQTT, OPC-UA, REST, or FHIR endpoints depending on the domain.
5. **Compile** to your target platform and iterate.

## What Each Starter Includes

Every starter follows the same structure for consistency:

- **`metadata { }`** -- Project info, tags, target platforms
- **`template "..." { }`** -- Reusable component definitions with traits
- **Objects and spatial groups** -- Scene layout with physics, collision, and interaction
- **`state { }`** -- Application state management
- **`action ...() { }`** -- Callable logic for user interactions and data handling
- **`system "..." { }`** -- Platform integrations (ROS 2, Azure DT, etc.)

## Relationship to Other Examples

These starters are intentionally minimal. For full-featured examples with complete scene detail, see:

- `examples/real-world/medical-training.holo` -- Full surgical training simulator
- `examples/specialized/iot/smart-factory-twin.holo` -- Complete factory floor with 50+ objects
- `examples/specialized/robotics/robot-arm-simulation.holo` -- UR5 6-DOF arm with welding/painting programs
- `examples/robotics/two-dof-robot-arm.holo` -- Minimal kinematic chain example

## Adding a New Domain Starter

1. Create a directory under `domain-starters/` named after the vertical (e.g., `agriculture/`).
2. Add a single `<domain>-starter.holo` file following the structure above.
3. Include a header comment block with compile instructions and extension guidance.
4. Update this README table.

## Resources

- [HoloScript Template Reference](../TEMPLATE/README.md)
- [Quickstart Examples](../quickstart/README.md)
- [Full Example Index](../INDEX.md)
