import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-interactive-story",
  name: "Interactive Story",
  description: "Branching narrative scene with choice points and atmosphere",
  thumbnail: "📖",
  tags: ["web","story","narrative","interactive"],
  category: "web",
  code: `composition "Interactive Story" {
  environment {
    skybox: "night"
    ambient_light: 0.2
    fog: { color: "#0a1020", density: 0.008 }
    shadows: true
  }

  object "ForestFloor" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [15, 0.2, 15]
    color: "#2a3a1a"
  }

  object "PathLeft" {
    @clickable
    @glowing
    geometry: "box"
    position: [-3, 0.05, -5]
    scale: [2, 0.05, 6]
    color: "#3a4a2a"
    emissive: "#4488ff"
    emissiveIntensity: 0.3
    label: "The Dark Woods"
  }

  object "PathRight" {
    @clickable
    @glowing
    geometry: "box"
    position: [3, 0.05, -5]
    scale: [2, 0.05, 6]
    color: "#3a4a2a"
    emissive: "#ff8844"
    emissiveIntensity: 0.3
    label: "The Bright Clearing"
  }

  object "StoryNarrator" {
    @billboard
    @glowing
    geometry: "plane"
    position: [0, 3, -2]
    scale: [5, 1, 0.01]
    color: "#111122"
    emissive: "#222244"
    emissiveIntensity: 0.2
    label: "You come to a fork in the path..."
  }

  object "MysteriousOrb" {
    @glowing
    geometry: "sphere"
    position: [0, 1.5, -3]
    scale: [0.2, 0.2, 0.2]
    color: "#aaffee"
    emissive: "#aaffee"
    emissiveIntensity: 3.0

    animation float {
      property: "position.y"
      from: 1.5
      to: 2.0
      duration: 2500
      loop: infinite
      easing: "easeInOut"
    }
  }
}`
};

export default template;
