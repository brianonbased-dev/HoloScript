import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-rehab-sim",
  name: "Rehabilitation Simulator",
  description: "Physical rehab exercises with guided movement targets",
  thumbnail: "🏋️",
  tags: ["healthcare","rehab","exercise","vr"],
  category: "healthcare",
  code: `composition "Rehab Simulator" {
  environment {
    skybox: "studio"
    ambient_light: 0.8
    shadows: true
  }

  object "Floor" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [10, 0.2, 10]
    color: "#e0e0e0"
  }

  object "TargetHigh" {
    @grabbable
    @glowing
    geometry: "sphere"
    position: [0, 2, -2]
    scale: [0.25, 0.25, 0.25]
    color: "#ff6644"
    emissive: "#ff4422"
    emissiveIntensity: 1.0
    label: "Reach here"
  }

  object "TargetLow" {
    @grabbable
    @glowing
    geometry: "sphere"
    position: [1.5, 0.5, -2]
    scale: [0.25, 0.25, 0.25]
    color: "#44aaff"
    emissive: "#2288dd"
    emissiveIntensity: 1.0
    label: "Reach here"
  }

  object "ProgressBar" {
    @billboard
    geometry: "plane"
    position: [0, 3, -3]
    scale: [3, 0.4, 0.01]
    color: "#1a1a2e"
    label: "Session Progress: 0 / 10 reps"
  }
}`
};

export default template;
