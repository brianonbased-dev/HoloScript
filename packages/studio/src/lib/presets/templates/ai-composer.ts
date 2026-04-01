import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-ai-composer",
  name: "AI Scene Composer",
  description: "Prompt-driven 3D scene with AI-generated objects and smart layout",
  thumbnail: "🤖",
  tags: ["ai","generative","smart","composer"],
  category: "art",
  code: `composition "AI Composed Scene" {
  environment {
    skybox: "studio"
    ambient_light: 0.7
    shadows: true
  }

  object "GeneratedPlatform" {
    @collidable
    @static
    geometry: "cylinder"
    position: [0, -0.05, 0]
    scale: [6, 0.1, 6]
    color: "#1a1a2e"
    emissive: "#2244aa"
    emissiveIntensity: 0.15
  }

  object "AISubjectA" {
    @glowing
    geometry: "sphere"
    position: [-1.5, 1, 0]
    scale: [0.8, 0.8, 0.8]
    color: "#6633ff"
    emissive: "#6633ff"
    emissiveIntensity: 0.6

    animation float {
      property: "position.y"
      from: 1.0
      to: 1.3
      duration: 2000
      loop: infinite
      easing: "easeInOut"
    }
  }

  object "AISubjectB" {
    @glowing
    geometry: "box"
    position: [1.5, 1, 0]
    scale: [0.7, 0.7, 0.7]
    color: "#00ccff"
    emissive: "#00ccff"
    emissiveIntensity: 0.5

    animation spin {
      property: "rotation.y"
      from: 0
      to: 360
      duration: 8000
      loop: infinite
      easing: "linear"
    }
  }

  object "ConnectionBeam" {
    @glowing
    geometry: "cylinder"
    position: [0, 1.15, 0]
    rotation: [0, 0, 90]
    scale: [0.02, 3, 0.02]
    color: "#ff66aa"
    emissive: "#ff66aa"
    emissiveIntensity: 1.5
    opacity: 0.6
    material: "glass"
  }
}`
};

export default template;
