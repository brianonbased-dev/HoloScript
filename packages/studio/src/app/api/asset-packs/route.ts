export const maxDuration = 300;

import { NextRequest } from 'next/server';

/**
 * GET /api/asset-packs
 * Returns 6 curated asset pack catalogs. Each pack contains
 * scene-node definitions ready to inject into HoloScript code.
 */

export interface AssetPackItem {
  id: string;
  name: string;
  type: 'mesh' | 'light' | 'camera' | 'group' | 'audio';
  emoji: string;
  traitSnippet: string;
}

export interface AssetPack {
  id: string;
  name: string;
  category: 'sci-fi' | 'fantasy' | 'nature' | 'urban' | 'abstract' | 'vr-ui';
  description: string;
  emoji: string;
  author: string;
  itemCount: number;
  tags: string[];
  items: AssetPackItem[];
}

const PACKS: AssetPack[] = [
  {
    id: 'sci-fi-station',
    name: 'Sci-Fi Station',
    category: 'sci-fi',
    emoji: '🛸',
    description:
      'Modular space station components: corridors, airlocks, control panels, and reactor cores',
    author: 'HoloScript Labs',
    itemCount: 6,
    tags: ['space', 'futuristic', 'interior'],
    items: [
      {
        id: 'corridor',
        name: 'Corridor Segment',
        type: 'mesh',
        emoji: '🚪',
        traitSnippet: `object "Corridor" {\n  @transform { position: [0, 0, 0] scale: [1, 1, 1] }\n  @material { albedo: "#223344" metallic: 0.9 roughness: 0.3 emissive: "#00aaff" emissiveIntensity: 0.3 }\n  @physics { type: static }\n}`,
      },
      {
        id: 'reactor',
        name: 'Reactor Core',
        type: 'mesh',
        emoji: '⚛️',
        traitSnippet: `object "Reactor_Core" {\n  @transform { position: [0, 1, 0] scale: [0.8, 0.8, 0.8] }\n  @material { albedo: "#001122" emissive: "#00ffcc" emissiveIntensity: 2.0 roughness: 0.1 metallic: 1.0 }\n  @audio { src: "reactor_hum.ogg" loop: true volume: 0.3 spatial: true }\n}`,
      },
      {
        id: 'airlock',
        name: 'Airlock Door',
        type: 'mesh',
        emoji: '🔒',
        traitSnippet: `object "Airlock" {\n  @transform { position: [0, 0, -2] }\n  @material { albedo: "#334455" metallic: 0.95 roughness: 0.2 }\n  @physics { type: kinematic }\n  @animation { idle: "door_closed" open: "door_open" trigger: "proximity" }\n}`,
      },
      {
        id: 'control-panel',
        name: 'Control Panel',
        type: 'mesh',
        emoji: '🖥️',
        traitSnippet: `object "Control_Panel" {\n  @transform { position: [0, 0.9, 0] rotation: [0, 0, 0] }\n  @material { albedo: "#112233" emissive: "#0066ff" emissiveIntensity: 0.8 }\n  @lod { levels: [5, 20, 60] }\n}`,
      },
      {
        id: 'station-light',
        name: 'Station Accent Light',
        type: 'light',
        emoji: '💡',
        traitSnippet: `light "Station_Light" {\n  @transform { position: [0, 3, 0] }\n  @light { type: point color: "#0088ff" intensity: 2.0 range: 12 castShadow: true }\n}`,
      },
      {
        id: 'escape-pod',
        name: 'Escape Pod',
        type: 'mesh',
        emoji: '🚀',
        traitSnippet: `object "Escape_Pod" {\n  @transform { position: [4, 0, 0] }\n  @material { albedo: "#ccddee" metallic: 0.7 roughness: 0.4 }\n  @physics { type: dynamic mass: 800 }\n  @lod { levels: [10, 40, 120] }\n}`,
      },
    ],
  },
  {
    id: 'fantasy-village',
    name: 'Fantasy Village',
    category: 'fantasy',
    emoji: '🏰',
    description: 'Medieval village props: market stalls, torches, barrels, and ancient ruins',
    author: 'HoloScript Labs',
    itemCount: 5,
    tags: ['medieval', 'village', 'outdoor'],
    items: [
      {
        id: 'market-stall',
        name: 'Market Stall',
        type: 'mesh',
        emoji: '🏪',
        traitSnippet: `object "Market_Stall" {\n  @transform { position: [0, 0, 0] }\n  @material { albedo: "#8B4513" roughness: 0.9 }\n  @physics { type: static }\n}`,
      },
      {
        id: 'torch',
        name: 'Wall Torch',
        type: 'mesh',
        emoji: '🔥',
        traitSnippet: `object "Wall_Torch" {\n  @transform { position: [0, 1.5, 0] }\n  @material { albedo: "#4a3000" }\n  @particles { type: fire rate: 30 lifetime: 0.4 size: 0.15 color: "#ff6600" }\n  @audio { src: "fire_crackle.ogg" loop: true volume: 0.2 spatial: true }\n}`,
      },
      {
        id: 'barrel',
        name: 'Wooden Barrel',
        type: 'mesh',
        emoji: '🛢️',
        traitSnippet: `object "Barrel" {\n  @transform { position: [0, 0, 0] }\n  @material { albedo: "#6B3A2A" roughness: 0.95 }\n  @physics { type: dynamic mass: 30 restitution: 0.3 }\n}`,
      },
      {
        id: 'ruins',
        name: 'Ancient Ruins',
        type: 'group',
        emoji: '🏚️',
        traitSnippet: `group "Ancient_Ruins" {\n  @transform { position: [0, 0, 0] }\n  @lod { levels: [15, 50, 150] }\n  @physics { type: static }\n}`,
      },
      {
        id: 'magic-well',
        name: 'Magic Wishing Well',
        type: 'mesh',
        emoji: '✨',
        traitSnippet: `object "Magic_Well" {\n  @transform { position: [0, 0, 0] }\n  @material { albedo: "#556677" emissive: "#44aaff" emissiveIntensity: 0.6 }\n  @particles { type: sparkle rate: 8 lifetime: 1.5 color: "#aaddff" }\n}`,
      },
    ],
  },
  {
    id: 'nature-pack',
    name: 'Nature & Flora',
    category: 'nature',
    emoji: '🌿',
    description: 'Trees, rocks, grass patches, water planes, and ambient wildlife sounds',
    author: 'HoloScript Labs',
    itemCount: 5,
    tags: ['outdoor', 'nature', 'vegetation'],
    items: [
      {
        id: 'oak-tree',
        name: 'Oak Tree',
        type: 'mesh',
        emoji: '🌳',
        traitSnippet: `object "Oak_Tree" {\n  @transform { position: [0, 0, 0] scale: [1.2, 1.2, 1.2] }\n  @material { albedo: "#3d6b35" roughness: 0.95 }\n  @physics { type: static }\n  @lod { levels: [8, 30, 100] }\n}`,
      },
      {
        id: 'boulder',
        name: 'Mossy Boulder',
        type: 'mesh',
        emoji: '🪨',
        traitSnippet: `object "Boulder" {\n  @transform { position: [0, 0, 0] }\n  @material { albedo: "#556644" roughness: 1.0 normal: "mossy_rock_n.png" }\n  @physics { type: static }\n}`,
      },
      {
        id: 'water-plane',
        name: 'Water Plane',
        type: 'mesh',
        emoji: '💧',
        traitSnippet: `object "Water" {\n  @transform { position: [0, -0.1, 0] scale: [20, 1, 20] }\n  @material { albedo: "#1a6688" opacity: 0.75 roughness: 0.05 metallic: 0.0 }\n  @animation { shader: "wave_displacement" speed: 0.3 }\n}`,
      },
      {
        id: 'grass-patch',
        name: 'Grass Patch',
        type: 'mesh',
        emoji: '🌱',
        traitSnippet: `object "Grass_Patch" {\n  @transform { position: [0, 0, 0] scale: [3, 1, 3] }\n  @material { albedo: "#4a7a30" roughness: 1.0 alphaTest: 0.5 }\n  @physics { type: static }\n}`,
      },
      {
        id: 'ambient-birds',
        name: 'Bird Ambience',
        type: 'audio',
        emoji: '🐦',
        traitSnippet: `object "Bird_Ambience" {\n  @transform { position: [0, 5, 0] }\n  @audio { src: "birds.ogg" loop: true volume: 0.4 spatial: true maxDistance: 50 randomizePitch: 0.2 }\n}`,
      },
    ],
  },
  {
    id: 'urban-city',
    name: 'Urban City',
    category: 'urban',
    emoji: '🏙️',
    description:
      'City props: streetlights, benches, traffic signals, dumpsters, and distant crowd audio',
    author: 'HoloScript Labs',
    itemCount: 5,
    tags: ['city', 'street', 'modern'],
    items: [
      {
        id: 'streetlight',
        name: 'Street Light',
        type: 'mesh',
        emoji: '🔦',
        traitSnippet: `object "Streetlight" {\n  @transform { position: [0, 0, 0] }\n  @material { albedo: "#333333" metallic: 0.8 roughness: 0.4 }\n  @light { type: spot color: "#ffeecc" intensity: 3.0 angle: 60 range: 20 }\n}`,
      },
      {
        id: 'bench',
        name: 'Park Bench',
        type: 'mesh',
        emoji: '🪑',
        traitSnippet: `object "Bench" {\n  @transform { position: [0, 0, 0] }\n  @material { albedo: "#7a5c3a" roughness: 0.85 }\n  @physics { type: static }\n}`,
      },
      {
        id: 'traffic-light',
        name: 'Traffic Signal',
        type: 'mesh',
        emoji: '🚦',
        traitSnippet: `object "Traffic_Signal" {\n  @transform { position: [0, 0, 0] }\n  @material { albedo: "#222222" metallic: 0.7 }\n  @animation { cycle: "traffic_lights" interval: 5000 }\n}`,
      },
      {
        id: 'dumpster',
        name: 'Dumpster',
        type: 'mesh',
        emoji: '🗑️',
        traitSnippet: `object "Dumpster" {\n  @transform { position: [0, 0, 0] }\n  @material { albedo: "#2a5c2a" roughness: 0.9 metallic: 0.3 }\n  @physics { type: dynamic mass: 200 }\n}`,
      },
      {
        id: 'crowd-sound',
        name: 'City Crowd Audio',
        type: 'audio',
        emoji: '👥',
        traitSnippet: `object "City_Crowd" {\n  @transform { position: [0, 0, 0] }\n  @audio { src: "city_crowd.ogg" loop: true volume: 0.25 spatial: false }\n}`,
      },
    ],
  },
  {
    id: 'abstract-gallery',
    name: 'Abstract Gallery',
    category: 'abstract',
    emoji: '🎨',
    description:
      'Geometric art installations: floating cubes, plasma orbs, mirror planes, light pillars',
    author: 'HoloScript Labs',
    itemCount: 4,
    tags: ['art', 'geometric', 'abstract'],
    items: [
      {
        id: 'plasma-orb',
        name: 'Plasma Orb',
        type: 'mesh',
        emoji: '🔮',
        traitSnippet: `object "Plasma_Orb" {\n  @transform { position: [0, 1.5, 0] }\n  @material { fragmentShader: "plasma" roughness: 0.0 metallic: 0.5 }\n  @animation { rotate: [0, 30, 0] loop: true }\n}`,
      },
      {
        id: 'mirror-plane',
        name: 'Mirror Plane',
        type: 'mesh',
        emoji: '🪞',
        traitSnippet: `object "Mirror_Plane" {\n  @transform { position: [0, 1, 0] scale: [3, 2, 0.02] }\n  @material { albedo: "#aaaaaa" metallic: 1.0 roughness: 0.02 envMapIntensity: 2.0 }\n}`,
      },
      {
        id: 'light-pillar',
        name: 'Light Pillar',
        type: 'light',
        emoji: '💫',
        traitSnippet: `light "Light_Pillar" {\n  @transform { position: [0, 4, 0] }\n  @light { type: spot color: "#ff00ff" intensity: 8.0 angle: 15 range: 30 castShadow: true }\n}`,
      },
      {
        id: 'floating-cube',
        name: 'Floating Cube',
        type: 'mesh',
        emoji: '📦',
        traitSnippet: `object "Floating_Cube" {\n  @transform { position: [0, 2, 0] }\n  @material { fragmentShader: "fresnel" uPower: 4.0 rimColor: "#ff44ff" opacity: 0.7 }\n  @animation { float: { amplitude: 0.3 frequency: 0.5 } rotate: [0, 45, 0] loop: true }\n}`,
      },
    ],
  },
  {
    id: 'vr-ui',
    name: 'VR UI Kit',
    category: 'vr-ui',
    emoji: '🥽',
    description:
      'Spatial UI elements: floating panels, hand menus, progress rings, notification popups',
    author: 'HoloScript Labs',
    itemCount: 4,
    tags: ['vr', 'ui', 'xr', 'spatial'],
    items: [
      {
        id: 'floating-panel',
        name: 'Floating Info Panel',
        type: 'mesh',
        emoji: '🪟',
        traitSnippet: `object "Floating_Panel" {\n  @transform { position: [0, 1.5, -1] }\n  @material { albedo: "#111122" opacity: 0.85 emissive: "#2244ff" emissiveIntensity: 0.4 }\n  @xr { billboard: true followGaze: false }\n}`,
      },
      {
        id: 'progress-ring',
        name: 'Progress Ring',
        type: 'mesh',
        emoji: '⭕',
        traitSnippet: `object "Progress_Ring" {\n  @transform { position: [0, 1.5, -0.5] scale: [0.3, 0.3, 0.3] }\n  @material { fragmentShader: "fresnel" uPower: 2.0 rimColor: "#00aaff" opacity: 0.9 }\n  @xr { interactable: true }\n}`,
      },
      {
        id: 'hand-menu',
        name: 'Hand Menu Anchor',
        type: 'group',
        emoji: '🤚',
        traitSnippet: `group "Hand_Menu" {\n  @transform { position: [0, 0, 0] }\n  @xr { attachTo: "leftWrist" billboard: false }\n}`,
      },
      {
        id: 'notification',
        name: 'Notification Toast',
        type: 'mesh',
        emoji: '🔔',
        traitSnippet: `object "Notification" {\n  @transform { position: [0, 2, -0.8] }\n  @material { albedo: "#001122" emissive: "#00ffcc" emissiveIntensity: 0.6 opacity: 0.9 }\n  @xr { billboard: true lifespan: 3000 fadeOut: 500 }\n}`,
      },
    ],
  },
];

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.toLowerCase() ?? '';
  const category = request.nextUrl.searchParams.get('category') ?? '';
  let results: AssetPack[] = PACKS;
  if (category) results = results.filter((p) => p.category === category);
  if (q)
    results = results.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.includes(q))
    );
  const categories = [...new Set(PACKS.map((p) => p.category))];
  return Response.json({ packs: results, total: results.length, categories });
}


export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
