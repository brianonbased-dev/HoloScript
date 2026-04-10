import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: "wizard-product-configurator",
  name: "Product Configurator",
  description: "3D product viewer with rotation, color variants, and option panels",
  thumbnail: "🔧",
  tags: ["web","product","configurator","ecommerce"],
  category: "web",
  code: `composition "Product Configurator" {
  environment {
    skybox: "studio"
    ambient_light: 0.9
    shadows: true
  }

  object "Platform" {
    @static
    geometry: "cylinder"
    position: [0, -0.1, 0]
    scale: [2.5, 0.15, 2.5]
    color: "#e8e8e8"

    animation rotate {
      property: "rotation.y"
      from: 0
      to: 360
      duration: 15000
      loop: infinite
      easing: "linear"
    }
  }

  object "ProductBase" {
    geometry: "box"
    position: [0, 0.5, 0]
    scale: [1, 0.8, 0.6]
    color: "#2244aa"
    metalness: 0.3
    roughness: 0.4
    label: "Product Model"
  }

  object "ProductDetail" {
    geometry: "sphere"
    position: [0, 1.1, 0]
    scale: [0.3, 0.3, 0.3]
    color: "#cccccc"
    metalness: 0.9
    roughness: 0.1
  }

  object "OptionPanelLeft" {
    @clickable
    @billboard
    geometry: "plane"
    position: [-3, 1.5, 0]
    scale: [1.5, 2, 0.01]
    color: "#f5f5f5"
    label: "Color Options"
  }

  object "OptionPanelRight" {
    @clickable
    @billboard
    geometry: "plane"
    position: [3, 1.5, 0]
    scale: [1.5, 2, 0.01]
    color: "#f5f5f5"
    label: "Size Options"
  }

  object "KeyLight" {
    @light
    type: "spot"
    position: [3, 5, 3]
    rotation: [-45, 25, 0]
    color: "#ffffff"
    intensity: 2.5
    angle: 0.5
  }
}`
};

export default template;
