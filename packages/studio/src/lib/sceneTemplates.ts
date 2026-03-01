/**
 * sceneTemplates.ts — Pre-built Scene Templates
 *
 * Template definitions that users can browse and clone to kickstart projects.
 */

export interface SceneTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  thumbnail: string;           // URL or data URI
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  estimatedObjects: number;
  holoScript: string;          // HoloScript source code
  featured: boolean;
}

export type TemplateCategory =
  | 'architecture' | 'game' | 'education' | 'medical'
  | 'retail' | 'art' | 'simulation' | 'social'
  | 'industrial' | 'nature' | 'sci-fi' | 'starter';

export const SCENE_TEMPLATES: SceneTemplate[] = [
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
];

/**
 * Get templates by category.
 */
export function templatesByCategory(category: TemplateCategory): SceneTemplate[] {
  return SCENE_TEMPLATES.filter(t => t.category === category);
}

/**
 * Get featured templates.
 */
export function featuredTemplates(): SceneTemplate[] {
  return SCENE_TEMPLATES.filter(t => t.featured);
}

/**
 * Search templates by name or tags.
 */
export function searchTemplates(query: string): SceneTemplate[] {
  const q = query.toLowerCase();
  return SCENE_TEMPLATES.filter(t =>
    t.name.toLowerCase().includes(q)
    || t.tags.some(tag => tag.includes(q))
    || t.description.toLowerCase().includes(q)
  );
}

/**
 * Get all unique categories.
 */
export function templateCategories(): TemplateCategory[] {
  return [...new Set(SCENE_TEMPLATES.map(t => t.category))];
}
