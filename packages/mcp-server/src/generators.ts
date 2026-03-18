/**
 * HoloScript Code Generators
 *
 * AI-powered generation of HoloScript code from natural language.
 */

import { createProviderManager, type LLMProviderName } from '@holoscript/llm-provider';

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

  // Social keywords
  share: ['@shareable'],
  collaborate: ['@collaborative'],
  tweet: ['@tweetable'],
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

interface AIGenerationMetadata {
  source?: 'ai' | 'heuristic';
  provider?: LLMProviderName;
  attemptedProviders?: LLMProviderName[];
}

const AI_PROVIDER_PRIORITY: readonly LLMProviderName[] = [
  'anthropic',
  'openai',
  'gemini',
  'local-llm', // any llama.cpp / Ollama / LM Studio server
  'bitnet',    // dedicated bitnet.cpp server (HOLOSCRIPT_BITNET_URL required)
  'mock',
];

function getAIProviderOrder(registeredProviders: LLMProviderName[]): LLMProviderName[] {
  const forcedProvider = process.env.HOLOSCRIPT_MCP_AI_PROVIDER as LLMProviderName | undefined;

  if (forcedProvider && registeredProviders.includes(forcedProvider)) {
    return [
      forcedProvider,
      ...AI_PROVIDER_PRIORITY.filter(
        (provider) => provider !== forcedProvider && registeredProviders.includes(provider)
      ),
    ];
  }

  return AI_PROVIDER_PRIORITY.filter((provider) => registeredProviders.includes(provider));
}

function detectGeometryFromCode(code: string): string | undefined {
  const geometryMatch = code.match(/geometry:\s*"([^"]+)"/i);
  if (geometryMatch) return geometryMatch[1];

  const primitiveMatch = code.match(/\b(cube|sphere|cylinder|cone|torus|capsule|plane|mesh|text|light|camera)\b/);
  return primitiveMatch?.[1];
}

function isUsableObjectCode(code: string, format: 'hs' | 'hsplus' | 'holo'): boolean {
  if (!code.trim()) return false;
  if ((code.match(/\{/g) || []).length !== (code.match(/\}/g) || []).length) return false;

  if (format === 'holo') {
    return code.includes('template ') || code.includes('object ');
  }

  return code.includes('composition ') || code.includes('template ') || /\b(cube|sphere|plane|cylinder|cone|torus|capsule)\b/.test(code);
}

