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

import type { SceneNode } from '@/lib/stores';
import { getAllWizardTemplates } from '../presets/wizardTemplates';

export interface SceneTemplate {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  tags: string[];
  category: string;
  code: string;
  nodes?: Partial<SceneNode>[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function id() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Templates ───────────────────────────────────────────────────────────────

const BASE_SCENE_TEMPLATES: SceneTemplate[] = [
  // ── Blank Canvas ──────────────────────────────────────────────────────────
  {
    id: 'blank',
    name: 'Blank Canvas',
    description: 'Empty scene with default lighting',
    thumbnail: '⬜',
    tags: ['empty', 'basic', 'starter'],
    category: 'Starter',
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
    category: 'Starter',
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
      {
        id: id(),
        name: 'Sun',
        type: 'mesh',
        parentId: null,
        position: [0, 0, 0],
        scale: [1.5, 1.5, 1.5],
        rotation: [0, 0, 0],
        traits: [{ name: 'glow', properties: { emissive: '#ff6600', emissiveIntensity: 2 } }],
      },
      {
        id: id(),
        name: 'Earth',
        type: 'mesh',
        parentId: null,
        position: [4, 0, 0],
        scale: [0.5, 0.5, 0.5],
        rotation: [0, 0, 0],
        traits: [],
      },
      {
        id: id(),
        name: 'Moon',
        type: 'mesh',
        parentId: null,
        position: [5.2, 0, 0],
        scale: [0.14, 0.14, 0.14],
        rotation: [0, 0, 0],
        traits: [],
      },
    ],
  },

  // ── VR Gallery ────────────────────────────────────────────────────────────
  {
    id: 'gallery',
    name: 'VR Art Gallery',
    description: 'Minimalist white gallery with floating art planes',
    thumbnail: '🖼️',
    tags: ['vr', 'gallery', 'art', 'interior'],
    category: 'Art & Zora',
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
    category: 'Advanced',
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
    category: 'Utility',
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
    category: 'Advanced',
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
    category: 'Utility',
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
} `,
  },

  // ── Clanker Meme Token (Crypto / Social Media) ─────────────────────────────
  {
    id: 'clanker-meme',
    name: 'Clanker Token Forge',
    description: 'Spinning 3D character token with custom material for Zora/Social',
    thumbnail: '🤖',
    tags: ['crypto', 'token', 'meme', 'character', 'zora'],
    category: 'Social Media',
    code: `composition "Clanker Meme Token" {
  environment {
    skybox: "studio"
    ambient_light: 1.2
    shadows: false
  }

  object "ClankerCoin" {
    @material metalness:1.0 roughness:0.2
    geometry: "cylinder"
    position: [0, 1, 0]
    scale: [1.5, 0.1, 1.5]
    rotation: [90, 0, 0]
    color: "#ffd700"
    
    animation spin {
      property: "rotation.z"
      from: 0
      to: 360
      duration: 3000
      loop: infinite
      easing: "linear"
    }
  }

  object "CharacterHolo" {
    @billboard
    geometry: "plane"
    position: [0, 1, 0.1]
    scale: [1, 1, 1]
    color: "#ffffff"
    label: "CLANKER"
  }
} `,
  },

  // ── AI Builder (Agentic Generation) ────────────────────────────────────────
  {
    id: 'ai-agent-hub',
    name: 'Agentic Behavior Hub',
    description:
      'A logic-heavy template pre-wired with an AI Agent Node, navigation mesh, and dialogue triggers.',
    thumbnail: '🧠',
    tags: ['ai', 'agent', 'npc', 'behavior', 'logic'],
    category: 'AI Builder',
    code: `composition "Agentic Behavior Hub" {
  environment {
    skybox: "studio"
    ambient_light: 0.8
    shadows: true
  }

  object "NavMeshFloor" {
    @collidable
    @navmesh walkable:true
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [20, 0.2, 20]
    color: "#223344"
  }

  object "AIAgentNode" {
    @behavior type:"llm_agent" persona:"story_weaver"
    @physics type:"dynamic" shape:"capsule"
    geometry: "capsule"
    position: [0, 1, 0]
    color: "#00ffcc"
    
    component "DialogueTrigger" {
      type: "proximity"
      radius: 3.0
    }
  }

  object "WaypointA" {
    @behavior type:"waypoint" id:"wp_A"
    geometry: "sphere"
    position: [5, 0.5, 5]
    scale: [0.2, 0.2, 0.2]
    color: "#ff0066"
    opacity: 0.5
    material: "glass"
  }
} `,
  },

  // ── Orchestration (Networking & Mesh) ──────────────────────────────────────
  {
    id: 'mcp-mesh-node',
    name: 'MCP Mesh Data Center',
    description:
      'A spatial visualization of a Quantum MCP Mesh server node, wired for pub-sub telemetry and orchestration monitoring.',
    thumbnail: '🖧',
    tags: ['orchestration', 'mcp', 'mesh', 'server', 'network', 'visualization'],
    category: 'Orchestration',
    code: `composition "MCP Mesh Node" {
  environment {
    skybox: "night"
    ambient_light: 0.1
    fog: { color: "#000511", density: 0.05 }
  }

  object "ServerRack" {
    @collidable
    @static
    geometry: "box"
    position: [0, 2, 0]
    scale: [1.2, 4, 1.2]
    color: "#111111"
    
    component "TelemetryReceiver" {
      endpoint: "ws://mcp-orchestrator:5555"
      topic: "mesh.telemetry"
    }
  }

  object "DataStreamVisualizer" {
    @vfx preset:"digital_rain" color:"#00ff66" speed:2.0
    geometry: "plane"
    position: [0, 4.5, 0]
    scale: [2, 2, 1]
    rotation: [-90, 0, 0]
  }

  object "StatusIndicator" {
    @behavior type:"pulse_light" color:"#00ff00"
    geometry: "sphere"
    position: [0, 4.2, 0.65]
    scale: [0.15, 0.15, 0.15]
    color: "#00ff00"
    emissive: "#00ff00"
    emissiveIntensity: 2.5
  }
} `,
  },

  // ── Holographic UI Lab ─────────────────────────────────────────────────────
  {
    id: 'holo-ui',
    name: 'Holographic UI Lab',
    description: 'Floating holographic panels and controls for XR interface prototyping',
    thumbnail: '🖥️',
    tags: ['xr', 'ui', 'holographic', 'prototype'],
    category: 'AI Builder',
    code: `composition "Holographic UI Lab" {
  environment {
    skybox: "night"
    ambient_light: 0.1
  }

  object "MainPanel" {
    @billboard @glowing
    geometry: "plane"
    position: [0, 1.5, -1.5]
    scale: [1.6, 1, 0.01]
    color: "#0a1028"
    emissive: "#1144aa"
    emissiveIntensity: 0.3
    opacity: 0.85
    label: "System Status"
  }

  object "SidePanel" {
    @billboard @glowing
    geometry: "plane"
    position: [-1.2, 1.5, -1]
    rotation: [0, 25, 0]
    scale: [0.8, 0.6, 0.01]
    color: "#0a1028"
    emissive: "#00cc66"
    emissiveIntensity: 0.3
    opacity: 0.8
    label: "Metrics"
  }

  object "ControlOrb" {
    @glowing
    geometry: "sphere"
    position: [0.8, 1, -0.8]
    scale: [0.12, 0.12, 0.12]
    color: "#00aaff"
    emissive: "#00aaff"
    emissiveIntensity: 2.0

    animation hover {
      property: "position.y"
      from: 1.0
      to: 1.15
      duration: 1500
      loop: infinite
      easing: "easeInOut"
    }
  }
}`,
  },

  // ── Desert Ruins ──────────────────────────────────────────────────────────
  {
    id: 'tpl-desert-ruins',
    name: 'Desert Ruins',
    description: 'Wind-worn sandstone columns rising from golden dunes at dusk',
    thumbnail: '🏜️',
    tags: ['outdoor', 'ancient', 'desert', 'ruins'],
    category: 'environment',
    code: `composition "Desert Ruins" {
  environment {
    skybox: "desert_dusk"
    ambient_light: 0.4
    fog: { color: "#c2956a", density: 0.02 }
  }

  object "Ground" {
    @collidable
    @static
    geometry: "plane"
    rotation: [-90, 0, 0]
    scale: [20, 20, 1]
    color: "#c2956a"
  }

  object "ColumnA" {
    @static
    geometry: "cylinder"
    position: [3, 1.25, 0]
    rotation: [0, 15, 0]
    scale: [0.4, 2.5, 0.4]
    color: "#b8865a"
  }

  object "ColumnB" {
    @static
    geometry: "cylinder"
    position: [-2, 1, 4]
    rotation: [0, -20, 3]
    scale: [0.35, 2, 0.35]
    color: "#c09070"
  }

  object "Arch" {
    @static
    geometry: "box"
    position: [0, 1.5, -5]
    scale: [3, 2, 0.6]
    color: "#b07050"
  }

  object "SandDune" {
    @static
    geometry: "sphere"
    position: [8, -0.5, 3]
    scale: [4, 1.5, 3]
    color: "#d4a872"
  }
}`,
  },

  // ── Cyberpunk Alley ────────────────────────────────────────────────────────
  {
    id: 'tpl-cyberpunk-alley',
    name: 'Cyberpunk Alley',
    description: 'Neon-lit back alley with rain puddles and holographic signs',
    thumbnail: '🌆',
    tags: ['urban', 'night', 'neon', 'cyberpunk', 'rain'],
    category: 'environment',
    code: `composition "Cyberpunk Alley" {
  environment {
    skybox: "night"
    ambient_light: 0.1
    fog: { color: "#0a0020", density: 0.05 }
  }

  object "Ground" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.05, 0]
    scale: [10, 0.1, 20]
    color: "#1a1a2e"
  }

