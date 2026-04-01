import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-portfolio",
  name: "3D Portfolio",
  description: "Interactive 3D portfolio with floating project cards and navigation",
  thumbnail: "💼",
  tags: ["web","portfolio","gallery","interactive"],
  category: "web",
  code: `composition "3D Portfolio" {
  environment {
    skybox: "studio"
    ambient_light: 0.9
    shadows: true
  }

  object "Floor" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.05, 0]
    scale: [20, 0.1, 12]
    color: "#f5f5f5"
  }

  object "ProjectCardA" {
    @clickable
    @billboard
    geometry: "plane"
    position: [-3, 1.5, -3]
    scale: [2, 1.4, 0.01]
    color: "#ffffff"
    label: "Project Alpha"
  }

  object "ProjectCardB" {
    @clickable
    @billboard
    geometry: "plane"
    position: [0, 1.5, -3]
    scale: [2, 1.4, 0.01]
    color: "#ffffff"
    label: "Project Beta"
  }

  object "ProjectCardC" {
    @clickable
    @billboard
    geometry: "plane"
    position: [3, 1.5, -3]
    scale: [2, 1.4, 0.01]
    color: "#ffffff"
    label: "Project Gamma"
  }

  object "NamePlate" {
    @billboard
    geometry: "plane"
    position: [0, 3.5, -4]
    scale: [6, 1, 0.01]
    color: "#222222"
    label: "Your Name — Portfolio"
  }

  object "AccentLight" {
    @light
    type: "spot"
    position: [0, 5, 2]
    rotation: [-50, 0, 0]
    color: "#ffffff"
    intensity: 2.0
    angle: 0.6
  }
}`
};

export default template;
