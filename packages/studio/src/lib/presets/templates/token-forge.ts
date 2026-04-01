import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-token-forge",
  name: "Token Forge",
  description: "Spinning 3D token with customizable material and branding",
  thumbnail: "🔥",
  tags: ["creator","token","crypto","mint"],
  category: "creator",
  code: `composition "Token Forge" {
  environment {
    skybox: "studio"
    ambient_light: 0.3
  }

  object "TokenCoin" {
    @material metalness:1.0 roughness:0.15
    geometry: "cylinder"
    position: [0, 1.5, 0]
    rotation: [90, 0, 0]
    scale: [1.5, 0.12, 1.5]
    color: "#ffd700"

    animation spin {
      property: "rotation.z"
      from: 0
      to: 360
      duration: 3000
      loop: infinite
      easing: "linear"
    }
  }

  object "TokenLabel" {
    @billboard
    geometry: "plane"
    position: [0, 1.5, 0.15]
    scale: [0.8, 0.8, 0.01]
    color: "#ffffff"
    label: "YOUR TOKEN"
  }

  object "Pedestal" {
    @static
    geometry: "cylinder"
    position: [0, 0.3, 0]
    scale: [1, 0.6, 1]
    color: "#1a1a2e"
    material: { metalness: 0.7 }
  }

  object "ForgeGlow" {
    @glowing
    geometry: "torus"
    position: [0, 1.5, 0]
    scale: [2, 2, 0.05]
    color: "#ff6600"
    emissive: "#ff4400"
    emissiveIntensity: 1.5
    material: { opacity: 0.4 }
  }
}`
};

export default template;
