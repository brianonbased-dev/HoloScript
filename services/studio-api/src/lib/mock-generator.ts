/**
 * Mock AI Generator — produces valid HoloScript compositions from keyword analysis.
 * Zero LLM required. Works offline, in production, everywhere.
 *
 * Strategy: Parse the prompt for keywords → pick matching objects, traits, materials,
 * and environment → compose a valid .holo composition.
 */

// ─── Object Vocabulary ──────────────────────────────────────────────────────

interface ObjectDef {
  keywords: string[];
  name: string;
  geometry: string;
  traits: string[];
  material: string;
  color: string;
  scaleRange: [number, number];
}

const OBJECT_DEFS: ObjectDef[] = [
  // Nature
  {
    keywords: ['tree', 'oak', 'forest', 'woods'],
    name: 'Tree Trunk',
    geometry: 'cylinder',
    traits: ['collidable'],
    material: 'wood',
    color: '#5c3a1e',
    scaleRange: [0.5, 1.2],
  },
  {
    keywords: ['tree', 'oak', 'forest', 'woods'],
    name: 'Tree Crown',
    geometry: 'sphere',
    traits: [],
    material: 'matte',
    color: '#2d5a1e',
    scaleRange: [2, 4],
  },
  {
    keywords: ['rock', 'stone', 'boulder'],
    name: 'Rock',
    geometry: 'sphere',
    traits: ['collidable'],
    material: 'stone',
    color: '#777777',
    scaleRange: [0.3, 1.5],
  },
  {
    keywords: ['flower', 'plant', 'garden'],
    name: 'Flower',
    geometry: 'sphere',
    traits: ['clickable'],
    material: 'matte',
    color: '#ff6699',
    scaleRange: [0.1, 0.4],
  },
  {
    keywords: ['mushroom', 'fungus'],
    name: 'Mushroom',
    geometry: 'sphere',
    traits: ['glowing', 'clickable'],
    material: 'emissive',
    color: '#ff66ff',
    scaleRange: [0.2, 0.5],
  },
  {
    keywords: ['water', 'lake', 'pond', 'pool'],
    name: 'Water Surface',
    geometry: 'cylinder',
    traits: [],
    material: 'water',
    color: '#006994',
    scaleRange: [2, 5],
  },
  {
    keywords: ['grass', 'ground', 'floor', 'terrain'],
    name: 'Ground',
    geometry: 'plane',
    traits: ['collidable'],
    material: 'matte',
    color: '#2a5a1a',
    scaleRange: [15, 25],
  },

  // Architecture
  {
    keywords: ['wall', 'building', 'house', 'room'],
    name: 'Wall',
    geometry: 'cube',
    traits: ['collidable'],
    material: 'stone',
    color: '#aaaaaa',
    scaleRange: [3, 6],
  },
  {
    keywords: ['pillar', 'column'],
    name: 'Pillar',
    geometry: 'cylinder',
    traits: ['collidable'],
    material: 'marble',
    color: '#f0e6d0',
    scaleRange: [0.3, 0.8],
  },
  {
    keywords: ['door', 'gate', 'entrance', 'portal'],
    name: 'Portal',
    geometry: 'torus',
    traits: ['glowing', 'clickable'],
    material: 'emissive',
    color: '#6633ff',
    scaleRange: [1, 2],
  },
  {
    keywords: ['window'],
    name: 'Window',
    geometry: 'plane',
    traits: [],
    material: 'glass',
    color: '#aaddff',
    scaleRange: [1, 2],
  },
  {
    keywords: ['roof', 'top'],
    name: 'Roof',
    geometry: 'cone',
    traits: ['collidable'],
    material: 'wood',
    color: '#8b4513',
    scaleRange: [3, 5],
  },
  {
    keywords: ['bridge'],
    name: 'Bridge',
    geometry: 'cube',
    traits: ['collidable'],
    material: 'stone',
    color: '#888888',
    scaleRange: [5, 10],
  },
  {
    keywords: ['tower', 'spire', 'castle'],
    name: 'Tower',
    geometry: 'cylinder',
    traits: ['collidable'],
    material: 'stone',
    color: '#999999',
    scaleRange: [1, 3],
  },
  {
    keywords: ['castle', 'fortress'],
    name: 'Castle Wall',
    geometry: 'cube',
    traits: ['collidable'],
    material: 'stone',
    color: '#888888',
    scaleRange: [4, 8],
  },
  {
    keywords: ['stairs', 'step'],
    name: 'Steps',
    geometry: 'cube',
    traits: ['collidable'],
    material: 'stone',
    color: '#aaaaaa',
    scaleRange: [1, 3],
  },
  {
    keywords: ['floor', 'ground', 'platform'],
    name: 'Floor',
    geometry: 'plane',
    traits: ['collidable'],
    material: 'matte',
    color: '#cccccc',
    scaleRange: [10, 20],
  },
  {
    keywords: ['pedestal', 'stand', 'base'],
    name: 'Pedestal',
    geometry: 'cylinder',
    traits: ['collidable'],
    material: 'marble',
    color: '#e8e0d0',
    scaleRange: [0.4, 0.8],
  },

  // Sci-Fi
  {
    keywords: ['ship', 'spacecraft', 'shuttle'],
    name: 'Ship Hull',
    geometry: 'capsule',
    traits: ['collidable', 'animated'],
    material: 'metal',
    color: '#aaaacc',
    scaleRange: [2, 5],
  },
  {
    keywords: ['planet', 'globe', 'world'],
    name: 'Planet',
    geometry: 'sphere',
    traits: ['animated'],
    material: 'matte',
    color: '#3366aa',
    scaleRange: [5, 15],
  },
  {
    keywords: ['star', 'sun'],
    name: 'Star',
    geometry: 'sphere',
    traits: ['glowing'],
    material: 'emissive',
    color: '#ffdd44',
    scaleRange: [3, 8],
  },
  {
    keywords: ['robot', 'droid', 'mech'],
    name: 'Robot Body',
    geometry: 'cube',
    traits: ['animated', 'clickable'],
    material: 'chrome',
    color: '#cccccc',
    scaleRange: [0.8, 2],
  },
  {
    keywords: ['antenna', 'satellite', 'dish'],
    name: 'Antenna',
    geometry: 'cylinder',
    traits: [],
    material: 'metal',
    color: '#cccccc',
    scaleRange: [0.1, 0.3],
  },
  {
    keywords: ['panel', 'solar'],
    name: 'Solar Panel',
    geometry: 'plane',
    traits: ['animated'],
    material: 'shiny',
    color: '#1a1a4a',
    scaleRange: [2, 5],
  },
  {
    keywords: ['hologram', 'holo', 'display'],
    name: 'Hologram',
    geometry: 'sphere',
    traits: ['glowing', 'animated'],
    material: 'hologram',
    color: '#00ffff',
    scaleRange: [0.5, 2],
  },
  {
    keywords: ['laser', 'beam'],
    name: 'Laser Beam',
    geometry: 'cylinder',
    traits: ['glowing'],
    material: 'neon',
    color: '#ff0000',
    scaleRange: [0.05, 0.1],
  },

  // Fantasy
  {
    keywords: ['crystal', 'gem', 'jewel', 'diamond'],
    name: 'Crystal',
    geometry: 'cone',
    traits: ['glowing', 'grabbable'],
    material: 'crystal',
    color: '#6633ff',
    scaleRange: [0.2, 1],
  },
  {
    keywords: ['orb', 'sphere', 'ball', 'globe'],
    name: 'Orb',
    geometry: 'sphere',
    traits: ['glowing', 'grabbable'],
    material: 'crystal',
    color: '#44aaff',
    scaleRange: [0.3, 0.8],
  },
  {
    keywords: ['sword', 'blade', 'weapon'],
    name: 'Sword',
    geometry: 'cube',
    traits: ['grabbable', 'glowing'],
    material: 'chrome',
    color: '#ccccdd',
    scaleRange: [0.1, 0.3],
  },
  {
    keywords: ['shield'],
    name: 'Shield',
    geometry: 'sphere',
    traits: ['grabbable', 'collidable'],
    material: 'metal',
    color: '#886622',
    scaleRange: [0.5, 1],
  },
  {
    keywords: ['torch', 'fire', 'flame', 'lantern'],
    name: 'Torch',
    geometry: 'cone',
    traits: ['glowing'],
    material: 'emissive',
    color: '#ff6600',
    scaleRange: [0.2, 0.5],
  },
  {
    keywords: ['chest', 'treasure', 'loot'],
    name: 'Treasure Chest',
    geometry: 'cube',
    traits: ['clickable', 'grabbable'],
    material: 'wood',
    color: '#8b6914',
    scaleRange: [0.5, 1],
  },
  {
    keywords: ['potion', 'bottle', 'vial'],
    name: 'Potion',
    geometry: 'capsule',
    traits: ['grabbable', 'glowing'],
    material: 'glass',
    color: '#44ff88',
    scaleRange: [0.1, 0.3],
  },
  {
    keywords: ['cauldron', 'pot'],
    name: 'Cauldron',
    geometry: 'sphere',
    traits: ['particle_emitter'],
    material: 'metal',
    color: '#333333',
    scaleRange: [0.5, 1],
  },

  // Furniture / Interior
  {
    keywords: ['table', 'desk'],
    name: 'Table',
    geometry: 'cube',
    traits: ['collidable'],
    material: 'wood',
    color: '#8b6914',
    scaleRange: [1, 2],
  },
  {
    keywords: ['chair', 'seat', 'stool'],
    name: 'Chair',
    geometry: 'cube',
    traits: ['collidable', 'grabbable'],
    material: 'wood',
    color: '#a0784a',
    scaleRange: [0.4, 0.8],
  },
  {
    keywords: ['lamp', 'light', 'bulb'],
    name: 'Lamp',
    geometry: 'sphere',
    traits: ['glowing', 'clickable'],
    material: 'emissive',
    color: '#ffdd88',
    scaleRange: [0.2, 0.5],
  },
  {
    keywords: ['bookshelf', 'shelf', 'cabinet'],
    name: 'Bookshelf',
    geometry: 'cube',
    traits: ['collidable'],
    material: 'wood',
    color: '#6b4226',
    scaleRange: [1, 2],
  },
  {
    keywords: ['couch', 'sofa'],
    name: 'Couch',
    geometry: 'cube',
    traits: ['collidable'],
    material: 'velvet',
    color: '#884444',
    scaleRange: [2, 3],
  },
  {
    keywords: ['rug', 'carpet', 'mat'],
    name: 'Rug',
    geometry: 'plane',
    traits: [],
    material: 'velvet',
    color: '#cc6644',
    scaleRange: [2, 4],
  },
  {
    keywords: ['fireplace', 'hearth'],
    name: 'Fireplace',
    geometry: 'cube',
    traits: ['glowing', 'particle_emitter'],
    material: 'stone',
    color: '#666666',
    scaleRange: [1.5, 2.5],
  },

  // Urban / Modern
  {
    keywords: ['car', 'vehicle', 'truck'],
    name: 'Vehicle',
    geometry: 'cube',
    traits: ['collidable', 'physics'],
    material: 'chrome',
    color: '#cc0000',
    scaleRange: [2, 4],
  },
  {
    keywords: ['sign', 'neon', 'billboard'],
    name: 'Neon Sign',
    geometry: 'plane',
    traits: ['glowing'],
    material: 'neon',
    color: '#ff00ff',
    scaleRange: [1, 3],
  },
  {
    keywords: ['street', 'road', 'path'],
    name: 'Street',
    geometry: 'plane',
    traits: ['collidable'],
    material: 'matte',
    color: '#333333',
    scaleRange: [15, 30],
  },
  {
    keywords: ['crate', 'box', 'container'],
    name: 'Crate',
    geometry: 'cube',
    traits: ['grabbable', 'physics', 'collidable'],
    material: 'wood',
    color: '#a08050',
    scaleRange: [0.5, 1.5],
  },
  {
    keywords: ['barrel', 'drum'],
    name: 'Barrel',
    geometry: 'cylinder',
    traits: ['grabbable', 'physics'],
    material: 'metal',
    color: '#666655',
    scaleRange: [0.4, 0.8],
  },

  // Generic catchalls
  {
    keywords: ['button'],
    name: 'Button',
    geometry: 'cylinder',
    traits: ['clickable', 'hoverable', 'glowing'],
    material: 'emissive',
    color: '#ff3333',
    scaleRange: [0.3, 0.6],
  },
  {
    keywords: ['sphere'],
    name: 'Sphere',
    geometry: 'sphere',
    traits: [],
    material: 'shiny',
    color: '#4488cc',
    scaleRange: [0.5, 2],
  },
  {
    keywords: ['cube', 'block'],
    name: 'Cube',
    geometry: 'cube',
    traits: [],
    material: 'matte',
    color: '#cc8844',
    scaleRange: [0.5, 2],
  },
];

