# ROS 2 URDF / SDF Validation Receipt

> Generated: 2026-05-09  
> Source: `examples/robotics/demo-urdf-compilation.ts`  
> Composition: `TwoDoFRobotArm` (6 objects, 2 revolute joints)

## Proof Artifacts

| Format | File | Lines | Size | Status |
|--------|------|-------|------|--------|
| URDF (ROS 2) | [`two-dof-arm.urdf`](./two-dof-arm.urdf) | 184 | 5,382 bytes | Validated |
| SDF (Gazebo) | [`two-dof-arm.sdf`](./two-dof-arm.sdf) | 233 | 6,595 bytes | Validated |

## Validation Checks

- [x] Well-formed XML (parsed successfully)
- [x] Required `<robot>` root element (URDF)
- [x] Required `<sdf version="1.8">` root element (SDF)
- [x] Link/joint consistency (all joints reference existing links)
- [x] Inertial properties present for all links
- [x] Visual and collision geometry defined
- [x] Joint limits within valid ranges
- [x] Axis definitions normalized

## ROS 2 Compatibility

The URDF artifact is loadable in ROS 2 via:

```bash
# Standard ROS 2 robot description package
ros2 run robot_state_publisher robot_state_publisher two-dof-arm.urdf

# Or spawn in Gazebo
ros2 launch gazebo_ros spawn_entity.py -file two-dof-arm.urdf -entity two_dof_arm
```

## Gazebo Compatibility

The SDF artifact is loadable in Gazebo Classic / Ignition / Gazebo Sim via:

```bash
gazebo two-dof-arm.sdf
```

## Compilation Command

```bash
npx tsx examples/robotics/demo-urdf-compilation.ts
```

This regenerates the artifacts from the canonical HoloScript composition defined in the demo script.

## See Also

- [Robotics Guide](/ecosystem/ROBOTICS_GUIDE.md) — Full robotics workflow documentation
- [URDF Compiler](/compilers/robotics/urdf) — HoloScript → URDF compiler reference
- [SDF Compiler](/compilers/robotics/sdf) — HoloScript → SDF compiler reference
- [Robotics Export Pipeline](/cookbook/robotics-export-pipeline) — Step-by-step export tutorial
