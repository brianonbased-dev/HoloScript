import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-molecular-design",
  name: "Molecular Design Lab",
  description: "Drug design workspace with protein, ligand, and binding site visualization",
  thumbnail: "🧬",
  tags: ["science","molecular","drug","pdb","pharma"],
  category: "science",
  code: `composition "Molecular Design Lab" {
  environment {
    skybox: "night"
    ambient_light: 0.2
    fog: { color: "#050510", density: 0.003 }
  }

  object "ProteinBackbone" {
    @glowing
    geometry: "torus"
    position: [0, 2, 0]
    scale: [1.5, 1.5, 0.3]
    rotation: [30, 0, 20]
    color: "#4488cc"
    emissive: "#2266aa"
    emissiveIntensity: 0.4
    opacity: 0.7
    material: "glass"
    label: "Protein (PDB)"
  }

  object "HelixA" {
    @glowing
    geometry: "torus"
    position: [-0.5, 2.3, 0.5]
    scale: [0.6, 0.6, 0.15]
    rotation: [45, 30, 0]
    color: "#ff6688"
    emissive: "#ff4466"
    emissiveIntensity: 0.6
    label: "Alpha Helix"
  }

  object "HelixB" {
    @glowing
    geometry: "torus"
    position: [0.8, 1.8, -0.3]
    scale: [0.5, 0.5, 0.12]
    rotation: [-20, 60, 10]
    color: "#ff6688"
    emissive: "#ff4466"
    emissiveIntensity: 0.6
    label: "Alpha Helix"
  }

  object "ActiveSite" {
    @glowing
    @clickable
    geometry: "sphere"
    position: [0, 2, 0]
    scale: [0.4, 0.4, 0.4]
    color: "#ffcc00"
    emissive: "#ffaa00"
    emissiveIntensity: 2.0
    opacity: 0.5
    material: "glass"
    label: "Binding Site"

    animation pulse {
      property: "scale"
      from: [0.4, 0.4, 0.4]
      to: [0.48, 0.48, 0.48]
      duration: 1500
      loop: infinite
      easing: "easeInOut"
    }
  }

  object "Ligand" {
    @glowing
    @grabbable
    geometry: "sphere"
    position: [3, 2, 0]
    scale: [0.25, 0.25, 0.25]
    color: "#00ff88"
    emissive: "#00cc66"
    emissiveIntensity: 1.5
    label: "Drug Candidate"
  }

  object "LigandBond1" {
    @glowing
    geometry: "cylinder"
    position: [3.2, 2.2, 0.15]
    rotation: [0, 0, 30]
    scale: [0.02, 0.2, 0.02]
    color: "#00ff88"
    emissive: "#00cc66"
    emissiveIntensity: 0.8
  }

  object "LigandBond2" {
    @glowing
    geometry: "cylinder"
    position: [2.8, 1.8, -0.1]
    rotation: [0, 0, -45]
    scale: [0.02, 0.18, 0.02]
    color: "#00ff88"
    emissive: "#00cc66"
    emissiveIntensity: 0.8
  }

  object "InfoPanel" {
    @billboard
    @glowing
    geometry: "plane"
    position: [-3, 3, -2]
    scale: [2.5, 1.5, 0.01]
    color: "#0a1028"
    emissive: "#1144aa"
    emissiveIntensity: 0.15
    label: "Lipinski Score: --\\nBinding Energy: --"
  }
}`
};

export default template;
