import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-holographic-gallery",
  name: "Holographic Gallery",
  description: "Arrange photos as depth-displaced 3D panels in immersive gallery space",
  thumbnail: "🖼️",
  tags: ["hologram","gallery","depth","3d","photo"],
  category: "hologram",
  code: `composition "Holographic Gallery" {
  environment {
    skybox: "night"
    ambient_light: 0.15
    fog: { color: "#050510", density: 0.03 }
  }

  object "GalleryFloor" {
    @collidable
    @static
    geometry: "plane"
    position: [0, 0, 0]
    rotation: [-90, 0, 0]
    scale: [20, 20, 1]
    color: "#0a0a12"
    material: { roughness: 0.1, metalness: 0.6 }
  }

  object "Photo1" {
    @image src:"gallery/photo1.jpg"
    @depth_estimation { model: "depth-anything-v2-small", backend: "webgpu" }
    @displacement { scale: 0.3, segments: 128 }
    @depth_to_normal
    geometry: "plane"
    position: [-3, 1.8, -4]
    rotation: [0, 15, 0]
    scale: [2, 1.5, 1]
  }

  object "Photo2" {
    @image src:"gallery/photo2.jpg"
    @depth_estimation { model: "depth-anything-v2-small", backend: "webgpu" }
    @displacement { scale: 0.3, segments: 128 }
    @depth_to_normal
    geometry: "plane"
    position: [0, 2, -5]
    scale: [2.5, 1.8, 1]
  }

  object "Photo3" {
    @image src:"gallery/photo3.jpg"
    @depth_estimation { model: "depth-anything-v2-small", backend: "webgpu" }
    @displacement { scale: 0.3, segments: 128 }
    @depth_to_normal
    geometry: "plane"
    position: [3, 1.8, -4]
    rotation: [0, -15, 0]
    scale: [2, 1.5, 1]
  }

  object "SpotLeft" {
    @glowing
    geometry: "cone"
    position: [-3, 4.5, -3]
    rotation: [-10, 0, 5]
    scale: [0.3, 2, 0.3]
    color: "#6633ff"
    emissive: "#6633ff"
    emissiveIntensity: 2.5
    material: { opacity: 0.25 }
  }

  object "SpotCenter" {
    @glowing
    geometry: "cone"
    position: [0, 5, -4]
    rotation: [-5, 0, 0]
    scale: [0.4, 2.5, 0.4]
    color: "#ffffff"
    emissive: "#aaaaff"
    emissiveIntensity: 2.0
    material: { opacity: 0.2 }
  }

  object "SpotRight" {
    @glowing
    geometry: "cone"
    position: [3, 4.5, -3]
    rotation: [-10, 0, -5]
    scale: [0.3, 2, 0.3]
    color: "#ff33aa"
    emissive: "#ff33aa"
    emissiveIntensity: 2.5
    material: { opacity: 0.25 }
  }

  object "GalleryTitle" {
    @billboard
    @glowing
    geometry: "plane"
    position: [0, 4, -5.5]
    scale: [6, 0.8, 0.01]
    color: "#0a0a20"
    emissive: "#4422cc"
    emissiveIntensity: 1.2
    label: "HOLOGRAPHIC GALLERY"
  }
}`
};

export default template;
