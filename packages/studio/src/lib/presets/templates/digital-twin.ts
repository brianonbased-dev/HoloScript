import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-digital-twin",
  name: "Digital Twin",
  description: "Factory floor digital twin with machines, conveyors, and status indicators",
  thumbnail: "🏭",
  tags: ["iot","twin","factory","industrial"],
  category: "iot",
  code: `composition "Factory Digital Twin" {
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
    scale: [20, 0.2, 14]
    color: "#555566"
  }

  object "ConveyorBelt" {
    @static
    geometry: "box"
    position: [0, 0.4, 0]
    scale: [12, 0.15, 1.5]
    color: "#333344"
  }

  object "MachineA" {
    @collidable
    @static
    geometry: "box"
    position: [-4, 1.5, -3]
    scale: [2, 3, 2]
    color: "#2244aa"
    label: "CNC-001"
  }

  object "MachineAStatus" {
    @glowing
    geometry: "sphere"
    position: [-4, 3.2, -3]
    scale: [0.2, 0.2, 0.2]
    color: "#00ff00"
    emissive: "#00ff00"
    emissiveIntensity: 2.0
  }

  object "MachineB" {
    @collidable
    @static
    geometry: "box"
    position: [4, 1.5, -3]
    scale: [2, 3, 2]
    color: "#aa4422"
    label: "PRESS-002"
  }

  object "MachineBStatus" {
    @glowing
    geometry: "sphere"
    position: [4, 3.2, -3]
    scale: [0.2, 0.2, 0.2]
    color: "#ffaa00"
    emissive: "#ffaa00"
    emissiveIntensity: 2.0
    label: "Maintenance Due"
  }

  object "RoboticArm" {
    @static
    geometry: "capsule"
    position: [0, 1.5, -3]
    rotation: [0, 0, -30]
    scale: [0.15, 1.5, 0.15]
    color: "#888888"
    metalness: 0.8
    roughness: 0.3
    label: "ARM-003"
  }

  object "OutputBin" {
    @static
    geometry: "box"
    position: [7, 0.5, 0]
    scale: [2, 1, 1.5]
    color: "#445544"
    label: "Output: 847 units"
  }
}`
};

export default template;
