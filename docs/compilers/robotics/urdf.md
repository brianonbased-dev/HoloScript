# URDF Compiler (ROS 2)

**Target**: `--target urdf` | **Output**: URDF XML | **Platform**: ROS 2 / Robot Description
Compiles HoloScript compositions to URDF (Unified Robot Description Format) for use with ROS 2.

## Usage

```bash
holoscript compile robot.holo --target urdf --output ./robot_description/
```

## Output Files

- `robot.urdf` - Complete robot description
- `robot.xacro` - Xacro macro version (when enabled)

## Proof Artifact

A validated ROS 2 URDF generated from the canonical `TwoDoFRobotArm` composition:

- [two-dof-arm.urdf](./two-dof-arm.urdf) — 2-DOF robot arm (184 lines, 5,382 bytes)
- [ROS 2 Validation Receipt](./ros2-validation-receipt.md) — Compatibility verification

The artifact includes:
- 6 links with inertial, visual, and collision geometry
- 2 revolute joints (shoulder + elbow) with limits and damping
- ROS 2 `robot_state_publisher` compatible structure

## See Also

- [Robotics Guide](/ecosystem/ROBOTICS_GUIDE.md) — Full robotics workflow, ROS 2 integration, and safety patterns
- [SDF Compiler](/compilers/robotics/sdf)
- [IoT Traits](/traits/iot)
- [Platform Overview](/compilers/)
