/**
 * Wizard Templates — Starter HoloScript compositions for each wizard sub-category.
 *
 * When a user completes the setup wizard and selects a sub-category, the matching
 * template here provides ready-to-run starter code in the editor. Templates use
 * the standard HoloScript composition format (same as sceneTemplates.ts).
 *
 * Inspired by the 400 use case examples in docs/examples/Listed-Examples.
 */

import type { SceneTemplate } from '../scene/sceneTemplates';

// ─── Wizard Template Map ────────────────────────────────────────────────────

/** Maps wizard sub-category IDs to starter templates. */
export const WIZARD_TEMPLATES: Record<string, SceneTemplate> = {
  // ─── Game ──────────────────────────────────────────────────────────────────

  'vr-game': {
    id: 'wizard-vr-game',
    name: 'VR Game Starter',
    description: 'Interactive VR scene with grabbable objects and physics',
    thumbnail: '🎮',
    tags: ['vr', 'game', 'physics', 'interactive'],
    category: 'game',
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
}`,
  },

  'platformer': {
    id: 'wizard-platformer',
    name: 'Platformer Starter',
    description: 'Side-scrolling platformer with floating platforms and collectibles',
    thumbnail: '🏃',
    tags: ['game', 'platformer', 'physics', 'level'],
    category: 'game',
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
}`,
  },

  'rpg': {
    id: 'wizard-rpg',
    name: 'RPG World Starter',
    description: 'Fantasy RPG scene with NPC, tavern, and quest marker',
    thumbnail: '⚔️',
    tags: ['game', 'rpg', 'fantasy', 'npc'],
    category: 'game',
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
}`,
  },

  'puzzle': {
    id: 'wizard-puzzle',
    name: 'Puzzle Room Starter',
    description: 'Interactive puzzle room with clickable switches and moving elements',
    thumbnail: '🧩',
    tags: ['game', 'puzzle', 'interactive', 'logic'],
    category: 'game',
    code: `composition "Puzzle Room" {
  environment {
    skybox: "studio"
    ambient_light: 0.3
    shadows: true
  }

  object "Floor" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [10, 0.2, 10]
    color: "#2a2a3a"
  }

  object "WallNorth" {
    @collidable
    @static
    geometry: "box"
    position: [0, 2, -5]
    scale: [10, 4, 0.3]
    color: "#333344"
  }

  object "SwitchA" {
    @clickable
    @glowing
    geometry: "box"
    position: [-2, 1.5, -4.8]
    scale: [0.4, 0.4, 0.1]
    color: "#ff3333"
    emissive: "#ff0000"
    emissiveIntensity: 1.0
    label: "Switch 1"
  }

  object "SwitchB" {
    @clickable
    @glowing
    geometry: "box"
    position: [2, 1.5, -4.8]
    scale: [0.4, 0.4, 0.1]
    color: "#3333ff"
    emissive: "#0000ff"
    emissiveIntensity: 1.0
    label: "Switch 2"
  }

  object "GateDoor" {
    @collidable
    geometry: "box"
    position: [0, 1.5, -4.8]
    scale: [1.5, 3, 0.2]
    color: "#555566"
    emissive: "#222233"
    emissiveIntensity: 0.3
  }

  object "PrizeOrb" {
    @glowing
    geometry: "sphere"
    position: [0, 1.5, -8]
    scale: [0.5, 0.5, 0.5]
    color: "#ffcc00"
    emissive: "#ffaa00"
    emissiveIntensity: 2.0

    animation float {
      property: "position.y"
      from: 1.5
      to: 2.0
      duration: 2000
      loop: infinite
      easing: "easeInOut"
    }
  }
}`,
  },

  'social-vr': {
    id: 'wizard-social-vr',
    name: 'Social VR Space',
    description: 'Multiplayer social space with lounge areas and teleport points',
    thumbnail: '👥',
    tags: ['vr', 'social', 'multiplayer', 'lounge'],
    category: 'game',
    code: `composition "Social Lounge" {
  environment {
    skybox: "nebula"
    ambient_light: 0.4
    fog: { color: "#0a0520", density: 0.002 }
  }

  object "Floor" {
    @collidable
    @navmesh walkable:true
    geometry: "cylinder"
    position: [0, -0.1, 0]
    scale: [12, 0.2, 12]
    color: "#1a1a2e"
    material: "glass"
    opacity: 0.7
  }

  object "SeatCircleA" {
    @collidable
    @static
    geometry: "torus"
    position: [-3, 0.3, -3]
    scale: [1.5, 0.2, 1.5]
    color: "#4422aa"
    emissive: "#4422aa"
    emissiveIntensity: 0.3
  }

  object "SeatCircleB" {
    @collidable
    @static
    geometry: "torus"
    position: [3, 0.3, -3]
    scale: [1.5, 0.2, 1.5]
    color: "#aa2244"
    emissive: "#aa2244"
    emissiveIntensity: 0.3
  }

  object "TeleportPadA" {
    @teleport target:[0, 0, 0]
    @glowing
    geometry: "cylinder"
    position: [-6, 0.05, 0]
    scale: [0.8, 0.05, 0.8]
    color: "#00ccff"
    emissive: "#00ccff"
    emissiveIntensity: 1.5
    label: "Lobby"
  }

  object "TeleportPadB" {
    @teleport target:[0, 0, -10]
    @glowing
    geometry: "cylinder"
    position: [6, 0.05, 0]
    scale: [0.8, 0.05, 0.8]
    color: "#ff6600"
    emissive: "#ff6600"
    emissiveIntensity: 1.5
    label: "Stage"
  }

  object "StageScreen" {
    @billboard
    @glowing
    geometry: "plane"
    position: [0, 3, -8]
    scale: [6, 3, 0.05]
    color: "#111122"
    emissive: "#2244aa"
    emissiveIntensity: 0.2
    label: "Live Screen"
  }
}`,
  },

  // ─── Film ──────────────────────────────────────────────────────────────────

  'short-film': {
    id: 'wizard-short-film',
    name: 'Short Film Set',
    description: 'Cinematic set with camera positions, key lighting, and backdrop',
    thumbnail: '🎥',
    tags: ['film', 'cinematic', 'camera', 'lighting'],
    category: 'cinematic',
    code: `composition "Short Film Set" {
  environment {
    skybox: "sunset"
    ambient_light: 0.3
    fog: { color: "#1a0a2e", density: 0.005 }
    shadows: true
  }

  object "StageFloor" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.05, 0]
    scale: [15, 0.1, 10]
    color: "#2a2a2a"
  }

  object "Backdrop" {
    @static
    geometry: "box"
    position: [0, 4, -5]
    scale: [15, 8, 0.2]
    color: "#1a1a3a"
  }

  object "ActorMark" {
    geometry: "cylinder"
    position: [0, 0.02, 0]
    scale: [0.5, 0.01, 0.5]
    color: "#ff4444"
    label: "Actor Mark"
  }

  object "KeyLight" {
    @light
    type: "spot"
    position: [4, 5, 3]
    rotation: [-40, 25, 0]
    color: "#fff5e6"
    intensity: 3.0
    angle: 0.5
  }

  object "FillLight" {
    @light
    type: "spot"
    position: [-3, 4, 2]
    rotation: [-35, -20, 0]
    color: "#aabbdd"
    intensity: 1.2
    angle: 0.6
  }

  object "RimLight" {
    @light
    type: "spot"
    position: [0, 5, -4]
    rotation: [-50, 0, 0]
    color: "#eeddff"
    intensity: 2.0
    angle: 0.4
  }

  object "CameraA" {
    @camera name:"Wide Shot"
    position: [0, 2, 6]
    rotation: [-10, 0, 0]
  }

  object "CameraB" {
    @camera name:"Close-up"
    position: [1, 1.5, 2]
    rotation: [-5, -10, 0]
  }
}`,
  },

  'music-video': {
    id: 'wizard-music-video',
    name: 'Music Video Stage',
    description: 'Concert stage with particle effects and audio-reactive lights',
    thumbnail: '🎶',
    tags: ['film', 'music', 'stage', 'particles', 'audio'],
    category: 'cinematic',
    code: `composition "Music Video Stage" {
  environment {
    skybox: "night"
    ambient_light: 0.05
    fog: { color: "#050510", density: 0.01 }
  }

  object "Stage" {
    @collidable
    @static
    geometry: "box"
    position: [0, 0, 0]
    scale: [10, 0.5, 6]
    color: "#111111"
  }

  object "SpotlightLeft" {
    @glowing
    geometry: "cone"
    position: [-4, 6, -2]
    rotation: [15, 0, 15]
    scale: [0.8, 4, 0.8]
    color: "#ff0066"
    emissive: "#ff0066"
    emissiveIntensity: 2.0
    opacity: 0.3
    material: "glass"
  }

  object "SpotlightRight" {
    @glowing
    geometry: "cone"
    position: [4, 6, -2]
    rotation: [15, 0, -15]
    scale: [0.8, 4, 0.8]
    color: "#0066ff"
    emissive: "#0066ff"
    emissiveIntensity: 2.0
    opacity: 0.3
    material: "glass"
  }

  object "DiscoBall" {
    @glowing
    geometry: "sphere"
    position: [0, 5, -1]
    scale: [0.5, 0.5, 0.5]
    color: "#cccccc"
    metalness: 1.0
    roughness: 0.1

    animation spin {
      property: "rotation.y"
      from: 0
      to: 360
      duration: 4000
      loop: infinite
      easing: "linear"
    }
  }

  object "SpeakerLeft" {
    @static
    geometry: "box"
    position: [-5, 1, -1]
    scale: [1, 2, 1]
    color: "#222222"
  }

  object "SpeakerRight" {
    @static
    geometry: "box"
    position: [5, 1, -1]
    scale: [1, 2, 1]
    color: "#222222"
  }

  object "PerformerSpot" {
    @glowing
    geometry: "cylinder"
    position: [0, 0.3, -1]
    scale: [1, 0.02, 1]
    color: "#ffffff"
    emissive: "#ffffff"
    emissiveIntensity: 1.0

    animation glow {
      property: "material.emissiveIntensity"
      from: 0.5
      to: 2.0
      duration: 800
      loop: infinite
      easing: "easeInOut"
    }
  }
}`,
  },

  'product-viz': {
    id: 'wizard-product-viz',
    name: 'Product Showcase',
    description: 'Clean studio setup for product visualization and turntables',
    thumbnail: '📦',
    tags: ['film', 'product', 'showcase', 'studio'],
    category: 'minimal',
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
}`,
  },

  'cutscene': {
    id: 'wizard-cutscene',
    name: 'Game Cutscene',
    description: 'In-game cinematic with character marks, cameras, and mood lighting',
    thumbnail: '🎭',
    tags: ['film', 'cutscene', 'game', 'cinematic'],
    category: 'cinematic',
    code: `composition "Game Cutscene" {
  environment {
    skybox: "night"
    ambient_light: 0.15
    fog: { color: "#0a0a1a", density: 0.008 }
    shadows: true
  }

  object "Ground" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [12, 0.2, 12]
    color: "#1a1a2a"
  }

  object "HeroMark" {
    geometry: "capsule"
    position: [-1.5, 0.8, 0]
    scale: [0.4, 0.8, 0.4]
    color: "#3366cc"
    label: "Hero"
  }

  object "VillainMark" {
    geometry: "capsule"
    position: [1.5, 0.9, 0]
    scale: [0.45, 0.9, 0.45]
    color: "#cc3333"
    label: "Villain"
  }

  object "DramaticLight" {
    @light
    type: "spot"
    position: [0, 6, 3]
    rotation: [-60, 0, 0]
    color: "#ccaaff"
    intensity: 3.0
    angle: 0.3
  }

  object "CamOver" {
    @camera name:"Over the Shoulder"
    position: [-3, 2, 1.5]
    rotation: [-10, -25, 0]
  }

  object "CamDramatic" {
    @camera name:"Low Angle"
    position: [0, 0.5, 3]
    rotation: [10, 0, 0]
  }

  object "CamWide" {
    @camera name:"Establishing"
    position: [0, 4, 8]
    rotation: [-20, 0, 0]
  }
}`,
  },

  // ─── Art ───────────────────────────────────────────────────────────────────

  'character-design': {
    id: 'wizard-character-design',
    name: 'Character Design Studio',
    description: 'Rigging-ready character template with T-pose reference and lighting',
    thumbnail: '🧑‍🎨',
    tags: ['art', 'character', 'design', 'avatar'],
    category: 'character',
    code: `composition "Character Studio" {
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
    scale: [6, 0.1, 6]
    color: "#e0e0e0"
  }

  object "CharacterBase" {
    geometry: "capsule"
    position: [0, 1, 0]
    scale: [0.4, 1.0, 0.4]
    color: "#d4a574"
    label: "Character Body"
  }

  object "Head" {
    geometry: "sphere"
    position: [0, 2.1, 0]
    scale: [0.35, 0.35, 0.35]
    color: "#d4a574"
  }

  object "LeftArm" {
    geometry: "capsule"
    position: [-0.7, 1.5, 0]
    rotation: [0, 0, 90]
    scale: [0.12, 0.5, 0.12]
    color: "#d4a574"
  }

  object "RightArm" {
    geometry: "capsule"
    position: [0.7, 1.5, 0]
    rotation: [0, 0, -90]
    scale: [0.12, 0.5, 0.12]
    color: "#d4a574"
  }

  object "GridReference" {
    @static
    geometry: "plane"
    position: [0, 0, -2]
    scale: [4, 4, 1]
    rotation: [0, 0, 0]
    color: "#cccccc"
    opacity: 0.3
    material: "glass"
  }

  object "FrontLight" {
    @light
    type: "spot"
    position: [0, 3, 4]
    rotation: [-30, 0, 0]
    color: "#ffffff"
    intensity: 2.0
    angle: 0.6
  }

  object "RimLight" {
    @light
    type: "spot"
    position: [0, 3, -3]
    rotation: [-40, 180, 0]
    color: "#aaccff"
    intensity: 1.5
    angle: 0.5
  }
}`,
  },

  'environment-art': {
    id: 'wizard-environment-art',
    name: 'Environment Art Scene',
    description: 'Lush landscape with terrain, vegetation, and atmospheric fog',
    thumbnail: '🏔️',
    tags: ['art', 'environment', 'landscape', 'nature'],
    category: 'environment',
    code: `composition "Environment Art" {
  environment {
    skybox: "sunset"
    ambient_light: 0.4
    fog: { color: "#d4a87a", density: 0.004 }
    shadows: true
  }

  object "Terrain" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.5, 0]
    scale: [30, 1, 30]
    color: "#5a7a3a"
  }

  object "MountainA" {
    @static
    geometry: "cone"
    position: [-8, 3, -12]
    scale: [6, 8, 6]
    color: "#7a6a5a"
  }

  object "MountainB" {
    @static
    geometry: "cone"
    position: [5, 4, -15]
    scale: [8, 10, 8]
    color: "#8a7a6a"
  }

  object "TreeA" {
    @static
    geometry: "cone"
    position: [-3, 1.5, -3]
    scale: [1, 3, 1]
    color: "#2a5a2a"
  }

  object "TreeATrunk" {
    @static
    geometry: "cylinder"
    position: [-3, 0, -3]
    scale: [0.15, 1.5, 0.15]
    color: "#5a3a1a"
  }

  object "TreeB" {
    @static
    geometry: "cone"
    position: [2, 1.2, -5]
    scale: [0.8, 2.5, 0.8]
    color: "#3a6a3a"
  }

  object "Rock" {
    @collidable
    @static
    geometry: "sphere"
    position: [4, 0.3, -1]
    scale: [1.2, 0.8, 1.0]
    color: "#6a6a6a"
    roughness: 1.0
  }

  object "Lake" {
    geometry: "cylinder"
    position: [-2, -0.1, 2]
    scale: [4, 0.02, 3]
    color: "#3a6a9a"
    metalness: 0.3
    roughness: 0.05
    opacity: 0.8
    material: "glass"
  }
}`,
  },

  'material-study': {
    id: 'wizard-material-study',
    name: 'Material Study',
    description: 'PBR material comparison with varied metalness, roughness, and emission',
    thumbnail: '✨',
    tags: ['art', 'material', 'shader', 'pbr'],
    category: 'environment',
    code: `composition "Material Study" {
  environment {
    skybox: "studio"
    ambient_light: 0.6
    shadows: true
  }

  object "Backdrop" {
    @static
    geometry: "box"
    position: [0, 2, -3]
    scale: [10, 5, 0.1]
    color: "#1a1a1a"
  }

  object "MatteOrb" {
    geometry: "sphere"
    position: [-3, 1, 0]
    scale: [0.8, 0.8, 0.8]
    color: "#cc4444"
    metalness: 0.0
    roughness: 1.0
    label: "Matte"
  }

  object "PlasticOrb" {
    geometry: "sphere"
    position: [-1, 1, 0]
    scale: [0.8, 0.8, 0.8]
    color: "#44cc44"
    metalness: 0.0
    roughness: 0.3
    label: "Plastic"
  }

  object "MetalOrb" {
    geometry: "sphere"
    position: [1, 1, 0]
    scale: [0.8, 0.8, 0.8]
    color: "#cccccc"
    metalness: 1.0
    roughness: 0.2
    label: "Metal"
  }

  object "ChromeOrb" {
    geometry: "sphere"
    position: [3, 1, 0]
    scale: [0.8, 0.8, 0.8]
    color: "#eeeeee"
    metalness: 1.0
    roughness: 0.02
    label: "Chrome"
  }

  object "EmissiveOrb" {
    @glowing
    geometry: "sphere"
    position: [-1, 1, 2.5]
    scale: [0.8, 0.8, 0.8]
    color: "#6633ff"
    emissive: "#6633ff"
    emissiveIntensity: 2.0
    label: "Emissive"
  }

  object "GlassOrb" {
    geometry: "sphere"
    position: [1, 1, 2.5]
    scale: [0.8, 0.8, 0.8]
    color: "#aaddff"
    metalness: 0.1
    roughness: 0.0
    opacity: 0.4
    material: "glass"
    label: "Glass"
  }
}`,
  },

  'music-visualizer': {
    id: 'wizard-music-visualizer',
    name: 'Music Visualizer',
    description: 'Audio-reactive rings and orbs with glow effects',
    thumbnail: '🎵',
    tags: ['art', 'audio', 'visualizer', 'particles'],
    category: 'environment',
    code: `composition "Audio Visualizer" {
  environment {
    skybox: "night"
    ambient_light: 0.05
    fog: { color: "#050510", density: 0.006 }
  }

  object "CenterOrb" {
    @glowing
    geometry: "sphere"
    position: [0, 2, 0]
    scale: [0.5, 0.5, 0.5]
    color: "#ff00cc"
    emissive: "#ff00cc"
    emissiveIntensity: 3.0

    animation pulse {
      property: "scale"
      from: [0.5, 0.5, 0.5]
      to: [0.65, 0.65, 0.65]
      duration: 500
      loop: infinite
      easing: "easeInOut"
    }
  }

  object "RingBass" {
    @glowing
    geometry: "torus"
    position: [0, 2, 0]
    scale: [2, 2, 0.05]
    rotation: [90, 0, 0]
    color: "#ff0066"
    emissive: "#ff0066"
    emissiveIntensity: 1.0

    animation expand {
      property: "scale"
      from: [2, 2, 0.05]
      to: [2.4, 2.4, 0.05]
      duration: 600
      loop: infinite
      easing: "easeInOut"
    }
  }

  object "RingMid" {
    @glowing
    geometry: "torus"
    position: [0, 2, 0]
    scale: [3, 3, 0.04]
    rotation: [70, 20, 0]
    color: "#00ccff"
    emissive: "#00ccff"
    emissiveIntensity: 0.6

    animation spin {
      property: "rotation.z"
      from: 0
      to: 360
      duration: 6000
      loop: infinite
      easing: "linear"
    }
  }

  object "RingHigh" {
    @glowing
    geometry: "torus"
    position: [0, 2, 0]
    scale: [4, 4, 0.03]
    rotation: [50, -30, 10]
    color: "#66ff00"
    emissive: "#66ff00"
    emissiveIntensity: 0.4

    animation spin {
      property: "rotation.y"
      from: 0
      to: -360
      duration: 10000
      loop: infinite
      easing: "linear"
    }
  }

  object "FloorGlow" {
    @glowing
    geometry: "cylinder"
    position: [0, 0, 0]
    scale: [6, 0.01, 6]
    color: "#1a0a2e"
    emissive: "#4400aa"
    emissiveIntensity: 0.5
    opacity: 0.6
    material: "glass"
  }
}`,
  },

  // ─── Web ───────────────────────────────────────────────────────────────────

  'portfolio': {
    id: 'wizard-portfolio',
    name: '3D Portfolio',
    description: 'Interactive 3D portfolio with floating project cards and navigation',
    thumbnail: '💼',
    tags: ['web', 'portfolio', 'gallery', 'interactive'],
    category: 'minimal',
    code: `composition "3D Portfolio" {
  environment {
    skybox: "studio"
    ambient_light: 0.9
    shadows: true
  }

  object "Floor" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.05, 0]
    scale: [20, 0.1, 12]
    color: "#f5f5f5"
  }

  object "ProjectCardA" {
    @clickable
    @billboard
    geometry: "plane"
    position: [-3, 1.5, -3]
    scale: [2, 1.4, 0.01]
    color: "#ffffff"
    label: "Project Alpha"
  }

  object "ProjectCardB" {
    @clickable
    @billboard
    geometry: "plane"
    position: [0, 1.5, -3]
    scale: [2, 1.4, 0.01]
    color: "#ffffff"
    label: "Project Beta"
  }

  object "ProjectCardC" {
    @clickable
    @billboard
    geometry: "plane"
    position: [3, 1.5, -3]
    scale: [2, 1.4, 0.01]
    color: "#ffffff"
    label: "Project Gamma"
  }

  object "NamePlate" {
    @billboard
    geometry: "plane"
    position: [0, 3.5, -4]
    scale: [6, 1, 0.01]
    color: "#222222"
    label: "Your Name — Portfolio"
  }

  object "AccentLight" {
    @light
    type: "spot"
    position: [0, 5, 2]
    rotation: [-50, 0, 0]
    color: "#ffffff"
    intensity: 2.0
    angle: 0.6
  }
}`,
  },

  'interactive-story': {
    id: 'wizard-interactive-story',
    name: 'Interactive Story',
    description: 'Branching narrative scene with choice points and atmosphere',
    thumbnail: '📖',
    tags: ['web', 'story', 'narrative', 'interactive'],
    category: 'fantasy',
    code: `composition "Interactive Story" {
  environment {
    skybox: "night"
    ambient_light: 0.2
    fog: { color: "#0a1020", density: 0.008 }
    shadows: true
  }

  object "ForestFloor" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [15, 0.2, 15]
    color: "#2a3a1a"
  }

  object "PathLeft" {
    @clickable
    @glowing
    geometry: "box"
    position: [-3, 0.05, -5]
    scale: [2, 0.05, 6]
    color: "#3a4a2a"
    emissive: "#4488ff"
    emissiveIntensity: 0.3
    label: "The Dark Woods"
  }

  object "PathRight" {
    @clickable
    @glowing
    geometry: "box"
    position: [3, 0.05, -5]
    scale: [2, 0.05, 6]
    color: "#3a4a2a"
    emissive: "#ff8844"
    emissiveIntensity: 0.3
    label: "The Bright Clearing"
  }

  object "StoryNarrator" {
    @billboard
    @glowing
    geometry: "plane"
    position: [0, 3, -2]
    scale: [5, 1, 0.01]
    color: "#111122"
    emissive: "#222244"
    emissiveIntensity: 0.2
    label: "You come to a fork in the path..."
  }

  object "MysteriousOrb" {
    @glowing
    geometry: "sphere"
    position: [0, 1.5, -3]
    scale: [0.2, 0.2, 0.2]
    color: "#aaffee"
    emissive: "#aaffee"
    emissiveIntensity: 3.0

    animation float {
      property: "position.y"
      from: 1.5
      to: 2.0
      duration: 2500
      loop: infinite
      easing: "easeInOut"
    }
  }
}`,
  },

  'data-dashboard': {
    id: 'wizard-data-dashboard',
    name: '3D Data Dashboard',
    description: 'Spatial data visualization with bar charts and status panels',
    thumbnail: '📊',
    tags: ['web', 'data', 'dashboard', 'visualization'],
    category: 'minimal',
    code: `composition "Data Dashboard" {
  environment {
    skybox: "night"
    ambient_light: 0.2
  }

  object "Floor" {
    @static
    geometry: "box"
    position: [0, -0.05, 0]
    scale: [12, 0.1, 8]
    color: "#0a0a1a"
  }

  object "BarA" {
    @glowing
    geometry: "box"
    position: [-3, 1, -2]
    scale: [0.6, 2, 0.6]
    color: "#0066ff"
    emissive: "#0044cc"
    emissiveIntensity: 0.5
    label: "Revenue"
  }

  object "BarB" {
    @glowing
    geometry: "box"
    position: [-1.5, 1.5, -2]
    scale: [0.6, 3, 0.6]
    color: "#00cc66"
    emissive: "#00aa44"
    emissiveIntensity: 0.5
    label: "Users"
  }

  object "BarC" {
    @glowing
    geometry: "box"
    position: [0, 0.75, -2]
    scale: [0.6, 1.5, 0.6]
    color: "#ff6600"
    emissive: "#cc4400"
    emissiveIntensity: 0.5
    label: "Churn"
  }

  object "BarD" {
    @glowing
    geometry: "box"
    position: [1.5, 2, -2]
    scale: [0.6, 4, 0.6]
    color: "#cc00ff"
    emissive: "#aa00cc"
    emissiveIntensity: 0.5
    label: "Growth"
  }

  object "StatusPanel" {
    @billboard
    @glowing
    geometry: "plane"
    position: [4, 2, -2]
    scale: [2.5, 2, 0.01]
    color: "#0a1028"
    emissive: "#1144aa"
    emissiveIntensity: 0.2
    label: "System Status: OK"
  }
}`,
  },

  'product-configurator': {
    id: 'wizard-product-configurator',
    name: 'Product Configurator',
    description: '3D product viewer with rotation, color variants, and option panels',
    thumbnail: '🔧',
    tags: ['web', 'product', 'configurator', 'ecommerce'],
    category: 'minimal',
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
}`,
  },

  // ─── IoT ───────────────────────────────────────────────────────────────────

  'sensor-dashboard': {
    id: 'wizard-sensor-dashboard',
    name: 'Sensor Dashboard',
    description: 'Live sensor monitoring with gauges, status indicators, and data panels',
    thumbnail: '📡',
    tags: ['iot', 'sensor', 'dashboard', 'monitoring'],
    category: 'minimal',
    code: `composition "Sensor Dashboard" {
  environment {
    skybox: "night"
    ambient_light: 0.15
  }

  object "DashboardBase" {
    @static
    geometry: "box"
    position: [0, 0, -3]
    scale: [8, 4, 0.1]
    color: "#0a0a1a"
  }

  object "TempGauge" {
    @glowing
    geometry: "cylinder"
    position: [-2.5, 1, -2.9]
    scale: [0.6, 0.6, 0.05]
    rotation: [90, 0, 0]
    color: "#ff4444"
    emissive: "#ff2222"
    emissiveIntensity: 0.8
    label: "Temperature: 72F"
  }

  object "HumidityGauge" {
    @glowing
    geometry: "cylinder"
    position: [0, 1, -2.9]
    scale: [0.6, 0.6, 0.05]
    rotation: [90, 0, 0]
    color: "#4488ff"
    emissive: "#2266dd"
    emissiveIntensity: 0.8
    label: "Humidity: 45%"
  }

  object "PressureGauge" {
    @glowing
    geometry: "cylinder"
    position: [2.5, 1, -2.9]
    scale: [0.6, 0.6, 0.05]
    rotation: [90, 0, 0]
    color: "#44cc44"
    emissive: "#22aa22"
    emissiveIntensity: 0.8
    label: "Pressure: 1013 hPa"
  }

  object "StatusLight" {
    @glowing
    geometry: "sphere"
    position: [3.5, 1.8, -2.8]
    scale: [0.15, 0.15, 0.15]
    color: "#00ff00"
    emissive: "#00ff00"
    emissiveIntensity: 3.0
    label: "Online"

    animation blink {
      property: "material.emissiveIntensity"
      from: 1.0
      to: 3.0
      duration: 1000
      loop: infinite
      easing: "easeInOut"
    }
  }

  object "AlertPanel" {
    @billboard
    @glowing
    geometry: "plane"
    position: [0, -0.5, -2.9]
    scale: [7, 1, 0.01]
    color: "#0a1028"
    emissive: "#113344"
    emissiveIntensity: 0.15
    label: "No active alerts"
  }
}`,
  },

  'digital-twin': {
    id: 'wizard-digital-twin',
    name: 'Digital Twin',
    description: 'Factory floor digital twin with machines, conveyors, and status indicators',
    thumbnail: '🏭',
    tags: ['iot', 'twin', 'factory', 'industrial'],
    category: 'minimal',
    code: `composition "Factory Digital Twin" {
  environment {
    skybox: "studio"
    ambient_light: 0.5
    shadows: true
  }

  object "FactoryFloor" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [20, 0.2, 14]
    color: "#555566"
  }

  object "ConveyorBelt" {
    @static
    geometry: "box"
    position: [0, 0.4, 0]
    scale: [12, 0.15, 1.5]
    color: "#333344"
  }

  object "MachineA" {
    @collidable
    @static
    geometry: "box"
    position: [-4, 1.5, -3]
    scale: [2, 3, 2]
    color: "#2244aa"
    label: "CNC-001"
  }

  object "MachineAStatus" {
    @glowing
    geometry: "sphere"
    position: [-4, 3.2, -3]
    scale: [0.2, 0.2, 0.2]
    color: "#00ff00"
    emissive: "#00ff00"
    emissiveIntensity: 2.0
  }

  object "MachineB" {
    @collidable
    @static
    geometry: "box"
    position: [4, 1.5, -3]
    scale: [2, 3, 2]
    color: "#aa4422"
    label: "PRESS-002"
  }

  object "MachineBStatus" {
    @glowing
    geometry: "sphere"
    position: [4, 3.2, -3]
    scale: [0.2, 0.2, 0.2]
    color: "#ffaa00"
    emissive: "#ffaa00"
    emissiveIntensity: 2.0
    label: "Maintenance Due"
  }

  object "RoboticArm" {
    @static
    geometry: "capsule"
    position: [0, 1.5, -3]
    rotation: [0, 0, -30]
    scale: [0.15, 1.5, 0.15]
    color: "#888888"
    metalness: 0.8
    roughness: 0.3
    label: "ARM-003"
  }

  object "OutputBin" {
    @static
    geometry: "box"
    position: [7, 0.5, 0]
    scale: [2, 1, 1.5]
    color: "#445544"
    label: "Output: 847 units"
  }
}`,
  },

  'control-panel': {
    id: 'wizard-control-panel',
    name: 'Device Control Panel',
    description: 'Smart home / IoT control interface with switches and status displays',
    thumbnail: '🎛️',
    tags: ['iot', 'control', 'smart-home', 'devices'],
    category: 'minimal',
    code: `composition "Control Panel" {
  environment {
    skybox: "night"
    ambient_light: 0.2
  }

  object "PanelBackground" {
    @static
    geometry: "box"
    position: [0, 1.5, -2]
    scale: [6, 4, 0.1]
    color: "#0d1117"
  }

  object "LightSwitch" {
    @clickable
    @glowing
    geometry: "box"
    position: [-2, 2.5, -1.9]
    scale: [0.8, 0.5, 0.1]
    color: "#ffcc00"
    emissive: "#ffaa00"
    emissiveIntensity: 1.0
    label: "Living Room Light"
  }

  object "ThermostatDial" {
    @clickable
    @glowing
    geometry: "cylinder"
    position: [0, 2.5, -1.9]
    scale: [0.5, 0.05, 0.5]
    rotation: [90, 0, 0]
    color: "#0088ff"
    emissive: "#0066cc"
    emissiveIntensity: 0.8
    label: "Thermostat: 72F"
  }

  object "DoorLock" {
    @clickable
    @glowing
    geometry: "box"
    position: [2, 2.5, -1.9]
    scale: [0.8, 0.5, 0.1]
    color: "#00cc44"
    emissive: "#00aa33"
    emissiveIntensity: 1.0
    label: "Front Door: Locked"
  }

  object "EnergyMeter" {
    @glowing
    geometry: "box"
    position: [-2, 0.8, -1.9]
    scale: [1.5, 0.8, 0.08]
    color: "#1a1a2e"
    emissive: "#00ffcc"
    emissiveIntensity: 0.3
    label: "Energy: 2.4 kWh today"
  }

  object "SecurityCam" {
    @glowing
    geometry: "box"
    position: [2, 0.8, -1.9]
    scale: [1.5, 0.8, 0.08]
    color: "#1a1a2e"
    emissive: "#ff4444"
    emissiveIntensity: 0.3
    label: "Camera: Front Yard"
  }
}`,
  },

  // ─── Education ─────────────────────────────────────────────────────────────

  'tutorial-creator': {
    id: 'wizard-tutorial-creator',
    name: 'Tutorial Creator',
    description: 'Step-by-step learning module with interactive examples',
    thumbnail: '📝',
    tags: ['education', 'tutorial', 'learning', 'interactive'],
    category: 'Starter',
    code: `composition "Tutorial Module" {
  environment {
    skybox: "studio"
    ambient_light: 0.8
    shadows: true
  }

  object "LessonBoard" {
    @billboard
    geometry: "plane"
    position: [0, 2, -3]
    scale: [5, 2.5, 0.01]
    color: "#1a1a2e"
    label: "Lesson 1: Your First 3D Object"
  }

  object "ExampleCube" {
    @grabbable
    @glowing
    geometry: "box"
    position: [0, 1, 0]
    scale: [0.6, 0.6, 0.6]
    color: "#4488ff"
    emissive: "#2266dd"
    emissiveIntensity: 0.3
    label: "Try grabbing me!"

    animation bounce {
      property: "position.y"
      from: 1.0
      to: 1.3
      duration: 1500
      loop: infinite
      easing: "easeInOut"
    }
  }

  object "StepIndicator1" {
    @glowing
    geometry: "sphere"
    position: [-2, 0.5, -1]
    scale: [0.2, 0.2, 0.2]
    color: "#00ff66"
    emissive: "#00ff66"
    emissiveIntensity: 2.0
    label: "Step 1"
  }

  object "StepIndicator2" {
    @glowing
    geometry: "sphere"
    position: [0, 0.5, -1]
    scale: [0.2, 0.2, 0.2]
    color: "#666666"
    emissive: "#444444"
    emissiveIntensity: 0.3
    label: "Step 2"
  }

  object "StepIndicator3" {
    @glowing
    geometry: "sphere"
    position: [2, 0.5, -1]
    scale: [0.2, 0.2, 0.2]
    color: "#666666"
    emissive: "#444444"
    emissiveIntensity: 0.3
    label: "Step 3"
  }

  object "Floor" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.05, 0]
    scale: [10, 0.1, 8]
    color: "#e0e0e0"
  }
}`,
  },

  'student-sandbox': {
    id: 'wizard-student-sandbox',
    name: 'Student Sandbox',
    description: 'Safe experimentation space with pre-placed objects to modify',
    thumbnail: '🎓',
    tags: ['education', 'sandbox', 'beginner', 'experiment'],
    category: 'Starter',
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
}`,
  },

  'classroom-demo': {
    id: 'wizard-classroom-demo',
    name: 'Classroom Demo',
    description: 'Interactive science demo with animated solar system and physics',
    thumbnail: '🏫',
    tags: ['education', 'classroom', 'demo', 'science'],
    category: 'Starter',
    code: `composition "Classroom Demo" {
  environment {
    skybox: "stars"
    ambient_light: 0.1
  }

  object "Sun" {
    @glowing
    geometry: "sphere"
    position: [0, 2, 0]
    scale: [1, 1, 1]
    color: "#ffaa00"
    emissive: "#ff6600"
    emissiveIntensity: 2.5
    label: "Sun"

    animation spin {
      property: "rotation.y"
      from: 0
      to: 360
      duration: 20000
      loop: infinite
      easing: "linear"
    }
  }

  object "Earth" {
    @clickable
    geometry: "sphere"
    position: [3, 2, 0]
    scale: [0.3, 0.3, 0.3]
    color: "#2244aa"
    label: "Earth"

    animation orbit {
      property: "position"
      keyframes: [
        { time: 0,     value: [3, 2, 0] }
        { time: 2500,  value: [0, 2, 3] }
        { time: 5000,  value: [-3, 2, 0] }
        { time: 7500,  value: [0, 2, -3] }
        { time: 10000, value: [3, 2, 0] }
      ]
      loop: infinite
      easing: "linear"
    }
  }

  object "Mars" {
    @clickable
    geometry: "sphere"
    position: [5, 2, 0]
    scale: [0.22, 0.22, 0.22]
    color: "#cc4422"
    label: "Mars"

    animation orbit {
      property: "position"
      keyframes: [
        { time: 0,     value: [5, 2, 0] }
        { time: 4000,  value: [0, 2, 5] }
        { time: 8000,  value: [-5, 2, 0] }
        { time: 12000, value: [0, 2, -5] }
        { time: 16000, value: [5, 2, 0] }
      ]
      loop: infinite
      easing: "linear"
    }
  }

  object "InfoBoard" {
    @billboard
    geometry: "plane"
    position: [0, 4.5, -3]
    scale: [5, 1, 0.01]
    color: "#111122"
    label: "Click a planet to learn more!"
  }
}`,
  },
  // ─── Robotics ─────────────────────────────────────────────────────────────

  'robot-arm': {
    id: 'wizard-robot-arm',
    name: 'Robot Arm Trainer',
    description: 'URDF robot arm with joint control, kinematics, and ROS2 export',
    thumbnail: '🦾',
    tags: ['robotics', 'urdf', 'ros2', 'arm', 'joints'],
    category: 'robotics',
    code: `composition "Robot Arm Lab" {
  environment {
    skybox: "studio"
    ambient_light: 0.7
    shadows: true
  }

  object "LabFloor" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.05, 0]
    scale: [10, 0.1, 10]
    color: "#e0e0e0"
  }

  object "RobotBase" {
    @collidable
    @static
    geometry: "cylinder"
    position: [0, 0.15, 0]
    scale: [0.6, 0.3, 0.6]
    color: "#333333"
    metalness: 0.8
    roughness: 0.3
    label: "Base (Fixed)"
  }

  object "Shoulder" {
    @joint type:"revolute" axis:[0,1,0] limits:[-180,180]
    geometry: "cylinder"
    position: [0, 0.6, 0]
    scale: [0.2, 0.6, 0.2]
    color: "#2244aa"
    metalness: 0.7
    roughness: 0.3
    label: "Shoulder Joint"
  }

  object "UpperArm" {
    @joint type:"revolute" axis:[1,0,0] limits:[-90,90]
    geometry: "capsule"
    position: [0, 1.3, 0]
    rotation: [0, 0, 0]
    scale: [0.12, 0.5, 0.12]
    color: "#4488cc"
    metalness: 0.6
    roughness: 0.4
    label: "Upper Arm"
  }

  object "Elbow" {
    @joint type:"revolute" axis:[1,0,0] limits:[-135,0]
    geometry: "sphere"
    position: [0, 1.8, 0]
    scale: [0.15, 0.15, 0.15]
    color: "#ffaa00"
    metalness: 0.8
    roughness: 0.2
    label: "Elbow Joint"
  }

  object "Forearm" {
    @joint type:"revolute" axis:[0,1,0] limits:[-180,180]
    geometry: "capsule"
    position: [0, 2.2, 0]
    scale: [0.1, 0.4, 0.1]
    color: "#4488cc"
    metalness: 0.6
    roughness: 0.4
    label: "Forearm"
  }

  object "Gripper" {
    @glowing
    geometry: "box"
    position: [0, 2.6, 0]
    scale: [0.2, 0.06, 0.15]
    color: "#cc4444"
    emissive: "#cc2222"
    emissiveIntensity: 0.3
    metalness: 0.9
    roughness: 0.1
    label: "End Effector"
  }

  object "WorkTable" {
    @collidable
    @static
    geometry: "box"
    position: [1.5, 0.4, 0]
    scale: [1, 0.8, 1]
    color: "#8b7355"
    roughness: 0.9
    label: "Workspace"
  }

  object "TargetObject" {
    @physics type:"dynamic" shape:"box"
    geometry: "box"
    position: [1.5, 1, 0]
    scale: [0.15, 0.15, 0.15]
    color: "#00cc66"
    label: "Pick Target"
  }
}`,
  },

  'factory-automation': {
    id: 'wizard-factory-automation',
    name: 'Factory Automation',
    description: 'Industrial production line with conveyors, robots, and sensor monitoring',
    thumbnail: '🏭',
    tags: ['robotics', 'factory', 'industrial', 'automation'],
    category: 'robotics',
    code: `composition "Factory Automation" {
  environment {
    skybox: "studio"
    ambient_light: 0.5
    shadows: true
  }

  object "FactoryFloor" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [24, 0.2, 16]
    color: "#666666"
  }

  object "ConveyorA" {
    @static
    geometry: "box"
    position: [-6, 0.5, 0]
    scale: [8, 0.15, 1.5]
    color: "#333344"
    label: "Intake Conveyor"
  }

  object "ConveyorB" {
    @static
    geometry: "box"
    position: [6, 0.5, 0]
    scale: [8, 0.15, 1.5]
    color: "#333344"
    label: "Output Conveyor"
  }

  object "WeldingStation" {
    @collidable
    @static
    geometry: "box"
    position: [-2, 1.5, -3]
    scale: [2, 3, 2]
    color: "#884422"
    metalness: 0.7
    roughness: 0.4
    label: "Welding Cell"
  }

  object "WeldArmA" {
    @joint type:"revolute" axis:[0,1,0]
    geometry: "capsule"
    position: [-2, 3.2, -3]
    rotation: [0, 0, -30]
    scale: [0.08, 0.8, 0.08]
    color: "#ffaa00"
    metalness: 0.8
    label: "Welder Arm"
  }

  object "WeldStatus" {
    @glowing
    geometry: "sphere"
    position: [-2, 3.5, -1.8]
    scale: [0.12, 0.12, 0.12]
    color: "#00ff00"
    emissive: "#00ff00"
    emissiveIntensity: 2.0
    label: "Active"
  }

  object "QAStation" {
    @collidable
    @static
    geometry: "box"
    position: [2, 1, -3]
    scale: [1.5, 2, 1.5]
    color: "#2244aa"
    metalness: 0.6
    label: "Quality Check"
  }

  object "QACamera" {
    @glowing
    geometry: "box"
    position: [2, 2.3, -2.3]
    scale: [0.3, 0.2, 0.2]
    color: "#111111"
    emissive: "#ff0000"
    emissiveIntensity: 0.5
    label: "Vision System"
  }

  object "PackagingBot" {
    @static
    geometry: "box"
    position: [8, 1.2, -3]
    scale: [1.8, 2.4, 1.8]
    color: "#44aa44"
    metalness: 0.5
    label: "Packaging Robot"
  }

  object "OutputBin" {
    @static
    geometry: "box"
    position: [10, 0.5, 0]
    scale: [2, 1, 1.5]
    color: "#445544"
    label: "Output: 0 units"
  }

  object "SafetyBarrier" {
    @collidable
    @static
    geometry: "box"
    position: [0, 0.6, 4]
    scale: [24, 1.2, 0.05]
    color: "#ffcc00"
    opacity: 0.5
    material: "glass"
    label: "Safety Perimeter"
  }
}`,
  },

  'drone-sim': {
    id: 'wizard-drone-sim',
    name: 'Drone Simulator',
    description: 'Autonomous drone with waypoints, obstacles, and flight path visualization',
    thumbnail: '🚁',
    tags: ['robotics', 'drone', 'uav', 'flight', 'autonomous'],
    category: 'robotics',
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
}`,
  },

  'warehouse-robotics': {
    id: 'wizard-warehouse-robotics',
    name: 'Warehouse Robotics',
    description: 'Autonomous pick-and-place robots navigating warehouse shelves',
    thumbnail: '📦',
    tags: ['robotics', 'warehouse', 'agv', 'pick-place'],
    category: 'robotics',
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
}`,
  },

  // ─── Science / Medical ────────────────────────────────────────────────────

  'molecular-design': {
    id: 'wizard-molecular-design',
    name: 'Molecular Design Lab',
    description: 'Drug design workspace with protein, ligand, and binding site visualization',
    thumbnail: '🧬',
    tags: ['science', 'molecular', 'drug', 'pdb', 'pharma'],
    category: 'science',
    code: `composition "Molecular Design Lab" {
  environment {
    skybox: "night"
    ambient_light: 0.2
    fog: { color: "#050510", density: 0.003 }
  }

  object "ProteinBackbone" {
    @glowing
    geometry: "torus"
    position: [0, 2, 0]
    scale: [1.5, 1.5, 0.3]
    rotation: [30, 0, 20]
    color: "#4488cc"
    emissive: "#2266aa"
    emissiveIntensity: 0.4
    opacity: 0.7
    material: "glass"
    label: "Protein (PDB)"
  }

  object "HelixA" {
    @glowing
    geometry: "torus"
    position: [-0.5, 2.3, 0.5]
    scale: [0.6, 0.6, 0.15]
    rotation: [45, 30, 0]
    color: "#ff6688"
    emissive: "#ff4466"
    emissiveIntensity: 0.6
    label: "Alpha Helix"
  }

  object "HelixB" {
    @glowing
    geometry: "torus"
    position: [0.8, 1.8, -0.3]
    scale: [0.5, 0.5, 0.12]
    rotation: [-20, 60, 10]
    color: "#ff6688"
    emissive: "#ff4466"
    emissiveIntensity: 0.6
    label: "Alpha Helix"
  }

  object "ActiveSite" {
    @glowing
    @clickable
    geometry: "sphere"
    position: [0, 2, 0]
    scale: [0.4, 0.4, 0.4]
    color: "#ffcc00"
    emissive: "#ffaa00"
    emissiveIntensity: 2.0
    opacity: 0.5
    material: "glass"
    label: "Binding Site"

    animation pulse {
      property: "scale"
      from: [0.4, 0.4, 0.4]
      to: [0.48, 0.48, 0.48]
      duration: 1500
      loop: infinite
      easing: "easeInOut"
    }
  }

  object "Ligand" {
    @glowing
    @grabbable
    geometry: "sphere"
    position: [3, 2, 0]
    scale: [0.25, 0.25, 0.25]
    color: "#00ff88"
    emissive: "#00cc66"
    emissiveIntensity: 1.5
    label: "Drug Candidate"
  }

  object "LigandBond1" {
    @glowing
    geometry: "cylinder"
    position: [3.2, 2.2, 0.15]
    rotation: [0, 0, 30]
    scale: [0.02, 0.2, 0.02]
    color: "#00ff88"
    emissive: "#00cc66"
    emissiveIntensity: 0.8
  }

  object "LigandBond2" {
    @glowing
    geometry: "cylinder"
    position: [2.8, 1.8, -0.1]
    rotation: [0, 0, -45]
    scale: [0.02, 0.18, 0.02]
    color: "#00ff88"
    emissive: "#00cc66"
    emissiveIntensity: 0.8
  }

  object "InfoPanel" {
    @billboard
    @glowing
    geometry: "plane"
    position: [-3, 3, -2]
    scale: [2.5, 1.5, 0.01]
    color: "#0a1028"
    emissive: "#1144aa"
    emissiveIntensity: 0.15
    label: "Lipinski Score: --\\nBinding Energy: --"
  }
}`,
  },

  'narupa-sim': {
    id: 'wizard-narupa-sim',
    name: 'Narupa MD Simulation',
    description: 'Interactive molecular dynamics with real-time force manipulation',
    thumbnail: '🔬',
    tags: ['science', 'narupa', 'molecular-dynamics', 'simulation'],
    category: 'science',
    code: `composition "Narupa MD Session" {
  environment {
    skybox: "night"
    ambient_light: 0.15
    fog: { color: "#020212", density: 0.005 }
  }

  object "SimulationBox" {
    geometry: "box"
    position: [0, 2, 0]
    scale: [4, 4, 4]
    color: "#1a1a3a"
    opacity: 0.1
    material: "glass"
    label: "Simulation Boundary"
  }

  object "WaterMoleculeA" {
    @glowing
    @physics type:"dynamic" shape:"sphere"
    geometry: "sphere"
    position: [-1, 2.5, -0.5]
    scale: [0.15, 0.15, 0.15]
    color: "#ff4444"
    emissive: "#ff2222"
    emissiveIntensity: 0.5
    label: "O"
  }

  object "WaterH1" {
    @glowing
    geometry: "sphere"
    position: [-0.85, 2.6, -0.4]
    scale: [0.08, 0.08, 0.08]
    color: "#ffffff"
    emissive: "#cccccc"
    emissiveIntensity: 0.3
    label: "H"
  }

  object "WaterH2" {
    @glowing
    geometry: "sphere"
    position: [-1.15, 2.6, -0.4]
    scale: [0.08, 0.08, 0.08]
    color: "#ffffff"
    emissive: "#cccccc"
    emissiveIntensity: 0.3
    label: "H"
  }

  object "ProteinFragment" {
    @glowing
    geometry: "torus"
    position: [0.5, 2, 0.5]
    scale: [0.8, 0.8, 0.2]
    rotation: [20, 0, 15]
    color: "#6644cc"
    emissive: "#4422aa"
    emissiveIntensity: 0.5
    opacity: 0.8
    label: "Protein Fragment"

    animation wobble {
      property: "rotation.z"
      from: 15
      to: 25
      duration: 3000
      loop: infinite
      easing: "easeInOut"
    }
  }

  object "ForceArrow" {
    @glowing
    geometry: "cone"
    position: [2, 2, 0]
    rotation: [0, 0, 90]
    scale: [0.1, 0.4, 0.1]
    color: "#ffcc00"
    emissive: "#ffaa00"
    emissiveIntensity: 1.5
    label: "Applied Force"
  }

  object "EnergyDisplay" {
    @billboard
    @glowing
    geometry: "plane"
    position: [0, 4.5, -2]
    scale: [3, 0.8, 0.01]
    color: "#0a0a2e"
    emissive: "#113344"
    emissiveIntensity: 0.2
    label: "KE: -- | PE: -- | T: 300K"
  }

  object "NarupaStatus" {
    @glowing
    geometry: "sphere"
    position: [3, 4, 0]
    scale: [0.15, 0.15, 0.15]
    color: "#00ff00"
    emissive: "#00ff00"
    emissiveIntensity: 2.0
    label: "Narupa: Connecting..."

    animation blink {
      property: "material.emissiveIntensity"
      from: 1.0
      to: 3.0
      duration: 1200
      loop: infinite
      easing: "easeInOut"
    }
  }
}`,
  },

  'anatomy-explorer': {
    id: 'wizard-anatomy-explorer',
    name: 'Anatomy Explorer',
    description: '3D anatomy visualization with clickable organs and labeled systems',
    thumbnail: '🫀',
    tags: ['science', 'medical', 'anatomy', 'education'],
    category: 'science',
    code: `composition "Anatomy Explorer" {
  environment {
    skybox: "studio"
    ambient_light: 0.7
    shadows: true
  }

  object "Floor" {
    @static
    geometry: "box"
    position: [0, -0.05, 0]
    scale: [8, 0.1, 8]
    color: "#e8e8e8"
  }

  object "Torso" {
    geometry: "capsule"
    position: [0, 1.5, 0]
    scale: [0.5, 0.8, 0.3]
    color: "#e8c8a8"
    opacity: 0.3
    material: "glass"
    label: "Torso (transparent)"
  }

  object "Heart" {
    @clickable
    @glowing
    geometry: "sphere"
    position: [0.1, 1.8, 0.1]
    scale: [0.18, 0.2, 0.15]
    color: "#cc2222"
    emissive: "#aa0000"
    emissiveIntensity: 0.5
    label: "Heart"

    animation beat {
      property: "scale"
      from: [0.18, 0.2, 0.15]
      to: [0.2, 0.22, 0.17]
      duration: 800
      loop: infinite
      easing: "easeInOut"
    }
  }

  object "LeftLung" {
    @clickable
    geometry: "sphere"
    position: [-0.2, 1.8, 0]
    scale: [0.2, 0.25, 0.15]
    color: "#cc8899"
    opacity: 0.6
    material: "glass"
    label: "Left Lung"
  }

  object "RightLung" {
    @clickable
    geometry: "sphere"
    position: [0.25, 1.8, 0]
    scale: [0.22, 0.27, 0.16]
    color: "#cc8899"
    opacity: 0.6
    material: "glass"
    label: "Right Lung"
  }

  object "Liver" {
    @clickable
    geometry: "sphere"
    position: [0.15, 1.4, 0.05]
    scale: [0.2, 0.12, 0.12]
    color: "#884433"
    label: "Liver"
  }

  object "Spine" {
    @static
    geometry: "cylinder"
    position: [0, 1.5, -0.15]
    scale: [0.04, 0.8, 0.04]
    color: "#eeeecc"
    label: "Spine"
  }

  object "InfoBoard" {
    @billboard
    geometry: "plane"
    position: [2, 2.5, -1]
    scale: [2, 1.5, 0.01]
    color: "#1a1a2e"
    label: "Click an organ to learn more"
  }

  object "RotateHint" {
    @billboard
    geometry: "plane"
    position: [0, 0.3, 2]
    scale: [2.5, 0.5, 0.01]
    color: "#222233"
    label: "Drag to rotate | Scroll to zoom"
  }
}`,
  },

  'surgical-training': {
    id: 'wizard-surgical-training',
    name: 'Surgical Training',
    description: 'VR procedure practice with instrument tracking and step guidance',
    thumbnail: '🏥',
    tags: ['science', 'medical', 'surgery', 'vr', 'training'],
    category: 'science',
    code: `composition "Surgical Training" {
  environment {
    skybox: "studio"
    ambient_light: 0.8
    shadows: true
  }

  object "OperatingTable" {
    @collidable
    @static
    geometry: "box"
    position: [0, 0.4, 0]
    scale: [2, 0.8, 0.8]
    color: "#cccccc"
    metalness: 0.3
    roughness: 0.5
    label: "Operating Table"
  }

  object "SurgicalField" {
    @static
    geometry: "box"
    position: [0, 0.82, 0]
    scale: [0.8, 0.02, 0.5]
    color: "#2255aa"
    label: "Surgical Field"
  }

  object "PatientModel" {
    geometry: "capsule"
    position: [0, 1, 0]
    scale: [0.2, 0.15, 0.12]
    color: "#e8c8a8"
    opacity: 0.7
    material: "glass"
    label: "Patient Area"
  }

  object "Scalpel" {
    @grabbable
    @glowing
    geometry: "box"
    position: [0.6, 1, 0.3]
    scale: [0.02, 0.01, 0.15]
    color: "#cccccc"
    metalness: 1.0
    roughness: 0.1
    emissive: "#ffffff"
    emissiveIntensity: 0.2
    label: "Scalpel"
  }

  object "Forceps" {
    @grabbable
    geometry: "capsule"
    position: [0.8, 1, 0.3]
    scale: [0.015, 0.1, 0.015]
    color: "#aaaaaa"
    metalness: 0.9
    roughness: 0.2
    label: "Forceps"
  }

  object "SurgicalLight" {
    @light
    type: "spot"
    position: [0, 3, 0]
    rotation: [-90, 0, 0]
    color: "#ffffff"
    intensity: 4.0
    angle: 0.4
  }

  object "Monitor" {
    @billboard
    @glowing
    geometry: "plane"
    position: [-1.5, 2, -0.5]
    scale: [1.2, 0.8, 0.01]
    color: "#0a0a1a"
    emissive: "#00cc66"
    emissiveIntensity: 0.3
    label: "Vitals: HR 72 | BP 120/80 | SpO2 98%"
  }

  object "StepGuide" {
    @billboard
    geometry: "plane"
    position: [1.5, 2, -0.5]
    scale: [1.2, 0.8, 0.01]
    color: "#1a1a2e"
    label: "Step 1: Prepare surgical field"
  }

  object "InstrumentTray" {
    @static
    geometry: "box"
    position: [0.7, 0.9, 0.3]
    scale: [0.5, 0.02, 0.3]
    color: "#aaaaaa"
    metalness: 0.8
    roughness: 0.2
    label: "Instrument Tray"
  }
}`,
  },

  // ─── Healthcare ──────────────────────────────────────────────────────────────

  'therapy-vr': {
    id: 'wizard-therapy-vr',
    name: 'Therapeutic VR Environment',
    description: 'Calming virtual space for exposure therapy and relaxation',
    thumbnail: '🧘',
    tags: ['healthcare', 'therapy', 'vr', 'wellness'],
    category: 'healthcare',
    code: `composition "Therapy VR" {
  environment {
    skybox: "sunset"
    ambient_light: 0.7
    fog: { color: "#e8d5c4", density: 0.003 }
  }

  object "Ground" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [30, 0.2, 30]
    color: "#8fbc8f"
  }

  object "Lake" {
    @static
    geometry: "cylinder"
    position: [0, -0.05, 5]
    scale: [6, 0.02, 6]
    color: "#4a90d9"
    material: { roughness: 0.0, metalness: 0.1, opacity: 0.8 }
  }

  object "BreathingOrb" {
    @glowing
    geometry: "sphere"
    position: [0, 1.5, 0]
    scale: [0.4, 0.4, 0.4]
    color: "#88ccff"
    emissive: "#6699cc"
    emissiveIntensity: 1.5

    animation breathe {
      property: "scale"
      from: [0.35, 0.35, 0.35]
      to: [0.5, 0.5, 0.5]
      duration: 4000
      loop: infinite
      easing: "easeInOut"
    }
  }

  object "GuideText" {
    @billboard
    geometry: "plane"
    position: [0, 2.5, -2]
    scale: [2, 0.6, 0.01]
    color: "#1a1a2e"
    label: "Breathe with the orb..."
  }
}`,
  },

  'rehab-sim': {
    id: 'wizard-rehab-sim',
    name: 'Rehabilitation Simulator',
    description: 'Physical rehab exercises with guided movement targets',
    thumbnail: '🏋️',
    tags: ['healthcare', 'rehab', 'exercise', 'vr'],
    category: 'healthcare',
    code: `composition "Rehab Simulator" {
  environment {
    skybox: "studio"
    ambient_light: 0.8
    shadows: true
  }

  object "Floor" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [10, 0.2, 10]
    color: "#e0e0e0"
  }

  object "TargetHigh" {
    @grabbable
    @glowing
    geometry: "sphere"
    position: [0, 2, -2]
    scale: [0.25, 0.25, 0.25]
    color: "#ff6644"
    emissive: "#ff4422"
    emissiveIntensity: 1.0
    label: "Reach here"
  }

  object "TargetLow" {
    @grabbable
    @glowing
    geometry: "sphere"
    position: [1.5, 0.5, -2]
    scale: [0.25, 0.25, 0.25]
    color: "#44aaff"
    emissive: "#2288dd"
    emissiveIntensity: 1.0
    label: "Reach here"
  }

  object "ProgressBar" {
    @billboard
    geometry: "plane"
    position: [0, 3, -3]
    scale: [3, 0.4, 0.01]
    color: "#1a1a2e"
    label: "Session Progress: 0 / 10 reps"
  }
}`,
  },

  'clinical-training': {
    id: 'wizard-clinical-training',
    name: 'Clinical Training Scenario',
    description: 'Medical procedure practice with step-by-step guidance',
    thumbnail: '🩺',
    tags: ['healthcare', 'clinical', 'training', 'procedure'],
    category: 'healthcare',
    code: `composition "Clinical Training" {
  environment {
    skybox: "studio"
    ambient_light: 0.9
    shadows: true
  }

  object "ExamTable" {
    @static
    geometry: "box"
    position: [0, 0.45, 0]
    scale: [2, 0.1, 0.8]
    color: "#e0e8f0"
    metalness: 0.2
  }

  object "PatientModel" {
    @static
    geometry: "capsule"
    position: [0, 0.7, 0]
    scale: [0.3, 0.3, 0.6]
    color: "#deb887"
  }

  object "StepGuide" {
    @billboard
    geometry: "plane"
    position: [-2, 2, 0]
    scale: [1.5, 1.0, 0.01]
    color: "#0a1a2e"
    emissive: "#1155aa"
    emissiveIntensity: 0.2
    label: "Step 1: Check patient vitals"
  }

  object "VitalsMonitor" {
    @billboard
    @glowing
    geometry: "plane"
    position: [2, 2, 0]
    scale: [1.2, 0.8, 0.01]
    color: "#0a0a1a"
    emissive: "#00cc66"
    emissiveIntensity: 0.3
    label: "HR: 72 | SpO2: 98%"
  }
}`,
  },

  'patient-education': {
    id: 'wizard-patient-education',
    name: 'Patient Education Display',
    description: 'Visual health information with interactive 3D models',
    thumbnail: '📋',
    tags: ['healthcare', 'education', 'patient', 'visualization'],
    category: 'healthcare',
    code: `composition "Patient Education" {
  environment {
    skybox: "studio"
    ambient_light: 0.8
  }

  object "OrganModel" {
    @glowing
    geometry: "sphere"
    position: [0, 1.5, 0]
    scale: [0.6, 0.7, 0.5]
    color: "#cc4444"
    emissive: "#882222"
    emissiveIntensity: 0.3

    animation rotate {
      property: "rotation.y"
      from: 0
      to: 360
      duration: 15000
      loop: infinite
      easing: "linear"
    }
  }

  object "InfoPanel" {
    @billboard
    geometry: "plane"
    position: [-2, 1.5, 0]
    scale: [1.6, 1.2, 0.01]
    color: "#0a1a2e"
    label: "Tap organ regions to learn more"
  }

  object "Platform" {
    @static
    geometry: "cylinder"
    position: [0, 0.05, 0]
    scale: [2, 0.1, 2]
    color: "#f0f0f5"
  }
}`,
  },

  // ─── Architecture ────────────────────────────────────────────────────────────

  'building-walkthrough': {
    id: 'wizard-building-walkthrough',
    name: 'Building Walkthrough',
    description: 'First-person architectural walkthrough with rooms and corridors',
    thumbnail: '🏗️',
    tags: ['architecture', 'walkthrough', 'building', 'interior'],
    category: 'architecture',
    code: `composition "Building Walkthrough" {
  environment {
    skybox: "studio"
    ambient_light: 0.4
    shadows: true
  }

  object "Floor" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.05, 0]
    scale: [12, 0.1, 10]
    color: "#d4c4a0"
  }

  object "WallNorth" {
    @collidable
    @static
    geometry: "box"
    position: [0, 1.5, -5]
    scale: [12, 3, 0.2]
    color: "#f5f0e8"
  }

  object "WallSouth" {
    @collidable
    @static
    geometry: "box"
    position: [0, 1.5, 5]
    scale: [12, 3, 0.2]
    color: "#f5f0e8"
  }

  object "WallEast" {
    @collidable
    @static
    geometry: "box"
    position: [6, 1.5, 0]
    scale: [0.2, 3, 10]
    color: "#f0ebe0"
  }

  object "Window" {
    @static
    geometry: "box"
    position: [6.1, 1.8, 0]
    scale: [0.02, 1.5, 2]
    color: "#88bbdd"
    material: { opacity: 0.4, roughness: 0.0 }
  }

  object "CeilingLight" {
    @glowing
    geometry: "cylinder"
    position: [0, 2.9, 0]
    scale: [0.6, 0.02, 0.6]
    color: "#ffffff"
    emissive: "#ffffee"
    emissiveIntensity: 2.0
  }
}`,
  },

  'interior-design': {
    id: 'wizard-interior-design',
    name: 'Interior Design Studio',
    description: 'Room layout with furniture placement and material preview',
    thumbnail: '🛋️',
    tags: ['architecture', 'interior', 'design', 'furniture'],
    category: 'architecture',
    code: `composition "Interior Design" {
  environment {
    skybox: "studio"
    ambient_light: 0.6
    shadows: true
  }

  object "Floor" {
    @static
    geometry: "box"
    position: [0, -0.05, 0]
    scale: [8, 0.1, 6]
    color: "#c4a882"
    material: { roughness: 0.7 }
  }

  object "Sofa" {
    @static
    geometry: "box"
    position: [-2, 0.4, -2]
    scale: [2.5, 0.8, 1]
    color: "#4a6b8a"
    material: { roughness: 0.9 }
  }

  object "CoffeeTable" {
    @static
    geometry: "box"
    position: [0, 0.25, -1]
    scale: [1.2, 0.05, 0.6]
    color: "#8b6914"
    material: { roughness: 0.4, metalness: 0.1 }
  }

  object "Lamp" {
    @glowing
    geometry: "cone"
    position: [2.5, 1.2, -2.5]
    scale: [0.3, 0.4, 0.3]
    color: "#f5e6c8"
    emissive: "#ffddaa"
    emissiveIntensity: 1.5
  }

  object "Rug" {
    @static
    geometry: "cylinder"
    position: [0, 0.01, -1]
    scale: [2, 0.01, 1.5]
    color: "#8b4513"
    material: { roughness: 1.0 }
  }
}`,
  },

  'urban-planning': {
    id: 'wizard-urban-planning',
    name: 'Urban Planning Model',
    description: 'City-scale block model with roads, buildings, and green spaces',
    thumbnail: '🏙️',
    tags: ['architecture', 'urban', 'city', 'planning'],
    category: 'architecture',
    code: `composition "Urban Plan" {
  environment {
    skybox: "day"
    ambient_light: 0.7
    shadows: true
  }

  object "Terrain" {
    @static
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [30, 0.2, 30]
    color: "#6b8e23"
  }

  object "Road" {
    @static
    geometry: "box"
    position: [0, 0.01, 0]
    scale: [2, 0.02, 30]
    color: "#333333"
  }

  object "BlockA" {
    @static
    geometry: "box"
    position: [-5, 1.5, -4]
    scale: [3, 3, 3]
    color: "#c8c8c8"
  }

  object "BlockB" {
    @static
    geometry: "box"
    position: [5, 2.5, 2]
    scale: [4, 5, 3]
    color: "#a0b0c0"
  }

  object "Park" {
    @static
    geometry: "cylinder"
    position: [-5, 0.05, 5]
    scale: [4, 0.05, 4]
    color: "#228b22"
  }

  object "ParkTree" {
    @static
    geometry: "cone"
    position: [-5, 1, 5]
    scale: [1, 2, 1]
    color: "#2e8b2e"
  }
}`,
  },

  'smart-home': {
    id: 'wizard-smart-home',
    name: 'Smart Home Dashboard',
    description: 'IoT-connected home with sensor overlays and device controls',
    thumbnail: '🏠',
    tags: ['architecture', 'iot', 'smart-home', 'dashboard'],
    category: 'iot',
    code: `composition "Smart Home" {
  environment {
    skybox: "studio"
    ambient_light: 0.5
    shadows: true
  }

  object "HouseFrame" {
    @static
    geometry: "box"
    position: [0, 1, 0]
    scale: [6, 2, 4]
    color: "#e8e0d0"
    material: { opacity: 0.6 }
  }

  object "TempSensor" {
    @glowing
    geometry: "sphere"
    position: [-2, 1.5, 0]
    scale: [0.15, 0.15, 0.15]
    color: "#ff6644"
    emissive: "#ff4422"
    emissiveIntensity: 2.0
    label: "Living Room: 22C"
  }

  object "MotionSensor" {
    @glowing
    geometry: "sphere"
    position: [2, 1.5, 0]
    scale: [0.15, 0.15, 0.15]
    color: "#44ff66"
    emissive: "#22dd44"
    emissiveIntensity: 2.0
    label: "Kitchen: Active"
  }

  object "Dashboard" {
    @billboard
    geometry: "plane"
    position: [0, 3, -2]
    scale: [3, 1, 0.01]
    color: "#0a0a1a"
    emissive: "#1155cc"
    emissiveIntensity: 0.2
    label: "Smart Home Control Panel"
  }
}`,
  },

  // ─── Agriculture ─────────────────────────────────────────────────────────────

  'farm-twin': {
    id: 'wizard-farm-twin',
    name: 'Farm Digital Twin',
    description: 'Real-time farm monitoring with crop health and weather data',
    thumbnail: '🚜',
    tags: ['agriculture', 'farm', 'digital-twin', 'monitoring'],
    category: 'agriculture',
    code: `composition "Farm Twin" {
  environment {
    skybox: "day"
    ambient_light: 0.8
    shadows: true
  }

  object "Terrain" {
    @static
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [30, 0.2, 30]
    color: "#8b7355"
  }

  object "CropFieldA" {
    @static
    geometry: "box"
    position: [-6, 0.1, 0]
    scale: [8, 0.15, 10]
    color: "#4a8c3f"
    label: "Field A — Wheat"
  }

  object "CropFieldB" {
    @static
    geometry: "box"
    position: [6, 0.1, 0]
    scale: [8, 0.15, 10]
    color: "#6aac4f"
    label: "Field B — Corn"
  }

  object "WeatherStation" {
    @glowing
    geometry: "cylinder"
    position: [0, 1, -12]
    scale: [0.1, 2, 0.1]
    color: "#aaaaaa"
    metalness: 0.8
    label: "Temp: 24C | Humidity: 65%"
  }

  object "IrrigationLine" {
    @static
    geometry: "cylinder"
    position: [0, 0.05, 0]
    rotation: [0, 0, 90]
    scale: [0.05, 14, 0.05]
    color: "#3366cc"
    label: "Active irrigation"
  }

  object "DroneOverview" {
    @billboard
    geometry: "plane"
    position: [0, 5, -5]
    scale: [4, 1.5, 0.01]
    color: "#0a1a2e"
    label: "Farm Dashboard — All Systems Normal"
  }
}`,
  },

  'greenhouse-monitor': {
    id: 'wizard-greenhouse-monitor',
    name: 'Greenhouse Monitor',
    description: 'Climate-controlled greenhouse with sensor overlays',
    thumbnail: '🌱',
    tags: ['agriculture', 'greenhouse', 'sensors', 'climate'],
    category: 'agriculture',
    code: `composition "Greenhouse Monitor" {
  environment {
    skybox: "studio"
    ambient_light: 0.6
    fog: { color: "#e8f5e8", density: 0.01 }
  }

  object "Frame" {
    @static
    geometry: "box"
    position: [0, 1.5, 0]
    scale: [8, 3, 12]
    color: "#ccddcc"
    material: { opacity: 0.3 }
  }

  object "PlantBedA" {
    @static
    geometry: "box"
    position: [-2, 0.3, -3]
    scale: [3, 0.4, 2]
    color: "#3a5a2f"
  }

  object "PlantBedB" {
    @static
    geometry: "box"
    position: [2, 0.3, 3]
    scale: [3, 0.4, 2]
    color: "#4a6a3f"
  }

  object "TempSensor" {
    @glowing
    geometry: "sphere"
    position: [0, 2.5, 0]
    scale: [0.12, 0.12, 0.12]
    color: "#ff8844"
    emissive: "#ff6622"
    emissiveIntensity: 2.0
    label: "28C / 80% humidity"
  }

  object "GrowLight" {
    @glowing
    geometry: "box"
    position: [0, 2.8, 0]
    scale: [6, 0.05, 0.3]
    color: "#ff88ff"
    emissive: "#cc44cc"
    emissiveIntensity: 2.5
  }
}`,
  },

  'precision-agriculture': {
    id: 'wizard-precision-agriculture',
    name: 'Precision Agriculture',
    description: 'Drone-based crop analysis with NDVI overlays',
    thumbnail: '🛰️',
    tags: ['agriculture', 'precision', 'drone', 'analysis'],
    category: 'agriculture',
    code: `composition "Precision Agriculture" {
  environment {
    skybox: "day"
    ambient_light: 0.8
    shadows: true
  }

  object "Terrain" {
    @static
    geometry: "box"
    position: [0, -0.1, 0]
    scale: [40, 0.2, 40]
    color: "#6b8e23"
  }

  object "FieldGrid" {
    @static
    geometry: "box"
    position: [0, 0.02, 0]
    scale: [30, 0.01, 30]
    color: "#228b22"
    material: { opacity: 0.7 }
  }

  object "HotspotA" {
    @glowing
    geometry: "cylinder"
    position: [-8, 0.1, 5]
    scale: [3, 0.05, 3]
    color: "#ff4444"
    emissive: "#ff2222"
    emissiveIntensity: 1.0
    label: "Low NDVI — Stress detected"
  }

  object "HotspotB" {
    @glowing
    geometry: "cylinder"
    position: [6, 0.1, -3]
    scale: [4, 0.05, 4]
    color: "#ffaa00"
    emissive: "#dd8800"
    emissiveIntensity: 0.8
    label: "Moderate — Needs water"
  }

  object "Drone" {
    @physics type:"dynamic"
    geometry: "box"
    position: [0, 8, 0]
    scale: [0.6, 0.1, 0.6]
    color: "#333333"
    metalness: 0.8
    label: "Survey Drone"
  }
}`,
  },

  // ─── Creator Economy ─────────────────────────────────────────────────────────

  'nft-gallery': {
    id: 'wizard-nft-gallery',
    name: 'NFT Gallery Space',
    description: 'Virtual art exhibition for displaying and minting NFTs',
    thumbnail: '🖼️',
    tags: ['creator', 'nft', 'gallery', 'art'],
    category: 'creator',
    code: `composition "NFT Gallery" {
  environment {
    skybox: "night"
    ambient_light: 0.15
  }

  object "Floor" {
    @collidable
    @static
    geometry: "box"
    position: [0, -0.05, 0]
    scale: [16, 0.1, 12]
    color: "#0a0a12"
    material: { roughness: 0.1 }
  }

  object "ArtFrameA" {
    @billboard
    @glowing
    geometry: "plane"
    position: [-4, 1.8, -5.5]
    scale: [2, 1.5, 0.01]
    color: "#111122"
    emissive: "#4444aa"
    emissiveIntensity: 0.2
    label: "Art #001"
  }

  object "ArtFrameB" {
    @billboard
    @glowing
    geometry: "plane"
    position: [0, 1.8, -5.5]
    scale: [2, 1.5, 0.01]
    color: "#111122"
    emissive: "#aa4444"
    emissiveIntensity: 0.2
    label: "Art #002"
  }

  object "ArtFrameC" {
    @billboard
    @glowing
    geometry: "plane"
    position: [4, 1.8, -5.5]
    scale: [2, 1.5, 0.01]
    color: "#111122"
    emissive: "#44aa44"
    emissiveIntensity: 0.2
    label: "Art #003"
  }

  object "SpotlightA" {
    @light
    type: "spot"
    position: [-4, 4, -4]
    rotation: [-60, 0, 0]
    color: "#ffffff"
    intensity: 3.0
  }

  object "SpotlightB" {
    @light
    type: "spot"
    position: [0, 4, -4]
    rotation: [-60, 0, 0]
    color: "#ffffff"
    intensity: 3.0
  }

  object "MintButton" {
    @glowing
    geometry: "cylinder"
    position: [6, 0.5, 0]
    scale: [0.5, 0.3, 0.5]
    color: "#6633ff"
    emissive: "#6633ff"
    emissiveIntensity: 2.0
    label: "Mint NFT"
  }
}`,
  },

  'token-forge': {
    id: 'wizard-token-forge',
    name: 'Token Forge',
    description: 'Spinning 3D token with customizable material and branding',
    thumbnail: '🔥',
    tags: ['creator', 'token', 'crypto', 'mint'],
    category: 'creator',
    code: `composition "Token Forge" {
  environment {
    skybox: "studio"
    ambient_light: 0.3
  }

  object "TokenCoin" {
    @material metalness:1.0 roughness:0.15
    geometry: "cylinder"
    position: [0, 1.5, 0]
    rotation: [90, 0, 0]
    scale: [1.5, 0.12, 1.5]
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

  object "TokenLabel" {
    @billboard
    geometry: "plane"
    position: [0, 1.5, 0.15]
    scale: [0.8, 0.8, 0.01]
    color: "#ffffff"
    label: "YOUR TOKEN"
  }

  object "Pedestal" {
    @static
    geometry: "cylinder"
    position: [0, 0.3, 0]
    scale: [1, 0.6, 1]
    color: "#1a1a2e"
    material: { metalness: 0.7 }
  }

  object "ForgeGlow" {
    @glowing
    geometry: "torus"
    position: [0, 1.5, 0]
    scale: [2, 2, 0.05]
    color: "#ff6600"
    emissive: "#ff4400"
    emissiveIntensity: 1.5
    material: { opacity: 0.4 }
  }
}`,
  },

  'social-avatar': {
    id: 'wizard-social-avatar',
    name: 'Social Avatar Creator',
    description: 'Customizable avatar display with accessory slots',
    thumbnail: '🧑‍🎤',
    tags: ['creator', 'avatar', 'social', 'character'],
    category: 'creator',
    code: `composition "Avatar Creator" {
  environment {
    skybox: "studio"
    ambient_light: 1.0
    shadows: true
  }

  object "AvatarBody" {
    @physics
    geometry: "capsule"
    position: [0, 1.2, 0]
    scale: [0.4, 0.5, 0.4]
    color: "#e8b89d"
  }

  object "AvatarHead" {
    geometry: "sphere"
    position: [0, 2, 0]
    scale: [0.35, 0.4, 0.35]
    color: "#e8b89d"
  }

  object "Hair" {
    geometry: "sphere"
    position: [0, 2.2, -0.05]
    scale: [0.38, 0.25, 0.38]
    color: "#3a2a1a"
  }

  object "LeftEye" {
    geometry: "sphere"
    position: [-0.1, 2.05, 0.3]
    scale: [0.06, 0.06, 0.03]
    color: "#2244aa"
  }

  object "RightEye" {
    geometry: "sphere"
    position: [0.1, 2.05, 0.3]
    scale: [0.06, 0.06, 0.03]
    color: "#2244aa"
  }

  object "Turntable" {
    @static
    geometry: "cylinder"
    position: [0, 0.05, 0]
    scale: [1.5, 0.1, 1.5]
    color: "#222244"
    material: { metalness: 0.5 }
  }

  object "CustomizeLabel" {
    @billboard
    geometry: "plane"
    position: [0, 3, -1]
    scale: [2, 0.4, 0.01]
    color: "#1a1a2e"
    label: "Customize Your Avatar"
  }
}`,
  },

  'live-stage': {
    id: 'wizard-live-stage',
    name: 'Virtual Live Stage',
    description: 'Concert and streaming stage with lighting rigs and effects',
    thumbnail: '🎤',
    tags: ['creator', 'stage', 'concert', 'streaming'],
    category: 'creator',
    code: `composition "Live Stage" {
  environment {
    skybox: "night"
    ambient_light: 0.05
    fog: { color: "#0a0020", density: 0.02 }
  }

  object "StagePlatform" {
    @collidable
    @static
    geometry: "box"
    position: [0, 0.3, 0]
    scale: [12, 0.6, 6]
    color: "#1a1a2e"
    material: { roughness: 0.2 }
  }

  object "SpotlightLeft" {
    @glowing
    geometry: "cone"
    position: [-4, 5, -2]
    rotation: [-20, 0, 10]
    scale: [0.5, 3, 0.5]
    color: "#ff0066"
    emissive: "#ff0066"
    emissiveIntensity: 3.0
    material: { opacity: 0.3 }
  }

  object "SpotlightRight" {
    @glowing
    geometry: "cone"
    position: [4, 5, -2]
    rotation: [-20, 0, -10]
    scale: [0.5, 3, 0.5]
    color: "#0066ff"
    emissive: "#0066ff"
    emissiveIntensity: 3.0
    material: { opacity: 0.3 }
  }

  object "Mic" {
    @static
    geometry: "cylinder"
    position: [0, 1.3, 0]
    scale: [0.02, 1, 0.02]
    color: "#333333"
    metalness: 0.8
  }

  object "MicHead" {
    @static
    geometry: "sphere"
    position: [0, 1.85, 0]
    scale: [0.06, 0.08, 0.06]
    color: "#444444"
    metalness: 0.9
  }

  object "ScreenBackdrop" {
    @billboard
    @glowing
    geometry: "plane"
    position: [0, 3, -2.8]
    scale: [10, 3, 0.01]
    color: "#0a0a2e"
    emissive: "#2211aa"
    emissiveIntensity: 0.5
    label: "LIVE"
  }
}`,
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Get the starter template for a given wizard sub-category ID. */
export function getWizardTemplate(subcategoryId: string): SceneTemplate | null {
  return WIZARD_TEMPLATES[subcategoryId] ?? null;
}

/** Get all available wizard template IDs. */
export function getAvailableTemplateIds(): string[] {
  return Object.keys(WIZARD_TEMPLATES);
}

/** Get all wizard templates as a flat array (for merging into template galleries). */
export function getAllWizardTemplates(): SceneTemplate[] {
  return Object.values(WIZARD_TEMPLATES);
}
