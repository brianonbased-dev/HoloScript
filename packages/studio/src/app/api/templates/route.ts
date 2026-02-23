import { NextRequest } from 'next/server';

/**
 * GET /api/templates?category=&q=
 * Returns paginated HoloScript scene templates organized by category.
 */

type TemplateCategory = 'environment' | 'architecture' | 'sci-fi' | 'fantasy' | 'minimal' | 'game';

interface SceneTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  tags: string[];
  description: string;
  thumbnail: string;
  code: string;
  objectCount: number;
  complexity: 'simple' | 'medium' | 'complex';
}

const TEMPLATES: SceneTemplate[] = [
  {
    id: 'tpl-desert-ruins',
    name: 'Desert Ruins',
    category: 'environment',
    tags: ['outdoor', 'ancient', 'desert', 'ruins'],
    description: 'Wind-worn sandstone columns rising from golden dunes at dusk.',
    thumbnail: '',
    complexity: 'medium',
    objectCount: 6,
    code: `scene "Desert Ruins" {\n  @environment(sky: "desert_dusk", fog: 0.02)\n}\n\nobject "Ground" {\n  @mesh(src: "plane.glb")\n  @material(color: "#c2956a", roughness: 0.9)\n  @transform(scale: [20, 1, 20])\n}\n\nobject "Column A" {\n  @mesh(src: "column.glb")\n  @material(color: "#b8865a", roughness: 0.8)\n  @transform(position: [3, 0, 0], rotation: [0, 15, 0], scale: [1, 2.5, 1])\n}\n\nobject "Column B" {\n  @mesh(src: "column.glb")\n  @material(color: "#c09070", roughness: 0.85)\n  @transform(position: [-2, 0, 4], rotation: [0, -20, 3], scale: [0.9, 2.0, 0.9])\n}\n\nobject "Arch" {\n  @mesh(src: "arch.glb")\n  @material(color: "#b07050", roughness: 0.9)\n  @transform(position: [0, 0, -5], scale: [2, 2, 1])\n}\n\nobject "Sand Dune" {\n  @mesh(src: "dune.glb")\n  @material(color: "#d4a872", roughness: 1.0)\n  @transform(position: [8, -0.5, 3], scale: [4, 1.5, 3])\n}\n`,
  },
  {
    id: 'tpl-cyberpunk-alley',
    name: 'Cyberpunk Alley',
    category: 'sci-fi',
    tags: ['urban', 'night', 'neon', 'cyberpunk', 'rain'],
    description: 'Neon-lit back alley with rain puddles and holographic signs.',
    thumbnail: '',
    complexity: 'complex',
    objectCount: 8,
    code: `scene "Cyberpunk Alley" {\n  @environment(sky: "night_city", fog: 0.05, fogColor: "#0a0020")\n  @postprocess(bloom: 0.8, chromaticAberration: 0.02)\n}\n\nobject "Ground" {\n  @mesh(src: "concrete.glb")\n  @material(color: "#1a1a2e", roughness: 0.3, metalness: 0.1)\n  @transform(scale: [10, 0.1, 20])\n}\n\nobject "Left Wall" {\n  @mesh(src: "wall.glb")\n  @material(color: "#111122", roughness: 0.7)\n  @transform(position: [-5, 3, 0], scale: [0.2, 6, 20])\n}\n\nobject "Neon Sign A" {\n  @mesh(src: "neon_sign.glb")\n  @material(color: "#ff006e", emissive: "#ff006e", emissiveIntensity: 3)\n  @transform(position: [-4.5, 4, -3], rotation: [0, 90, 0])\n}\n\nobject "Neon Sign B" {\n  @mesh(src: "neon_sign.glb")\n  @material(color: "#00f5ff", emissive: "#00f5ff", emissiveIntensity: 2.5)\n  @transform(position: [-4.5, 2.5, -7], rotation: [0, 90, 0], scale: [0.7, 0.7, 0.7])\n}\n\nobject "Rain Puddle" {\n  @mesh(src: "plane.glb")\n  @material(color: "#0a0a1a", roughness: 0.0, metalness: 0.8, envMapIntensity: 2)\n  @transform(position: [0, 0.02, 0], scale: [4, 1, 6])\n}\n\nobject "Trash Cans" {\n  @mesh(src: "trash_can.glb")\n  @material(color: "#333344", roughness: 0.8)\n  @transform(position: [3, 0.5, -2], scale: [0.8, 0.8, 0.8])\n}\n`,
  },
  {
    id: 'tpl-japanese-garden',
    name: 'Japanese Garden',
    category: 'environment',
    tags: ['nature', 'zen', 'outdoor', 'peaceful'],
    description: 'Serene stone garden with cherry blossom tree and koi pond.',
    thumbnail: '',
    complexity: 'medium',
    objectCount: 5,
    code: `scene "Japanese Garden" {\n  @environment(sky: "overcast_soft", ambient: "#fff5ee", ambientIntensity: 0.6)\n}\n\nobject "Stone Ground" {\n  @mesh(src: "gravel.glb")\n  @material(color: "#9e9e8e", roughness: 1.0)\n  @transform(scale: [12, 0.05, 12])\n}\n\nobject "Cherry Tree" {\n  @mesh(src: "cherry_tree.glb")\n  @material(color: "#f4a5c0")\n  @transform(position: [-3, 0, -2], scale: [1.5, 1.5, 1.5])\n}\n\nobject "Koi Pond" {\n  @mesh(src: "pond.glb")\n  @material(color: "#2d4a6e", roughness: 0.05, metalness: 0.1)\n  @transform(position: [2, 0, 1], scale: [2.5, 0.2, 3])\n}\n\nobject "Stone Lantern" {\n  @mesh(src: "lantern.glb")\n  @material(color: "#888877", roughness: 0.95)\n  @transform(position: [0, 0, -4])\n}\n\nobject "Wooden Bridge" {\n  @mesh(src: "bridge.glb")\n  @material(color: "#6b4423", roughness: 0.8)\n  @transform(position: [2, 0.1, 1], rotation: [0, 90, 0], scale: [1, 1, 0.8])\n}\n`,
  },
  {
    id: 'tpl-space-station',
    name: 'Space Station Interior',
    category: 'sci-fi',
    tags: ['interior', 'space', 'futuristic', 'metal'],
    description: 'Modular corridor with glowing panels, airlock, and observation window.',
    thumbnail: '',
    complexity: 'complex',
    objectCount: 7,
    code: `scene "Space Station Interior" {\n  @environment(sky: "space_hdri", ambient: "#0a1428", ambientIntensity: 0.3)\n}\n\nobject "Floor Plate" {\n  @mesh(src: "grid_floor.glb")\n  @material(color: "#1c2333", roughness: 0.3, metalness: 0.9)\n  @transform(scale: [8, 0.1, 12])\n}\n\nobject "Wall Panel Left" {\n  @mesh(src: "panel.glb")\n  @material(color: "#242d40", roughness: 0.4, metalness: 0.8)\n  @transform(position: [-4, 2, 0], scale: [0.1, 4, 12])\n}\n\nobject "Glowing Strip" {\n  @mesh(src: "strip_light.glb")\n  @material(color: "#4488ff", emissive: "#4488ff", emissiveIntensity: 2)\n  @transform(position: [0, 3.8, 0], scale: [8, 0.1, 0.2])\n}\n\nobject "Display Screen" {\n  @mesh(src: "screen.glb")\n  @material(color: "#0a2040", emissive: "#1a6aff", emissiveIntensity: 0.5)\n  @transform(position: [-3.9, 2, -3], rotation: [0, 90, 0], scale: [2, 1.5, 0.05])\n}\n\nobject "Airlock Door" {\n  @mesh(src: "airlock.glb")\n  @material(color: "#2a3a50", roughness: 0.2, metalness: 1.0)\n  @transform(position: [0, 2, -6], scale: [3, 4, 0.3])\n}\n\nobject "Observation Window" {\n  @mesh(src: "window_frame.glb")\n  @material(color: "#1a2a3a", roughness: 0.1, metalness: 0.9)\n  @transform(position: [3.9, 2.5, 2], rotation: [0, -90, 0], scale: [3, 2, 0.1])\n}\n`,
  },
  {
    id: 'tpl-medieval-castle',
    name: 'Castle Courtyard',
    category: 'fantasy',
    tags: ['medieval', 'castle', 'stone', 'outdoor'],
    description: 'Fortified courtyard with towers, torchlight, and a well.',
    thumbnail: '',
    complexity: 'complex',
    objectCount: 6,
    code: `scene "Castle Courtyard" {\n  @environment(sky: "sunset_orange", ambient: "#ff9944", ambientIntensity: 0.4)\n}\n\nobject "Cobblestone Floor" {\n  @mesh(src: "cobblestone.glb")\n  @material(color: "#776655", roughness: 0.95)\n  @transform(scale: [15, 0.1, 15])\n}\n\nobject "Tower A" {\n  @mesh(src: "tower.glb")\n  @material(color: "#887766", roughness: 0.9)\n  @transform(position: [6, 5, 6], scale: [2, 10, 2])\n}\n\nobject "Tower B" {\n  @mesh(src: "tower.glb")\n  @material(color: "#887766", roughness: 0.9)\n  @transform(position: [-6, 5, 6], scale: [2, 10, 2])\n}\n\nobject "Stone Well" {\n  @mesh(src: "well.glb")\n  @material(color: "#665544", roughness: 0.9)\n  @transform(position: [0, 0, 0], scale: [1.2, 1.2, 1.2])\n}\n\nobject "Torch A" {\n  @mesh(src: "torch.glb")\n  @material(color: "#884422", emissive: "#ff6600", emissiveIntensity: 2)\n  @transform(position: [4, 2, 0])\n  @pointLight(color: "#ff6600", intensity: 3, distance: 6)\n}\n`,
  },
  {
    id: 'tpl-minimal-showcase',
    name: 'Minimal Showcase',
    category: 'minimal',
    tags: ['clean', 'product', 'studio', 'white'],
    description: 'Clean white studio environment for showcasing 3D objects.',
    thumbnail: '',
    complexity: 'simple',
    objectCount: 3,
    code: `scene "Minimal Showcase" {\n  @environment(sky: "studio_white", ambient: "#ffffff", ambientIntensity: 1.0)\n}\n\nobject "Platform" {\n  @mesh(src: "cylinder.glb")\n  @material(color: "#f5f5f5", roughness: 0.1, metalness: 0.0)\n  @transform(position: [0, -0.5, 0], scale: [3, 0.2, 3])\n}\n\nobject "Subject" {\n  @mesh(src: "sphere.glb")\n  @material(color: "#ffffff", roughness: 0.05, metalness: 0.9)\n  @transform(position: [0, 0.5, 0], scale: [1.2, 1.2, 1.2])\n}\n\nobject "Key Light" {\n  @directionalLight(color: "#fff8e8", intensity: 2, position: [5, 8, 3])\n}\n`,
  },
  {
    id: 'tpl-platformer-level',
    name: 'Platformer Level',
    category: 'game',
    tags: ['game', 'platformer', 'level', 'blocks'],
    description: 'Classic side-scrolling platformer stage with floating platforms and collectibles.',
    thumbnail: '',
    complexity: 'medium',
    objectCount: 7,
    code: `scene "Platformer Level 1" {\n  @environment(sky: "blue_gradient", ambient: "#aaccff", ambientIntensity: 0.8)\n}\n\nobject "Ground Platform" {\n  @mesh(src: "platform.glb")\n  @material(color: "#4a8c3f", roughness: 0.8)\n  @transform(position: [0, -1, 0], scale: [12, 0.5, 2])\n}\n\nobject "Platform A" {\n  @mesh(src: "platform.glb")\n  @material(color: "#5a9c4f", roughness: 0.7)\n  @transform(position: [-3, 1.5, 0], scale: [2.5, 0.4, 2])\n}\n\nobject "Platform B" {\n  @mesh(src: "platform.glb")\n  @material(color: "#5a9c4f", roughness: 0.7)\n  @transform(position: [2, 3, 0], scale: [3, 0.4, 2])\n}\n\nobject "Coin A" {\n  @mesh(src: "coin.glb")\n  @material(color: "#ffd700", emissive: "#ffaa00", emissiveIntensity: 0.5)\n  @transform(position: [-3, 2.5, 0], rotation: [0, 0, 0], scale: [0.4, 0.4, 0.4])\n  @spin(axis: "y", speed: 90)\n}\n\nobject "Coin B" {\n  @mesh(src: "coin.glb")\n  @material(color: "#ffd700", emissive: "#ffaa00", emissiveIntensity: 0.5)\n  @transform(position: [2, 4, 0], scale: [0.4, 0.4, 0.4])\n  @spin(axis: "y", speed: 90)\n}\n\nobject "Flag Pole" {\n  @mesh(src: "flagpole.glb")\n  @material(color: "#cc3333")\n  @transform(position: [5.5, 0, 0], scale: [0.15, 4, 0.15])\n}\n`,
  },
  {
    id: 'tpl-underwater',
    name: 'Underwater Scene',
    category: 'environment',
    tags: ['underwater', 'ocean', 'coral', 'nature'],
    description: 'Deep-sea coral reef with bioluminescent plants and drifting particles.',
    thumbnail: '',
    complexity: 'complex',
    objectCount: 6,
    code: `scene "Underwater Reef" {\n  @environment(sky: "underwater", fog: 0.08, fogColor: "#003a5c", ambient: "#005580", ambientIntensity: 0.5)\n  @postprocess(bloom: 0.4)\n}\n\nobject "Sea Floor" {\n  @mesh(src: "sand.glb")\n  @material(color: "#c8b89a", roughness: 1.0)\n  @transform(position: [0, -3, 0], scale: [15, 0.2, 15])\n}\n\nobject "Coral Cluster" {\n  @mesh(src: "coral.glb")\n  @material(color: "#ff6b35", emissive: "#ff3300", emissiveIntensity: 0.3)\n  @transform(position: [2, -2.5, -1], scale: [1.5, 1.5, 1.5])\n}\n\nobject "Sea Anemone" {\n  @mesh(src: "anemone.glb")\n  @material(color: "#ff1493", emissive: "#ff0066", emissiveIntensity: 0.8)\n  @transform(position: [-2, -2.8, 2])\n  @wave(amplitude: 0.1, frequency: 1.2)\n}\n\nobject "Kelp Forest" {\n  @mesh(src: "kelp.glb")\n  @material(color: "#2d6a2d")\n  @transform(position: [0, -2, -4], scale: [1, 2, 1])\n  @wave(amplitude: 0.15, frequency: 0.8)\n}\n\nobject "Glowing Orb" {\n  @mesh(src: "sphere.glb")\n  @material(color: "#aaffee", emissive: "#00ffcc", emissiveIntensity: 3)\n  @transform(position: [-3, 0, -2], scale: [0.3, 0.3, 0.3])\n  @float(amplitude: 0.5, speed: 0.5)\n}\n`,
  },
];

declare global { var __templateCatalog__: SceneTemplate[] | undefined; }
const catalog = globalThis.__templateCatalog__ ?? (globalThis.__templateCatalog__ = [...TEMPLATES]);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get('q')?.toLowerCase() ?? '';
  const category = searchParams.get('category') as TemplateCategory | null;

  let results = catalog;
  if (q) results = results.filter((t) => t.name.toLowerCase().includes(q) || t.tags.some((tag) => tag.includes(q)));
  if (category) results = results.filter((t) => t.category === category);

  const categories = [...new Set(catalog.map((t) => t.category))];
  return Response.json({ templates: results, total: results.length, categories });
}
