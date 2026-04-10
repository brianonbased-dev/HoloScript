# HoloScript Robotics Guide

> Spatial programming for robotic systems

## Overview

HoloScript's scene graph model maps directly to robotic workspace definitions. This guide covers collision avoidance, path planning visualization, and ROS 2 integration.

## Why HoloScript for Robotics?

| HoloScript Feature | Robotics Application |
| ------------------ | -------------------- |
| Scene graph        | Workspace definition |
| `@physics` traits  | Collision detection  |
| `@behavior_tree`   | Robot behavior logic |
| Spatial zones      | Safety boundaries    |
| Animation system   | Motion trajectories  |

## Core Concepts

### 1. Workspace Definition

```holoscript
composition RobotWorkspace {
  environment {
    type: "industrial"
    scale: [10, 10, 3]  // meters
    gravity: [0, -9.81, 0]
  }

  objects {
    // Robot arm base
    robot#arm1 {
      model: "ur10e"
      position: [2, 0, 0]

      @urdf(source: "assets/ur10e.urdf")
      @collidable(layer: "robot")
      @kinematic
    }

    // Workspace obstacles
    obstacle#table {
      geometry: "box"
      dimensions: [2, 0.8, 1]
      position: [3, 0.4, 0]

      @static
      @collidable(layer: "environment")
    }

    // Safety zone
    zone#humanArea {
      bounds: [[-1, 0, -2], [1, 2, 2]]

      @trigger(layer: "human")
      @on_enter {
        emit("safety_stop", { robot: "arm1" })
      }
    }
  }
}
```

### 2. Collision Avoidance

```holoscript
robot#arm {
  @collision_avoidance(
    method: "swept_sphere",
    margin: 0.05,  // 5cm safety margin
    layers: ["environment", "human"]
  )

  @on_collision_predicted(threshold: 0.5) {
    // Triggered 500ms before potential collision
    call("planner.replan", { avoid: collision.obstacle })
  }
}
```

### 3. Behavior Trees

```holoscript
robot#picker {
  @behavior_tree {
    selector {
      sequence "pick_and_place" {
        condition: hasTask()
        action: moveTo(task.pickup)
        action: grasp()
        action: moveTo(task.dropoff)
        action: release()
      }
      action: idle()
    }
  }
}
```

## URDF Export

HoloScript compositions can export to URDF for ROS 2:

```bash
holoscript compile workspace.holo --target urdf -o robot_description/
```

### Generated URDF Structure

```xml
<?xml version="1.0"?>
<robot name="workspace">
  <link name="world"/>

  <link name="table">
    <collision>
      <geometry>
        <box size="2 0.8 1"/>
      </geometry>
    </collision>
  </link>

  <joint name="table_joint" type="fixed">
    <origin xyz="3 0.4 0"/>
    <parent link="world"/>
    <child link="table"/>
  </joint>
</robot>
```

## ROS 2 Integration

### Topic Bindings

```holoscript
robot#arm {
  @ros2_subscriber(
    topic: "/joint_states",
    msg_type: "sensor_msgs/JointState"
  )

  @ros2_publisher(
    topic: "/arm/goal",
    msg_type: "geometry_msgs/PoseStamped"
  )
}
```

### Action Server Integration

```holoscript
@ros2_action_client(
  action: "/move_group",
  action_type: "moveit_msgs/MoveGroup"
)

action moveTo(target) {
  goal: {
    request: {
      group_name: "manipulator",
      goal_constraints: [
        { position_constraints: [target] }
      ]
    }
  }
}
```

## Example: Pick-and-Place Cell

```holoscript
composition PickPlaceCell {
  environment {
    type: "industrial"
    frame_rate: 100  // Hz for real-time
  }

  objects {
    robot#ur10 {
      position: [0, 0, 0]
      @urdf(source: "ur10e.urdf")
      @ros2_moveit(group: "manipulator")
    }

    conveyor#input {
      position: [-1, 0.5, 0]
      @ros2_subscriber(topic: "/conveyor/parts")

      @state {
        parts: []
      }

      @on_message(topic: "/conveyor/parts") {
        state.parts.push(message.part)
        emit("part_available", message.part)
      }
    }

    bin#output {
      position: [1, 0.5, 0]
      capacity: 50

      @state {
        count: 0
      }
    }

    zone#pickZone {
      bounds: [[-1.5, 0, -0.5], [-0.5, 1, 0.5]]
      @trigger(layer: "gripper")
    }

    zone#placeZone {
      bounds: [[0.5, 0, -0.5], [1.5, 1, 0.5]]
      @trigger(layer: "gripper")
    }
  }

  logic {
    @on("part_available") {
      if (robot.state == "idle") {
        robot.execute("pick_and_place", {
          pickup: event.part.position,
          dropoff: bin.position
        })
      }
    }
  }
}
```

## Simulation Integration

### NVIDIA Isaac Sim

```holoscript
@isaac_sim(
  scene: "omniverse://localhost/NVIDIA/Samples/",
  physics_dt: 0.001,
  render_dt: 0.016
)
```

### Gazebo

```bash
holoscript compile workspace.holo --target sdf -o gazebo_world/
```

## Safety Patterns

### Speed Monitoring

```holoscript
robot#arm {
  @speed_monitor(
    max_linear: 1.5,    // m/s
    max_angular: 2.0,   // rad/s
    zone_limits: {
      "humanArea": { max_linear: 0.25 }
    }
  )
}
```

### Emergency Stop

```holoscript
@global_estop(
  trigger: "any_collision",
  recovery: "manual"
)
```

## Best Practices

1. **Define safety zones first** - Safety boundaries before kinematics
2. **Use collision layers** - Separate robot/human/environment
3. **Test in simulation** - Validate in Isaac Sim before deployment
4. **Version control URDF** - Track robot descriptions with code
5. **Real-time constraints** - Use `frame_rate` for timing guarantees

## Next Steps

- [Digital Twins Guide](./DIGITAL_TWINS.md) - Real-time robot monitoring
- [IoT Integration](./IOT_INTEGRATION.md) - Sensor fusion
- [Cross-Reality Patterns](./CROSS_REALITY.md) - AR for robot programming

## References

- [ROS 2 Documentation](https://docs.ros.org/en/rolling/)
- [MoveIt 2](https://moveit.picknik.ai/main/index.html)
- [NVIDIA Isaac Sim](https://developer.nvidia.com/isaac-sim)
- [URDF Specification](http://wiki.ros.org/urdf/XML)
