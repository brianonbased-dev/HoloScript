# SDF Compiler (Gazebo)

**Target**: `--target sdf` | **Output**: SDF XML | **Platform**: Gazebo Simulation
Compiles HoloScript compositions to SDF (Simulation Description Format) for Gazebo.

## Usage

```bash
holoscript compile world.holo --target sdf --output ./gazebo_worlds/
```

## Proof Artifact

A validated SDF generated from the canonical `TwoDoFRobotArm` composition:

- [two-dof-arm.sdf](./two-dof-arm.sdf) — Gazebo Classic / Ignition / Gazebo Sim compatible (233 lines, 6,595 bytes)
- [ROS 2 Validation Receipt](./ros2-validation-receipt.md) — Joint URDF/SDF compatibility verification

## See Also

- [HoloScript for ROS 2 Developers](./ros2.md) - End-to-end URDF, SDF, Gazebo, ros2_control, and Isaac Sim workflow
- [Robotics Guide](/ecosystem/ROBOTICS_GUIDE.md) — Full robotics workflow documentation
- [URDF Compiler](/compilers/robotics/urdf)
- [IoT Traits](/traits/iot)
- [Platform Overview](/compilers/)
