import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-puzzle",
  name: "Puzzle Room Starter",
  description: "Interactive puzzle room with clickable switches and moving elements",
  thumbnail: "🧩",
  tags: ["game","puzzle","interactive","logic"],
  category: "game",
  code: `composition "Puzzle Room" {
  environment {
    skybox: "studio"
    ambient_light: 0.3
    shadows: true
  }

  object "Floor" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [10, 0.2, 10]
    color: "#2a2a3a"
  }

  object "WallNorth" {
    @collidable
    @static
    geometry: "box"
    position: [0, 2, -5]
    scale: [10, 4, 0.3]
    color: "#333344"
  }

  object "SwitchA" {
    @clickable
    @glowing
    geometry: "box"
    position: [-2, 1.5, -4.8]
    scale: [0.4, 0.4, 0.1]
    color: "#ff3333"
    emissive: "#ff0000"
    emissiveIntensity: 1.0
    label: "Switch 1"
  }

  object "SwitchB" {
    @clickable
    @glowing
    geometry: "box"
    position: [2, 1.5, -4.8]
    scale: [0.4, 0.4, 0.1]
    color: "#3333ff"
    emissive: "#0000ff"
    emissiveIntensity: 1.0
    label: "Switch 2"
  }

  object "GateDoor" {
    @collidable
    geometry: "box"
    position: [0, 1.5, -4.8]
    scale: [1.5, 3, 0.2]
    color: "#555566"
    emissive: "#222233"
    emissiveIntensity: 0.3
  }

  object "PrizeOrb" {
    @glowing
    geometry: "sphere"
    position: [0, 1.5, -8]
    scale: [0.5, 0.5, 0.5]
    color: "#ffcc00"
    emissive: "#ffaa00"
    emissiveIntensity: 2.0

    animation float {
      property: "position.y"
      from: 1.5
      to: 2.0
      duration: 2000
      loop: infinite
      easing: "easeInOut"
    }
  }
}`
};

export default template;
