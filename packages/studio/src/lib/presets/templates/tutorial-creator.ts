import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-tutorial-creator",
  name: "Tutorial Creator",
  description: "Step-by-step learning module with interactive examples",
  thumbnail: "📝",
  tags: ["education","tutorial","learning","interactive"],
  category: "education",
  code: `composition "Tutorial Module" {
  environment {
    skybox: "studio"
    ambient_light: 0.8
    shadows: true
  }

  object "LessonBoard" {
    @billboard
    geometry: "plane"
    position: [0, 2, -3]
    scale: [5, 2.5, 0.01]
    color: "#1a1a2e"
    label: "Lesson 1: Your First 3D Object"
  }

  object "ExampleCube" {
    @grabbable
    @glowing
    geometry: "box"
    position: [0, 1, 0]
    scale: [0.6, 0.6, 0.6]
    color: "#4488ff"
    emissive: "#2266dd"
    emissiveIntensity: 0.3
    label: "Try grabbing me!"

    animation bounce {
      property: "position.y"
      from: 1.0
      to: 1.3
      duration: 1500
      loop: infinite
      easing: "easeInOut"
    }
  }

  object "StepIndicator1" {
    @glowing
    geometry: "sphere"
    position: [-2, 0.5, -1]
    scale: [0.2, 0.2, 0.2]
    color: "#00ff66"
    emissive: "#00ff66"
    emissiveIntensity: 2.0
    label: "Step 1"
  }

  object "StepIndicator2" {
    @glowing
    geometry: "sphere"
    position: [0, 0.5, -1]
    scale: [0.2, 0.2, 0.2]
    color: "#666666"
    emissive: "#444444"
    emissiveIntensity: 0.3
    label: "Step 2"
  }

  object "StepIndicator3" {
    @glowing
    geometry: "sphere"
    position: [2, 0.5, -1]
    scale: [0.2, 0.2, 0.2]
    color: "#666666"
    emissive: "#444444"
    emissiveIntensity: 0.3
    label: "Step 3"
  }

  object "Floor" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.05, 0]
    scale: [10, 0.1, 8]
    color: "#e0e0e0"
  }
}`
};

export default template;
