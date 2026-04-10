import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-video-portal",
  name: "Video Portal",
  description: "Video on depth-displaced surface with parallax effect",
  thumbnail: "🌀",
  tags: ["hologram","video","depth","portal","immersive"],
  category: "hologram",
  code: `composition "Video Portal" {
  environment {
    skybox: "space"
    ambient_light: 0.1
    fog: { color: "#020208", density: 0.015 }
  }

  object "PortalFrame" {
    @glowing
    geometry: "torus"
    position: [0, 2, -4]
    scale: [2.5, 2.5, 0.15]
    color: "#1a0033"
    emissive: "#7700ff"
    emissiveIntensity: 2.0
    material: { metalness: 0.9, roughness: 0.1 }

    state {
      pulse: 0
    }

    logic {
      on_update(dt) {
        state.pulse = state.pulse + dt * 1.5
        self.emissiveIntensity = 1.5 + Math.sin(state.pulse) * 0.8
      }
    }
  }

  object "VideoSurface" {
    @video src:"portal/video.mp4" loop:true autoplay:true
    @depth_estimation {
      model: "depth-anything-v2-small"
      backend: "webgpu"
      temporal_smoothing: 0.8
    }
    @displacement { scale: 0.4, segments: 128 }
    geometry: "plane"
    position: [0, 2, -4.05]
    scale: [3.2, 2.4, 1]
  }

  object "PortalParticles" {
    @gpu_particle count:2000 lifetime:3.0 emissive:true
    position: [0, 2, -3.8]

    state {
      time: 0
    }

    logic {
      on_update(dt) {
        state.time = state.time + dt
        self.rotation_y = state.time * 15
      }
    }
  }

  object "FloorReflection" {
    @static
    geometry: "plane"
    position: [0, 0, 0]
    rotation: [-90, 0, 0]
    scale: [12, 12, 1]
    color: "#050510"
    material: { roughness: 0.05, metalness: 0.95 }
  }

  object "PortalLight" {
    @glowing
    geometry: "sphere"
    position: [0, 2, -2]
    scale: [0.01, 0.01, 0.01]
    color: "#7700ff"
    emissive: "#9933ff"
    emissiveIntensity: 5.0
    material: { opacity: 0 }
  }
}`
};

export default template;
