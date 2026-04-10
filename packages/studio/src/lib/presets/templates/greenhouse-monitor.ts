import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-greenhouse-monitor",
  name: "Greenhouse Monitor",
  description: "Climate-controlled greenhouse with sensor overlays",
  thumbnail: "🌱",
  tags: ["agriculture","greenhouse","sensors","climate"],
  category: "agriculture",
  code: `composition "Greenhouse Monitor" {
  environment {
    skybox: "studio"
    ambient_light: 0.6
    fog: { color: "#e8f5e8", density: 0.01 }
  }

  object "Frame" {
    @static
    geometry: "box"
    position: [0, 1.5, 0]
    scale: [8, 3, 12]
    color: "#ccddcc"
    material: { opacity: 0.3 }
  }

  object "PlantBedA" {
    @static
    geometry: "box"
    position: [-2, 0.3, -3]
    scale: [3, 0.4, 2]
    color: "#3a5a2f"
  }

  object "PlantBedB" {
    @static
    geometry: "box"
    position: [2, 0.3, 3]
    scale: [3, 0.4, 2]
    color: "#4a6a3f"
  }

  object "TempSensor" {
    @glowing
    geometry: "sphere"
    position: [0, 2.5, 0]
    scale: [0.12, 0.12, 0.12]
    color: "#ff8844"
    emissive: "#ff6622"
    emissiveIntensity: 2.0
    label: "28C / 80% humidity"
  }

  object "GrowLight" {
    @glowing
    geometry: "box"
    position: [0, 2.8, 0]
    scale: [6, 0.05, 0.3]
    color: "#ff88ff"
    emissive: "#cc44cc"
    emissiveIntensity: 2.5
  }
}`
};

export default template;
