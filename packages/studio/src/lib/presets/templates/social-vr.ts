import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-social-vr",
  name: "Social VR Space",
  description: "Multiplayer social space with lounge areas and teleport points",
  thumbnail: "👥",
  tags: ["vr","social","multiplayer","lounge"],
  category: "game",
  code: `composition "Social Lounge" {
  environment {
    skybox: "nebula"
    ambient_light: 0.4
    fog: { color: "#0a0520", density: 0.002 }
  }

  object "Floor" {
    @collidable
    @navmesh walkable:true
    geometry: "cylinder"
    position: [0, -0.1, 0]
    scale: [12, 0.2, 12]
    color: "#1a1a2e"
    material: "glass"
    opacity: 0.7
  }

  object "SeatCircleA" {
    @collidable
    @static
    geometry: "torus"
    position: [-3, 0.3, -3]
    scale: [1.5, 0.2, 1.5]
    color: "#4422aa"
    emissive: "#4422aa"
    emissiveIntensity: 0.3
  }

  object "SeatCircleB" {
    @collidable
    @static
    geometry: "torus"
    position: [3, 0.3, -3]
    scale: [1.5, 0.2, 1.5]
    color: "#aa2244"
    emissive: "#aa2244"
    emissiveIntensity: 0.3
  }

  object "TeleportPadA" {
    @teleport target:[0, 0, 0]
    @glowing
    geometry: "cylinder"
    position: [-6, 0.05, 0]
    scale: [0.8, 0.05, 0.8]
    color: "#00ccff"
    emissive: "#00ccff"
    emissiveIntensity: 1.5
    label: "Lobby"
  }

  object "TeleportPadB" {
    @teleport target:[0, 0, -10]
    @glowing
    geometry: "cylinder"
    position: [6, 0.05, 0]
    scale: [0.8, 0.05, 0.8]
    color: "#ff6600"
    emissive: "#ff6600"
    emissiveIntensity: 1.5
    label: "Stage"
  }

  object "StageScreen" {
    @billboard
    @glowing
    geometry: "plane"
    position: [0, 3, -8]
    scale: [6, 3, 0.05]
    color: "#111122"
    emissive: "#2244aa"
    emissiveIntensity: 0.2
    label: "Live Screen"
  }
}`
};

export default template;
