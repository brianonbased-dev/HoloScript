import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-material-study",
  name: "Material Study",
  description: "PBR material comparison with varied metalness, roughness, and emission",
  thumbnail: "✨",
  tags: ["art","material","shader","pbr"],
  category: "art",
  code: `composition "Material Study" {
  environment {
    skybox: "studio"
    ambient_light: 0.6
    shadows: true
  }

  object "Backdrop" {
    @static
    geometry: "box"
    position: [0, 2, -3]
    scale: [10, 5, 0.1]
    color: "#1a1a1a"
  }

  object "MatteOrb" {
    geometry: "sphere"
    position: [-3, 1, 0]
    scale: [0.8, 0.8, 0.8]
    color: "#cc4444"
    metalness: 0.0
    roughness: 1.0
    label: "Matte"
  }

  object "PlasticOrb" {
    geometry: "sphere"
    position: [-1, 1, 0]
    scale: [0.8, 0.8, 0.8]
    color: "#44cc44"
    metalness: 0.0
    roughness: 0.3
    label: "Plastic"
  }

  object "MetalOrb" {
    geometry: "sphere"
    position: [1, 1, 0]
    scale: [0.8, 0.8, 0.8]
    color: "#cccccc"
    metalness: 1.0
    roughness: 0.2
    label: "Metal"
  }

  object "ChromeOrb" {
    geometry: "sphere"
    position: [3, 1, 0]
    scale: [0.8, 0.8, 0.8]
    color: "#eeeeee"
    metalness: 1.0
    roughness: 0.02
    label: "Chrome"
  }

  object "EmissiveOrb" {
    @glowing
    geometry: "sphere"
    position: [-1, 1, 2.5]
    scale: [0.8, 0.8, 0.8]
    color: "#6633ff"
    emissive: "#6633ff"
    emissiveIntensity: 2.0
    label: "Emissive"
  }

  object "GlassOrb" {
    geometry: "sphere"
    position: [1, 1, 2.5]
    scale: [0.8, 0.8, 0.8]
    color: "#aaddff"
    metalness: 0.1
    roughness: 0.0
    opacity: 0.4
    material: "glass"
    label: "Glass"
  }
}`
};

export default template;
