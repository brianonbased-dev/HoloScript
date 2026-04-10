import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-vr-game",
  name: "VR Game Starter",
  description: "Interactive VR scene with grabbable objects and physics",
  thumbnail: "🎮",
  tags: ["vr","game","physics","interactive"],
  category: "game",
  code: `composition "VR Game" {
  environment {
    skybox: "studio"
    ambient_light: 0.6
    shadows: true
  }

  object "Arena" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [16, 0.2, 16]
    color: "#334455"
  }

  object "GrabbableCube" {
    @grabbable
    @physics type:"dynamic" shape:"box" restitution:0.4
    geometry: "box"
    position: [0, 1.5, -2]
    scale: [0.4, 0.4, 0.4]
    color: "#ff4444"
    emissive: "#ff2222"
    emissiveIntensity: 0.2
  }

  object "GrabbableSphere" {
    @grabbable
    @physics type:"dynamic" shape:"sphere" restitution:0.7
    geometry: "sphere"
    position: [1.5, 2, -2]
    scale: [0.35, 0.35, 0.35]
    color: "#44aaff"
  }

  object "TargetRing" {
    @glowing
    @collidable
    geometry: "torus"
    position: [0, 2, -6]
    scale: [1.2, 1.2, 0.15]
    rotation: [90, 0, 0]
    color: "#00ff66"
    emissive: "#00ff66"
    emissiveIntensity: 0.8

    animation pulse {
      property: "material.emissiveIntensity"
      from: 0.4
      to: 1.2
      duration: 1500
      loop: infinite
      easing: "easeInOut"
    }
  }

  object "Wall" {
    @collidable
    @static
    geometry: "box"
    position: [0, 1.5, -8]
    scale: [16, 3, 0.3]
    color: "#223344"
  }
}`
};

export default template;
