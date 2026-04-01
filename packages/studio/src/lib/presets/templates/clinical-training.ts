import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-clinical-training",
  name: "Clinical Training Scenario",
  description: "Medical procedure practice with step-by-step guidance",
  thumbnail: "🩺",
  tags: ["healthcare","clinical","training","procedure"],
  category: "healthcare",
  code: `composition "Clinical Training" {
  environment {
    skybox: "studio"
    ambient_light: 0.9
    shadows: true
  }

  object "ExamTable" {
    @static
    geometry: "box"
    position: [0, 0.45, 0]
    scale: [2, 0.1, 0.8]
    color: "#e0e8f0"
    metalness: 0.2
  }

  object "PatientModel" {
    @static
    geometry: "capsule"
    position: [0, 0.7, 0]
    scale: [0.3, 0.3, 0.6]
    color: "#deb887"
  }

  object "StepGuide" {
    @billboard
    geometry: "plane"
    position: [-2, 2, 0]
    scale: [1.5, 1.0, 0.01]
    color: "#0a1a2e"
    emissive: "#1155aa"
    emissiveIntensity: 0.2
    label: "Step 1: Check patient vitals"
  }

  object "VitalsMonitor" {
    @billboard
    @glowing
    geometry: "plane"
    position: [2, 2, 0]
    scale: [1.2, 0.8, 0.01]
    color: "#0a0a1a"
    emissive: "#00cc66"
    emissiveIntensity: 0.3
    label: "HR: 72 | SpO2: 98%"
  }
}`
};

export default template;
