import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-building-walkthrough",
  name: "Building Walkthrough",
  description: "First-person architectural walkthrough with rooms and corridors",
  thumbnail: "🏗️",
  tags: ["architecture","walkthrough","building","interior"],
  category: "architecture",
  code: `composition "Building Walkthrough" {
  environment {
    skybox: "studio"
    ambient_light: 0.4
    shadows: true
  }

  object "Floor" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.05, 0]
    scale: [12, 0.1, 10]
    color: "#d4c4a0"
  }

  object "WallNorth" {
    @collidable
    @static
    geometry: "box"
    position: [0, 1.5, -5]
    scale: [12, 3, 0.2]
    color: "#f5f0e8"
  }

  object "WallSouth" {
    @collidable
    @static
    geometry: "box"
    position: [0, 1.5, 5]
    scale: [12, 3, 0.2]
    color: "#f5f0e8"
  }

  object "WallEast" {
    @collidable
    @static
    geometry: "box"
    position: [6, 1.5, 0]
    scale: [0.2, 3, 10]
    color: "#f0ebe0"
  }

  object "Window" {
    @static
    geometry: "box"
    position: [6.1, 1.8, 0]
    scale: [0.02, 1.5, 2]
    color: "#88bbdd"
    material: { opacity: 0.4, roughness: 0.0 }
  }

  object "CeilingLight" {
    @glowing
    geometry: "cylinder"
    position: [0, 2.9, 0]
    scale: [0.6, 0.02, 0.6]
    color: "#ffffff"
    emissive: "#ffffee"
    emissiveIntensity: 2.0
  }
}`
};

export default template;
