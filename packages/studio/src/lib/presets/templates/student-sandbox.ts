import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-student-sandbox",
  name: "Student Sandbox",
  description: "Safe experimentation space with pre-placed objects to modify",
  thumbnail: "🎓",
  tags: ["education","sandbox","beginner","experiment"],
  category: "education",
  code: `composition "Student Sandbox" {
  environment {
    skybox: "studio"
    ambient_light: 0.7
    shadows: true
  }

  object "Ground" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [14, 0.2, 14]
    color: "#ddeedd"
  }

  object "RedCube" {
    @grabbable
    @physics type:"dynamic" shape:"box"
    geometry: "box"
    position: [-2, 1, 0]
    scale: [0.5, 0.5, 0.5]
    color: "#ff4444"
    label: "Change my color!"
  }

  object "BlueSphere" {
    @grabbable
    @physics type:"dynamic" shape:"sphere" restitution:0.8
    geometry: "sphere"
    position: [0, 1, 0]
    scale: [0.4, 0.4, 0.4]
    color: "#4444ff"
    label: "Make me bounce!"
  }

  object "GreenCylinder" {
    @grabbable
    @physics type:"dynamic" shape:"box"
    geometry: "cylinder"
    position: [2, 1, 0]
    scale: [0.3, 0.6, 0.3]
    color: "#44cc44"
    label: "Scale me up!"
  }

  object "HintBoard" {
    @billboard
    geometry: "plane"
    position: [0, 3, -4]
    scale: [6, 1.5, 0.01]
    color: "#222233"
    label: "Try editing the code to change colors, positions, and sizes!"
  }

  object "Ramp" {
    @collidable
    @static
    geometry: "box"
    position: [-4, 0.5, 3]
    rotation: [0, 0, -15]
    scale: [4, 0.15, 2]
    color: "#bbbbbb"
    label: "Roll objects down!"
  }
}`
};

export default template;
