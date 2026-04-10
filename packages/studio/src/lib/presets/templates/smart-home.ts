import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-smart-home",
  name: "Smart Home Dashboard",
  description: "IoT-connected home with sensor overlays and device controls",
  thumbnail: "🏠",
  tags: ["architecture","iot","smart-home","dashboard"],
  category: "iot",
  code: `composition "Smart Home" {
  environment {
    skybox: "studio"
    ambient_light: 0.5
    shadows: true
  }

  object "HouseFrame" {
    @static
    geometry: "box"
    position: [0, 1, 0]
    scale: [6, 2, 4]
    color: "#e8e0d0"
    material: { opacity: 0.6 }
  }

  object "TempSensor" {
    @glowing
    geometry: "sphere"
    position: [-2, 1.5, 0]
    scale: [0.15, 0.15, 0.15]
    color: "#ff6644"
    emissive: "#ff4422"
    emissiveIntensity: 2.0
    label: "Living Room: 22C"
  }

  object "MotionSensor" {
    @glowing
    geometry: "sphere"
    position: [2, 1.5, 0]
    scale: [0.15, 0.15, 0.15]
    color: "#44ff66"
    emissive: "#22dd44"
    emissiveIntensity: 2.0
    label: "Kitchen: Active"
  }

  object "Dashboard" {
    @billboard
    geometry: "plane"
    position: [0, 3, -2]
    scale: [3, 1, 0.01]
    color: "#0a0a1a"
    emissive: "#1155cc"
    emissiveIntensity: 0.2
    label: "Smart Home Control Panel"
  }
}`
};

export default template;
