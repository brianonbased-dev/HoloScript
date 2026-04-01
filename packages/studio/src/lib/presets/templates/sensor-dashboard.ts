import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-sensor-dashboard",
  name: "Sensor Dashboard",
  description: "Live sensor monitoring with gauges, status indicators, and data panels",
  thumbnail: "📡",
  tags: ["iot","sensor","dashboard","monitoring"],
  category: "iot",
  code: `composition "Sensor Dashboard" {
  environment {
    skybox: "night"
    ambient_light: 0.15
  }

  object "DashboardBase" {
    @static
    geometry: "box"
    position: [0, 0, -3]
    scale: [8, 4, 0.1]
    color: "#0a0a1a"
  }

  object "TempGauge" {
    @glowing
    geometry: "cylinder"
    position: [-2.5, 1, -2.9]
    scale: [0.6, 0.6, 0.05]
    rotation: [90, 0, 0]
    color: "#ff4444"
    emissive: "#ff2222"
    emissiveIntensity: 0.8
    label: "Temperature: 72F"
  }

  object "HumidityGauge" {
    @glowing
    geometry: "cylinder"
    position: [0, 1, -2.9]
    scale: [0.6, 0.6, 0.05]
    rotation: [90, 0, 0]
    color: "#4488ff"
    emissive: "#2266dd"
    emissiveIntensity: 0.8
    label: "Humidity: 45%"
  }

  object "PressureGauge" {
    @glowing
    geometry: "cylinder"
    position: [2.5, 1, -2.9]
    scale: [0.6, 0.6, 0.05]
    rotation: [90, 0, 0]
    color: "#44cc44"
    emissive: "#22aa22"
    emissiveIntensity: 0.8
    label: "Pressure: 1013 hPa"
  }

  object "StatusLight" {
    @glowing
    geometry: "sphere"
    position: [3.5, 1.8, -2.8]
    scale: [0.15, 0.15, 0.15]
    color: "#00ff00"
    emissive: "#00ff00"
    emissiveIntensity: 3.0
    label: "Online"

    animation blink {
      property: "material.emissiveIntensity"
      from: 1.0
      to: 3.0
      duration: 1000
      loop: infinite
      easing: "easeInOut"
    }
  }

  object "AlertPanel" {
    @billboard
    @glowing
    geometry: "plane"
    position: [0, -0.5, -2.9]
    scale: [7, 1, 0.01]
    color: "#0a1028"
    emissive: "#113344"
    emissiveIntensity: 0.15
    label: "No active alerts"
  }
}`
};

export default template;
