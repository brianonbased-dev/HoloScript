/**
 * memeTemplates.ts — Meme Character Template Recognition & Auto-Configuration
 *
 * MEME-001: Recognize meme character templates (Pepe, Wojak, Chad)
 * Priority: High | Estimate: 3 hours
 *
 * Auto-detects popular meme characters from GLB filename/bones
 * and applies appropriate traits, animations, and settings
 */

import type { TraitConfig } from './sceneGraphStore';

export interface MemeTemplate {
  id: string;
  name: string;
  displayName: string;
  description: string;

  // Detection patterns
  filenamePatterns: RegExp[];
  bonePatterns?: string[]; // Optional bone names that indicate this template

  // Auto-applied configuration
  defaultTraits: TraitConfig[];
  suggestedAnimations: string[];
  defaultMaterials?: {
    skin?: string;
    eyes?: string;
    mouth?: string;
  };

  // HoloScript composition code (native asset)
  holoScript: string;

  // Metadata
  tags: string[];
  popularity: 'viral' | 'trending' | 'classic' | 'niche';
  previewImage?: string;
}

/**
 * Built-in meme character templates
 */
export const MEME_TEMPLATES: MemeTemplate[] = [
  // Pepe the Frog
  {
    id: 'pepe',
    name: 'pepe',
    displayName: 'Pepe',
    description: 'The OG meme frog. Rare, comfy, or wojak mode.',
    filenamePatterns: [/pepe/i, /pepega/i, /monkas/i, /feelsgood/i, /feels.*man/i],
    bonePatterns: ['Frog_Root', 'Pepe_Head', 'Mouth_Smile'],
    defaultTraits: [
      {
        name: 'physics-wiggle',
        properties: {
          bones: ['Head', 'Mouth'],
          frequency: 2.5,
          amplitude: 0.15,
          damping: 0.8,
        },
      },
      {
        name: 'emoji-reaction',
        properties: {
          triggers: ['rare', 'comfy', 'feels'],
          emojis: ['🐸', '💚', '✨', '💎'],
          spawnRate: 3,
        },
      },
    ],
    suggestedAnimations: ['Pepe_Laugh', 'Pepe_Cry', 'Pepe_Dance', 'Pepe_Smug'],
    defaultMaterials: {
      skin: 'green-frog',
      eyes: 'pepe-eyes',
      mouth: 'smile-curve',
    },
    holoScript: `composition "Pepe" {
  object "Pepe" @animation {
    position: [0, 0, 0]

    object "Head" {
      geometry: "sphere"
      position: [0, 1.6, 0]
      scale: [0.55, 0.5, 0.45]
      color: "#4ade80"
      material: { roughness: 0.6 }

      object "LeftEye" {
        geometry: "sphere"
        position: [-0.15, 0.12, 0.35]
        scale: [0.16, 0.2, 0.06]
        color: "#ffffff"
      }
      object "LeftPupil" {
        geometry: "sphere"
        position: [-0.13, 0.12, 0.4]
        scale: [0.06, 0.08, 0.04]
        color: "#111111"
      }
      object "RightEye" {
        geometry: "sphere"
        position: [0.15, 0.12, 0.35]
        scale: [0.16, 0.2, 0.06]
        color: "#ffffff"
      }
      object "RightPupil" {
        geometry: "sphere"
        position: [0.13, 0.12, 0.4]
        scale: [0.06, 0.08, 0.04]
        color: "#111111"
      }
      object "Mouth" {
        geometry: "torus"
        position: [0, -0.1, 0.3]
        rotation: [15, 0, 0]
        scale: [0.2, 0.1, 0.05]
        color: "#e74c3c"
      }
    }

    object "Body" {
      geometry: "sphere"
      position: [0, 0.85, 0]
      scale: [0.45, 0.55, 0.35]
      color: "#4ade80"
    }
    object "LeftArm" {
      geometry: "cylinder"
      position: [-0.4, 0.9, 0]
      rotation: [0, 0, 25]
      scale: [0.08, 0.35, 0.08]
      color: "#4ade80"
    }
    object "RightArm" {
      geometry: "cylinder"
      position: [0.4, 0.9, 0]
      rotation: [0, 0, -25]
      scale: [0.08, 0.35, 0.08]
      color: "#4ade80"
    }
    object "LeftLeg" {
      geometry: "cylinder"
      position: [-0.15, 0.3, 0]
      scale: [0.09, 0.35, 0.09]
      color: "#4ade80"
    }
    object "RightLeg" {
      geometry: "cylinder"
      position: [0.15, 0.3, 0]
      scale: [0.09, 0.35, 0.09]
      color: "#4ade80"
    }
  }

  ambient_light "Fill" { color: "#e0ffe0" intensity: 0.5 }
  directional_light "Key" { color: "#ffffff" intensity: 1.0 position: [3, 5, 3] }
}`,
    tags: ['classic', 'frog', '4chan', 'twitch'],
    popularity: 'classic',
    previewImage: '/assets/templates/pepe.png',
  },

  // Wojak
  {
    id: 'wojak',
    name: 'wojak',
    displayName: 'Wojak',
    description: 'Sad boy hours. Doomer, bloomer, or soyjak variants.',
    filenamePatterns: [/wojak/i, /doomer/i, /bloomer/i, /soyjak/i, /coper/i],
    bonePatterns: ['Wojak_Root', 'Sad_Face', 'Tear_L', 'Tear_R'],
    defaultTraits: [
      {
        name: 'emotional-state',
        properties: {
          states: ['sad', 'happy', 'neutral', 'angry'],
          transitionSpeed: 1.5,
          expressionIntensity: 0.8,
        },
      },
      {
        name: 'tear-physics',
        properties: {
          tearBones: ['Tear_L', 'Tear_R'],
          dropRate: 0.5, // tears per second
          gravity: 9.81,
        },
      },
    ],
    suggestedAnimations: ['Wojak_Cry', 'Wojak_Cope', 'Wojak_Smile', 'Wojak_Rage'],
    defaultMaterials: {
      skin: 'pale-white',
      eyes: 'sad-eyes',
      mouth: 'frown',
    },
    holoScript: `composition "Wojak" {
  object "Wojak" @animation {
    position: [0, 0, 0]

    object "Head" {
      geometry: "sphere"
      position: [0, 1.6, 0]
      scale: [0.5, 0.55, 0.45]
      color: "#e5e7eb"
      material: { roughness: 0.7 }

      object "LeftEye" {
        geometry: "sphere"
        position: [-0.12, 0.08, 0.35]
        scale: [0.06, 0.1, 0.04]
        color: "#222222"
      }
      object "RightEye" {
        geometry: "sphere"
        position: [0.12, 0.08, 0.35]
        scale: [0.06, 0.1, 0.04]
        color: "#222222"
      }
      object "Mouth" {
        geometry: "torus"
        position: [0, -0.12, 0.3]
        rotation: [-20, 0, 0]
        scale: [0.12, 0.06, 0.03]
        color: "#666666"
      }
      object "LeftTear" {
        geometry: "sphere"
        position: [-0.12, -0.02, 0.38]
        scale: [0.03, 0.06, 0.02]
        color: "#60a5fa"
        material: { emissive: "#60a5fa", emissiveIntensity: 0.5, opacity: 0.7 }
      }
      object "RightTear" {
        geometry: "sphere"
        position: [0.12, -0.02, 0.38]
        scale: [0.03, 0.06, 0.02]
        color: "#60a5fa"
        material: { emissive: "#60a5fa", emissiveIntensity: 0.5, opacity: 0.7 }
      }
    }

    object "Body" {
      geometry: "cylinder"
      position: [0, 0.85, 0]
      scale: [0.3, 0.55, 0.25]
      color: "#d1d5db"
    }
    object "LeftArm" {
      geometry: "cylinder"
      position: [-0.35, 0.85, 0]
      rotation: [0, 0, 15]
      scale: [0.07, 0.35, 0.07]
      color: "#d1d5db"
    }
    object "RightArm" {
      geometry: "cylinder"
      position: [0.35, 0.85, 0]
      rotation: [0, 0, -15]
      scale: [0.07, 0.35, 0.07]
      color: "#d1d5db"
    }
  }

  ambient_light "Fill" { color: "#e0e0ff" intensity: 0.5 }
  directional_light "Key" { color: "#ffffff" intensity: 1.0 position: [3, 5, 3] }
}`,
    tags: ['classic', 'feels', '4chan', 'relatable'],
    popularity: 'classic',
    previewImage: '/assets/templates/wojak.png',
  },

  // Gigachad
  {
    id: 'chad',
    name: 'chad',
    displayName: 'Gigachad',
    description: 'Sigma male energy. Based and gigapilled.',
    filenamePatterns: [/chad/i, /gigachad/i, /sigma/i, /based/i],
    bonePatterns: ['Chad_Root', 'Jaw_Lower', 'Muscles'],
    defaultTraits: [
      {
        name: 'confidence-aura',
        properties: {
          auraColor: '#FFD700', // Gold
          intensity: 1.0,
          pulseSpeed: 0.5,
        },
      },
      {
        name: 'flex-animations',
        properties: {
          flexBones: ['Bicep_L', 'Bicep_R', 'Chest'],
          flexIntensity: 1.2,
          autoFlex: true,
        },
      },
    ],
    suggestedAnimations: ['Chad_Walk', 'Chad_Flex', 'Chad_Nod', 'Chad_Yes'],
    defaultMaterials: {
      skin: 'tan-alpha',
      eyes: 'chad-stare',
      mouth: 'smirk',
    },
    holoScript: `composition "Gigachad" {
  object "Chad" @physics @animation {
    position: [0, 0, 0]

    object "Head" {
      geometry: "cube"
      position: [0, 2.0, 0]
      scale: [0.45, 0.5, 0.4]
      color: "#d4a574"
      material: { roughness: 0.6 }

      object "Jaw" {
        geometry: "cube"
        position: [0, -0.2, 0.05]
        scale: [0.5, 0.15, 0.35]
        color: "#c49464"
      }
      object "LeftEye" {
        geometry: "cube"
        position: [-0.1, 0.05, 0.2]
        scale: [0.08, 0.04, 0.02]
        color: "#111111"
      }
      object "RightEye" {
        geometry: "cube"
        position: [0.1, 0.05, 0.2]
        scale: [0.08, 0.04, 0.02]
        color: "#111111"
      }
    }

    object "Neck" {
      geometry: "cylinder"
      position: [0, 1.7, 0]
      scale: [0.15, 0.15, 0.15]
      color: "#d4a574"
    }
    object "Torso" {
      geometry: "cube"
      position: [0, 1.15, 0]
      scale: [0.8, 0.9, 0.4]
      color: "#333333"
    }
    object "LeftPec" {
      geometry: "sphere"
      position: [-0.2, 1.35, 0.15]
      scale: [0.2, 0.15, 0.1]
      color: "#333333"
    }
    object "RightPec" {
      geometry: "sphere"
      position: [0.2, 1.35, 0.15]
      scale: [0.2, 0.15, 0.1]
      color: "#333333"
    }
    object "LeftBicep" {
      geometry: "sphere"
      position: [-0.55, 1.25, 0]
      scale: [0.18, 0.25, 0.18]
      color: "#d4a574"
    }
    object "RightBicep" {
      geometry: "sphere"
      position: [0.55, 1.25, 0]
      scale: [0.18, 0.25, 0.18]
      color: "#d4a574"
    }
    object "LeftLeg" {
      geometry: "cylinder"
      position: [-0.2, 0.3, 0]
      scale: [0.12, 0.55, 0.12]
      color: "#2a2a2a"
    }
    object "RightLeg" {
      geometry: "cylinder"
      position: [0.2, 0.3, 0]
      scale: [0.12, 0.55, 0.12]
      color: "#2a2a2a"
    }

    object "Aura" {
      geometry: "sphere"
      position: [0, 1.2, 0]
      scale: [1.2, 1.5, 1.0]
      color: "#FFD700"
      material: { emissive: "#FFD700", emissiveIntensity: 0.3, opacity: 0.08 }
    }
  }

  ambient_light "Fill" { color: "#ffe8cc" intensity: 0.4 }
  directional_light "Key" { color: "#ffffff" intensity: 1.2 position: [3, 5, 3] }
}`,
    tags: ['sigma', 'based', 'alpha', 'meme-king'],
    popularity: 'viral',
    previewImage: '/assets/templates/chad.png',
  },

  // Doge
  {
    id: 'doge',
    name: 'doge',
    displayName: 'Doge',
    description: 'Much wow. Such meme. Very crypto.',
    filenamePatterns: [/doge/i, /shiba/i, /shibainu/i, /kabosu/i],
    bonePatterns: ['Doge_Root', 'Shiba_Head', 'Tail'],
    defaultTraits: [
      {
        name: 'tail-wag',
        properties: {
          tailBone: 'Tail',
          wagSpeed: 3.0,
          wagAmplitude: 45, // degrees
        },
      },
      {
        name: 'comic-sans-text',
        properties: {
          texts: ['wow', 'such', 'very', 'much'],
          fontSize: 24,
          color: '#FF6B6B',
          randomPositions: true,
        },
      },
    ],
    suggestedAnimations: ['Doge_Tilt', 'Doge_Bork', 'Doge_Sit', 'Doge_Moon'],
    defaultMaterials: {
      skin: 'shiba-fur',
      eyes: 'dog-eyes',
    },
    holoScript: `composition "Doge" {
  object "Doge" @physics @animation {
    position: [0, 0, 0]

    object "Body" {
      geometry: "sphere"
      position: [0, 0.6, 0]
      scale: [0.45, 0.4, 0.6]
      color: "#f59e0b"
      material: { roughness: 0.8 }
    }
    object "Head" {
      geometry: "sphere"
      position: [0, 1.0, 0.25]
      scale: [0.35, 0.35, 0.3]
      color: "#f59e0b"

      object "Snout" {
        geometry: "sphere"
        position: [0, -0.08, 0.25]
        scale: [0.15, 0.12, 0.15]
        color: "#fbbf24"
      }
      object "Nose" {
        geometry: "sphere"
        position: [0, -0.02, 0.4]
        scale: [0.06, 0.05, 0.04]
        color: "#111111"
      }
      object "LeftEye" {
        geometry: "sphere"
        position: [-0.1, 0.08, 0.22]
        scale: [0.06, 0.07, 0.04]
        color: "#111111"
      }
      object "RightEye" {
        geometry: "sphere"
        position: [0.1, 0.08, 0.22]
        scale: [0.06, 0.07, 0.04]
        color: "#111111"
      }
      object "LeftEar" {
        geometry: "cone"
        position: [-0.2, 0.25, 0]
        rotation: [0, 0, 20]
        scale: [0.1, 0.2, 0.06]
        color: "#d97706"
      }
      object "RightEar" {
        geometry: "cone"
        position: [0.2, 0.25, 0]
        rotation: [0, 0, -20]
        scale: [0.1, 0.2, 0.06]
        color: "#d97706"
      }
    }
    object "FrontLeftLeg" {
      geometry: "cylinder"
      position: [-0.15, 0.2, 0.2]
      scale: [0.06, 0.25, 0.06]
      color: "#f59e0b"
    }
    object "FrontRightLeg" {
      geometry: "cylinder"
      position: [0.15, 0.2, 0.2]
      scale: [0.06, 0.25, 0.06]
      color: "#f59e0b"
    }
    object "BackLeftLeg" {
      geometry: "cylinder"
      position: [-0.15, 0.2, -0.2]
      scale: [0.06, 0.25, 0.06]
      color: "#f59e0b"
    }
    object "BackRightLeg" {
      geometry: "cylinder"
      position: [0.15, 0.2, -0.2]
      scale: [0.06, 0.25, 0.06]
      color: "#f59e0b"
    }
    object "Tail" {
      geometry: "cylinder"
      position: [0, 0.75, -0.55]
      rotation: [-40, 0, 0]
      scale: [0.04, 0.25, 0.04]
      color: "#fbbf24"
    }
  }

  ambient_light "Fill" { color: "#fff5e0" intensity: 0.5 }
  directional_light "Key" { color: "#ffffff" intensity: 1.0 position: [3, 5, 3] }
}`,
    tags: ['classic', 'dog', 'crypto', 'wholesome'],
    popularity: 'classic',
    previewImage: '/assets/templates/doge.png',
  },

  // Trollface
  {
    id: 'trollface',
    name: 'trollface',
    displayName: 'Trollface',
    description: 'Problem? U mad bro?',
    filenamePatterns: [/troll/i, /problem/i, /umad/i],
    defaultTraits: [
      {
        name: 'troll-grin',
        properties: {
          grinIntensity: 1.0,
          eyeGleam: true,
        },
      },
    ],
    suggestedAnimations: ['Troll_Laugh', 'Troll_Problem', 'Troll_Dance'],
    holoScript: `composition "Trollface" {
  object "Trollface" @animation {
    position: [0, 0, 0]

    object "Head" {
      geometry: "sphere"
      position: [0, 1.5, 0]
      scale: [0.6, 0.5, 0.4]
      color: "#f0f0f0"

      object "LeftEye" {
        geometry: "sphere"
        position: [-0.15, 0.1, 0.3]
        scale: [0.1, 0.12, 0.05]
        color: "#ffffff"
      }
      object "LeftPupil" {
        geometry: "sphere"
        position: [-0.15, 0.1, 0.35]
        scale: [0.04, 0.06, 0.03]
        color: "#111111"
      }
      object "RightEye" {
        geometry: "sphere"
        position: [0.18, 0.08, 0.3]
        scale: [0.08, 0.1, 0.05]
        color: "#ffffff"
      }
      object "RightPupil" {
        geometry: "sphere"
        position: [0.18, 0.08, 0.35]
        scale: [0.03, 0.05, 0.03]
        color: "#111111"
      }
      object "Grin" {
        geometry: "torus"
        position: [0.05, -0.15, 0.25]
        rotation: [-10, 0, 5]
        scale: [0.3, 0.12, 0.05]
        color: "#333333"
      }
    }

    object "Body" {
      geometry: "cylinder"
      position: [0, 0.8, 0]
      scale: [0.25, 0.5, 0.2]
      color: "#f0f0f0"
    }
  }

  ambient_light "Fill" { color: "#ffffff" intensity: 0.5 }
  directional_light "Key" { color: "#ffffff" intensity: 1.0 position: [3, 5, 3] }
}`,
    tags: ['classic', 'rage', '2010s'],
    popularity: 'classic',
  },

  // Cursed Cat / Smudge
  {
    id: 'cursed-cat',
    name: 'cursed_cat',
    displayName: 'Cursed Cat (Smudge)',
    description: 'Confused cat at dinner table. He no like vegetals.',
    filenamePatterns: [/smudge/i, /cursed.*cat/i, /confused.*cat/i, /table.*cat/i],
    defaultTraits: [
      {
        name: 'head-bob',
        properties: {
          bobSpeed: 1.5,
          bobAmount: 0.1,
        },
      },
    ],
    suggestedAnimations: ['Cat_Stare', 'Cat_Yell', 'Cat_Confusion'],
    holoScript: `composition "SmudgeCat" {
  object "Cat" @animation {
    position: [0, 0, 0]

    object "Body" {
      geometry: "sphere"
      position: [0, 0.5, 0]
      scale: [0.35, 0.3, 0.5]
      color: "#f5f0e8"
      material: { roughness: 0.9 }
    }
    object "Head" {
      geometry: "sphere"
      position: [0, 0.9, 0.2]
      scale: [0.35, 0.3, 0.3]
      color: "#f5f0e8"

      object "LeftEar" {
        geometry: "cone"
        position: [-0.15, 0.25, 0]
        scale: [0.08, 0.15, 0.06]
        color: "#e8d8c8"
      }
      object "RightEar" {
        geometry: "cone"
        position: [0.15, 0.25, 0]
        scale: [0.08, 0.15, 0.06]
        color: "#e8d8c8"
      }
      object "LeftEye" {
        geometry: "sphere"
        position: [-0.1, 0.05, 0.22]
        scale: [0.07, 0.05, 0.04]
        color: "#4ade80"
        material: { emissive: "#4ade80", emissiveIntensity: 0.5 }
      }
      object "RightEye" {
        geometry: "sphere"
        position: [0.1, 0.05, 0.22]
        scale: [0.07, 0.05, 0.04]
        color: "#4ade80"
        material: { emissive: "#4ade80", emissiveIntensity: 0.5 }
      }
      object "Nose" {
        geometry: "sphere"
        position: [0, -0.02, 0.28]
        scale: [0.04, 0.03, 0.03]
        color: "#ffaaaa"
      }
    }
    object "Tail" {
      geometry: "cylinder"
      position: [0, 0.5, -0.45]
      rotation: [-50, 0, 0]
      scale: [0.04, 0.3, 0.04]
      color: "#e8d8c8"
    }
  }

  ambient_light "Fill" { color: "#fff5ee" intensity: 0.5 }
  directional_light "Key" { color: "#ffffff" intensity: 1.0 position: [3, 5, 3] }
}`,
    tags: ['viral', 'cat', '2019', 'wholesome'],
    popularity: 'viral',
  },

  // SpongeBob (Mocking)
  {
    id: 'spongebob-mocking',
    name: 'spongebob_mocking',
    displayName: 'Mocking SpongeBob',
    description: 'sPoNgEbOb MoCkInG mEmE',
    filenamePatterns: [/spongebob/i, /mocking/i, /caveman/i],
    defaultTraits: [
      {
        name: 'random-caps-text',
        properties: {
          enableRandomCaps: true,
        },
      },
    ],
    suggestedAnimations: ['SpongeBob_Mock', 'SpongeBob_Laugh'],
    holoScript: `composition "MockingSpongeBob" {
  object "SpongeBob" @animation {
    position: [0, 0, 0]

    object "Body" {
      geometry: "cube"
      position: [0, 0.9, 0]
      scale: [0.5, 0.7, 0.2]
      color: "#FFD700"
      material: { roughness: 0.8 }

      object "Pants" {
        geometry: "cube"
        position: [0, -0.35, 0]
        scale: [1.0, 0.3, 1.0]
        color: "#8B4513"
      }
      object "Tie" {
        geometry: "cube"
        position: [0, -0.05, 0.11]
        scale: [0.1, 0.2, 0.02]
        color: "#ff0000"
      }
    }
    object "Head" {
      geometry: "cube"
      position: [0, 1.55, 0]
      scale: [0.45, 0.4, 0.2]
      color: "#FFD700"

      object "LeftEye" {
        geometry: "sphere"
        position: [-0.1, 0.05, 0.1]
        scale: [0.1, 0.13, 0.05]
        color: "#ffffff"
      }
      object "LeftPupil" {
        geometry: "sphere"
        position: [-0.1, 0.05, 0.14]
        scale: [0.04, 0.05, 0.03]
        color: "#2196F3"
      }
      object "RightEye" {
        geometry: "sphere"
        position: [0.1, 0.05, 0.1]
        scale: [0.1, 0.13, 0.05]
        color: "#ffffff"
      }
      object "RightPupil" {
        geometry: "sphere"
        position: [0.1, 0.05, 0.14]
        scale: [0.04, 0.05, 0.03]
        color: "#2196F3"
      }
      object "Nose" {
        geometry: "sphere"
        position: [0, -0.02, 0.12]
        scale: [0.06, 0.06, 0.08]
        color: "#FFD700"
      }
    }
    object "LeftArm" {
      geometry: "cylinder"
      position: [-0.35, 0.9, 0]
      rotation: [0, 0, 40]
      scale: [0.04, 0.3, 0.04]
      color: "#FFD700"
    }
    object "RightArm" {
      geometry: "cylinder"
      position: [0.35, 0.9, 0]
      rotation: [0, 0, -40]
      scale: [0.04, 0.3, 0.04]
      color: "#FFD700"
    }
    object "LeftLeg" {
      geometry: "cylinder"
      position: [-0.1, 0.15, 0]
      scale: [0.04, 0.25, 0.04]
      color: "#FFD700"
    }
    object "RightLeg" {
      geometry: "cylinder"
      position: [0.1, 0.15, 0]
      scale: [0.04, 0.25, 0.04]
      color: "#FFD700"
    }
  }

  ambient_light "Fill" { color: "#ffffcc" intensity: 0.5 }
  directional_light "Key" { color: "#ffffff" intensity: 1.0 position: [3, 5, 3] }
}`,
    tags: ['classic', 'nickelodeon', 'text-meme'],
    popularity: 'trending',
  },

  // Thinking / Big Brain
  {
    id: 'big-brain',
    name: 'big_brain',
    displayName: 'Big Brain',
    description: 'Galaxy brain. Expanding brain. IQ 200.',
    filenamePatterns: [/brain/i, /thinking/i, /galaxy.*brain/i, /expanding/i],
    defaultTraits: [
      {
        name: 'brain-expansion',
        properties: {
          expansionLevels: 5,
          glowIntensity: 1.5,
        },
      },
    ],
    suggestedAnimations: ['Brain_Expand', 'Brain_Glow', 'Brain_Shrink'],
    holoScript: `composition "GalaxyBrain" {
  object "Figure" @animation {
    position: [0, 0, 0]

    object "Head" {
      geometry: "sphere"
      position: [0, 1.6, 0]
      scale: [0.4, 0.45, 0.4]
      color: "#d1d5db"

      object "Brain" {
        geometry: "sphere"
        position: [0, 0.2, 0]
        scale: [0.5, 0.4, 0.45]
        color: "#ff88cc"
        material: { roughness: 0.6 }
      }
      object "BrainGlow" {
        geometry: "sphere"
        position: [0, 0.2, 0]
        scale: [0.65, 0.55, 0.6]
        color: "#cc44ff"
        material: { emissive: "#cc44ff", emissiveIntensity: 2.0, opacity: 0.15 }
      }
      object "BrainAura" {
        geometry: "sphere"
        position: [0, 0.2, 0]
        scale: [1.0, 0.9, 0.9]
        color: "#4488ff"
        material: { emissive: "#4488ff", emissiveIntensity: 1.0, opacity: 0.06 }
      }
      object "LeftEye" {
        geometry: "sphere"
        position: [-0.1, -0.02, 0.35]
        scale: [0.05, 0.05, 0.03]
        color: "#ffffff"
        material: { emissive: "#ffffff", emissiveIntensity: 3.0 }
      }
      object "RightEye" {
        geometry: "sphere"
        position: [0.1, -0.02, 0.35]
        scale: [0.05, 0.05, 0.03]
        color: "#ffffff"
        material: { emissive: "#ffffff", emissiveIntensity: 3.0 }
      }
    }

    object "Body" {
      geometry: "cylinder"
      position: [0, 0.85, 0]
      scale: [0.2, 0.5, 0.15]
      color: "#555555"
    }
  }

  ambient_light "Fill" { color: "#1a1a2e" intensity: 0.3 }
  directional_light "Key" { color: "#8888ff" intensity: 0.8 position: [3, 5, 3] }
  point_light "BrainLight" { color: "#cc44ff" intensity: 2.0 position: [0, 2.0, 0] }
}`,
    tags: ['IQ', 'smart', 'galaxy'],
    popularity: 'trending',
  },
];

