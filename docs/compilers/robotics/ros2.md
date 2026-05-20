# HoloScript for ROS 2 Developers

HoloScript is the semantic source layer above the ROS 2 robot stack. Keep the
robot definition in `.holo`, then compile the same source to the artifacts each
runtime expects:

```text
robot.holo
  -> URDFCompiler -> ROS 2 robot_description, RViz2, ros2_control, Isaac Sim URDF import
  -> SDFCompiler  -> Gazebo / Gazebo Harmonic worlds
  -> USDPhysicsCompiler -> native Isaac Sim / Omniverse scenes
```

The point is not to replace ROS 2. HoloScript owns the cross-target robot
semantics, provenance, and compiler receipts. ROS 2 still owns nodes, messages,
controllers, launch, drivers, and hardware safety.

## When To Use Each Target

| Target | Use it for | HoloScript output |
|--------|------------|-------------------|
| URDF | `robot_description`, RViz2, `robot_state_publisher`, MoveIt 2, `ros2_control`, Isaac Sim URDF import | `compile --target urdf` |
| SDF | Gazebo worlds, physics scenes, lights, sensors, world plugins | `compile --target sdf` |
| USD | Native Isaac Sim / Omniverse physics scenes, factory twins, Isaac Lab workflows | `compile --target usd --usd-context isaac_sim` |

URDF is the ROS 2 description path. SDF is the Gazebo world path. USD is the
native NVIDIA simulation path. For a robot team, the normal first proof is URDF
in RViz2 and SDF in Gazebo from the same `.holo` source.

## Package Layout

Create a ROS 2 overlay workspace and put generated artifacts in normal ROS
packages:

```bash
mkdir -p ~/ros2_ws/src
cd ~/ros2_ws/src
ros2 pkg create holoscript_robot_description --build-type ament_cmake --dependencies robot_state_publisher joint_state_publisher_gui rviz2
ros2 pkg create holoscript_robot_gazebo --build-type ament_cmake --dependencies ros_gz_sim ros_gz_bridge

mkdir -p holoscript_robot_description/urdf
mkdir -p holoscript_robot_description/launch
mkdir -p holoscript_robot_description/config
mkdir -p holoscript_robot_description/meshes
mkdir -p holoscript_robot_gazebo/worlds
```

Add this install rule to each package `CMakeLists.txt` for the directories it
owns:

```cmake
install(
  DIRECTORY urdf launch config meshes worlds
  DESTINATION share/${PROJECT_NAME}
  OPTIONAL
)
```

Then generate both robot and simulation artifacts:

```bash
holoscript compile robot.holo --target urdf -o ~/ros2_ws/src/holoscript_robot_description/urdf/robot.urdf
holoscript compile robot.holo --target sdf -o ~/ros2_ws/src/holoscript_robot_gazebo/worlds/robot.sdf
```

If the robot uses mesh geometry, keep mesh paths package-relative. A URDF mesh
reference should resolve through `package://holoscript_robot_description/meshes/...`.

## ROS 2 Display Launch

HoloScript emits raw URDF, so the launch file can load the file directly into
the `robot_description` parameter. Use Xacro only if your downstream package
intentionally wraps the generated URDF.

```python
import os

from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():
    pkg_share = get_package_share_directory("holoscript_robot_description")
    urdf_path = os.path.join(pkg_share, "urdf", "robot.urdf")

    with open(urdf_path, "r", encoding="utf-8") as handle:
        robot_description = handle.read()

    return LaunchDescription([
        Node(
            package="robot_state_publisher",
            executable="robot_state_publisher",
            parameters=[{
                "robot_description": robot_description,
                "use_sim_time": False,
            }],
            output="screen",
        ),
        Node(
            package="joint_state_publisher_gui",
            executable="joint_state_publisher_gui",
            output="screen",
        ),
        Node(
            package="rviz2",
            executable="rviz2",
            output="screen",
        ),
    ])
```

Build and launch:

```bash
cd ~/ros2_ws
source /opt/ros/jazzy/setup.bash
colcon build --symlink-install
source install/setup.bash
ros2 launch holoscript_robot_description display.launch.py
```

`robot_state_publisher` consumes `robot_description`, subscribes to
`joint_states`, and publishes link transforms on `/tf` and `/tf_static`. The
generated URDF should be valid before controllers or simulation are introduced.

## Gazebo Path

Use SDF when the question is a world, not just a robot description. HoloScript's
SDF compiler emits world-level physics, scene lighting, ground plane, objects,
joints, and Gazebo Harmonic system plugins when `gazeboVersion: "harmonic"` is
selected.

```bash
gz sim ~/ros2_ws/src/holoscript_robot_gazebo/worlds/robot.sdf
```

From ROS 2 launch, Gazebo Harmonic can also be started through `ros_gz_sim`:

