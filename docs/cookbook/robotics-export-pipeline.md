# Robotics Export Pipeline

Export HoloScript scenes to URDF, SDF, and MJCF for ROS/Gazebo/MuJoCo.

## Scene Definition

```hsplus
// Define a 2-DOF robot arm
object "RobotArm" {
  @physics { mass: 5.0, collider: "mesh" }
  @networked { authority: "server" }

  // Base (fixed)
  object "Base" {
    @physics { mass: 10.0, fixed: true, collider: "cylinder" }
    geometry: { type: "cylinder", radius: 0.15, height: 0.1 }
    material: { color: "#444444", metalness: 0.8 }
    position: { x: 0, y: 0, z: 0 }
  }

  // Shoulder joint (revolute)
  object "ShoulderLink" {
    @physics { mass: 2.0, collider: "box" }
    @joint {
      type: "revolute",
      axis: { x: 0, y: 0, z: 1 },
      limits: { lower: -3.14, upper: 3.14, effort: 100, velocity: 1.0 }
    }
    geometry: { type: "box", size: { x: 0.08, y: 0.08, z: 0.4 } }
    material: { color: "#2196F3" }
    position: { x: 0, y: 0, z: 0.25 }
  }

  // Elbow joint (revolute)
  object "ForearmLink" {
    @physics { mass: 1.5, collider: "box" }
    @joint {
      type: "revolute",
      axis: { x: 0, y: 0, z: 1 },
      limits: { lower: -2.35, upper: 2.35, effort: 50, velocity: 2.0 }
    }
    geometry: { type: "box", size: { x: 0.06, y: 0.06, z: 0.35 } }
    material: { color: "#FF9800" }
    position: { x: 0, y: 0, z: 0.45 }
  }

  // End effector (gripper)
  object "Gripper" {
    @grabbable { physics: true }
    @joint {
      type: "prismatic",
      axis: { x: 1, y: 0, z: 0 },
      limits: { lower: 0, upper: 0.04, effort: 20, velocity: 0.5 }
    }
    geometry: { type: "box", size: { x: 0.1, y: 0.02, z: 0.05 } }
    material: { color: "#4CAF50" }
  }
}

// Target object for pick-and-place
object "Target" {
  @physics { mass: 0.2, collider: "sphere" }
  @grabbable { physics: true }
  geometry: { type: "sphere", radius: 0.03 }
  material: { color: "#E91E63" }
  position: { x: 0.5, y: 0, z: 0.1 }
}
```

## Export Commands

```bash
# URDF (ROS/Gazebo)
holoscript export robot_arm.hsplus --format urdf --output robot_arm.urdf

# SDF (Gazebo native)
holoscript export robot_arm.hsplus --format sdf --output robot_arm.sdf

# MJCF (MuJoCo)
holoscript export robot_arm.hsplus --format mjcf --output robot_arm.xml

# USD (Universal Scene Description)
holoscript export robot_arm.hsplus --format usd --output robot_arm.usda
```

## Export Mapping

| HoloScript          | URDF          | SDF           | MJCF         |
| ------------------- | ------------- | ------------- | ------------ |
| `object`            | `<link>`      | `<link>`      | `<body>`     |
| `@joint`            | `<joint>`     | `<joint>`     | `<joint>`    |
| `@physics.mass`     | `<inertial>`  | `<inertial>`  | `<inertial>` |
| `@physics.collider` | `<collision>` | `<collision>` | `<geom>`     |
| `geometry`          | `<visual>`    | `<visual>`    | `<geom>`     |
| `material`          | `<material>`  | `<material>`  | `<material>` |

## ROS Integration

```bash
# Launch in Gazebo with ROS controller
roslaunch holoscript_bridge spawn_robot.launch model:=robot_arm.urdf
```
