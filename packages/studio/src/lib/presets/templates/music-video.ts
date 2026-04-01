import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-music-video",
  name: "Music Video Stage",
  description: "Concert stage with particle effects and audio-reactive lights",
  thumbnail: "🎶",
  tags: ["film","music","stage","particles","audio"],
  category: "film",
  code: `composition "Music Video Stage" {
  environment {
    skybox: "night"
    ambient_light: 0.05
    fog: { color: "#050510", density: 0.01 }
  }

  object "Stage" {
    @collidable
    @static
    geometry: "box"
    position: [0, 0, 0]
    scale: [10, 0.5, 6]
    color: "#111111"
  }

  object "SpotlightLeft" {
    @glowing
    geometry: "cone"
    position: [-4, 6, -2]
    rotation: [15, 0, 15]
    scale: [0.8, 4, 0.8]
    color: "#ff0066"
    emissive: "#ff0066"
    emissiveIntensity: 2.0
    opacity: 0.3
    material: "glass"
  }

  object "SpotlightRight" {
    @glowing
    geometry: "cone"
    position: [4, 6, -2]
    rotation: [15, 0, -15]
    scale: [0.8, 4, 0.8]
    color: "#0066ff"
    emissive: "#0066ff"
    emissiveIntensity: 2.0
    opacity: 0.3
    material: "glass"
  }

  object "DiscoBall" {
    @glowing
    geometry: "sphere"
    position: [0, 5, -1]
    scale: [0.5, 0.5, 0.5]
    color: "#cccccc"
    metalness: 1.0
    roughness: 0.1

    animation spin {
      property: "rotation.y"
      from: 0
      to: 360
      duration: 4000
      loop: infinite
      easing: "linear"
    }
  }

  object "SpeakerLeft" {
    @static
    geometry: "box"
    position: [-5, 1, -1]
    scale: [1, 2, 1]
    color: "#222222"
  }

  object "SpeakerRight" {
    @static
    geometry: "box"
    position: [5, 1, -1]
    scale: [1, 2, 1]
    color: "#222222"
  }

  object "PerformerSpot" {
    @glowing
    geometry: "cylinder"
    position: [0, 0.3, -1]
    scale: [1, 0.02, 1]
    color: "#ffffff"
    emissive: "#ffffff"
    emissiveIntensity: 1.0

    animation glow {
      property: "material.emissiveIntensity"
      from: 0.5
      to: 2.0
      duration: 800
      loop: infinite
      easing: "easeInOut"
    }
  }
}`
};

export default template;
