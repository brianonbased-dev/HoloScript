import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-platformer",
  name: "Platformer Starter",
  description: "Side-scrolling platformer with floating platforms and collectibles",
  thumbnail: "🏃",
  tags: ["game","platformer","physics","level"],
  category: "game",
  code: `composition "Platformer Level" {
  environment {
    skybox: "sunset"
    ambient_light: 0.7
    shadows: true
  }

  object "Ground" {
    @collidable
    @static
    geometry: "box"
    position: [0, -1, 0]
    scale: [20, 0.5, 3]
    color: "#4a8c3f"
  }

  object "PlatformA" {
    @collidable
    @static
    geometry: "box"
    position: [-4, 1, 0]
    scale: [3, 0.3, 3]
    color: "#5a9c4f"
  }

  object "PlatformB" {
    @collidable
    @static
    geometry: "box"
    position: [1, 2.5, 0]
    scale: [2.5, 0.3, 3]
    color: "#5a9c4f"
  }

  object "PlatformC" {
    @collidable
    @static
    geometry: "box"
    position: [6, 4, 0]
    scale: [3, 0.3, 3]
    color: "#5a9c4f"
  }

  object "CoinA" {
    @glowing
    geometry: "cylinder"
    position: [-4, 2, 0]
    scale: [0.3, 0.05, 0.3]
    color: "#ffd700"
    emissive: "#ffaa00"
    emissiveIntensity: 1.0

    animation spin {
      property: "rotation.y"
      from: 0
      to: 360
      duration: 2000
      loop: infinite
      easing: "linear"
    }
  }

  object "CoinB" {
    @glowing
    geometry: "cylinder"
    position: [1, 3.5, 0]
    scale: [0.3, 0.05, 0.3]
    color: "#ffd700"
    emissive: "#ffaa00"
    emissiveIntensity: 1.0

    animation spin {
      property: "rotation.y"
      from: 0
      to: 360
      duration: 2000
      loop: infinite
      easing: "linear"
    }
  }

  object "FlagPole" {
    @static
    geometry: "cylinder"
    position: [9, 1, 0]
    scale: [0.08, 3, 0.08]
    color: "#cc3333"
  }
}`
};

export default template;
