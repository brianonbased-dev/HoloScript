/**
 * HoloScript Code Generators
 *
 * AI-powered generation of HoloScript code from natural language.
 */

// Inline utility — avoids an @holoscript/std peer dependency
const capitalize = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Trait suggestions based on keywords
const TRAIT_KEYWORDS: Record<string, string[]> = {
  // Interaction keywords
  'pick up': ['@grabbable'],
  grab: ['@grabbable'],
  hold: ['@grabbable', '@holdable'],
  throw: ['@grabbable', '@throwable'],
  click: ['@clickable'],
  point: ['@pointable'],
  hover: ['@hoverable'],
  drag: ['@draggable'],
  scale: ['@scalable'],
  resize: ['@scalable'],

  // Physics keywords
  collide: ['@collidable'],
  bounce: ['@collidable', '@physics'],
  physics: ['@physics', '@collidable'],
  fall: ['@physics', '@gravity'],
  gravity: ['@gravity'],
  trigger: ['@trigger'],

  // Visual keywords
  glow: ['@glowing'],
  light: ['@emissive'],
  transparent: ['@transparent'],
  'see through': ['@transparent'],
  reflect: ['@reflective'],
  mirror: ['@reflective'],
  animate: ['@animated'],
  spin: ['@animated'],
  rotate: ['@animated'],
  billboard: ['@billboard'],
  'face camera': ['@billboard'],

  // Networking keywords
  multiplayer: ['@networked', '@synced'],
  sync: ['@networked', '@synced'],
  network: ['@networked'],
  save: ['@persistent'],
  persist: ['@persistent'],
  own: ['@owned'],
  host: ['@host_only'],

  // Behavior keywords
  stack: ['@stackable'],
  attach: ['@attachable'],
  equip: ['@equippable'],
  wear: ['@equippable'],
  consume: ['@consumable'],
  eat: ['@consumable'],
  drink: ['@consumable'],
  destroy: ['@destructible'],
  break: ['@destructible'],

  // Spatial keywords
  anchor: ['@anchor'],
  track: ['@tracked'],
  'world lock': ['@world_locked'],
  'hand track': ['@hand_tracked'],
  'eye track': ['@eye_tracked'],

  // Audio keywords
  sound: ['@spatial_audio'],
  audio: ['@spatial_audio'],
  ambient: ['@ambient'],
  voice: ['@voice_activated'],
  speak: ['@voice_activated'],

  // State keywords
  state: ['@state', '@reactive'],
  react: ['@reactive'],
  observe: ['@observable'],
  compute: ['@computed'],
};

// Geometry keywords
const GEOMETRY_KEYWORDS: Record<string, string> = {
  cube: 'cube',
  box: 'cube',
  sphere: 'sphere',
  ball: 'sphere',
  orb: 'sphere',
  cylinder: 'cylinder',
  tube: 'cylinder',
  pipe: 'cylinder',
  cone: 'cone',
  pyramid: 'cone',
  torus: 'torus',
  ring: 'torus',
  donut: 'torus',
  capsule: 'capsule',
  pill: 'capsule',
  plane: 'plane',
  floor: 'plane',
  ground: 'plane',
  wall: 'plane',
};

// Color keywords
const COLOR_KEYWORDS: Record<string, string> = {
  red: '#ff0000',
  green: '#00ff00',
  blue: '#0000ff',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  yellow: '#ffff00',
  orange: '#ff8800',
  purple: '#8800ff',
  pink: '#ff88ff',
  white: '#ffffff',
  black: '#000000',
  gray: '#888888',
  grey: '#888888',
  gold: '#ffd700',
  silver: '#c0c0c0',
};

interface GenerateOptions {
  format?: 'hs' | 'hsplus' | 'holo';
  includeDocs?: boolean;
}

interface SceneOptions {
  style?: 'minimal' | 'detailed' | 'production';
  features?: string[];
}

/**
 * Suggest traits based on object description
 */
