/**
 * sceneTemplates — built-in scene starter templates
 *
 * Each template provides:
 *  - id: unique slug
 *  - name: display name
 *  - description: one-liner
 *  - thumbnail: emoji or icon key
 *  - tags: searchable categories
 *  - code: valid HoloScript composition string
 *  - nodes: optional pre-built SceneNode[]
 */

import type { SceneNode } from '@/lib/store';

export interface SceneTemplate {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  tags: string[];
  code: string;
  nodes?: Partial<SceneNode>[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function id() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Templates ───────────────────────────────────────────────────────────────

export const SCENE_TEMPLATES: SceneTemplate[] = [
  // ── Blank Canvas ──────────────────────────────────────────────────────────
  {
    id: 'blank',
    name: 'Blank Canvas',
    description: 'Empty scene with default lighting',
    thumbnail: '⬜',
    tags: ['empty', 'basic', 'starter'],
    code: `composition "Untitled" {
  environment {
    skybox: "studio"
    ambient_light: 0.5
    shadows: true
  }
}`,
    nodes: [],
  },

  // ── Solar System ──────────────────────────────────────────────────────────
  {
    id: 'solar-system',
    name: 'Solar System',
    description: 'Animated sun, planet with moon, starfield',
    thumbnail: '🌍',
    tags: ['space', 'animation', 'physics', 'starter'],
    code: `composition "Solar System" {
  environment {
    skybox: "stars"
    ambient_light: 0.05
    fog: { color: "#000008", density: 0.002 }
  }

  object "Sun" {
    @glowing
    geometry: "sphere"
    position: [0, 0, 0]
    scale: [1.5, 1.5, 1.5]
    color: "#ffaa00"
    emissive: "#ff6600"
    emissiveIntensity: 2.0

    animation spin {
      property: "rotation.y"
      from: 0
      to: 360
      duration: 25000
      loop: infinite
      easing: "linear"
    }
  }

  object "Earth" {
    geometry: "sphere"
    position: [4, 0, 0]
    scale: [0.5, 0.5, 0.5]
    color: "#2244aa"

    animation orbit {
      property: "position"
      keyframes: [
        { time: 0,     value: [4, 0, 0] }
        { time: 5000,  value: [0, 0, 4] }
        { time: 10000, value: [-4, 0, 0] }
        { time: 15000, value: [0, 0, -4] }
        { time: 20000, value: [4, 0, 0] }
      ]
      loop: infinite
      easing: "linear"
    }

    animation spin {
      property: "rotation.y"
      from: 0
      to: 360
      duration: 5000
      loop: infinite
      easing: "linear"
    }
  }

  object "Moon" {
    geometry: "sphere"
    position: [5.2, 0, 0]
    scale: [0.14, 0.14, 0.14]
    color: "#aaaaaa"

    animation orbit {
      property: "position"
      keyframes: [
        { time: 0,    value: [5.2, 0, 0] }
        { time: 1500, value: [4, 0, 1.2] }
        { time: 3000, value: [2.8, 0, 0] }
        { time: 4500, value: [4, 0, -1.2] }
        { time: 6000, value: [5.2, 0, 0] }
      ]
      loop: infinite
      easing: "linear"
    }
  }
}`,
    nodes: [
      { id: id(), name: 'Sun',   geometry: 'sphere', position: [0, 0, 0], color: '#ffaa00', scale: [1.5, 1.5, 1.5], traits: [{ name: 'glow', properties: { emissive: '#ff6600', emissiveIntensity: 2 } }] },
      { id: id(), name: 'Earth', geometry: 'sphere', position: [4, 0, 0], color: '#2244aa', scale: [0.5, 0.5, 0.5], traits: [] },
      { id: id(), name: 'Moon',  geometry: 'sphere', position: [5.2, 0, 0], color: '#aaaaaa', scale: [0.14, 0.14, 0.14], traits: [] },
    ],
  },

  // ── VR Gallery ────────────────────────────────────────────────────────────
  {
    id: 'gallery',
    name: 'VR Art Gallery',
    description: 'Minimalist white gallery with floating art planes',
    thumbnail: '🖼️',
    tags: ['vr', 'gallery', 'art', 'interior'],
    code: `composition "VR Gallery" {
  environment {
    skybox: "studio"
    ambient_light: 0.8
    shadows: true
  }

  object "Floor" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.05, 0]
    scale: [12, 0.1, 8]
    color: "#f8f8f8"
  }

  object "PanelNorth" {
    @billboard
    @glowing
    geometry: "plane"
    position: [0, 1.5, -3.5]
    scale: [2.4, 1.6, 0.01]
    color: "#111"
    emissive: "#222266"
    emissiveIntensity: 0.1
    label: "Exhibit A"
  }

  object "PanelEast" {
    @billboard
    @glowing
    geometry: "plane"
    position: [3, 1.5, 0]
    rotation: [0, -90, 0]
    scale: [2.4, 1.6, 0.01]
    color: "#111"
    emissive: "#662222"
    emissiveIntensity: 0.1
    label: "Exhibit B"
  }

  object "SpotlightA" {
    @light
    type: "spot"
    position: [0, 3.5, -3.5]
    rotation: [-90, 0, 0]
    color: "#ffffff"
    intensity: 2.0
    angle: 0.4
  }
}`,
  },

  // ── Procedural City ───────────────────────────────────────────────────────
  {
    id: 'city',
    name: 'Procedural City',
    description: 'Grid of randomized glowing buildings at night',
    thumbnail: '🏙️',
    tags: ['city', 'procedural', 'night', 'glowing'],
    code: `composition "Night City" {
  environment {
    skybox: "night"
    ambient_light: 0.05
    fog: { color: "#050514", density: 0.01 }
    shadows: false
  }

  object "Ground" {
    @collidable
    @static
    geometry: "plane"
    rotation: [-90, 0, 0]
    scale: [50, 50, 1]
    color: "#111118"
  }

  object "TowerA" {
    @glowing
    @static
    geometry: "box"
    position: [-4, 2.5, -5]
    scale: [1.2, 5, 1.2]
    color: "#0d1117"
    emissive: "#0066ff"
    emissiveIntensity: 0.25
  }

  object "TowerB" {
    @glowing
    @static
    geometry: "box"
    position: [2, 3.5, -6]
    scale: [0.9, 7, 0.9]
    color: "#0d1117"
    emissive: "#ff2266"
    emissiveIntensity: 0.3
  }

  object "TowerC" {
    @glowing
    @static
    geometry: "box"
    position: [-1, 1.5, -3]
    scale: [1.5, 3, 1.5]
    color: "#0d1117"
    emissive: "#00ffcc"
    emissiveIntensity: 0.2
  }

  object "TowerD" {
    @glowing
    @static
    geometry: "box"
    position: [5, 4, -7]
    scale: [1.0, 8, 1.0]
    color: "#0d1117"
    emissive: "#9933ff"
    emissiveIntensity: 0.35
  }
}`,
  },

  // ── Physics Playground ────────────────────────────────────────────────────
  {
    id: 'physics',
    name: 'Physics Playground',
    description: 'Bouncing spheres and boxes with Rapier rigid bodies',
    thumbnail: '⚽',
    tags: ['physics', 'dynamic', 'simulation'],
    code: `composition "Physics Playground" {
  environment {
    skybox: "studio"
    ambient_light: 0.6
    shadows: true
  }

  object "Floor" {
    @collidable
    @physics type:"static" shape:"box"
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [10, 0.2, 10]
    color: "#334455"
  }

  object "Ball1" {
    @physics type:"dynamic" shape:"sphere" restitution:0.7 friction:0.3
    geometry: "sphere"
    position: [0, 3, 0]
    scale: [0.5, 0.5, 0.5]
    color: "#ff4444"
  }

  object "Ball2" {
    @physics type:"dynamic" shape:"sphere" restitution:0.5
    geometry: "sphere"
    position: [1.2, 5, 0.5]
    scale: [0.4, 0.4, 0.4]
    color: "#44aaff"
  }

  object "Crate" {
    @physics type:"dynamic" shape:"box" friction:0.8
    geometry: "box"
    position: [-1, 4, -0.5]
    scale: [0.6, 0.6, 0.6]
    color: "#cc8833"
  }
}`,
  },

  // ── Shader Showcase ───────────────────────────────────────────────────────
  {
    id: 'shaders',
    name: 'Shader Showcase',
    description: 'Three spheres with procedural animated shaders',
    thumbnail: '✨',
    tags: ['shaders', 'glsl', 'material', 'showcase'],
    code: `composition "Shader Showcase" {
  environment {
    skybox: "night"
    ambient_light: 0.1
  }

  object "WaveOrb" {
    @material vertexShader:"sin(uTime + position.x) * 0.15"
    geometry: "sphere"
    position: [-2.5, 1, 0]
    scale: [1, 1, 1]
    color: "#6633ff"
    emissive: "#6633ff"
    emissiveIntensity: 0.5
  }

  object "PulseOrb" {
    @material emissive:"#00ffcc" emissiveIntensity:1.5
    geometry: "sphere"
    position: [0, 1, 0]
    scale: [1, 1, 1]
    color: "#00ffcc"

    animation pulse_emit {
      property: "material.emissiveIntensity"
      from: 0.3
      to: 2.0
      duration: 1200
      loop: infinite
      easing: "easeInOut"
    }
  }

  object "ChromeOrb" {
    @material metalness:1.0 roughness:0.05
    geometry: "sphere"
    position: [2.5, 1, 0]
    scale: [1, 1, 1]
    color: "#cccccc"
  }
}`,
  },

  // ── Meditation Space ──────────────────────────────────────────────────────
  {
    id: 'meditation',
    name: 'Meditation Space',
    description: 'Peaceful ambient environment with floating particles',
    thumbnail: '🧘',
    tags: ['ambient', 'vr', 'wellness', 'particles'],
    code: `composition "Meditation Space" {
  environment {
    skybox: "nebula"
    ambient_light: 0.2
    fog: { color: "#0a0520", density: 0.004 }
  }

  object "CentralOrb" {
    @glowing
    geometry: "sphere"
    position: [0, 1.5, 0]
    scale: [0.3, 0.3, 0.3]
    color: "#aa66ff"
    emissive: "#aa66ff"
    emissiveIntensity: 3.0

    animation breathe {
      property: "scale"
      from: [0.3, 0.3, 0.3]
      to: [0.38, 0.38, 0.38]
      duration: 4000
      loop: infinite
      easing: "easeInOut"
    }
  }

  object "RingA" {
    @glowing
    geometry: "torus"
    position: [0, 1.5, 0]
    scale: [1.0, 1.0, 0.04]
    rotation: [90, 0, 0]
    color: "#6633ff"
    emissive: "#6633ff"
    emissiveIntensity: 0.4

    animation spin_a {
      property: "rotation.y"
      from: 0
      to: 360
      duration: 8000
      loop: infinite
      easing: "linear"
    }
  }

  object "RingB" {
    @glowing
    geometry: "torus"
    position: [0, 1.5, 0]
    scale: [1.6, 1.6, 0.03]
    rotation: [60, 30, 0]
    color: "#ff66aa"
    emissive: "#ff66aa"
    emissiveIntensity: 0.3

    animation spin_b {
      property: "rotation.z"
      from: 0
      to: -360
      duration: 12000
      loop: infinite
      easing: "linear"
    }
  }

  object "FloorPad" {
    @collidable
    @static
    geometry: "cylinder"
    position: [0, 0, 0]
    scale: [4, 0.02, 4]
    color: "#1a0a2e"
    material: "glass"
    opacity: 0.6
  }
}`,
  },
];

// ─── Search ───────────────────────────────────────────────────────────────────

export function searchTemplates(query: string): SceneTemplate[] {
  if (!query.trim()) return SCENE_TEMPLATES;
  const q = query.toLowerCase();
  return SCENE_TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.includes(q))
  );
}
