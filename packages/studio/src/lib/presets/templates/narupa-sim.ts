import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-narupa-sim",
  name: "Narupa MD Simulation",
  description: "Interactive molecular dynamics with real-time force manipulation",
  thumbnail: "🔬",
  tags: ["science","narupa","molecular-dynamics","simulation"],
  category: "science",
  code: `composition "Narupa MD Session" {
  environment {
    skybox: "night"
    ambient_light: 0.15
    fog: { color: "#020212", density: 0.005 }
  }

  object "SimulationBox" {
    geometry: "box"
    position: [0, 2, 0]
    scale: [4, 4, 4]
    color: "#1a1a3a"
    opacity: 0.1
    material: "glass"
    label: "Simulation Boundary"
  }

  object "WaterMoleculeA" {
    @glowing
    @physics type:"dynamic" shape:"sphere"
    geometry: "sphere"
    position: [-1, 2.5, -0.5]
    scale: [0.15, 0.15, 0.15]
    color: "#ff4444"
    emissive: "#ff2222"
    emissiveIntensity: 0.5
    label: "O"
  }

  object "WaterH1" {
    @glowing
    geometry: "sphere"
    position: [-0.85, 2.6, -0.4]
    scale: [0.08, 0.08, 0.08]
    color: "#ffffff"
    emissive: "#cccccc"
    emissiveIntensity: 0.3
    label: "H"
  }

  object "WaterH2" {
    @glowing
    geometry: "sphere"
    position: [-1.15, 2.6, -0.4]
    scale: [0.08, 0.08, 0.08]
    color: "#ffffff"
    emissive: "#cccccc"
    emissiveIntensity: 0.3
    label: "H"
  }

  object "ProteinFragment" {
    @glowing
    geometry: "torus"
    position: [0.5, 2, 0.5]
    scale: [0.8, 0.8, 0.2]
    rotation: [20, 0, 15]
    color: "#6644cc"
    emissive: "#4422aa"
    emissiveIntensity: 0.5
    opacity: 0.8
    label: "Protein Fragment"

    animation wobble {
      property: "rotation.z"
      from: 15
      to: 25
      duration: 3000
      loop: infinite
      easing: "easeInOut"
    }
  }

  object "ForceArrow" {
    @glowing
    geometry: "cone"
    position: [2, 2, 0]
    rotation: [0, 0, 90]
    scale: [0.1, 0.4, 0.1]
    color: "#ffcc00"
    emissive: "#ffaa00"
    emissiveIntensity: 1.5
    label: "Applied Force"
  }

  object "EnergyDisplay" {
    @billboard
    @glowing
    geometry: "plane"
    position: [0, 4.5, -2]
    scale: [3, 0.8, 0.01]
    color: "#0a0a2e"
    emissive: "#113344"
    emissiveIntensity: 0.2
    label: "KE: -- | PE: -- | T: 300K"
  }

  object "NarupaStatus" {
    @glowing
    geometry: "sphere"
    position: [3, 4, 0]
    scale: [0.15, 0.15, 0.15]
    color: "#00ff00"
    emissive: "#00ff00"
    emissiveIntensity: 2.0
    label: "Narupa: Connecting..."

    animation blink {
      property: "material.emissiveIntensity"
      from: 1.0
      to: 3.0
      duration: 1200
      loop: infinite
      easing: "easeInOut"
    }
  }
}`
};

export default template;
