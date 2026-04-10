/**
 * sceneTemplates.ts — Pre-built Scene Templates
 *
 * Template definitions that users can browse and clone to kickstart projects.
 */

// Re-export composition-based templates (SCENE_TEMPLATES, searchTemplates, SceneTemplate)
export { type SceneTemplate, SCENE_TEMPLATES, searchTemplates } from './scene/sceneTemplates';

export interface StudioTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  thumbnail: string; // URL or data URI
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  estimatedObjects: number;
  holoScript: string; // HoloScript source code
  featured: boolean;
}

export type TemplateCategory =
  | 'architecture'
  | 'game'
  | 'education'
  | 'medical'
  | 'retail'
  | 'art'
  | 'simulation'
  | 'social'
  | 'industrial'
  | 'nature'
  | 'sci-fi'
  | 'starter';

export const STUDIO_TEMPLATES: StudioTemplate[] = [
  {
    id: 'starter-cube',
    name: 'Hello Cube',
    description: 'A single spinning cube — the classic first scene.',
    category: 'starter',
    thumbnail: '/templates/hello-cube.png',
    difficulty: 'beginner',
    tags: ['beginner', 'tutorial'],
    estimatedObjects: 1,
    featured: true,
    holoScript: `scene "Hello Cube" {
  cube @spinning(speed: 1) @grabbable
    position: 0 1 0
    color: #3b82f6
}`,
  },
  {
    id: 'starter-room',
    name: 'Empty Room',
    description: 'A room with floor, walls, and ambient lighting.',
    category: 'architecture',
    thumbnail: '/templates/empty-room.png',
    difficulty: 'beginner',
    tags: ['architecture', 'interior'],
    estimatedObjects: 6,
    featured: true,
    holoScript: `scene "Empty Room" {
  floor size: 10 10 material: "wood"
  wall @repeat(4) height: 3 material: "plaster"
  light type: ambient intensity: 0.6
  light type: point position: 0 2.5 0 intensity: 1.0
}`,
  },
  {
    id: 'game-platformer',
    name: 'Platformer Level',
    description: 'A side-scrolling platformer with moving platforms.',
    category: 'game',
    thumbnail: '/templates/platformer.png',
    difficulty: 'intermediate',
    tags: ['game', 'platformer', 'physics'],
    estimatedObjects: 20,
    featured: true,
    holoScript: `scene "Platformer" {
  player @controllable @physics(gravity: 9.81)
    position: 0 2 0
  platform @static size: 5 0.3 2 position: 0 0 0
  platform @moving(axis: x, range: 4, speed: 1) position: 6 2 0
  coin @collectible @spinning position: 3 3 0
}`,
  },
  {
    id: 'medical-anatomy',
    name: 'Anatomy Explorer',
    description: 'Interactive 3D human anatomy model for education.',
    category: 'medical',
    thumbnail: '/templates/anatomy.png',
    difficulty: 'advanced',
    tags: ['medical', 'education', 'anatomy'],
    estimatedObjects: 50,
    featured: false,
    holoScript: `scene "Anatomy Explorer" {
  model "human-body" @explodable @annotated
    scale: 1.5
    interaction: click-to-isolate
  ui panel: organ-info position: right
  camera orbit distance: 3
}`,
  },
  {
    id: 'nature-garden',
    name: 'Zen Garden',
    description: 'A peaceful procedural garden with water features.',
    category: 'nature',
    thumbnail: '/templates/garden.png',
    difficulty: 'intermediate',
    tags: ['nature', 'procedural', 'relaxation'],
    estimatedObjects: 30,
    featured: true,
    holoScript: `scene "Zen Garden" {
  terrain size: 20 20 @erosion(iterations: 3)
  water @reflective @animated position: 0 -0.1 0 size: 4 4
  tree @procedural(type: bonsai) @wind(strength: 0.3) count: 5
  rock @scattered(count: 12, radius: 8)
  light type: directional angle: 45 color: #fef3c7
}`,
  },
  {
    id: 'retail-showroom',
    name: 'Product Showroom',
    description: 'A sleek product display room with lighting rigs.',
    category: 'retail',
    thumbnail: '/templates/showroom.png',
    difficulty: 'intermediate',
    tags: ['retail', 'product', 'eCommerce'],
    estimatedObjects: 15,
    featured: false,
    holoScript: `scene "Showroom" {
  pedestal @turntable(speed: 0.5)
    position: 0 1 0
    material: "marble-white"
  spotlight position: 0 3 2 target: pedestal intensity: 2
  backdrop color: #1a1a2e curved: true
  camera orbit distance: 4 auto-rotate: true
}`,
  },

  // ── Native Assets (composed from geometric primitives) ──────────────────
  {
    id: 'native-robot',
    name: 'HoloBot',
    description:
      'A robot built from ~35 geometric primitives with emissive eyes, chrome joints, and a reactor core.',
    category: 'sci-fi',
    thumbnail: '/templates/native-robot.png',
    difficulty: 'intermediate',
    tags: ['native-asset', 'robot', 'sci-fi', 'primitives'],
    estimatedObjects: 35,
    featured: true,
    holoScript: `composition "HoloBot" {
  template "MetalJoint" {
    geometry: "sphere"
    material: { preset: "chrome", metalness: 0.9, roughness: 0.1 }
  }

  object "Robot" @physics @animation {
    position: [0, 0, 0]

    object "Head" {
      geometry: "sphere"
      position: [0, 2.2, 0]
      scale: [0.45, 0.5, 0.45]
      color: "#c0c0c0"
      material: { metalness: 0.8, roughness: 0.2 }

      object "LeftEye" {
        geometry: "sphere"
        position: [-0.12, 0.08, 0.38]
        scale: [0.09, 0.09, 0.04]
        color: "#00ffff"
        material: { emissive: "#00ffff", emissiveIntensity: 2.0 }
      }
      object "RightEye" {
        geometry: "sphere"
        position: [0.12, 0.08, 0.38]
        scale: [0.09, 0.09, 0.04]
        color: "#00ffff"
        material: { emissive: "#00ffff", emissiveIntensity: 2.0 }
      }
      object "Antenna" {
        geometry: "cylinder"
        position: [0, 0.45, 0]
        scale: [0.02, 0.25, 0.02]
        color: "#ff4444"
      }
    }

    object "Neck" using "MetalJoint" {
      position: [0, 1.85, 0]
      scale: [0.12, 0.12, 0.12]
    }

    object "Torso" {
      geometry: "cube"
      position: [0, 1.2, 0]
      scale: [0.7, 0.9, 0.35]
      color: "#888888"
      material: { metalness: 0.7, roughness: 0.3 }

      object "ReactorCore" {
        geometry: "sphere"
        position: [0, 0.0, 0.2]
        scale: [0.12, 0.12, 0.12]
        color: "#00ffff"
        material: { emissive: "#00ffff", emissiveIntensity: 3.0 }
      }
    }

    object "LeftUpperArm" {
      geometry: "cylinder"
      position: [-0.55, 1.2, 0]
      scale: [0.08, 0.35, 0.08]
      color: "#777777"
    }
    object "RightUpperArm" {
      geometry: "cylinder"
      position: [0.55, 1.2, 0]
      scale: [0.08, 0.35, 0.08]
      color: "#777777"
    }
    object "LeftLeg" {
      geometry: "cylinder"
      position: [-0.2, 0.25, 0]
      scale: [0.1, 0.65, 0.1]
      color: "#777777"
    }
    object "RightLeg" {
      geometry: "cylinder"
      position: [0.2, 0.25, 0]
      scale: [0.1, 0.65, 0.1]
      color: "#777777"
    }
  }

  directional_light "KeyLight" {
    color: "#ffffff"
    intensity: 1.2
    position: [5, 10, 5]
  }
  ambient_light "Fill" {
    color: "#e0e8ff"
    intensity: 0.4
  }
}`,
  },
  {
    id: 'native-starfighter',
    name: 'Starfighter',
    description:
      'A sleek starfighter with swept wings, twin engine thrust glow, and weapon hardpoints.',
    category: 'sci-fi',
    thumbnail: '/templates/native-starfighter.png',
    difficulty: 'intermediate',
    tags: ['native-asset', 'spaceship', 'sci-fi', 'vehicles'],
    estimatedObjects: 30,
    featured: true,
    holoScript: `composition "Starfighter" {
  object "Ship" @physics @animation {
    position: [0, 0, 0]

    object "NoseCone" {
      geometry: "cone"
      position: [0, 0, 3.5]
      rotation: [90, 0, 0]
      scale: [0.35, 1.5, 0.25]
      color: "#303540"
      material: { metalness: 0.85, roughness: 0.15 }
    }
    object "MainBody" {
      geometry: "cube"
      position: [0, 0, 0]
      scale: [1.0, 0.5, 3.0]
      color: "#404550"
      material: { metalness: 0.75 }
    }
    object "Cockpit" {
      geometry: "sphere"
      position: [0, 0.35, 1.5]
      scale: [0.35, 0.25, 0.6]
      color: "#3388cc"
      material: { metalness: 0.2, roughness: 0.0, opacity: 0.7 }
    }
    object "LeftWing" {
      geometry: "cube"
      position: [-2.5, -0.05, -0.3]
      scale: [4.0, 0.08, 1.5]
      color: "#404550"

      object "LeftNavLight" {
        geometry: "sphere"
        position: [-2.1, 0.05, -0.6]
        scale: [0.08, 0.08, 0.08]
        color: "#ff0000"
        material: { emissive: "#ff0000", emissiveIntensity: 3.0 }
      }
    }
    object "RightWing" {
      geometry: "cube"
      position: [2.5, -0.05, -0.3]
      scale: [4.0, 0.08, 1.5]
      color: "#404550"

      object "RightNavLight" {
        geometry: "sphere"
        position: [2.1, 0.05, -0.6]
        scale: [0.08, 0.08, 0.08]
        color: "#00ff00"
        material: { emissive: "#00ff00", emissiveIntensity: 3.0 }
      }
    }
    object "LeftEngine" {
      geometry: "cylinder"
      position: [-0.6, -0.1, -2.8]
      rotation: [90, 0, 0]
      scale: [0.3, 1.2, 0.3]
      color: "#2a2e35"
      material: { metalness: 0.9 }

      object "LeftThrust" {
        geometry: "cone"
        position: [0, -0.9, 0]
        scale: [0.8, 1.2, 0.8]
        color: "#00aaff"
        material: { emissive: "#00aaff", emissiveIntensity: 5.0, opacity: 0.6 }
      }
    }
    object "RightEngine" {
      geometry: "cylinder"
      position: [0.6, -0.1, -2.8]
      rotation: [90, 0, 0]
      scale: [0.3, 1.2, 0.3]
      color: "#2a2e35"
      material: { metalness: 0.9 }

      object "RightThrust" {
        geometry: "cone"
        position: [0, -0.9, 0]
        scale: [0.8, 1.2, 0.8]
        color: "#00aaff"
        material: { emissive: "#00aaff", emissiveIntensity: 5.0, opacity: 0.6 }
      }
    }
    object "TailFin" {
      geometry: "cube"
      position: [0, 0.7, -2.5]
      scale: [0.06, 1.2, 0.8]
      color: "#404550"
    }
  }

  directional_light "StarLight" {
    color: "#eeeeff"
    intensity: 1.0
    position: [5, 3, 10]
  }
  ambient_light "SpaceGlow" {
    color: "#101020"
    intensity: 0.2
  }
}`,
  },
  {
    id: 'native-castle',
    name: 'Medieval Castle',
    description:
      'A castle with four towers, gatehouse, central keep with lit windows, and battlements.',
    category: 'architecture',
    thumbnail: '/templates/native-castle.png',
    difficulty: 'advanced',
    tags: ['native-asset', 'castle', 'medieval', 'architecture'],
    estimatedObjects: 35,
    featured: true,
    holoScript: `composition "MedievalCastle" {
  object "Castle" @physics @collidable {
    position: [0, 0, 0]

    object "Foundation" {
      geometry: "cube"
      position: [0, 0.25, 0]
      scale: [12, 0.5, 10]
      color: "#4a4a3a"
    }
    object "WallFront" {
      geometry: "cube"
      position: [0, 2, 5]
      scale: [12, 3.5, 0.5]
      color: "#8C7B6B"
    }
    object "WallBack" {
      geometry: "cube"
      position: [0, 2, -5]
      scale: [12, 3.5, 0.5]
      color: "#8C7B6B"
    }
    object "WallLeft" {
      geometry: "cube"
      position: [-6, 2, 0]
      scale: [0.5, 3.5, 10]
      color: "#8C7B6B"
    }
    object "WallRight" {
      geometry: "cube"
      position: [6, 2, 0]
      scale: [0.5, 3.5, 10]
      color: "#8C7B6B"
    }

    object "TowerFL" {
      geometry: "cylinder"
      position: [-6, 2.5, 5]
      scale: [1.2, 5.0, 1.2]
      color: "#7A6B5C"

      object "RoofFL" {
        geometry: "cone"
        position: [0, 3.2, 0]
        scale: [1.5, 2.0, 1.5]
        color: "#6B2D2D"
      }
    }
    object "TowerFR" {
      geometry: "cylinder"
      position: [6, 2.5, 5]
      scale: [1.2, 5.0, 1.2]
      color: "#7A6B5C"

      object "RoofFR" {
        geometry: "cone"
        position: [0, 3.2, 0]
        scale: [1.5, 2.0, 1.5]
        color: "#6B2D2D"
      }
    }
    object "TowerBL" {
      geometry: "cylinder"
      position: [-6, 2.5, -5]
      scale: [1.2, 5.0, 1.2]
      color: "#7A6B5C"

      object "RoofBL" {
        geometry: "cone"
        position: [0, 3.2, 0]
        scale: [1.5, 2.0, 1.5]
        color: "#6B2D2D"
      }
    }
    object "TowerBR" {
      geometry: "cylinder"
      position: [6, 2.5, -5]
      scale: [1.2, 5.0, 1.2]
      color: "#7A6B5C"

      object "RoofBR" {
        geometry: "cone"
        position: [0, 3.2, 0]
        scale: [1.5, 2.0, 1.5]
        color: "#6B2D2D"
      }
    }

    object "Keep" {
      geometry: "cube"
      position: [0, 3.5, -1.5]
      scale: [4, 6.5, 3.5]
      color: "#7A6B5C"

      object "KeepRoof" {
        geometry: "cone"
        position: [0, 3.8, 0]
        scale: [3.0, 2.5, 2.5]
        color: "#5C2020"
      }
      object "Window1" {
        geometry: "cube"
        position: [0, 1.5, 1.8]
        scale: [0.5, 0.8, 0.1]
        color: "#FFDD44"
        material: { emissive: "#FFDD44", emissiveIntensity: 1.5 }
      }
      object "Window2" {
        geometry: "cube"
        position: [1.0, 1.5, 1.8]
        scale: [0.5, 0.8, 0.1]
        color: "#FFDD44"
        material: { emissive: "#FFDD44", emissiveIntensity: 1.5 }
      }
    }
  }

  directional_light "Sun" {
    color: "#fff5e0"
    intensity: 1.3
    position: [8, 12, 6]
    shadows: true
  }
  ambient_light "Sky" {
    color: "#8899bb"
    intensity: 0.35
  }
}`,
  },
  {
    id: 'native-tree',
    name: 'Pine Tree',
    description: 'A stylized pine tree with layered cone foliage, bark roots, and snow caps.',
    category: 'nature',
    thumbnail: '/templates/native-tree.png',
    difficulty: 'beginner',
    tags: ['native-asset', 'tree', 'nature', 'winter'],
    estimatedObjects: 15,
    featured: false,
    holoScript: `composition "PineTree" {
  object "Tree" @physics {
    position: [0, 0, 0]

    object "Trunk" {
      geometry: "cylinder"
      position: [0, 0.8, 0]
      scale: [0.25, 1.6, 0.25]
      color: "#5C3A1E"
    }
    object "Foliage1" {
      geometry: "cone"
      position: [0, 2.0, 0]
      scale: [1.8, 1.2, 1.8]
      color: "#1B5E20"
    }
    object "Foliage2" {
      geometry: "cone"
      position: [0, 2.8, 0]
      scale: [1.5, 1.2, 1.5]
      color: "#2E7D32"
    }
    object "Foliage3" {
      geometry: "cone"
      position: [0, 3.5, 0]
      scale: [1.1, 1.1, 1.1]
      color: "#388E3C"
    }
    object "Foliage4" {
      geometry: "cone"
      position: [0, 4.1, 0]
      scale: [0.7, 0.9, 0.7]
      color: "#43A047"
    }
    object "Tip" {
      geometry: "cone"
      position: [0, 4.6, 0]
      scale: [0.35, 0.6, 0.35]
      color: "#4CAF50"
    }
    object "Snow1" {
      geometry: "cone"
      position: [0, 2.5, 0]
      scale: [1.3, 0.15, 1.3]
      color: "#f0f5ff"
      material: { opacity: 0.85 }
    }
    object "Snow2" {
      geometry: "cone"
      position: [0, 3.3, 0]
      scale: [1.0, 0.12, 1.0]
      color: "#f0f5ff"
      material: { opacity: 0.85 }
    }
  }
}`,
  },
  {
    id: 'native-streetlamp',
    name: 'Street Lamp',
    description:
      'A Victorian street lamp with warm glass panes, glowing bulb, and decorative metalwork.',
    category: 'architecture',
    thumbnail: '/templates/native-streetlamp.png',
    difficulty: 'intermediate',
    tags: ['native-asset', 'lamp', 'victorian', 'lighting'],
    estimatedObjects: 25,
    featured: false,
    holoScript: `composition "StreetLamp" {
  object "Lamp" @physics {
    position: [0, 0, 0]

    object "Base" {
      geometry: "cylinder"
      position: [0, 0.05, 0]
      scale: [0.45, 0.1, 0.45]
      color: "#2a2a2a"
      material: { metalness: 0.8, roughness: 0.3 }
    }
    object "BaseRing" {
      geometry: "torus"
      position: [0, 0.12, 0]
      scale: [0.35, 0.35, 0.08]
      color: "#333333"
      material: { metalness: 0.85 }
    }
    object "Pole" {
      geometry: "cylinder"
      position: [0, 1.5, 0]
      scale: [0.07, 2.8, 0.07]
      color: "#2d2d2d"
      material: { metalness: 0.7 }
    }
    object "LampCap" {
      geometry: "cone"
      position: [0, 3.45, 0]
      scale: [0.35, 0.2, 0.35]
      color: "#222222"
      material: { metalness: 0.9 }
    }
    object "LampHousing" {
      geometry: "cylinder"
      position: [0, 3.2, 0]
      scale: [0.25, 0.35, 0.25]
      color: "#333333"

      object "GlassPane1" {
        geometry: "cube"
        position: [0.22, 0, 0]
        scale: [0.02, 0.28, 0.2]
        color: "#FFE8B0"
        material: { emissive: "#FFE8B0", emissiveIntensity: 0.8, opacity: 0.5 }
      }
      object "GlassPane2" {
        geometry: "cube"
        position: [-0.22, 0, 0]
        scale: [0.02, 0.28, 0.2]
        color: "#FFE8B0"
        material: { emissive: "#FFE8B0", emissiveIntensity: 0.8, opacity: 0.5 }
      }
    }
    object "Bulb" {
      geometry: "sphere"
      position: [0, 3.2, 0]
      scale: [0.12, 0.15, 0.12]
      color: "#FFCC44"
      material: { emissive: "#FFCC44", emissiveIntensity: 4.0 }
    }
  }

  point_light "LampLight" {
    color: "#FFE0A0"
    intensity: 2.5
    position: [0, 3.2, 0]
  }
}`,
  },
  {
    id: 'native-spacestation',
    name: 'Space Station',
    description:
      'An orbital station with habitat torus ring, solar panels, docking bay, and radial spokes.',
    category: 'sci-fi',
    thumbnail: '/templates/native-spacestation.png',
    difficulty: 'advanced',
    tags: ['native-asset', 'space', 'station', 'orbital'],
    estimatedObjects: 25,
    featured: false,
    holoScript: `composition "SpaceStation" {
  environment {
    background: "#000011"
  }

  object "Station" @physics @networked {
    position: [0, 0, 0]

    object "CoreHub" {
      geometry: "sphere"
      scale: [2.0, 2.0, 2.0]
      color: "#b0b0b0"
      material: { metalness: 0.9, roughness: 0.15 }

      object "Viewport1" {
        geometry: "sphere"
        position: [0, 0, 1.95]
        scale: [0.5, 0.5, 0.1]
        color: "#113355"
        material: { emissive: "#113355", emissiveIntensity: 0.5 }
      }
    }
    object "HabitatRing" {
      geometry: "torus"
      scale: [6.0, 6.0, 1.2]
      color: "#808080"
      material: { metalness: 0.85, roughness: 0.2 }
    }
    object "RingGlow" {
      geometry: "torus"
      scale: [6.0, 6.0, 0.3]
      position: [0, 0.6, 0]
      color: "#00ccff"
      material: { emissive: "#00ccff", emissiveIntensity: 1.5, opacity: 0.6 }
    }
    object "Spoke1" {
      geometry: "cylinder"
      position: [4.0, 0, 0]
      rotation: [0, 0, 90]
      scale: [0.15, 4.0, 0.15]
      color: "#999999"
    }
    object "Spoke2" {
      geometry: "cylinder"
      position: [-4.0, 0, 0]
      rotation: [0, 0, 90]
      scale: [0.15, 4.0, 0.15]
      color: "#999999"
    }
    object "SolarPanel" {
      geometry: "cube"
      position: [0, 4.0, 0]
      scale: [3.0, 0.05, 1.2]
      color: "#1a2744"
    }
    object "DockingBay" {
      geometry: "cylinder"
      position: [0, 0, -3.0]
      rotation: [90, 0, 0]
      scale: [0.8, 1.5, 0.8]
      color: "#707070"

      object "DockingLight" {
        geometry: "sphere"
        position: [0, 1.5, 0]
        scale: [0.2, 0.2, 0.2]
        color: "#ff3300"
        material: { emissive: "#ff3300", emissiveIntensity: 3.0 }
      }
    }
  }

  directional_light "Sunlight" {
    color: "#ffffee"
    intensity: 1.5
    position: [10, 5, 8]
  }
  ambient_light "SpaceAmbient" {
    color: "#0a0a20"
    intensity: 0.15
  }
}`,
  },
];

/**
 * Get studio templates by category.
 */
export function templatesByCategory(category: TemplateCategory): StudioTemplate[] {
  return STUDIO_TEMPLATES.filter((t) => t.category === category);
}

/**
 * Get featured studio templates.
 */
export function featuredTemplates(): StudioTemplate[] {
  return STUDIO_TEMPLATES.filter((t) => t.featured);
}

/**
 * Search studio templates by name or tags.
 */
export function searchStudioTemplates(query: string): StudioTemplate[] {
  const q = query.toLowerCase();
  return STUDIO_TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.includes(q)) ||
      t.description.toLowerCase().includes(q)
  );
}

/**
 * Get all unique studio template categories.
 */
export function templateCategories(): TemplateCategory[] {
  return [...new Set(STUDIO_TEMPLATES.map((t) => t.category))];
}
