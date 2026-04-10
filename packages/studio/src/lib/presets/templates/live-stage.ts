import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-live-stage",
  name: "Virtual Live Stage",
  description: "Concert and streaming stage with lighting rigs and effects",
  thumbnail: "🎤",
  tags: ["creator","stage","concert","streaming"],
  category: "creator",
  code: `composition "Live Stage" {
  environment {
    skybox: "night"
    ambient_light: 0.05
    fog: { color: "#0a0020", density: 0.02 }
  }

  object "StagePlatform" {
    @collidable
    @static
    geometry: "box"
    position: [0, 0.3, 0]
    scale: [12, 0.6, 6]
    color: "#1a1a2e"
    material: { roughness: 0.2 }
  }

  object "SpotlightLeft" {
    @glowing
    geometry: "cone"
    position: [-4, 5, -2]
    rotation: [-20, 0, 10]
    scale: [0.5, 3, 0.5]
    color: "#ff0066"
    emissive: "#ff0066"
    emissiveIntensity: 3.0
    material: { opacity: 0.3 }
  }

  object "SpotlightRight" {
    @glowing
    geometry: "cone"
    position: [4, 5, -2]
    rotation: [-20, 0, -10]
    scale: [0.5, 3, 0.5]
    color: "#0066ff"
    emissive: "#0066ff"
    emissiveIntensity: 3.0
    material: { opacity: 0.3 }
  }

  object "Mic" {
    @static
    geometry: "cylinder"
    position: [0, 1.3, 0]
    scale: [0.02, 1, 0.02]
    color: "#333333"
    metalness: 0.8
  }

  object "MicHead" {
    @static
    geometry: "sphere"
    position: [0, 1.85, 0]
    scale: [0.06, 0.08, 0.06]
    color: "#444444"
    metalness: 0.9
  }

  object "ScreenBackdrop" {
    @billboard
    @glowing
    geometry: "plane"
    position: [0, 3, -2.8]
    scale: [10, 3, 0.01]
    color: "#0a0a2e"
    emissive: "#2211aa"
    emissiveIntensity: 0.5
    label: "LIVE"
  }
}`
};

export default template;
