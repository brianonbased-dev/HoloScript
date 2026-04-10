import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-music-visualizer",
  name: "Music Visualizer",
  description: "Audio-reactive rings and orbs with glow effects",
  thumbnail: "🎵",
  tags: ["art","audio","visualizer","particles"],
  category: "art",
  code: `composition "Audio Visualizer" {
  environment {
    skybox: "night"
    ambient_light: 0.05
    fog: { color: "#050510", density: 0.006 }
  }

  object "CenterOrb" {
    @glowing
    geometry: "sphere"
    position: [0, 2, 0]
    scale: [0.5, 0.5, 0.5]
    color: "#ff00cc"
    emissive: "#ff00cc"
    emissiveIntensity: 3.0

    animation pulse {
      property: "scale"
      from: [0.5, 0.5, 0.5]
      to: [0.65, 0.65, 0.65]
      duration: 500
      loop: infinite
      easing: "easeInOut"
    }
  }

  object "RingBass" {
    @glowing
    geometry: "torus"
    position: [0, 2, 0]
    scale: [2, 2, 0.05]
    rotation: [90, 0, 0]
    color: "#ff0066"
    emissive: "#ff0066"
    emissiveIntensity: 1.0

    animation expand {
      property: "scale"
      from: [2, 2, 0.05]
      to: [2.4, 2.4, 0.05]
      duration: 600
      loop: infinite
      easing: "easeInOut"
    }
  }

  object "RingMid" {
    @glowing
    geometry: "torus"
    position: [0, 2, 0]
    scale: [3, 3, 0.04]
    rotation: [70, 20, 0]
    color: "#00ccff"
    emissive: "#00ccff"
    emissiveIntensity: 0.6

    animation spin {
      property: "rotation.z"
      from: 0
      to: 360
      duration: 6000
      loop: infinite
      easing: "linear"
    }
  }

  object "RingHigh" {
    @glowing
    geometry: "torus"
    position: [0, 2, 0]
    scale: [4, 4, 0.03]
    rotation: [50, -30, 10]
    color: "#66ff00"
    emissive: "#66ff00"
    emissiveIntensity: 0.4

    animation spin {
      property: "rotation.y"
      from: 0
      to: -360
      duration: 10000
      loop: infinite
      easing: "linear"
    }
  }

  object "FloorGlow" {
    @glowing
    geometry: "cylinder"
    position: [0, 0, 0]
    scale: [6, 0.01, 6]
    color: "#1a0a2e"
    emissive: "#4400aa"
    emissiveIntensity: 0.5
    opacity: 0.6
    material: "glass"
  }
}`
};

export default template;