// ─── Environment Vocabulary ─────────────────────────────────────────────────

interface EnvDef {
  keywords: string[];
  skybox: string;
  ambient: number;
  fog?: boolean;
  floorColor: string;
  floorMaterial: string;
}

const ENV_DEFS: EnvDef[] = [
  {
    keywords: ['forest', 'woods', 'jungle', 'garden', 'nature', 'tree', 'park'],
    skybox: 'forest_sunset',
    ambient: 0.4,
    fog: true,
    floorColor: '#1a3a0a',
    floorMaterial: 'matte',
  },
  {
    keywords: ['space', 'star', 'planet', 'galaxy', 'station', 'orbit', 'void'],
    skybox: 'space_void',
    ambient: 0.15,
    floorColor: '#111122',
    floorMaterial: 'metal',
  },
  {
    keywords: ['ocean', 'underwater', 'sea', 'coral', 'reef', 'aquatic'],
    skybox: 'underwater',
    ambient: 0.3,
    fog: true,
    floorColor: '#1a3a4a',
    floorMaterial: 'matte',
  },
  {
    keywords: ['desert', 'sand', 'dune', 'oasis', 'pyramid'],
    skybox: 'desert',
    ambient: 0.5,
    floorColor: '#c4a35a',
    floorMaterial: 'matte',
  },
  {
    keywords: ['city', 'neon', 'cyberpunk', 'urban', 'street', 'night'],
    skybox: 'cyberpunk_city',
    ambient: 0.15,
    fog: true,
    floorColor: '#1a1a2e',
    floorMaterial: 'shiny',
  },
  {
    keywords: ['gallery', 'museum', 'studio', 'room', 'indoor', 'interior', 'tavern', 'house'],
    skybox: 'studio',
    ambient: 0.6,
    floorColor: '#e8e0d0',
    floorMaterial: 'marble',
  },
  {
    keywords: ['zen', 'peaceful', 'calm', 'meditation'],
    skybox: 'forest_sunset',
    ambient: 0.5,
    floorColor: '#e8d8b8',
    floorMaterial: 'matte',
  },
];