export function suggestTraits(
  description: string,
  context?: string
): {
  traits: string[];
  reasoning: Record<string, string>;
  confidence: number;
} {
  const lowerDesc = (description + ' ' + (context || '')).toLowerCase();
  const suggestedTraits = new Set<string>();
  const reasoning: Record<string, string> = {};

  for (const [keyword, traits] of Object.entries(TRAIT_KEYWORDS)) {
    if (lowerDesc.includes(keyword)) {
      for (const trait of traits) {
        if (!suggestedTraits.has(trait)) {
          suggestedTraits.add(trait);
          reasoning[trait] = `Suggested because description mentions "${keyword}"`;
        }
      }
    }
  }

  // Default traits for interactive objects
  if (suggestedTraits.size === 0) {
    suggestedTraits.add('@pointable');
    reasoning['@pointable'] = 'Default trait for interactive objects';
  }

  // Always suggest @collidable if physics-related
  if (suggestedTraits.has('@physics') && !suggestedTraits.has('@collidable')) {
    suggestedTraits.add('@collidable');
    reasoning['@collidable'] = 'Required for physics interactions';
  }

  const traits = Array.from(suggestedTraits);
  const confidence = Math.min(0.95, 0.5 + traits.length * 0.1);

  return { traits, reasoning, confidence };
}

/**
 * Generate an object from natural language description
 */
export function generateObject(
  description: string,
  options: GenerateOptions = {}
): {
  code: string;
  traits: string[];
  geometry: string;
  format: string;
} {
  const format = options.format || 'hsplus';
  const lowerDesc = description.toLowerCase();

  // Extract geometry
  let geometry = 'sphere'; // default
  for (const [keyword, geo] of Object.entries(GEOMETRY_KEYWORDS)) {
    if (lowerDesc.includes(keyword)) {
      geometry = geo;
      break;
    }
  }

  // Extract color
  let color = '#00ffff'; // default cyan
  for (const [keyword, hex] of Object.entries(COLOR_KEYWORDS)) {
    if (lowerDesc.includes(keyword)) {
      color = hex;
      break;
    }
  }

  // Get traits
  const { traits } = suggestTraits(description);

  // Extract name
  const words = description.split(/\s+/);
  const nameWord = words.find((w) => /^[A-Z]/.test(w)) || words[words.length - 1] || 'Object';
  const objectName = nameWord.replace(/[^a-zA-Z0-9]/g, '');

  // Generate code based on format
  let code: string;

  if (format === 'holo') {
    code = generateHoloObject(objectName, geometry, color, traits, options.includeDocs);
  } else if (format === 'hsplus') {
    code = generateHsplusObject(objectName, geometry, color, traits, options.includeDocs);
  } else {
    code = generateHsObject(objectName, geometry, color, traits, options.includeDocs);
  }

  return { code, traits, geometry, format };
}

function generateHoloObject(
  name: string,
  geometry: string,
  color: string,
  traits: string[],
  docs?: boolean
): string {
  const traitsStr = traits.map((t) => `    ${t}`).join('\n');
  const docComment = docs ? `  // ${name} - Generated from natural language description\n` : '';

  return `${docComment}  template "${name}Template" {
${traitsStr}
    geometry: "${geometry}"
    color: "${color}"
  }

  object "${name}" using "${name}Template" {
    position: [0, 1, 0]
  }`;
}

function generateHsplusObject(
  name: string,
  geometry: string,
  color: string,
  traits: string[],
  docs?: boolean
): string {
  const traitsStr = traits.map((t) => `  ${t}`).join('\n');
  const docComment = docs ? `// ${name} - Generated from natural language description\n` : '';

  return `${docComment}composition "${name}Scene" {
  template "${name}Template" {
${traitsStr}
    geometry: "${geometry}"
    color: "${color}"
  }

  object "${name}" using "${name}Template" {
    position: [0, 1, 0]
  }
}`;
}

function generateHsObject(
  name: string,
  geometry: string,
  color: string,
  traits: string[],
  docs?: boolean
): string {
  const traitsStr = traits.map((t) => `  ${t}`).join('\n');
  const docComment = docs ? `// ${name} - Generated from natural language description\n` : '';

  return `${docComment}composition "${name}Scene" {
  template "${name}Template" {
${traitsStr}
    geometry: "${geometry}"
    color: "${color}"
  }

  object "${name}" using "${name}Template" {
    position: [0, 1, 0]
  }
}`;
}

/**
 * Generate a complete scene from natural language description
 */