```bash
ros2 launch ros_gz_sim gz_sim.launch.py gz_args:=$HOME/ros2_ws/src/holoscript_robot_gazebo/worlds/robot.sdf
```

Add `ros_gz_bridge` only for the topics the robot actually needs. Treat bridge
YAML as deployment configuration, not as part of the HoloScript source.

## ros2_control Path

When the composition declares actuated joints, compile URDF with the ROS 2
control path enabled:

```typescript
import { compileForROS2 } from "@holoscript/core/compiler";

const urdf = compileForROS2(composition, {
  robotName: "HoloScriptRobot",
  packageName: "holoscript_robot_description",
});
```

The generated URDF can include `ros2_control` and transmission metadata. After
generation, verify:

- Every joint named inside `ros2_control` exists in the URDF kinematic tree.
- Command and state interfaces match the intended controller.
- Passive or mimic joints are not accidentally given command interfaces.
- Hardware plugin names are swapped from mock/sim plugins to production drivers
  before real hardware launch.

Use `joint_state_broadcaster` for state publication and controller spawners for
actuated controllers. Keep controller YAML in the ROS package `config/`
directory so robot source and runtime tuning do not blur together.

## Isaac Sim URDF Path

HoloScript has two Isaac Sim paths:

- `compile --target usd --usd-context isaac_sim` for native USD / Isaac Lab.
- `compile --target urdf --isaac-sim` for the Isaac Sim URDF importer and ROS 2
  compatibility.

Use the URDF path when the robot already lives in a ROS 2 workflow or when a
team needs `robot_description` to be the common interchange point:

```bash
holoscript compile robot.holo --target urdf --isaac-sim -o robot.urdf
```

Then import the URDF in Isaac Sim or enable the ROS 2 robot-description importer
extension and import from a running ROS node. After import, verify units, inertia,
collision meshes, joint axes, drive type, and solver iteration settings before
using the scene for training or synthetic data.

## Validation Checklist

Run this sequence before treating a robot export as usable:

```bash
check_urdf ~/ros2_ws/src/holoscript_robot_description/urdf/robot.urdf
cd ~/ros2_ws
colcon build --symlink-install
source install/setup.bash
ros2 launch holoscript_robot_description display.launch.py
gz sim src/holoscript_robot_gazebo/worlds/robot.sdf
```

Then inspect:

- RViz2 shows the expected link tree with no missing mesh warnings.
- `/robot_description` contains the generated URDF.
- `/tf_static` contains fixed joints after startup.
- `/tf` updates when `joint_states` changes.
- Gazebo loads the SDF world without missing model or plugin paths.
- `ros2_control` controllers only load after the URDF and hardware plugin agree.

## Known Boundaries

URDF is a robot kinematic description, not a rich world format. Prefer SDF for
worlds, terrain, lights, scene physics, Gazebo plugins, and many sensor-heavy
simulation setups.

URDF closed-loop mechanisms, complex mimic behavior, and hardware-specific
control semantics still require review by a robotics engineer. HoloScript can
emit the bridge artifacts, but it cannot prove that a physical robot is safe to
energize without the team's normal hardware interlocks and bring-up procedure.

Mesh scale is always a validation item. Keep HoloScript compositions in meters,
store mesh assets with known units, and check Isaac Sim and Gazebo imports before
benchmarking or training.

## Community Publishing Plan

Ship a small public sample as the first ROS 2 proof:

1. `robot.holo` source plus generated `robot.urdf` and `robot.sdf`.
2. `holoscript_robot_description` package with `display.launch.py`.
3. `holoscript_robot_gazebo` package with one Gazebo Harmonic world.
4. A short README titled "Write the robot once, deploy to RViz2, Gazebo, Isaac
   Sim, and hardware from the same HoloScript source."
5. A ROS Discourse post that leads with the generated URDF/SDF artifacts and the
   reproducible validation commands.

## References

- [ROS 2 Jazzy colcon tutorial](https://docs.ros.org/en/jazzy/Tutorials/Beginner-Client-Libraries/Colcon-Tutorial.html)
- [ROS 2 Jazzy robot_state_publisher](https://docs.ros.org/en/ros2_packages/jazzy/api/robot_state_publisher/index.html)
- [ros2_control hardware interface types](https://control.ros.org/kilted/doc/ros2_control/hardware_interface/doc/hardware_interface_types_userdoc.html)
- [Gazebo Harmonic ROS 2 launch guide](https://gazebosim.org/docs/harmonic/ros2_launch_gazebo/)
- [SDFormat specification](https://sdformat.org/spec/1.8/model/)
- [NVIDIA Isaac Sim ROS 2 documentation](https://docs.isaacsim.omniverse.nvidia.com/latest/ros2_tutorials/ros2_landing_page.html)
- [NVIDIA Isaac Sim ROS 2 URDF importer extension](https://docs.isaacsim.omniverse.nvidia.com/4.5.0/py/source/extensions/isaacsim.ros2.urdf/docs/index.html)
