import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-surgical-training",
  name: "Surgical Training",
  description: "VR procedure practice with instrument tracking and step guidance",
  thumbnail: "🏥",
  tags: ["science","medical","surgery","vr","training"],
  category: "science",
  code: `composition "Surgical Training" {
  environment {
    skybox: "studio"
    ambient_light: 0.8
    shadows: true
  }

  object "OperatingTable" {
    @collidable
    @static
    geometry: "box"
    position: [0, 0.4, 0]
    scale: [2, 0.8, 0.8]
    color: "#cccccc"
    metalness: 0.3
    roughness: 0.5
    label: "Operating Table"
  }

  object "SurgicalField" {
    @static
    geometry: "box"
    position: [0, 0.82, 0]
    scale: [0.8, 0.02, 0.5]
    color: "#2255aa"
    label: "Surgical Field"
  }

  object "PatientModel" {
    geometry: "capsule"
    position: [0, 1, 0]
    scale: [0.2, 0.15, 0.12]
    color: "#e8c8a8"
    opacity: 0.7
    material: "glass"
    label: "Patient Area"
  }

  object "Scalpel" {
    @grabbable
    @glowing
    geometry: "box"
    position: [0.6, 1, 0.3]
    scale: [0.02, 0.01, 0.15]
    color: "#cccccc"
    metalness: 1.0
    roughness: 0.1
    emissive: "#ffffff"
    emissiveIntensity: 0.2
    label: "Scalpel"
  }

  object "Forceps" {
    @grabbable
    geometry: "capsule"
    position: [0.8, 1, 0.3]
    scale: [0.015, 0.1, 0.015]
    color: "#aaaaaa"
    metalness: 0.9
    roughness: 0.2
    label: "Forceps"
  }

  object "SurgicalLight" {
    @light
    type: "spot"
    position: [0, 3, 0]
    rotation: [-90, 0, 0]
    color: "#ffffff"
    intensity: 4.0
    angle: 0.4
  }

  object "Monitor" {
    @billboard
    @glowing
    geometry: "plane"
    position: [-1.5, 2, -0.5]
    scale: [1.2, 0.8, 0.01]
    color: "#0a0a1a"
    emissive: "#00cc66"
    emissiveIntensity: 0.3
    label: "Vitals: HR 72 | BP 120/80 | SpO2 98%"
  }

  object "StepGuide" {
    @billboard
    geometry: "plane"
    position: [1.5, 2, -0.5]
    scale: [1.2, 0.8, 0.01]
    color: "#1a1a2e"
    label: "Step 1: Prepare surgical field"
  }

  object "InstrumentTray" {
    @static
    geometry: "box"
    position: [0.7, 0.9, 0.3]
    scale: [0.5, 0.02, 0.3]
    color: "#aaaaaa"
    metalness: 0.8
    roughness: 0.2
    label: "Instrument Tray"
  }
}`
};

export default template;
