import { NextRequest } from 'next/server';

/**
 * GET /api/prompts
 * Returns curated prompt library for Brittney AI.
 * Organized by categories with example prompts and descriptions.
 *
 * Query params:
 *   q        — search query
 *   category — filter by category
 */

export interface Prompt {
  id: string;
  title: string;
  prompt: string;
  category: string;
  description: string;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

const PROMPTS: Prompt[] = [
  // ── Scene Building ─────────────────────────────────────────────────────────
  {
    id: 'build-room',
    title: 'Build a Room',
    prompt:
      'Create a cozy living room with a fireplace, two sofas, a coffee table, and warm ambient lighting',
    category: 'Scene Building',
    description: 'Generates a complete interior scene with furniture and lighting',
    tags: ['interior', 'furniture', 'lighting'],
    difficulty: 'beginner',
  },
  {
    id: 'outdoor-scene',
    title: 'Outdoor Environment',
    prompt:
      'Build a forest clearing with tall pine trees, a small stream, wildflowers, and golden hour sunlight',
    category: 'Scene Building',
    description: 'Creates a natural outdoor environment with vegetation and water',
    tags: ['nature', 'outdoor', 'environment'],
    difficulty: 'beginner',
  },
  {
    id: 'space-station',
    title: 'Sci-Fi Space Station',
    prompt:
      'Design a futuristic space station corridor with metallic walls, blue accent lights, holographic displays, and an airlock at the end',
    category: 'Scene Building',
    description: 'Builds a detailed sci-fi interior with lighting effects',
    tags: ['sci-fi', 'interior', 'lighting'],
    difficulty: 'intermediate',
  },
  {
    id: 'cityscape',
    title: 'Night Cityscape',
    prompt:
      'Create a cyberpunk city rooftop scene at night with neon signs, rain effects, distant skyscrapers, and a hovering drone',
    category: 'Scene Building',
    description: 'Complex city environment with weather and atmospheric effects',
    tags: ['city', 'night', 'cyberpunk', 'weather'],
    difficulty: 'advanced',
  },

  // ── Physics & Simulation ───────────────────────────────────────────────────
  {
    id: 'domino-chain',
    title: 'Domino Chain Reaction',
    prompt:
      'Set up a domino chain reaction with 50 dominoes in a spiral pattern that triggers when the first one is pushed',
    category: 'Physics & Simulation',
    description: 'Creates a physics-driven domino chain with triggers',
    tags: ['physics', 'dynamic', 'trigger'],
    difficulty: 'intermediate',
  },
  {
    id: 'marble-run',
    title: 'Marble Run Machine',
    prompt:
      'Build a Rube Goldberg machine marble run with ramps, loops, funnels, and a bell at the finish',
    category: 'Physics & Simulation',
    description: 'Complex physics simulation with multiple mechanical components',
    tags: ['physics', 'simulation', 'mechanical'],
    difficulty: 'advanced',
  },
  {
    id: 'explosion-sim',
    title: 'Explosion Effect',
    prompt:
      'Create a dramatic explosion with expanding fireball, debris particles, shockwave ring, and camera shake',
    category: 'Physics & Simulation',
    description: 'Particle-based explosion with multiple VFX layers',
    tags: ['particles', 'vfx', 'explosion'],
    difficulty: 'intermediate',
  },

  // ── Game Mechanics ─────────────────────────────────────────────────────────
  {
    id: 'platformer-level',
    title: 'Platformer Level',
    prompt:
      'Design a side-scrolling platformer level with moving platforms, spike traps, collectible coins, and a flagpole finish',
    category: 'Game Mechanics',
    description: 'Classic platformer game level with game logic',
    tags: ['game', 'platformer', 'level'],
    difficulty: 'intermediate',
  },
  {
    id: 'inventory-system',
    title: 'Inventory System',
    prompt:
      'Create an RPG inventory system with a 6x4 grid, item tooltips, drag-and-drop, and an equipment panel',
    category: 'Game Mechanics',
    description: 'UI-heavy game system with item management',
    tags: ['game', 'ui', 'rpg', 'inventory'],
    difficulty: 'advanced',
  },
  {
    id: 'npc-dialogue',
    title: 'NPC Dialogue Tree',
    prompt:
      'Create a merchant NPC with a branching dialogue tree: greet, show items, haggle, buy, and farewell paths',
    category: 'Game Mechanics',
    description: 'Interactive NPC with conversation branches',
    tags: ['npc', 'dialogue', 'interaction'],
    difficulty: 'intermediate',
  },

  // ── Visual Effects ──────────────────────────────────────────────────────────
  {
    id: 'aurora',
    title: 'Aurora Borealis',
    prompt:
      'Create a stunning aurora borealis effect with flowing green and purple curtains of light in a starry night sky',
    category: 'Visual Effects',
    description: 'Animated atmospheric light display',
    tags: ['vfx', 'sky', 'animation', 'nature'],
    difficulty: 'advanced',
  },
  {
    id: 'portal-effect',
    title: 'Magic Portal',
    prompt:
      'Build a swirling magic portal with a glowing ring, particle vortex, lens distortion effect, and ethereal sound',
    category: 'Visual Effects',
    description: 'Multi-layered magical effect with audio',
    tags: ['vfx', 'magic', 'particles', 'audio'],
    difficulty: 'advanced',
  },
  {
    id: 'fire-campfire',
    title: 'Campfire',
    prompt:
      'Create a realistic campfire with flickering flames, ember particles, crackling audio, and warm light that illuminates nearby logs',
    category: 'Visual Effects',
    description: 'Multi-sensory fire effect with lighting and audio',
    tags: ['fire', 'particles', 'audio', 'lighting'],
    difficulty: 'beginner',
  },

  // ── Architecture & Design ──────────────────────────────────────────────────
  {
    id: 'modern-house',
    title: 'Modern House',
    prompt:
      'Design a modern minimalist house with floor-to-ceiling windows, a flat roof, an open floor plan, and a pool deck',
    category: 'Architecture & Design',
    description: 'Architectural visualization of a modern residence',
    tags: ['architecture', 'modern', 'interior'],
    difficulty: 'intermediate',
  },
  {
    id: 'museum-exhibit',
    title: 'Museum Exhibition',
    prompt:
      'Create a museum exhibition space with pedestals for 3D sculptures, spotlighting, info plaques, and an interactive tour guide path',
    category: 'Architecture & Design',
    description: 'Gallery space with display and interactive elements',
    tags: ['museum', 'gallery', 'exhibition'],
    difficulty: 'intermediate',
  },

  // ── Modify & Enhance ──────────────────────────────────────────────────────
  {
    id: 'add-physics',
    title: 'Add Physics to Scene',
    prompt:
      'Add realistic physics to every object in the current scene: make the floor static, all boxes dynamic with mass, and spheres bouncy',
    category: 'Modify & Enhance',
    description: 'Retrofits physics traits onto existing scene objects',
    tags: ['physics', 'modify', 'traits'],
    difficulty: 'beginner',
  },
  {
    id: 'add-lighting',
    title: 'Improve Lighting',
    prompt:
      'Replace the current lighting with cinematic three-point lighting: key light from above-right, fill light from left, and a rim light from behind',
    category: 'Modify & Enhance',
    description: 'Upgrades scene lighting to professional quality',
    tags: ['lighting', 'modify', 'cinematic'],
    difficulty: 'beginner',
  },
  {
    id: 'make-interactive',
    title: 'Make Scene Interactive',
    prompt:
      'Add click interactions to every object: clicking an object should highlight it, show its name, and play a subtle sound effect',
    category: 'Modify & Enhance',
    description: 'Adds interactivity to existing scene elements',
    tags: ['interaction', 'modify', 'ui'],
    difficulty: 'intermediate',
  },

  // ── Learning & Reference ───────────────────────────────────────────────────
  {
    id: 'explain-traits',
    title: 'Explain All Traits',
    prompt:
      'List every @-trait available in HoloScript with a one-line description and example usage for each',
    category: 'Learning & Reference',
    description: 'Reference guide for all available HoloScript traits',
    tags: ['reference', 'learning', 'documentation'],
    difficulty: 'beginner',
  },
  {
    id: 'explain-code',
    title: 'Explain My Code',
    prompt:
      'Explain what the current scene code does line by line, including what each trait does and how the objects relate to each other',
    category: 'Learning & Reference',
    description: 'Code walkthrough of the current scene',
    tags: ['learning', 'explanation', 'documentation'],
    difficulty: 'beginner',
  },
];

const CATEGORIES = [...new Set(PROMPTS.map((p) => p.category))];

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').toLowerCase();
  const category = request.nextUrl.searchParams.get('category') ?? '';
  const difficulty = request.nextUrl.searchParams.get('difficulty') ?? '';

  let results = PROMPTS;
  if (category) results = results.filter((p) => p.category === category);
  if (difficulty) results = results.filter((p) => p.difficulty === difficulty);
  if (q) {
    results = results.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.prompt.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.includes(q))
    );
  }

  return Response.json({
    prompts: results,
    categories: CATEGORIES,
    total: results.length,
  });
}
