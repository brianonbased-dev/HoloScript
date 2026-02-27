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
    filenamePatterns: [
      /pepe/i,
      /pepega/i,
      /monkas/i,
      /feelsgood/i,
      /feels.*man/i,
    ],
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
    filenamePatterns: [
      /wojak/i,
      /doomer/i,
      /bloomer/i,
      /soyjak/i,
      /coper/i,
    ],
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
    filenamePatterns: [
      /chad/i,
      /gigachad/i,
      /sigma/i,
      /based/i,
    ],
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
    filenamePatterns: [
      /doge/i,
      /shiba/i,
      /shibainu/i,
      /kabosu/i,
    ],
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
    filenamePatterns: [
      /troll/i,
      /problem/i,
      /umad/i,
    ],
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
    tags: ['classic', 'rage', '2010s'],
    popularity: 'classic',
  },

  // Cursed Cat / Smudge
  {
    id: 'cursed-cat',
    name: 'cursed_cat',
    displayName: 'Cursed Cat (Smudge)',
    description: 'Confused cat at dinner table. He no like vegetals.',
    filenamePatterns: [
      /smudge/i,
      /cursed.*cat/i,
      /confused.*cat/i,
      /table.*cat/i,
    ],
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
    tags: ['viral', 'cat', '2019', 'wholesome'],
    popularity: 'viral',
  },

  // SpongeBob (Mocking)
  {
    id: 'spongebob-mocking',
    name: 'spongebob_mocking',
    displayName: 'Mocking SpongeBob',
    description: 'sPoNgEbOb MoCkInG mEmE',
    filenamePatterns: [
      /spongebob/i,
      /mocking/i,
      /caveman/i,
    ],
    defaultTraits: [
      {
        name: 'random-caps-text',
        properties: {
          enableRandomCaps: true,
        },
      },
    ],
    suggestedAnimations: ['SpongeBob_Mock', 'SpongeBob_Laugh'],
    tags: ['classic', 'nickelodeon', 'text-meme'],
    popularity: 'trending',
  },

  // Thinking / Big Brain
  {
    id: 'big-brain',
    name: 'big_brain',
    displayName: 'Big Brain',
    description: 'Galaxy brain. Expanding brain. IQ 200.',
    filenamePatterns: [
      /brain/i,
      /thinking/i,
      /galaxy.*brain/i,
      /expanding/i,
    ],
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
    const filenameMatch = template.filenamePatterns.some((pattern) =>
      pattern.test(filename)
    );

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
