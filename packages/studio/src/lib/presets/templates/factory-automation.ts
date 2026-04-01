import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-factory-automation",
  name: "Factory Automation",
  description: "Industrial production line with conveyors, robots, and sensor monitoring",
  thumbnail: "🏭",
  tags: ["robotics","factory","industrial","automation"],
  category: "robotics",
  code: `composition "Factory Automation" {
  environment {
    skybox: "studio"
    ambient_light: 0.5
    shadows: true
  }

  object "FactoryFloor" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [24, 0.2, 16]
    color: "#666666"
  }

  object "ConveyorA" {
    @static
    geometry: "box"
    position: [-6, 0.5, 0]
    scale: [8, 0.15, 1.5]
    color: "#333344"
    label: "Intake Conveyor"
  }

  object "ConveyorB" {
    @static
    geometry: "box"
    position: [6, 0.5, 0]
    scale: [8, 0.15, 1.5]
    color: "#333344"
    label: "Output Conveyor"
  }

  object "WeldingStation" {
    @collidable
    @static
    geometry: "box"
    position: [-2, 1.5, -3]
    scale: [2, 3, 2]
    color: "#884422"
    metalness: 0.7
    roughness: 0.4
    label: "Welding Cell"
  }

  object "WeldArmA" {
    @joint type:"revolute" axis:[0,1,0]
    geometry: "capsule"
    position: [-2, 3.2, -3]
    rotation: [0, 0, -30]
    scale: [0.08, 0.8, 0.08]
    color: "#ffaa00"
    metalness: 0.8
    label: "Welder Arm"
  }

  object "WeldStatus" {
    @glowing
    geometry: "sphere"
    position: [-2, 3.5, -1.8]
    scale: [0.12, 0.12, 0.12]
    color: "#00ff00"
    emissive: "#00ff00"
    emissiveIntensity: 2.0
    label: "Active"
  }

  object "QAStation" {
    @collidable
    @static
    geometry: "box"
    position: [2, 1, -3]
    scale: [1.5, 2, 1.5]
    color: "#2244aa"
    metalness: 0.6
    label: "Quality Check"
  }

  object "QACamera" {
    @glowing
    geometry: "box"
    position: [2, 2.3, -2.3]
    scale: [0.3, 0.2, 0.2]
    color: "#111111"
    emissive: "#ff0000"
    emissiveIntensity: 0.5
    label: "Vision System"
  }

  object "PackagingBot" {
    @static
    geometry: "box"
    position: [8, 1.2, -3]
    scale: [1.8, 2.4, 1.8]
    color: "#44aa44"
    metalness: 0.5
    label: "Packaging Robot"
  }

  object "OutputBin" {
    @static
    geometry: "box"
    position: [10, 0.5, 0]
    scale: [2, 1, 1.5]
    color: "#445544"
    label: "Output: 0 units"
  }

  object "SafetyBarrier" {
    @collidable
    @static
    geometry: "box"
    position: [0, 0.6, 4]
    scale: [24, 1.2, 0.05]
    color: "#ffcc00"
    opacity: 0.5
    material: "glass"
    label: "Safety Perimeter"
  }
}`
};

export default template;
