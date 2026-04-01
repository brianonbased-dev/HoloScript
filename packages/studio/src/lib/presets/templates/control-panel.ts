import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-control-panel",
  name: "Device Control Panel",
  description: "Smart home / IoT control interface with switches and status displays",
  thumbnail: "🎛️",
  tags: ["iot","control","smart-home","devices"],
  category: "iot",
  code: `composition "Control Panel" {
  environment {
    skybox: "night"
    ambient_light: 0.2
  }

  object "PanelBackground" {
    @static
    geometry: "box"
    position: [0, 1.5, -2]
    scale: [6, 4, 0.1]
    color: "#0d1117"
  }

  object "LightSwitch" {
    @clickable
    @glowing
    geometry: "box"
    position: [-2, 2.5, -1.9]
    scale: [0.8, 0.5, 0.1]
    color: "#ffcc00"
    emissive: "#ffaa00"
    emissiveIntensity: 1.0
    label: "Living Room Light"
  }

  object "ThermostatDial" {
    @clickable
    @glowing
    geometry: "cylinder"
    position: [0, 2.5, -1.9]
    scale: [0.5, 0.05, 0.5]
    rotation: [90, 0, 0]
    color: "#0088ff"
    emissive: "#0066cc"
    emissiveIntensity: 0.8
    label: "Thermostat: 72F"
  }

  object "DoorLock" {
    @clickable
    @glowing
    geometry: "box"
    position: [2, 2.5, -1.9]
    scale: [0.8, 0.5, 0.1]
    color: "#00cc44"
    emissive: "#00aa33"
    emissiveIntensity: 1.0
    label: "Front Door: Locked"
  }

  object "EnergyMeter" {
    @glowing
    geometry: "box"
    position: [-2, 0.8, -1.9]
    scale: [1.5, 0.8, 0.08]
    color: "#1a1a2e"
    emissive: "#00ffcc"
    emissiveIntensity: 0.3
    label: "Energy: 2.4 kWh today"
  }

  object "SecurityCam" {
    @glowing
    geometry: "box"
    position: [2, 0.8, -1.9]
    scale: [1.5, 0.8, 0.08]
    color: "#1a1a2e"
    emissive: "#ff4444"
    emissiveIntensity: 0.3
    label: "Camera: Front Yard"
  }
}`
};

export default template;
