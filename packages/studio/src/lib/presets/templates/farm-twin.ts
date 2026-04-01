import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-farm-twin",
  name: "Farm Digital Twin",
  description: "Real-time farm monitoring with crop health and weather data",
  thumbnail: "🚜",
  tags: ["agriculture","farm","digital-twin","monitoring"],
  category: "agriculture",
  code: `composition "Farm Twin" {
  environment {
    skybox: "day"
    ambient_light: 0.8
    shadows: true
  }

  object "Terrain" {
    @static
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [30, 0.2, 30]
    color: "#8b7355"
  }

  object "CropFieldA" {
    @static
    geometry: "box"
    position: [-6, 0.1, 0]
    scale: [8, 0.15, 10]
    color: "#4a8c3f"
    label: "Field A — Wheat"
  }

  object "CropFieldB" {
    @static
    geometry: "box"
    position: [6, 0.1, 0]
    scale: [8, 0.15, 10]
    color: "#6aac4f"
    label: "Field B — Corn"
  }

  object "WeatherStation" {
    @glowing
    geometry: "cylinder"
    position: [0, 1, -12]
    scale: [0.1, 2, 0.1]
    color: "#aaaaaa"
    metalness: 0.8
    label: "Temp: 24C | Humidity: 65%"
  }

  object "IrrigationLine" {
    @static
    geometry: "cylinder"
    position: [0, 0.05, 0]
    rotation: [0, 0, 90]
    scale: [0.05, 14, 0.05]
    color: "#3366cc"
    label: "Active irrigation"
  }

  object "DroneOverview" {
    @billboard
    geometry: "plane"
    position: [0, 5, -5]
    scale: [4, 1.5, 0.01]
    color: "#0a1a2e"
    label: "Farm Dashboard — All Systems Normal"
  }
}`
};

export default template;
