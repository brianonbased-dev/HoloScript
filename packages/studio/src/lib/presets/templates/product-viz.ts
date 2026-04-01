import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-product-viz",
  name: "Product Showcase",
  description: "Clean studio setup for product visualization and turntables",
  thumbnail: "📦",
  tags: ["film","product","showcase","studio"],
  category: "film",
  code: `composition "Product Showcase" {
  environment {
    skybox: "studio"
    ambient_light: 1.0
    shadows: true
  }

  object "InfinitePlane" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.01, 0]
    scale: [20, 0.02, 20]
    color: "#f0f0f0"
  }

  object "Turntable" {
    @static
    geometry: "cylinder"
    position: [0, 0.05, 0]
    scale: [1.5, 0.1, 1.5]
    color: "#e8e8e8"
    metalness: 0.1
    roughness: 0.3

    animation rotate {
      property: "rotation.y"
      from: 0
      to: 360
      duration: 10000
      loop: infinite
      easing: "linear"
    }
  }

  object "ProductPlaceholder" {
    geometry: "box"
    position: [0, 0.7, 0]
    scale: [0.8, 1.0, 0.5]
    color: "#ffffff"
    metalness: 0.2
    roughness: 0.3
    label: "Place your product here"
  }

  object "KeyLight" {
    @light
    type: "spot"
    position: [3, 5, 3]
    rotation: [-45, 25, 0]
    color: "#fff8f0"
    intensity: 2.5
    angle: 0.5
  }

  object "FillLight" {
    @light
    type: "spot"
    position: [-4, 3, 2]
    rotation: [-30, -30, 0]
    color: "#e8f0ff"
    intensity: 1.0
    angle: 0.7
  }

  object "BackLight" {
    @light
    type: "spot"
    position: [0, 4, -3]
    rotation: [-50, 0, 0]
    color: "#ffffff"
    intensity: 1.5
    angle: 0.4
  }
}`
};

export default template;
