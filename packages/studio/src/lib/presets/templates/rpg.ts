import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-rpg",
  name: "RPG World Starter",
  description: "Fantasy RPG scene with NPC, tavern, and quest marker",
  thumbnail: "⚔️",
  tags: ["game","rpg","fantasy","npc"],
  category: "game",
  code: `composition "RPG Village" {
  environment {
    skybox: "sunset"
    ambient_light: 0.5
    fog: { color: "#e8d5b0", density: 0.003 }
    shadows: true
  }

  object "Ground" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [20, 0.2, 20]
    color: "#6b8e4e"
  }

  object "TavernWall" {
    @collidable
    @static
    geometry: "box"
    position: [4, 1.5, -5]
    scale: [5, 3, 4]
    color: "#8b6b4a"
  }

  object "TavernRoof" {
    @static
    geometry: "box"
    position: [4, 3.2, -5]
    scale: [6, 0.3, 5]
    rotation: [5, 0, 0]
    color: "#aa4422"
  }

  object "NPC_Innkeeper" {
    @behavior type:"npc" persona:"friendly_innkeeper"
    geometry: "capsule"
    position: [3, 0.8, -3]
    scale: [0.4, 0.8, 0.4]
    color: "#d4a574"

    component "DialogueTrigger" {
      type: "proximity"
      radius: 2.5
      greeting: "Welcome, traveler!"
    }
  }

  object "QuestMarker" {
    @glowing
    geometry: "cone"
    position: [-5, 2.5, -3]
    scale: [0.3, 0.6, 0.3]
    rotation: [180, 0, 0]
    color: "#ffcc00"
    emissive: "#ffcc00"
    emissiveIntensity: 2.0

    animation bounce {
      property: "position.y"
      from: 2.5
      to: 3.0
      duration: 1000
      loop: infinite
      easing: "easeInOut"
    }
  }

  object "Torch" {
    @glowing
    geometry: "cylinder"
    position: [1.5, 1, -3]
    scale: [0.06, 1.2, 0.06]
    color: "#553311"
    emissive: "#ff6600"
    emissiveIntensity: 1.5
  }
}`
};

export default template;
