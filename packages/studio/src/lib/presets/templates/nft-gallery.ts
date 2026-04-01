import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-nft-gallery",
  name: "NFT Gallery Space",
  description: "Virtual art exhibition for displaying and minting NFTs",
  thumbnail: "🖼️",
  tags: ["creator","nft","gallery","art"],
  category: "creator",
  code: `composition "NFT Gallery" {
  environment {
    skybox: "night"
    ambient_light: 0.15
  }

  object "Floor" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.05, 0]
    scale: [16, 0.1, 12]
    color: "#0a0a12"
    material: { roughness: 0.1 }
  }

  object "ArtFrameA" {
    @billboard
    @glowing
    geometry: "plane"
    position: [-4, 1.8, -5.5]
    scale: [2, 1.5, 0.01]
    color: "#111122"
    emissive: "#4444aa"
    emissiveIntensity: 0.2
    label: "Art #001"
  }

  object "ArtFrameB" {
    @billboard
    @glowing
    geometry: "plane"
    position: [0, 1.8, -5.5]
    scale: [2, 1.5, 0.01]
    color: "#111122"
    emissive: "#aa4444"
    emissiveIntensity: 0.2
    label: "Art #002"
  }

  object "ArtFrameC" {
    @billboard
    @glowing
    geometry: "plane"
    position: [4, 1.8, -5.5]
    scale: [2, 1.5, 0.01]
    color: "#111122"
    emissive: "#44aa44"
    emissiveIntensity: 0.2
    label: "Art #003"
  }

  object "SpotlightA" {
    @light
    type: "spot"
    position: [-4, 4, -4]
    rotation: [-60, 0, 0]
    color: "#ffffff"
    intensity: 3.0
  }

  object "SpotlightB" {
    @light
    type: "spot"
    position: [0, 4, -4]
    rotation: [-60, 0, 0]
    color: "#ffffff"
    intensity: 3.0
  }

  object "MintButton" {
    @glowing
    geometry: "cylinder"
    position: [6, 0.5, 0]
    scale: [0.5, 0.3, 0.5]
    color: "#6633ff"
    emissive: "#6633ff"
    emissiveIntensity: 2.0
    label: "Mint NFT"
  }
}`
};

export default template;
