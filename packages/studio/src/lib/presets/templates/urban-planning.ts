import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-urban-planning",
  name: "Urban Planning Model",
  description: "City-scale block model with roads, buildings, and green spaces",
  thumbnail: "🏙️",
  tags: ["architecture","urban","city","planning"],
  category: "architecture",
  code: `composition "Urban Plan" {
  environment {
    skybox: "day"
    ambient_light: 0.7
    shadows: true
  }

  object "Terrain" {
    @static
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [30, 0.2, 30]
    color: "#6b8e23"
  }

  object "Road" {
    @static
    geometry: "box"
    position: [0, 0.01, 0]
    scale: [2, 0.02, 30]
    color: "#333333"
  }

  object "BlockA" {
    @static
    geometry: "box"
    position: [-5, 1.5, -4]
    scale: [3, 3, 3]
    color: "#c8c8c8"
  }

  object "BlockB" {
    @static
    geometry: "box"
    position: [5, 2.5, 2]
    scale: [4, 5, 3]
    color: "#a0b0c0"
  }

  object "Park" {
    @static
    geometry: "cylinder"
    position: [-5, 0.05, 5]
    scale: [4, 0.05, 4]
    color: "#228b22"
  }

  object "ParkTree" {
    @static
    geometry: "cone"
    position: [-5, 1, 5]
    scale: [1, 2, 1]
    color: "#2e8b2e"
  }
}`
};

export default template;
