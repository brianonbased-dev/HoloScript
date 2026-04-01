import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-robot-arm",
  name: "Robot Arm Trainer",
  description: "URDF robot arm with joint control, kinematics, and ROS2 export",
  thumbnail: "🦾",
  tags: ["robotics","urdf","ros2","arm","joints"],
  category: "robotics",
  code: `composition "Robot Arm Lab" {
  environment {
    skybox: "studio"
    ambient_light: 0.7
    shadows: true
  }

  object "LabFloor" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.05, 0]
    scale: [10, 0.1, 10]
    color: "#e0e0e0"
  }

  object "RobotBase" {
    @collidable
    @static
    geometry: "cylinder"
    position: [0, 0.15, 0]
    scale: [0.6, 0.3, 0.6]
    color: "#333333"
    metalness: 0.8
    roughness: 0.3
    label: "Base (Fixed)"
  }

  object "Shoulder" {
    @joint type:"revolute" axis:[0,1,0] limits:[-180,180]
    geometry: "cylinder"
    position: [0, 0.6, 0]
    scale: [0.2, 0.6, 0.2]
    color: "#2244aa"
    metalness: 0.7
    roughness: 0.3
    label: "Shoulder Joint"
  }

  object "UpperArm" {
    @joint type:"revolute" axis:[1,0,0] limits:[-90,90]
    geometry: "capsule"
    position: [0, 1.3, 0]
    rotation: [0, 0, 0]
    scale: [0.12, 0.5, 0.12]
    color: "#4488cc"
    metalness: 0.6
    roughness: 0.4
    label: "Upper Arm"
  }

  object "Elbow" {
    @joint type:"revolute" axis:[1,0,0] limits:[-135,0]
    geometry: "sphere"
    position: [0, 1.8, 0]
    scale: [0.15, 0.15, 0.15]
    color: "#ffaa00"
    metalness: 0.8
    roughness: 0.2
    label: "Elbow Joint"
  }

  object "Forearm" {
    @joint type:"revolute" axis:[0,1,0] limits:[-180,180]
    geometry: "capsule"
    position: [0, 2.2, 0]
    scale: [0.1, 0.4, 0.1]
    color: "#4488cc"
    metalness: 0.6
    roughness: 0.4
    label: "Forearm"
  }

  object "Gripper" {
    @glowing
    geometry: "box"
    position: [0, 2.6, 0]
    scale: [0.2, 0.06, 0.15]
    color: "#cc4444"
    emissive: "#cc2222"
    emissiveIntensity: 0.3
    metalness: 0.9
    roughness: 0.1
    label: "End Effector"
  }

  object "WorkTable" {
    @collidable
    @static
    geometry: "box"
    position: [1.5, 0.4, 0]
    scale: [1, 0.8, 1]
    color: "#8b7355"
    roughness: 0.9
    label: "Workspace"
  }

  object "TargetObject" {
    @physics type:"dynamic" shape:"box"
    geometry: "box"
    position: [1.5, 1, 0]
    scale: [0.15, 0.15, 0.15]
    color: "#00cc66"
    label: "Pick Target"
  }
}`
};

export default template;
