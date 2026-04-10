import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-therapy-vr",
  name: "Therapeutic VR Environment",
  description: "Calming virtual space for exposure therapy and relaxation",
  thumbnail: "🧘",
  tags: ["healthcare","therapy","vr","wellness"],
  category: "healthcare",
  code: `composition "Therapy VR" {
  environment {
    skybox: "sunset"
    ambient_light: 0.7
    fog: { color: "#e8d5c4", density: 0.003 }
  }

  object "Ground" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [30, 0.2, 30]
    color: "#8fbc8f"
  }

  object "Lake" {
    @static
    geometry: "cylinder"
    position: [0, -0.05, 5]
    scale: [6, 0.02, 6]
    color: "#4a90d9"
    material: { roughness: 0.0, metalness: 0.1, opacity: 0.8 }
  }

  object "BreathingOrb" {
    @glowing
    geometry: "sphere"
    position: [0, 1.5, 0]
    scale: [0.4, 0.4, 0.4]
    color: "#88ccff"
    emissive: "#6699cc"
    emissiveIntensity: 1.5

    animation breathe {
      property: "scale"
      from: [0.35, 0.35, 0.35]
      to: [0.5, 0.5, 0.5]
      duration: 4000
      loop: infinite
      easing: "easeInOut"
    }
  }

  object "GuideText" {
    @billboard
    geometry: "plane"
    position: [0, 2.5, -2]
    scale: [2, 0.6, 0.01]
    color: "#1a1a2e"
    label: "Breathe with the orb..."
  }
}`
};

export default template;
