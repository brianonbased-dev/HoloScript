import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-interior-design",
  name: "Interior Design Studio",
  description: "Room layout with furniture placement and material preview",
  thumbnail: "🛋️",
  tags: ["architecture","interior","design","furniture"],
  category: "architecture",
  code: `composition "Interior Design" {
  environment {
    skybox: "studio"
    ambient_light: 0.6
    shadows: true
  }

  object "Floor" {
    @static
    geometry: "box"
    position: [0, -0.05, 0]
    scale: [8, 0.1, 6]
    color: "#c4a882"
    material: { roughness: 0.7 }
  }

  object "Sofa" {
    @static
    geometry: "box"
    position: [-2, 0.4, -2]
    scale: [2.5, 0.8, 1]
    color: "#4a6b8a"
    material: { roughness: 0.9 }
  }

  object "CoffeeTable" {
    @static
    geometry: "box"
    position: [0, 0.25, -1]
    scale: [1.2, 0.05, 0.6]
    color: "#8b6914"
    material: { roughness: 0.4, metalness: 0.1 }
  }

  object "Lamp" {
    @glowing
    geometry: "cone"
    position: [2.5, 1.2, -2.5]
    scale: [0.3, 0.4, 0.3]
    color: "#f5e6c8"
    emissive: "#ffddaa"
    emissiveIntensity: 1.5
  }

  object "Rug" {
    @static
    geometry: "cylinder"
    position: [0, 0.01, -1]
    scale: [2, 0.01, 1.5]
    color: "#8b4513"
    material: { roughness: 1.0 }
  }
}`
};

export default template;
