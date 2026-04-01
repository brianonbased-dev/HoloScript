import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-data-dashboard",
  name: "3D Data Dashboard",
  description: "Spatial data visualization with bar charts and status panels",
  thumbnail: "📊",
  tags: ["web","data","dashboard","visualization"],
  category: "web",
  code: `composition "Data Dashboard" {
  environment {
    skybox: "night"
    ambient_light: 0.2
  }

  object "Floor" {
    @static
    geometry: "box"
    position: [0, -0.05, 0]
    scale: [12, 0.1, 8]
    color: "#0a0a1a"
  }

  object "BarA" {
    @glowing
    geometry: "box"
    position: [-3, 1, -2]
    scale: [0.6, 2, 0.6]
    color: "#0066ff"
    emissive: "#0044cc"
    emissiveIntensity: 0.5
    label: "Revenue"
  }

  object "BarB" {
    @glowing
    geometry: "box"
    position: [-1.5, 1.5, -2]
    scale: [0.6, 3, 0.6]
    color: "#00cc66"
    emissive: "#00aa44"
    emissiveIntensity: 0.5
    label: "Users"
  }

  object "BarC" {
    @glowing
    geometry: "box"
    position: [0, 0.75, -2]
    scale: [0.6, 1.5, 0.6]
    color: "#ff6600"
    emissive: "#cc4400"
    emissiveIntensity: 0.5
    label: "Churn"
  }

  object "BarD" {
    @glowing
    geometry: "box"
    position: [1.5, 2, -2]
    scale: [0.6, 4, 0.6]
    color: "#cc00ff"
    emissive: "#aa00cc"
    emissiveIntensity: 0.5
    label: "Growth"
  }

  object "StatusPanel" {
    @billboard
    @glowing
    geometry: "plane"
    position: [4, 2, -2]
    scale: [2.5, 2, 0.01]
    color: "#0a1028"
    emissive: "#1144aa"
    emissiveIntensity: 0.2
    label: "System Status: OK"
  }
}`
};

export default template;