export function generateScene(
  description: string,
  options: SceneOptions = {}
): {
  code: string;
  stats: {
    objects: number;
    traits: number;
    lines: number;
  };
} {
  const style = options.style || 'detailed';
  const features = options.features || [];
  const _lowerDesc = description.toLowerCase();

  // Parse scene elements from description
  const elements = parseSceneElements(description);

  // Generate objects
  const objects = elements.objects.map((obj) => {
    const { code } = generateObject(obj.description, {
      format: 'holo',
      includeDocs: style !== 'minimal',
    });
    return code;
  });

  // Generate environment
  const environment = generateEnvironment(description, style);

  // Generate logic if needed
  const logic = features.includes('logic') ? generateLogic(elements) : '';

  // Combine into composition
  const code = `composition "${elements.name}" {
  ${environment}

${objects.map((o) => '  ' + o.replace(/\n/g, '\n  ')).join('\n\n')}
${logic ? '\n  ' + logic : ''}}`;

  return {
    code,
    stats: {
      objects: objects.length,
      traits: (code.match(/@\w+/g) || []).length,
      lines: code.split('\n').length,
    },
  };
}

interface SceneElement {
  name: string;
  objects: { name: string; description: string }[];
  environment: string[];
}

function parseSceneElements(description: string): SceneElement {
  const _words = description.split(/\s+/);

  // Extract scene name
  const nameMatch = description.match(
    /(a|an|the)?\s*([a-z]+(?:\s+[a-z]+)?)\s*(scene|world|room|space)/i
  );
  const name = nameMatch ? capitalize(nameMatch[2]) : 'Generated Scene';

  // Extract objects (simplified parsing)
  const objectMatches = description.match(
    /(?:with|containing|featuring|has|include)\s+([^,]+(?:,\s*[^,]+)*)/i
  );
  const objects: { name: string; description: string }[] = [];

  if (objectMatches) {
    const items = objectMatches[1].split(/,\s*and\s*|,\s*|\s+and\s+/);
    for (const item of items) {
      const trimmed = item.trim();
      if (trimmed) {
        objects.push({
          name: extractObjectName(trimmed),
          description: trimmed,
        });
      }
    }
  }

  // Default object if none extracted
  if (objects.length === 0) {
    objects.push({
      name: 'MainObject',
      description: description,
    });
  }

  // Extract environment hints
  const environment: string[] = [];
  if (description.includes('forest') || description.includes('nature')) environment.push('nature');
  if (description.includes('space') || description.includes('galaxy')) environment.push('space');
  if (description.includes('night')) environment.push('night');
  if (description.includes('day') || description.includes('sunny')) environment.push('day');

  return { name, objects, environment };
}

function extractObjectName(description: string): string {
  const words = description.split(/\s+/);
  const lastWord = words[words.length - 1];
  return capitalize(lastWord.replace(/[^a-zA-Z0-9]/g, ''));
}


function generateEnvironment(description: string, style: string): string {
  const lowerDesc = description.toLowerCase();

  // Determine skybox
  let skybox = 'gradient';
  if (lowerDesc.includes('forest') || lowerDesc.includes('nature')) skybox = 'forest';
  if (lowerDesc.includes('space') || lowerDesc.includes('galaxy') || lowerDesc.includes('nebula'))
    skybox = 'nebula';
  if (lowerDesc.includes('sunset') || lowerDesc.includes('sunrise')) skybox = 'sunset';
  if (lowerDesc.includes('night') || lowerDesc.includes('moon')) skybox = 'night';
  if (lowerDesc.includes('ocean') || lowerDesc.includes('beach')) skybox = 'ocean';

  // Determine lighting
  let ambientLight = 0.3;
  if (lowerDesc.includes('dark') || lowerDesc.includes('night')) ambientLight = 0.1;
  if (lowerDesc.includes('bright') || lowerDesc.includes('sunny')) ambientLight = 0.7;

  if (style === 'minimal') {
    return `environment {
    skybox: "${skybox}"
  }`;
  }

  return `environment {
    skybox: "${skybox}"
    ambient_light: ${ambientLight}
    fog: { enabled: true, density: 0.01 }
  }`;
}

function generateLogic(elements: SceneElement): string {
  if (elements.objects.length < 2) return '';

  return `logic {
    // Auto-generated interaction logic
    on_scene_start() {
      console.log("Scene loaded!")
    }
  }`;
}
