import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-soil-remediation",
  name: "Soil Remediation Twin",
  description: "HoloRemediate verifiable bioremediation twin — hot-compost pathogen kill, nitrate leaching to the water table, and a food-chain edible-safety verdict, each backed by a tamper-evident receipt",
  thumbnail: "🌍",
  tags: ["agriculture", "soil", "bioremediation", "environment", "digital-twin", "verifiable"],
  category: "agriculture",
  code: `composition "Soil Remediation Twin" {
  environment {
    skybox: "day"
    ambient_light: 0.75
    shadows: true
  }

  object "SoilColumn" {
    @static
    geometry: "box"
    position: [0, -0.4, 0]
    scale: [20, 0.8, 20]
    color: "#5b4636"
    label: "Yard soil — 0.8 m to water table"
  }

  object "WaterTable" {
    @static
    geometry: "box"
    position: [0, -0.82, 0]
    scale: [20, 0.04, 20]
    color: "#2a6fb0"
    label: "Water table — nitrate must stay < 10 mg/L"
  }

  object "CompostPile" {
    @glowing
    geometry: "box"
    position: [-5, 0.6, 3]
    scale: [3, 1.2, 3]
    color: "#7a4a2a"
    label: "Hot pile 69C / 12.7 d >= 55C — pathogen kill: PASS"
  }

  object "DogWasteDeposit" {
    @static
    geometry: "sphere"
    position: [4, 0.15, 4]
    scale: [0.6, 0.4, 0.6]
    color: "#6b5436"
    label: "Raw deposit (uncomposted) — pathogen survives"
  }

  object "LettuceBed" {
    @static
    geometry: "box"
    position: [5, 0.2, -3]
    scale: [5, 0.25, 4]
    color: "#4fae54"
    label: "Crop — edible-safe ONLY after composting"
  }

  object "MonitoringWell" {
    @glowing
    geometry: "cylinder"
    position: [0, 1, -8]
    scale: [0.12, 2, 0.12]
    color: "#9fb8c9"
    metalness: 0.7
    label: "Well MW-1 — groundwater 5.5 mg/L (clay/deep site)"
  }

  object "VerdictDashboard" {
    @billboard
    geometry: "plane"
    position: [0, 4.5, -4]
    scale: [5, 1.8, 0.01]
    color: "#0a1a14"
    label: "HoloRemediate receipts — Pathogen: PASS | Groundwater: PASS | Edible-safe: after compost"
  }
}`
};

export default template;
