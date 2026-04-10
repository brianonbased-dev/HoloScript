import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-patient-education",
  name: "Patient Education Display",
  description: "Visual health information with interactive 3D models",
  thumbnail: "📋",
  tags: ["healthcare","education","patient","visualization"],
  category: "healthcare",
  code: `composition "Patient Education" {
  environment {
    skybox: "studio"
    ambient_light: 0.8
  }

  object "OrganModel" {
    @glowing
    geometry: "sphere"
    position: [0, 1.5, 0]
    scale: [0.6, 0.7, 0.5]
    color: "#cc4444"
    emissive: "#882222"
    emissiveIntensity: 0.3

    animation rotate {
      property: "rotation.y"
      from: 0
      to: 360
      duration: 15000
      loop: infinite
      easing: "linear"
    }
  }

  object "InfoPanel" {
    @billboard
    geometry: "plane"
    position: [-2, 1.5, 0]
    scale: [1.6, 1.2, 0.01]
    color: "#0a1a2e"
    label: "Tap organ regions to learn more"
  }

  object "Platform" {
    @static
    geometry: "cylinder"
    position: [0, 0.05, 0]
    scale: [2, 0.1, 2]
    color: "#f0f0f5"
  }
}`
};

export default template;
