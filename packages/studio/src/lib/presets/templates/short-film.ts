import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-short-film",
  name: "Short Film Set",
  description: "Cinematic set with camera positions, key lighting, and backdrop",
  thumbnail: "🎥",
  tags: ["film","cinematic","camera","lighting"],
  category: "film",
  code: `composition "Short Film Set" {
  environment {
    skybox: "sunset"
    ambient_light: 0.3
    fog: { color: "#1a0a2e", density: 0.005 }
    shadows: true
  }

  object "StageFloor" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.05, 0]
    scale: [15, 0.1, 10]
    color: "#2a2a2a"
  }

  object "Backdrop" {
    @static
    geometry: "box"
    position: [0, 4, -5]
    scale: [15, 8, 0.2]
    color: "#1a1a3a"
  }

  object "ActorMark" {
    geometry: "cylinder"
    position: [0, 0.02, 0]
    scale: [0.5, 0.01, 0.5]
    color: "#ff4444"
    label: "Actor Mark"
  }

  object "KeyLight" {
    @light
    type: "spot"
    position: [4, 5, 3]
    rotation: [-40, 25, 0]
    color: "#fff5e6"
    intensity: 3.0
    angle: 0.5
  }

  object "FillLight" {
    @light
    type: "spot"
    position: [-3, 4, 2]
    rotation: [-35, -20, 0]
    color: "#aabbdd"
    intensity: 1.2
    angle: 0.6
  }

  object "RimLight" {
    @light
    type: "spot"
    position: [0, 5, -4]
    rotation: [-50, 0, 0]
    color: "#eeddff"
    intensity: 2.0
    angle: 0.4
  }

  object "CameraA" {
    @camera name:"Wide Shot"
    position: [0, 2, 6]
    rotation: [-10, 0, 0]
  }

  object "CameraB" {
    @camera name:"Close-up"
    position: [1, 1.5, 2]
    rotation: [-5, -10, 0]
  }
}`
};

export default template;