/**
 * Detect meme template from GLB filename
 */
export function detectMemeTemplate(filename: string, boneNames?: string[]): MemeTemplate | null {
  // Check filename patterns
  for (const template of MEME_TEMPLATES) {
    const filenameMatch = template.filenamePatterns.some((pattern) => pattern.test(filename));

    if (filenameMatch) {
      return template;
    }
  }

  // Check bone patterns if available
  if (boneNames && boneNames.length > 0) {
    for (const template of MEME_TEMPLATES) {
      if (!template.bonePatterns) continue;

      const boneMatch = template.bonePatterns.some((pattern) =>
        boneNames.some((bone) => bone.toLowerCase().includes(pattern.toLowerCase()))
      );

      if (boneMatch) {
        return template;
      }
    }
  }

  return null;
}

/**
 * Get all templates sorted by popularity
 */
export function getPopularTemplates(): MemeTemplate[] {
  const priorityOrder = { viral: 0, trending: 1, classic: 2, niche: 3 };
  return [...MEME_TEMPLATES].sort(
    (a, b) => priorityOrder[a.popularity] - priorityOrder[b.popularity]
  );
}

/**
 * Search templates by name or tags
 */
export function searchTemplates(query: string): MemeTemplate[] {
  const lowerQuery = query.toLowerCase();
  return MEME_TEMPLATES.filter(
    (template) =>
      template.name.toLowerCase().includes(lowerQuery) ||
      template.displayName.toLowerCase().includes(lowerQuery) ||
      template.description.toLowerCase().includes(lowerQuery) ||
      template.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Get template by ID
 */
export function getTemplate(id: string): MemeTemplate | null {
  return MEME_TEMPLATES.find((t) => t.id === id) || null;
}

/**
 * Apply template configuration to character store
 */
export interface ApplyTemplateResult {
  success: boolean;
  template: MemeTemplate;
  appliedTraits: TraitConfig[];
  message: string;
}

export function getTemplateConfiguration(template: MemeTemplate): {
  traits: TraitConfig[];
  animations: string[];
  materials: Record<string, string>;
} {
  return {
    traits: template.defaultTraits,
    animations: template.suggestedAnimations,
    materials: template.defaultMaterials || {},
  };
}