  object "LeftWall" {
    @static
    geometry: "box"
    position: [-5, 3, 0]
    scale: [0.2, 6, 20]
    color: "#111122"
  }

  object "NeonSignA" {
    @glowing
    geometry: "box"
    position: [-4.5, 4, -3]
    rotation: [0, 90, 0]
    scale: [1.5, 0.5, 0.05]
    color: "#ff006e"
    emissive: "#ff006e"
    emissiveIntensity: 3.0
  }

  object "NeonSignB" {
    @glowing
    geometry: "box"
    position: [-4.5, 2.5, -7]
    rotation: [0, 90, 0]
    scale: [1, 0.35, 0.05]
    color: "#00f5ff"
    emissive: "#00f5ff"
    emissiveIntensity: 2.5
  }

  object "RainPuddle" {
    @static
    geometry: "plane"
    rotation: [-90, 0, 0]
    position: [0, 0.02, 0]
    scale: [4, 6, 1]
    color: "#0a0a1a"
  }
}`,
  },

  // ── Japanese Garden ────────────────────────────────────────────────────────
  {
    id: 'tpl-japanese-garden',
    name: 'Japanese Garden',
    description: 'Serene stone garden with cherry blossom tree and koi pond',
    thumbnail: '🌸',
    tags: ['nature', 'zen', 'outdoor', 'peaceful'],
    category: 'environment',
    code: `composition "Japanese Garden" {
  environment {
    skybox: "overcast"
    ambient_light: 0.6
  }

  object "StoneGround" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.025, 0]
    scale: [12, 0.05, 12]
    color: "#9e9e8e"
  }

  object "CherryTree" {
    geometry: "sphere"
    position: [-3, 1.5, -2]
    scale: [2, 2.5, 2]
    color: "#f4a5c0"
  }

  object "KoiPond" {
    @static
    geometry: "cylinder"
    position: [2, 0, 1]
    scale: [2.5, 0.1, 2.5]
    color: "#2d4a6e"
  }

  object "StoneLantern" {
    @static
    geometry: "cylinder"
    position: [0, 0.6, -4]
    scale: [0.3, 1.2, 0.3]
    color: "#888877"
  }

  object "WoodenBridge" {
    @static
    geometry: "box"
    position: [2, 0.15, 1]
    rotation: [0, 90, 0]
    scale: [2, 0.1, 0.8]
    color: "#6b4423"
  }
}`,
  },

  // ── Space Station Interior ────────────────────────────────────────────────
  {
    id: 'tpl-space-station',
    name: 'Space Station Interior',
    description: 'Modular corridor with glowing panels, airlock, and observation window',
    thumbnail: '🚀',
    tags: ['interior', 'space', 'futuristic', 'metal'],
    category: 'environment',
    code: `composition "Space Station Interior" {
  environment {
    skybox: "space"
    ambient_light: 0.15
  }

  object "FloorPlate" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.05, 0]
    scale: [8, 0.1, 12]
    color: "#1c2333"
  }

  object "WallLeft" {
    @static
    geometry: "box"
    position: [-4, 2, 0]
    scale: [0.1, 4, 12]
    color: "#242d40"
  }

  object "GlowingStrip" {
    @glowing
    geometry: "box"
    position: [0, 3.8, 0]
    scale: [8, 0.1, 0.2]
    color: "#4488ff"
    emissive: "#4488ff"
    emissiveIntensity: 2.0
  }

  object "AirlockDoor" {
    @static
    geometry: "box"
    position: [0, 2, -6]
    scale: [3, 4, 0.3]
    color: "#2a3a50"
  }

  object "DisplayScreen" {
    @glowing
    geometry: "plane"
    position: [-3.9, 2, -3]
    rotation: [0, 90, 0]
    scale: [2, 1.5, 1]
    color: "#0a2040"
    emissive: "#1a6aff"
    emissiveIntensity: 0.5
  }
}`,
  },

  // ── Castle Courtyard ──────────────────────────────────────────────────────
  {
    id: 'tpl-medieval-castle',
    name: 'Castle Courtyard',
    description: 'Fortified courtyard with towers, torchlight, and a well',
    thumbnail: '🏰',
    tags: ['medieval', 'castle', 'stone', 'outdoor'],
    category: 'game',
    code: `composition "Castle Courtyard" {
  environment {
    skybox: "sunset"
    ambient_light: 0.4
  }

  object "Cobblestones" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.05, 0]
    scale: [15, 0.1, 15]
    color: "#776655"
  }

  object "TowerA" {
    @static
    geometry: "cylinder"
    position: [6, 5, 6]
    scale: [1.5, 10, 1.5]
    color: "#887766"
  }

  object "TowerB" {
    @static
    geometry: "cylinder"
    position: [-6, 5, 6]
    scale: [1.5, 10, 1.5]
    color: "#887766"
  }

  object "StoneWell" {
    @static
    geometry: "cylinder"
    position: [0, 0.6, 0]
    scale: [1.2, 1.2, 1.2]
    color: "#665544"
  }

  object "Torch" {
    @glowing
    geometry: "cylinder"
    position: [4, 1.5, 0]
    scale: [0.08, 2, 0.08]
    color: "#884422"
    emissive: "#ff6600"
    emissiveIntensity: 2.0
  }
}`,
  },

  // ── Minimal Showcase ──────────────────────────────────────────────────────
  {
    id: 'tpl-minimal-showcase',
    name: 'Minimal Showcase',
    description: 'Clean white studio environment for showcasing 3D objects',
    thumbnail: '⚪',
    tags: ['clean', 'product', 'studio', 'white'],
    category: 'film',
    code: `composition "Minimal Showcase" {
  environment {
    skybox: "studio"
    ambient_light: 1.0
  }

  object "Platform" {
    @static
    geometry: "cylinder"
    position: [0, -0.1, 0]
    scale: [3, 0.2, 3]
    color: "#f5f5f5"
  }

  object "Subject" {
    @material metalness:0.9 roughness:0.05
    geometry: "sphere"
    position: [0, 0.5, 0]
    scale: [1.2, 1.2, 1.2]
    color: "#ffffff"
  }
}`,
  },

  // ── Platformer Level ──────────────────────────────────────────────────────
  {
    id: 'tpl-platformer-level',
    name: 'Platformer Level',
    description: 'Side-scrolling platformer stage with floating platforms and collectibles',
    thumbnail: '🎮',
    tags: ['game', 'platformer', 'level', 'blocks'],
    category: 'game',
    code: `composition "Platformer Level 1" {
  environment {
    skybox: "studio"
    ambient_light: 0.8
  }

  object "GroundPlatform" {
    @collidable
    @static
    geometry: "box"
    position: [0, -1, 0]
    scale: [12, 0.5, 2]
    color: "#4a8c3f"
  }

  object "PlatformA" {
    @collidable
    @static
    geometry: "box"
    position: [-3, 1.5, 0]
    scale: [2.5, 0.4, 2]
    color: "#5a9c4f"
  }

  object "PlatformB" {
    @collidable
    @static
    geometry: "box"
    position: [2, 3, 0]
    scale: [3, 0.4, 2]
    color: "#5a9c4f"
  }

  object "CoinA" {
    @glowing
    geometry: "cylinder"
    position: [-3, 2.5, 0]
    scale: [0.4, 0.1, 0.4]
    color: "#ffd700"
    emissive: "#ffaa00"
    emissiveIntensity: 0.5

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
    position: [5.5, 2, 0]
    scale: [0.15, 4, 0.15]
    color: "#cc3333"
  }
}`,
  },

  // ── Underwater Scene ──────────────────────────────────────────────────────
  {
    id: 'tpl-underwater',
    name: 'Underwater Scene',
    description: 'Deep-sea coral reef with bioluminescent plants and drifting particles',
    thumbnail: '🐠',
    tags: ['underwater', 'ocean', 'coral', 'nature'],
    category: 'environment',
    code: `composition "Underwater Reef" {
  environment {
    skybox: "underwater"
    ambient_light: 0.3
    fog: { color: "#003a5c", density: 0.08 }
  }

  object "SeaFloor" {
    @collidable
    @static
    geometry: "box"
    position: [0, -3, 0]
    scale: [15, 0.2, 15]
    color: "#c8b89a"
  }

  object "CoralCluster" {
    @glowing
    geometry: "sphere"
    position: [2, -2, -1]
    scale: [1.5, 1.2, 1.5]
    color: "#ff6b35"
    emissive: "#ff3300"
    emissiveIntensity: 0.3
  }

  object "SeaAnemone" {
    @glowing
    geometry: "cylinder"
    position: [-2, -2.5, 2]
    scale: [0.5, 0.8, 0.5]
    color: "#ff1493"
    emissive: "#ff0066"
    emissiveIntensity: 0.8
  }

  object "GlowingOrb" {
    @glowing
    geometry: "sphere"
    position: [-3, 0, -2]
    scale: [0.3, 0.3, 0.3]
    color: "#aaffee"
    emissive: "#00ffcc"
    emissiveIntensity: 3.0

    animation float {
      property: "position.y"
      from: 0
      to: 0.5
      duration: 3000
      loop: infinite
      easing: "easeInOut"
    }
  }
}`,
  },
];

/** All scene templates: built-in + wizard starter templates merged. */
export const SCENE_TEMPLATES: SceneTemplate[] = [
  ...BASE_SCENE_TEMPLATES,
  ...getAllWizardTemplates(),
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
