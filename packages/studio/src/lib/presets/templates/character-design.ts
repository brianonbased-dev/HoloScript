import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-character-design",
  name: "Character Design Studio",
  description: "Rigging-ready character template with T-pose reference and lighting",
  thumbnail: "🧑‍🎨",
  tags: ["art","character","design","avatar"],
  category: "art",
  code: `composition "Character Studio" {
  environment {
    skybox: "studio"
    ambient_light: 0.8
    shadows: true
  }

  object "Floor" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.05, 0]
    scale: [6, 0.1, 6]
    color: "#e0e0e0"
  }

  object "CharacterBase" {
    geometry: "capsule"
    position: [0, 1, 0]
    scale: [0.4, 1.0, 0.4]
    color: "#d4a574"
    label: "Character Body"
  }

  object "Head" {
    geometry: "sphere"
    position: [0, 2.1, 0]
    scale: [0.35, 0.35, 0.35]
    color: "#d4a574"
  }

  object "LeftArm" {
    geometry: "capsule"
    position: [-0.7, 1.5, 0]
    rotation: [0, 0, 90]
    scale: [0.12, 0.5, 0.12]
    color: "#d4a574"
  }

  object "RightArm" {
    geometry: "capsule"
    position: [0.7, 1.5, 0]
    rotation: [0, 0, -90]
    scale: [0.12, 0.5, 0.12]
    color: "#d4a574"
  }

  object "GridReference" {
    @static
    geometry: "plane"
    position: [0, 0, -2]
    scale: [4, 4, 1]
    rotation: [0, 0, 0]
    color: "#cccccc"
    opacity: 0.3
    material: "glass"
  }

  object "FrontLight" {
    @light
    type: "spot"
    position: [0, 3, 4]
    rotation: [-30, 0, 0]
    color: "#ffffff"
    intensity: 2.0
    angle: 0.6
  }

  object "RimLight" {
    @light
    type: "spot"
    position: [0, 3, -3]
    rotation: [-40, 180, 0]
    color: "#aaccff"
    intensity: 1.5
    angle: 0.5
  }
}`
};

export default template;
