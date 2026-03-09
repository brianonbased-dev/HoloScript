# Industrial Robot Arm Simulation

**HoloScript robotics example with URDF/SDF export for ROS2 and Gazebo.**

## Overview

Complete 6-DOF industrial robot arm (UR5) with inverse kinematics, path planning, gripper, and sensors. Exports to URDF for ROS2 or SDF for Gazebo simulation.

### Features

✓ **6-DOF Articulated Arm** - Realistic UR5 kinematics and dynamics
✓ **Two-Finger Gripper** - Parallel jaw with force sensing
✓ **Inverse Kinematics** - TRAC-IK solver for end-effector positioning
✓ **Path Planning** - OMPL integration for collision-free trajectories
✓ **Sensors** - RGB camera (wrist), force/torque (gripper), proximity
✓ **URDF/SDF Export** - ROS2 and Gazebo compatible

## Quick Start

### Compile to URDF (ROS2)

```bash
holoscript compile robot-arm-simulation.holo --target urdf --output ./build/
```

**Output**: `ur5_robot.urdf` compatible with ROS2 + MoveIt

### Compile to SDF (Gazebo)

```bash
holoscript compile robot-arm-simulation.holo --target sdf --output ./build/
```

**Output**: `ur5_robot.sdf` for Gazebo Sim

### Visualize in Unity/Unreal

```bash
# Unity (robot visualization + training)
holoscript compile robot-arm-simulation.holo --target unity --output ./build/unity/

# Unreal (high-fidelity digital twin)
holoscript compile robot-arm-simulation.holo --target unreal --output ./build/unreal/
```

## Robot Specifications

**Universal Robots UR5**

- Reach: 850mm
- Payload: 5kg
- Repeatability: ±0.1mm
- Max Speed: 180°/s
- DOF: 6 (revolute joints)

**Gripper** (Robotiq 85)

- Max Opening: 85mm
- Gripping Force: 100N
- Payload: 2kg

## Use Cases

### Industrial Automation

- Pick and place operations
- Assembly line simulation
- Quality control inspection
- Warehouse automation

### Training & Education

- Robot programming training
- Operator safety certification
- Engineering education
- Digital twin development

### Research

- Motion planning algorithms
- Grasp planning
- Computer vision integration
- Human-robot collaboration

## ROS2 Integration

### 1. Generate URDF

```bash
holoscript compile robot-arm-simulation.holo --target urdf --output ./ros2_ws/src/ur5_description/urdf/
```

### 2. Launch in RViz

```bash
cd ros2_ws
colcon build
source install/setup.bash

ros2 launch ur5_description display.launch.py
```

### 3. MoveIt Configuration

```bash
ros2 launch moveit_setup_assistant setup_assistant.launch.py
# Load generated URDF
# Configure planning groups, controllers
```

### 4. Execute Motion

```python
from moveit_py import MoveGroupInterface

move_group = MoveGroupInterface("manipulator")

# Move to joint angles
move_group.go([0, -90, 90, -90, -90, 0], wait=True)

# Move to pose
target_pose = Pose()
target_pose.position.x = 0.5
target_pose.position.y = 0.2
target_pose.position.z = 0.8
move_group.set_pose_target(target_pose)
move_group.go(wait=True)
```

## Gazebo Simulation

### Launch in Gazebo

```bash
gazebo --verbose ur5_robot.sdf
```

### Control via ROS2

```bash
ros2 topic pub /joint_commands std_msgs/Float64MultiArray \
  "{data: [0.0, -1.57, 1.57, -1.57, -1.57, 0.0]}"
```

## Customization

### Modify Robot Parameters

```holoscript
robot#ur5_arm @industrial @6dof {
  specs {
    reach: 850  // Change reach
    payload: 5  // Change payload
    max_speed: 180  // Adjust speed
  }
}
```

### Add Custom End Effector

```holoscript
tool#vacuum_gripper @suction {
  parent: "tool0"

  suction_cup {
    diameter: 0.05
    max_vacuum: -80  // kPa
  }

  on_activate {
    apply_vacuum: -80
  }

  on_release {
    vent_vacuum: 0
  }
}
```

### Add Sensors

```holoscript
sensor#lidar @laser_scan {
  parent: "wrist_2_link"

  specs {
    min_angle: -180
    max_angle: 180
    resolution: 1  // degree
    range: { min: 0.1, max: 30 }
  }

  publish_topic: "/robot/scan"
}
```

## Resources

- [ROS2 Documentation](https://docs.ros.org/)
- [MoveIt2](https://moveit.ros.org/)
- [Gazebo Sim](https://gazebosim.org/)
- [Universal Robots](https://www.universal-robots.com/)

---

**Built with HoloScript** - Robot definition in 789 lines, exports to ROS2/Gazebo. 🤖
