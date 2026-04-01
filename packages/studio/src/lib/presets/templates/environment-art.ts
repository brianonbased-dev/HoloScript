import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-environment-art",
  name: "Environment Art Scene",
  description: "Lush landscape with terrain, vegetation, and atmospheric fog",
  thumbnail: "🏔️",
  tags: ["art","environment","landscape","nature"],
  category: "art",
  code: `composition "Environment Art" {
  environment {
    skybox: "sunset"
    ambient_light: 0.4
    fog: { color: "#d4a87a", density: 0.004 }
    shadows: true
  }

  object "Terrain" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.5, 0]
    scale: [30, 1, 30]
    color: "#5a7a3a"
  }

  object "MountainA" {
    @static
    geometry: "cone"
    position: [-8, 3, -12]
    scale: [6, 8, 6]
    color: "#7a6a5a"
  }

  object "MountainB" {
    @static
    geometry: "cone"
    position: [5, 4, -15]
    scale: [8, 10, 8]
    color: "#8a7a6a"
  }

  object "TreeA" {
    @static
    geometry: "cone"
    position: [-3, 1.5, -3]
    scale: [1, 3, 1]
    color: "#2a5a2a"
  }

  object "TreeATrunk" {
    @static
    geometry: "cylinder"
    position: [-3, 0, -3]
    scale: [0.15, 1.5, 0.15]
    color: "#5a3a1a"
  }

  object "TreeB" {
    @static
    geometry: "cone"
    position: [2, 1.2, -5]
    scale: [0.8, 2.5, 0.8]
    color: "#3a6a3a"
  }

  object "Rock" {
    @collidable
    @static
    geometry: "sphere"
    position: [4, 0.3, -1]
    scale: [1.2, 0.8, 1.0]
    color: "#6a6a6a"
    roughness: 1.0
  }

  object "Lake" {
    geometry: "cylinder"
    position: [-2, -0.1, 2]
    scale: [4, 0.02, 3]
    color: "#3a6a9a"
    metalness: 0.3
    roughness: 0.05
    opacity: 0.8
    material: "glass"
  }
}`
};

export default template;
