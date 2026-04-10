import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-memory-wall",
  name: "Memory Wall",
  description: "Grid of personal photos as mini-holograms on interactive wall",
  thumbnail: "🧱",
  tags: ["hologram","photo","grid","memory","interactive"],
  category: "hologram",
  code: `composition "Memory Wall" {
  environment {
    skybox: "dusk"
    ambient_light: 0.25
  }

  object "WallBackground" {
    @static
    geometry: "box"
    position: [0, 2, -3]
    scale: [10, 5, 0.1]
    color: "#12121a"
    material: { roughness: 0.9 }
  }

  object "Memory1" {
    @image src:"memories/photo1.jpg"
    @depth_estimation { model: "depth-anything-v2-small", backend: "webgpu" }
    @displacement { scale: 0.2, segments: 64 }
    @hoverable
    geometry: "plane"
    position: [-3, 3.2, -2.9]
    scale: [1.2, 1.2, 1]
  }

  object "Memory2" {
    @image src:"memories/photo2.jpg"
    @depth_estimation { model: "depth-anything-v2-small", backend: "webgpu" }
    @displacement { scale: 0.2, segments: 64 }
    @hoverable
    geometry: "plane"
    position: [-1, 3.2, -2.9]
    scale: [1.2, 1.2, 1]
  }

  object "Memory3" {
    @image src:"memories/photo3.jpg"
    @depth_estimation { model: "depth-anything-v2-small", backend: "webgpu" }
    @displacement { scale: 0.2, segments: 64 }
    @hoverable
    geometry: "plane"
    position: [1, 3.2, -2.9]
    scale: [1.2, 1.2, 1]
  }

  object "Memory4" {
    @image src:"memories/photo4.jpg"
    @depth_estimation { model: "depth-anything-v2-small", backend: "webgpu" }
    @displacement { scale: 0.2, segments: 64 }
    @hoverable
    geometry: "plane"
    position: [3, 3.2, -2.9]
    scale: [1.2, 1.2, 1]
  }

  object "Memory5" {
    @image src:"memories/photo5.jpg"
    @depth_estimation { model: "depth-anything-v2-small", backend: "webgpu" }
    @displacement { scale: 0.2, segments: 64 }
    @hoverable
    geometry: "plane"
    position: [-3, 1.5, -2.9]
    scale: [1.2, 1.2, 1]
  }

  object "Memory6" {
    @animated_texture src:"memories/moment.gif" fps:12
    @holographic_sprite
    @depth_estimation { model: "depth-anything-v2-small", backend: "webgpu" }
    @displacement { scale: 0.2, segments: 64 }
    @hoverable
    geometry: "plane"
    position: [-1, 1.5, -2.9]
    scale: [1.2, 1.2, 1]
    emissive: "#4400ff"
    emissiveIntensity: 0.4
  }

  object "Memory7" {
    @image src:"memories/photo7.jpg"
    @depth_estimation { model: "depth-anything-v2-small", backend: "webgpu" }
    @displacement { scale: 0.2, segments: 64 }
    @hoverable
    geometry: "plane"
    position: [1, 1.5, -2.9]
    scale: [1.2, 1.2, 1]
  }

  object "Memory8" {
    @image src:"memories/photo8.jpg"
    @depth_estimation { model: "depth-anything-v2-small", backend: "webgpu" }
    @displacement { scale: 0.2, segments: 64 }
    @hoverable
    geometry: "plane"
    position: [3, 1.5, -2.9]
    scale: [1.2, 1.2, 1]
  }

  object "AmbientGlow" {
    @glowing
    geometry: "sphere"
    position: [0, 2.3, -1]
    scale: [0.01, 0.01, 0.01]
    color: "#2200aa"
    emissive: "#3311cc"
    emissiveIntensity: 4.0
    material: { opacity: 0 }
  }
}`
};

export default template;
