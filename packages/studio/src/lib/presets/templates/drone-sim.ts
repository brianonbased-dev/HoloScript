import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-drone-sim",
  name: "Drone Simulator",
  description: "Autonomous drone with waypoints, obstacles, and flight path visualization",
  thumbnail: "🚁",
  tags: ["robotics","drone","uav","flight","autonomous"],
  category: "robotics",
  code: `composition "Drone Simulator" {
  environment {
    skybox: "sunset"
    ambient_light: 0.6
    fog: { color: "#c0d0e0", density: 0.002 }
    shadows: true
  }

  object "Terrain" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [30, 0.2, 30]
    color: "#5a7a3a"
  }

  object "LaunchPad" {
    @static
    geometry: "cylinder"
    position: [0, 0.02, 0]
    scale: [1.5, 0.02, 1.5]
    color: "#333333"
    label: "Launch / Landing"
  }

  object "Drone" {
    @physics type:"dynamic" shape:"box"
    geometry: "box"
    position: [0, 2, 0]
    scale: [0.6, 0.15, 0.6]
    color: "#222222"
    metalness: 0.7
    roughness: 0.3

    animation hover {
      property: "position.y"
      from: 2.0
      to: 2.15
      duration: 1500
      loop: infinite
      easing: "easeInOut"
    }
  }

  object "PropFL" {
    @glowing
    geometry: "cylinder"
    position: [-0.25, 2.12, -0.25]
    scale: [0.15, 0.01, 0.15]
    color: "#888888"

    animation spin {
      property: "rotation.y"
      from: 0
      to: 360
      duration: 200
      loop: infinite
      easing: "linear"
    }
  }

  object "PropFR" {
    @glowing
    geometry: "cylinder"
    position: [0.25, 2.12, -0.25]
    scale: [0.15, 0.01, 0.15]
    color: "#888888"

    animation spin {
      property: "rotation.y"
      from: 0
      to: 360
      duration: 200
      loop: infinite
      easing: "linear"
    }
  }

  object "WaypointA" {
    @glowing
    geometry: "sphere"
    position: [5, 4, -5]
    scale: [0.25, 0.25, 0.25]
    color: "#00ccff"
    emissive: "#00ccff"
    emissiveIntensity: 2.0
    opacity: 0.7
    material: "glass"
    label: "WP-1"
  }

  object "WaypointB" {
    @glowing
    geometry: "sphere"
    position: [-6, 6, -8]
    scale: [0.25, 0.25, 0.25]
    color: "#00ccff"
    emissive: "#00ccff"
    emissiveIntensity: 2.0
    opacity: 0.7
    material: "glass"
    label: "WP-2"
  }

  object "WaypointC" {
    @glowing
    geometry: "sphere"
    position: [3, 3, -12]
    scale: [0.25, 0.25, 0.25]
    color: "#00ff66"
    emissive: "#00ff66"
    emissiveIntensity: 2.0
    opacity: 0.7
    material: "glass"
    label: "WP-3 (Delivery)"
  }

  object "BuildingObstacle" {
    @collidable
    @static
    geometry: "box"
    position: [-2, 2, -6]
    scale: [3, 4, 2]
    color: "#887766"
    label: "Obstacle"
  }

  object "TreeObstacle" {
    @collidable
    @static
    geometry: "cone"
    position: [4, 1.5, -3]
    scale: [1.5, 3, 1.5]
    color: "#2a5a2a"
  }
}`
};

export default template;
