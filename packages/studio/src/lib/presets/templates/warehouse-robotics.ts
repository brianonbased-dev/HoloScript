import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-warehouse-robotics",
  name: "Warehouse Robotics",
  description: "Autonomous pick-and-place robots navigating warehouse shelves",
  thumbnail: "📦",
  tags: ["robotics","warehouse","agv","pick-place"],
  category: "robotics",
  code: `composition "Warehouse Robotics" {
  environment {
    skybox: "studio"
    ambient_light: 0.6
    shadows: true
  }

  object "WarehouseFloor" {
    @collidable
    @navmesh walkable:true
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [20, 0.2, 16]
    color: "#888888"
  }

  object "ShelfRowA" {
    @collidable
    @static
    geometry: "box"
    position: [-5, 2, -4]
    scale: [1, 4, 8]
    color: "#4466aa"
    metalness: 0.5
    label: "Shelf A (Electronics)"
  }

  object "ShelfRowB" {
    @collidable
    @static
    geometry: "box"
    position: [0, 2, -4]
    scale: [1, 4, 8]
    color: "#44aa66"
    metalness: 0.5
    label: "Shelf B (Parts)"
  }

  object "ShelfRowC" {
    @collidable
    @static
    geometry: "box"
    position: [5, 2, -4]
    scale: [1, 4, 8]
    color: "#aa6644"
    metalness: 0.5
    label: "Shelf C (Packages)"
  }

  object "AGV_Robot1" {
    @behavior type:"pathfinding"
    @physics type:"dynamic" shape:"box"
    geometry: "box"
    position: [-3, 0.3, 3]
    scale: [0.8, 0.3, 0.6]
    color: "#ffaa00"
    metalness: 0.7
    label: "AGV-001"

    animation patrol {
      property: "position"
      keyframes: [
        { time: 0,    value: [-3, 0.3, 3] }
        { time: 3000, value: [-5, 0.3, 0] }
        { time: 6000, value: [-5, 0.3, -6] }
        { time: 9000, value: [-3, 0.3, 3] }
      ]
      loop: infinite
      easing: "linear"
    }
  }

  object "AGV_Robot2" {
    @behavior type:"pathfinding"
    @physics type:"dynamic" shape:"box"
    geometry: "box"
    position: [3, 0.3, 3]
    scale: [0.8, 0.3, 0.6]
    color: "#00aaff"
    metalness: 0.7
    label: "AGV-002"
  }

  object "PackingStation" {
    @collidable
    @static
    geometry: "box"
    position: [8, 0.5, 3]
    scale: [3, 1, 2]
    color: "#444455"
    label: "Packing Station"
  }

  object "LoadingDock" {
    @static
    geometry: "box"
    position: [8, 0.05, -4]
    scale: [3, 0.05, 5]
    color: "#ffcc00"
    label: "Loading Dock"
  }
}`
};

export default template;
