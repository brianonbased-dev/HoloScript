import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-precision-agriculture",
  name: "Precision Agriculture",
  description: "Drone-based crop analysis with NDVI overlays",
  thumbnail: "🛰️",
  tags: ["agriculture","precision","drone","analysis"],
  category: "agriculture",
  code: `composition "Precision Agriculture" {
  environment {
    skybox: "day"
    ambient_light: 0.8
    shadows: true
  }

  object "Terrain" {
    @static
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [40, 0.2, 40]
    color: "#6b8e23"
  }

  object "FieldGrid" {
    @static
    geometry: "box"
    position: [0, 0.02, 0]
    scale: [30, 0.01, 30]
    color: "#228b22"
    material: { opacity: 0.7 }
  }

  object "HotspotA" {
    @glowing
    geometry: "cylinder"
    position: [-8, 0.1, 5]
    scale: [3, 0.05, 3]
    color: "#ff4444"
    emissive: "#ff2222"
    emissiveIntensity: 1.0
    label: "Low NDVI — Stress detected"
  }

  object "HotspotB" {
    @glowing
    geometry: "cylinder"
    position: [6, 0.1, -3]
    scale: [4, 0.05, 4]
    color: "#ffaa00"
    emissive: "#dd8800"
    emissiveIntensity: 0.8
    label: "Moderate — Needs water"
  }

  object "Drone" {
    @physics type:"dynamic"
    geometry: "box"
    position: [0, 8, 0]
    scale: [0.6, 0.1, 0.6]
    color: "#333333"
    metalness: 0.8
    label: "Survey Drone"
  }
}`
};

export default template;