const DEFAULT_ENV: EnvDef = {
  keywords: [],
  skybox: 'studio',
  ambient: 0.5,
  floorColor: '#cccccc',
  floorMaterial: 'matte',
};

// ─── Color Overrides ────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  red: '#cc3333',
  blue: '#3366cc',
  green: '#33aa33',
  yellow: '#ddcc33',
  orange: '#dd7733',
  purple: '#8833cc',
  pink: '#cc66aa',
  white: '#eeeeee',
  black: '#222222',
  gold: '#ffd700',
  silver: '#c0c0c0',
  cyan: '#00cccc',
};

// ─── Generator ──────────────────────────────────────────────────────────────

function tokenize(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function matchScore(keywords: string[], tokens: string[]): number {
  let score = 0;
  for (const kw of keywords) {
    for (const tok of tokens) {
      if (tok === kw) score += 3;
      else if (tok.includes(kw) || kw.includes(tok)) score += 1;
    }
  }
  return score;
}

function pickEnv(tokens: string[]): EnvDef {
  let best = DEFAULT_ENV;
  let bestScore = 0;
  for (const env of ENV_DEFS) {
    const score = matchScore(env.keywords, tokens);
    if (score > bestScore) {
      bestScore = score;
      best = env;
    }
  }
  return best;
}

function pickObjects(tokens: string[]): ObjectDef[] {
  const scored = OBJECT_DEFS.map((def) => ({
    def,
    score: matchScore(def.keywords, tokens),
  })).filter((s) => s.score > 0);

  scored.sort((a, b) => b.score - a.score);

  // Deduplicate by name, take top 6-10
  const seen = new Set<string>();
  const results: ObjectDef[] = [];
  for (const { def } of scored) {
    if (seen.has(def.name)) continue;
    seen.add(def.name);
    results.push(def);
    if (results.length >= 8) break;
  }

  // If nothing matched, give a default scene
  if (results.length === 0) {
    return [
      OBJECT_DEFS.find((d) => d.name === 'Orb')!,
      OBJECT_DEFS.find((d) => d.name === 'Floor')!,
      OBJECT_DEFS.find((d) => d.name === 'Lamp')!,
    ].filter(Boolean);
  }

  return results;
}

function detectColor(tokens: string[]): string | null {
  for (const tok of tokens) {
    if (COLOR_MAP[tok]) return COLOR_MAP[tok];
  }
  return null;
}

function rand(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

function formatTraits(traits: string[]): string {
  return traits.map((t) => `@${t}`).join(' ');
}

export function generateMockScene(prompt: string): string {
  const tokens = tokenize(prompt);
  const env = pickEnv(tokens);
  const objects = pickObjects(tokens);
  const colorOverride = detectColor(tokens);

  // Build a scene name from the prompt
  const sceneName = prompt.length > 40 ? prompt.slice(0, 37) + '...' : prompt;

  let code = `composition "${sceneName}" {\n`;
  code += `  environment {\n`;
  code += `    skybox: "${env.skybox}"\n`;
  code += `    ambient: ${env.ambient}\n`;
  if (env.fog) code += `    fog: true\n`;
  code += `  }\n\n`;

  // Floor
  const hasFloor = objects.some(
    (o) => o.name === 'Ground' || o.name === 'Floor' || o.name === 'Street'
  );
  if (!hasFloor) {
    code += `  object "Ground" @collidable {\n`;
    code += `    geometry: "plane"\n`;
    code += `    position: [0, 0, -5]\n`;
    code += `    scale: [20, 20, 1]\n`;
    code += `    color: "${env.floorColor}"\n`;
    code += `    material: "${env.floorMaterial}"\n`;
    code += `  }\n\n`;
  }

  // Place objects with spatial distribution
  const positions: Array<[number, number, number]> = [];

  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    const scale = rand(obj.scaleRange[0], obj.scaleRange[1]);

    // Distribute objects in a rough semicircle in front of the camera
    let x: number, y: number, z: number;
    if (
      obj.name.includes('Ground') ||
      obj.name.includes('Floor') ||
      obj.name.includes('Street') ||
      obj.name === 'Rug'
    ) {
      x = 0;
      y = 0;
      z = -5;
    } else if (obj.name.includes('Crown') || obj.name.includes('Roof')) {
      // Place on top of previous object
      const prev = positions[positions.length - 1] || [0, 2, -5];
      x = prev[0];
      y = prev[1] + scale * 1.5;
      z = prev[2];
    } else {
      const angle = (i / objects.length) * Math.PI - Math.PI / 2;
      const radius = 2 + Math.random() * 3;
      x = Math.round(Math.cos(angle) * radius * 10) / 10;
      y = obj.geometry === 'plane' ? 0 : scale * 0.5;
      z = -4 - Math.round(Math.sin(angle) * radius * 10) / 10;
    }

    positions.push([x, y, z]);
    const color = i === 0 && colorOverride ? colorOverride : obj.color;
    const traitStr = obj.traits.length > 0 ? ` ${formatTraits(obj.traits)}` : '';

    code += `  object "${obj.name}"${traitStr} {\n`;
    code += `    geometry: "${obj.geometry}"\n`;
    code += `    position: [${x}, ${y}, ${z}]\n`;

    if (obj.geometry === 'plane') {
      code += `    scale: [${scale}, ${scale}, 1]\n`;
    } else if (
      obj.geometry === 'cylinder' &&
      (obj.name.includes('Trunk') || obj.name.includes('Pillar') || obj.name.includes('Antenna'))
    ) {
      code += `    scale: [${rand(0.2, 0.5)}, ${scale}, ${rand(0.2, 0.5)}]\n`;
    } else {
      code += `    scale: [${scale}, ${scale}, ${scale}]\n`;
    }

    code += `    color: "${color}"\n`;
    code += `    material: "${obj.material}"\n`;
    code += `  }\n\n`;
  }

  code += `}`;
  return code;
}

/**
 * Handle "refine" prompts by modifying existing code based on keywords.
 * Simple approach: regenerate with combined context.
 */
export function refineMockScene(existingCode: string, instruction: string): string {
  // For refinement, just generate a new scene incorporating both contexts
  // Extract the scene name from existing code
  const nameMatch = existingCode.match(/composition "(.+?)"/);
  const baseName = nameMatch?.[1] || 'Scene';

  // Generate from the instruction, which picks new objects
  const newCode = generateMockScene(`${baseName} with ${instruction}`);
  return newCode;
}
