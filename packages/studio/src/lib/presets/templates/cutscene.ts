import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-cutscene",
  name: "Game Cutscene",
  description: "In-game cinematic with character marks, cameras, and mood lighting",
  thumbnail: "🎭",
  tags: ["film","cutscene","game","cinematic"],
  category: "film",
  code: `composition "Game Cutscene" {
  environment {
    skybox: "night"
    ambient_light: 0.15
    fog: { color: "#0a0a1a", density: 0.008 }
    shadows: true
  }

  object "Ground" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [12, 0.2, 12]
    color: "#1a1a2a"
  }

  object "HeroMark" {
    geometry: "capsule"
    position: [-1.5, 0.8, 0]
    scale: [0.4, 0.8, 0.4]
    color: "#3366cc"
    label: "Hero"
  }

  object "VillainMark" {
    geometry: "capsule"
    position: [1.5, 0.9, 0]
    scale: [0.45, 0.9, 0.45]
    color: "#cc3333"
    label: "Villain"
  }

  object "DramaticLight" {
    @light
    type: "spot"
    position: [0, 6, 3]
    rotation: [-60, 0, 0]
    color: "#ccaaff"
    intensity: 3.0
    angle: 0.3
  }

  object "CamOver" {
    @camera name:"Over the Shoulder"
    position: [-3, 2, 1.5]
    rotation: [-10, -25, 0]
  }

  object "CamDramatic" {
    @camera name:"Low Angle"
    position: [0, 0.5, 3]
    rotation: [10, 0, 0]
  }

  object "CamWide" {
    @camera name:"Establishing"
    position: [0, 4, 8]
    rotation: [-20, 0, 0]
  }
}`
};

export default template;