function isUsableSceneCode(code: string): boolean {
  if (!code.trim()) return false;
  if ((code.match(/\{/g) || []).length !== (code.match(/\}/g) || []).length) return false;

  // Accept both named (composition "Foo" {) and unnamed (composition {) roots
  const hasCompositionRoot = /\bcomposition(?:\s+"[^"]*")?\s*\{/i.test(code);
  const hasSceneContent =
    code.includes('environment') ||
    code.includes('object ') ||
    code.includes('template ') ||
    /\b(cube|sphere|plane|cylinder|cone|torus|capsule|mesh|text|light|camera)\s*\{/i.test(code);

  return hasCompositionRoot && hasSceneContent;
}

function stripCodeFences(code: string): string {
  const fenced = code.match(/```(?:holoscript|holo|hsplus|hs)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : code).trim();
}

function trimToLikelyCodeStart(code: string): string {
  const marker = code.search(
    /(^|\n)\s*(composition\s*(?:"[^"]*"\s*)?\{|template\s+"|object\s+"|cube\s*\{|sphere\s*\{|plane\s*\{|cylinder\s*\{|cone\s*\{|torus\s*\{|capsule\s*\{|mesh\s*\{)/i
  );

  if (marker < 0) return code.trim();

  const start = code.lastIndexOf('\n', marker);
  return code.slice(start >= 0 ? start + 1 : marker).trim();
}

function indentBlock(code: string, spaces = 2): string {
  const indent = ' '.repeat(spaces);
  return code
    .split('\n')
    .map((line) => `${indent}${line}`)
    .join('\n');
}

function wrapSceneFragment(fragment: string): string {
  return `composition "GeneratedScene" {
  environment {
    skybox: "gradient"
    ambient_light: 0.3
  }

${indentBlock(fragment, 2)}
}`;
}

function normalizeSceneAIOutput(code: string): string {
  const stripped = stripCodeFences(code);
  const trimmed = trimToLikelyCodeStart(stripped);

  if (!trimmed) return trimmed;
  // Accept both named (composition "Foo" {) and unnamed (composition {) roots
  if (/^composition\s*(?:"[^"]*"\s*)?\{/i.test(trimmed)) return trimmed;

  const looksLikeSceneFragment =
    isUsableObjectCode(trimmed, 'holo') ||
    /\b(cube|sphere|plane|cylinder|cone|torus|capsule|mesh)\s*\{/i.test(trimmed);

  if (!looksLikeSceneFragment) return trimmed;

  return wrapSceneFragment(trimmed);
}

async function tryGenerateWithAI(
  prompt: string,
  targetFormat: 'hs' | 'hsplus' | 'holo'
): Promise<({ code: string; provider: LLMProviderName; attemptedProviders: LLMProviderName[]; detectedTraits: string[] } | null)> {
  let manager;

  try {
    manager = createProviderManager();
  } catch {
    return null;
  }

  const attemptedProviders: LLMProviderName[] = [];

  for (const providerName of getAIProviderOrder(manager.getRegisteredProviders())) {
    const provider = manager.getProvider(providerName);
    if (!provider) continue;

    attemptedProviders.push(providerName);

    try {
      // Local providers (small models) need conservative settings to stay coherent
      const isLocalProvider = providerName === 'bitnet' || providerName === 'local-llm';
      const result = await provider.generateHoloScript({
        prompt,
        targetFormat,
        maxObjects: targetFormat === 'holo' ? (isLocalProvider ? 4 : 8) : 1,
        temperature: isLocalProvider ? 0.1 : 0.35,
      });

      return {
        code: result.code,
        provider: result.provider,
        attemptedProviders: [...attemptedProviders],
        detectedTraits: result.detectedTraits,
      };
    } catch {
      // Fall through to next provider. The deterministic generator remains the final safety net.
    }
  }

  return null;
}

export async function generateObjectForMCP(
  description: string,
  options: GenerateOptions = {}
): Promise<ReturnType<typeof generateObject> & AIGenerationMetadata> {
  const format = options.format || 'hsplus';
  const heuristic = generateObject(description, options);
  const aiPrompt = `Create a single ${format} HoloScript object for: ${description}. Return only code. Prefer one focused object, not a large world.`;
  const aiResult = await tryGenerateWithAI(aiPrompt, format);

  if (aiResult && isUsableObjectCode(aiResult.code, format)) {
    return {
      code: aiResult.code,
      traits: aiResult.detectedTraits,
      geometry: detectGeometryFromCode(aiResult.code) ?? heuristic.geometry,
      format,
      source: 'ai',
      provider: aiResult.provider,
      attemptedProviders: aiResult.attemptedProviders,
    };
  }

  return {
    ...heuristic,
    source: 'heuristic',
    provider: aiResult?.provider,
    attemptedProviders: aiResult?.attemptedProviders,
  };
}

export async function generateSceneForMCP(
  description: string,
  options: SceneOptions = {}
): Promise<ReturnType<typeof generateScene> & AIGenerationMetadata> {
  const debugAI = process.env.HOLOSCRIPT_MCP_AI_DEBUG === '1';
  const heuristic = generateScene(description, options);
  const features = options.features?.length ? ` Include features: ${options.features.join(', ')}.` : '';
  const aiPrompt = `Create a complete holo composition scene for: ${description}.${features} Return only code with a composition root.`;
  const aiResult = await tryGenerateWithAI(aiPrompt, 'holo');
  const aiCode = aiResult ? normalizeSceneAIOutput(aiResult.code) : '';

  if (aiResult && isUsableSceneCode(aiCode)) {
    return {
      code: aiCode,
      stats: {
        objects: (aiCode.match(/\bobject\s+"/g) || []).length,
        traits: aiResult.detectedTraits.length,
        lines: aiCode.split('\n').length,
      },
      source: 'ai',
      provider: aiResult.provider,
      attemptedProviders: aiResult.attemptedProviders,
    };
  }

  const fallback = {
    ...heuristic,
    source: 'heuristic',
    provider: aiResult?.provider,
    attemptedProviders: aiResult?.attemptedProviders,
  };

  if (debugAI && aiResult) {
    Object.assign(fallback, {
      aiDebug: {
        rawCode: aiResult.code,
        normalizedCode: aiCode,
        balanced: (aiCode.match(/\{/g) || []).length === (aiCode.match(/\}/g) || []).length,
        hasCompositionRoot: /\bcomposition(?:\s+"[^"]+")?\s*\{/i.test(aiCode),
        hasSceneContent:
          aiCode.includes('environment') ||
          aiCode.includes('object ') ||
          aiCode.includes('template ') ||
          /\b(cube|sphere|plane|cylinder|cone|torus|capsule|mesh|text|light|camera)\s*\{/i.test(aiCode),
      },
    });
  }

  return fallback;
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
