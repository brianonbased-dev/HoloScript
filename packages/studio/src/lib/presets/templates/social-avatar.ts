import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-social-avatar",
  name: "Social Avatar Creator",
  description: "Customizable avatar display with accessory slots",
  thumbnail: "🧑‍🎤",
  tags: ["creator","avatar","social","character"],
  category: "creator",
  code: `composition "Avatar Creator" {
  environment {
    skybox: "studio"
    ambient_light: 1.0
    shadows: true
  }

  object "AvatarBody" {
    @physics
    geometry: "capsule"
    position: [0, 1.2, 0]
    scale: [0.4, 0.5, 0.4]
    color: "#e8b89d"
  }

  object "AvatarHead" {
    geometry: "sphere"
    position: [0, 2, 0]
    scale: [0.35, 0.4, 0.35]
    color: "#e8b89d"
  }

  object "Hair" {
    geometry: "sphere"
    position: [0, 2.2, -0.05]
    scale: [0.38, 0.25, 0.38]
    color: "#3a2a1a"
  }

  object "LeftEye" {
    geometry: "sphere"
    position: [-0.1, 2.05, 0.3]
    scale: [0.06, 0.06, 0.03]
    color: "#2244aa"
  }

  object "RightEye" {
    geometry: "sphere"
    position: [0.1, 2.05, 0.3]
    scale: [0.06, 0.06, 0.03]
    color: "#2244aa"
  }

  object "Turntable" {
    @static
    geometry: "cylinder"
    position: [0, 0.05, 0]
    scale: [1.5, 0.1, 1.5]
    color: "#222244"
    material: { metalness: 0.5 }
  }

  object "CustomizeLabel" {
    @billboard
    geometry: "plane"
    position: [0, 3, -1]
    scale: [2, 0.4, 0.01]
    color: "#1a1a2e"
    label: "Customize Your Avatar"
  }
}`
};

export default template;
