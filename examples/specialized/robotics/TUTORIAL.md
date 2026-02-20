# HoloScript Robotics Tutorial

Learn how to define robots with HoloScript and export to ROS2/Gazebo.

## Key Concepts

### 1. Robot Definition

```holoscript
robot#ur5_arm @industrial @6dof {
  name: "Universal Robots UR5"
  specs {
    reach: 850  // mm
    payload: 5  // kg
    degrees_of_freedom: 6
  }
}
```

**Traits**: `@industrial` (safety features), `@6dof` (6 joints)

### 2. Links (Rigid Bodies)

```holoscript
link#base_link @fixed {
  visual {
    geometry: "cylinder"
    material: "metal_gray"
  }

  collision {
    geometry: "cylinder"
  }

  inertial {
    mass: 4.0
    inertia: { ixx: 0.00443, iyy: 0.00443, izz: 0.0072 }
  }
}
```

**Three components**:
- `visual` - What you see
- `collision` - Physics shape
- `inertial` - Mass properties

### 3. Joints (Connections)

```holoscript
joint#shoulder_pan @revolute {
  parent: "base_link"
  child: "shoulder_link"

  axis: { x: 0, y: 0, z: 1 }  // Rotation axis
  origin: { x: 0, y: 0, z: 0.089159 }

  limits {
    lower: -360  // degrees
    upper: 360
    effort: 150  // Nm torque
    velocity: 180  // deg/s
  }

  controller @position_control {
    type: "pid"
    gains: { p: 100, i: 0.01, d: 10 }
  }
}
```

**Joint types**: `@revolute` (hinge), `@prismatic` (slider), `@fixed`

### 4. End Effectors

```holoscript
gripper#two_finger @parallel_jaw {
  parent: "tool0"

  joint#left_finger @prismatic {
    limits {
      lower: 0
      upper: 0.0425  // 42.5mm
    }
  }

  joint#right_finger @prismatic @mimic {
    mimic {
      joint: "left_finger"
      multiplier: 1.0  // Mirror movement
    }
  }
}
```

**Mimic joints**: Right finger copies left finger motion.

### 5. Sensors

```holoscript
sensor#wrist_camera @rgb_camera {
  parent: "wrist_2_link"

  specs {
    resolution: { width: 640, height: 480 }
    fov: 60
    update_rate: 30  // Hz
  }

  publish_topic: "/robot/wrist_camera/image_raw"
}
```

**Sensor types**: `@rgb_camera`, `@force_torque`, `@range`, `@laser_scan`

### 6. Inverse Kinematics

```holoscript
ik_solver#arm_ik @kdl {
  chain: ["base_link", "shoulder_link", ..., "tool0"]
  algorithm: "TRAC_IK"

  solve_ik(target_pose) {
    solutions = compute_ik: {
      position: target_pose.position,
      orientation: target_pose.orientation
    }

    return select_nearest_solution(solutions)
  }
}
```

**Converts**: Cartesian pose (x, y, z, roll, pitch, yaw) → Joint angles

### 7. Path Planning

```holoscript
path_planner#moveit @ompl {
  planner: "RRTConnect"

  plan_path(start, goal) {
    trajectory = compute_trajectory: {
      start: start,
      goal: goal,
      timeout: 5.0
    }

    return trajectory
  }
}
```

**Algorithms**: RRT, RRTConnect, PRM (collision-free paths)

### 8. URDF Export

```holoscript
export#urdf_export @ros2_compatible {
  target: "urdf"
  output_file: "ur5_robot.urdf"

  options {
    include_transmission: true
    ros2_control: true
  }
}
```

**Generates**: Standard URDF file for ROS2, MoveIt, RViz

## Workflow

1. **Define robot** - Links, joints, sensors
2. **Add controllers** - PID gains, limits
3. **Configure IK** - End-effector solver
4. **Export URDF** - Compile to ROS2
5. **Simulate** - Test in Gazebo
6. **Deploy** - Physical robot (if available)

## Best Practices

- **Realistic inertia**: Use CAD tools to calculate
- **Conservative limits**: Start with 50% of real limits
- **PID tuning**: Start low (P=10), increase gradually
- **Collision geometry**: Simpler than visual (performance)
- **Sensor placement**: Avoid self-occlusion

## Next Steps

- Add custom end effector
- Integrate computer vision
- Implement grasp planning
- Multi-robot coordination

---

**Robotics made declarative.** Define once, deploy to ROS2/Gazebo/Unity.
