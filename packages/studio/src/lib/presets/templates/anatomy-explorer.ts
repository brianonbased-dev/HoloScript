import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-anatomy-explorer",
  name: "Anatomy Explorer",
  description: "3D anatomy visualization with clickable organs and labeled systems",
  thumbnail: "🫀",
  tags: ["science","medical","anatomy","education"],
  category: "science",
  code: `composition "Anatomy Explorer" {
  environment {
    skybox: "studio"
    ambient_light: 0.7
    shadows: true
  }

  object "Floor" {
    @static
    geometry: "box"
    position: [0, -0.05, 0]
    scale: [8, 0.1, 8]
    color: "#e8e8e8"
  }

  object "Torso" {
    geometry: "capsule"
    position: [0, 1.5, 0]
    scale: [0.5, 0.8, 0.3]
    color: "#e8c8a8"
    opacity: 0.3
    material: "glass"
    label: "Torso (transparent)"
  }

  object "Heart" {
    @clickable
    @glowing
    geometry: "sphere"
    position: [0.1, 1.8, 0.1]
    scale: [0.18, 0.2, 0.15]
    color: "#cc2222"
    emissive: "#aa0000"
    emissiveIntensity: 0.5
    label: "Heart"

    animation beat {
      property: "scale"
      from: [0.18, 0.2, 0.15]
      to: [0.2, 0.22, 0.17]
      duration: 800
      loop: infinite
      easing: "easeInOut"
    }
  }

  object "LeftLung" {
    @clickable
    geometry: "sphere"
    position: [-0.2, 1.8, 0]
    scale: [0.2, 0.25, 0.15]
    color: "#cc8899"
    opacity: 0.6
    material: "glass"
    label: "Left Lung"
  }

  object "RightLung" {
    @clickable
    geometry: "sphere"
    position: [0.25, 1.8, 0]
    scale: [0.22, 0.27, 0.16]
    color: "#cc8899"
    opacity: 0.6
    material: "glass"
    label: "Right Lung"
  }

  object "Liver" {
    @clickable
    geometry: "sphere"
    position: [0.15, 1.4, 0.05]
    scale: [0.2, 0.12, 0.12]
    color: "#884433"
    label: "Liver"
  }

  object "Spine" {
    @static
    geometry: "cylinder"
    position: [0, 1.5, -0.15]
    scale: [0.04, 0.8, 0.04]
    color: "#eeeecc"
    label: "Spine"
  }

  object "InfoBoard" {
    @billboard
    geometry: "plane"
    position: [2, 2.5, -1]
    scale: [2, 1.5, 0.01]
    color: "#1a1a2e"
    label: "Click an organ to learn more"
  }

  object "RotateHint" {
    @billboard
    geometry: "plane"
    position: [0, 0.3, 2]
    scale: [2.5, 0.5, 0.01]
    color: "#222233"
    label: "Drag to rotate | Scroll to zoom"
  }
}`
};

export default template;
