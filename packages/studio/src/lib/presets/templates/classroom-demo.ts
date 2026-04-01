import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-classroom-demo",
  name: "Classroom Demo",
  description: "Interactive science demo with animated solar system and physics",
  thumbnail: "🏫",
  tags: ["education","classroom","demo","science"],
  category: "education",
  code: `composition "Classroom Demo" {
  environment {
    skybox: "stars"
    ambient_light: 0.1
  }

  object "Sun" {
    @glowing
    geometry: "sphere"
    position: [0, 2, 0]
    scale: [1, 1, 1]
    color: "#ffaa00"
    emissive: "#ff6600"
    emissiveIntensity: 2.5
    label: "Sun"

    animation spin {
      property: "rotation.y"
      from: 0
      to: 360
      duration: 20000
      loop: infinite
      easing: "linear"
    }
  }

  object "Earth" {
    @clickable
    geometry: "sphere"
    position: [3, 2, 0]
    scale: [0.3, 0.3, 0.3]
    color: "#2244aa"
    label: "Earth"

    animation orbit {
      property: "position"
      keyframes: [
        { time: 0,     value: [3, 2, 0] }
        { time: 2500,  value: [0, 2, 3] }
        { time: 5000,  value: [-3, 2, 0] }
        { time: 7500,  value: [0, 2, -3] }
        { time: 10000, value: [3, 2, 0] }
      ]
      loop: infinite
      easing: "linear"
    }
  }

  object "Mars" {
    @clickable
    geometry: "sphere"
    position: [5, 2, 0]
    scale: [0.22, 0.22, 0.22]
    color: "#cc4422"
    label: "Mars"

    animation orbit {
      property: "position"
      keyframes: [
        { time: 0,     value: [5, 2, 0] }
        { time: 4000,  value: [0, 2, 5] }
        { time: 8000,  value: [-5, 2, 0] }
        { time: 12000, value: [0, 2, -5] }
        { time: 16000, value: [5, 2, 0] }
      ]
      loop: infinite
      easing: "linear"
    }
  }

  object "InfoBoard" {
    @billboard
    geometry: "plane"
    position: [0, 4.5, -3]
    scale: [5, 1, 0.01]
    color: "#111122"
    label: "Click a planet to learn more!"
  }
}`
};

export default template;
