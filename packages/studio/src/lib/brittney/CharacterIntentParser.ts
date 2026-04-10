/**
 * CharacterIntentParser — Client-side NLP for character customization
 *
 * Parses natural language commands like "make eyes bigger",
 * "equip the hoodie", "change skin to darker" into structured intents
 * that can be dispatched to the character store.
 *
 * This runs entirely client-side (no LLM dependency) using keyword
 * matching and synonym maps for instant response.
 */

// ── Intent types ────────────────────────────────────────────────────────────

export type CharacterIntentType =
  | 'set_morph'
  | 'equip_item'
  | 'unequip_item'
  | 'set_skin_color'
  | 'reset'
  | 'unknown';

export interface MorphIntent {
  type: 'set_morph';
  target: string; // morph target ID, e.g. 'body_height'
  direction: 'increase' | 'decrease' | 'set';
  value?: number; // absolute value if 'set', otherwise undefined
}

export interface EquipIntent {
  type: 'equip_item';
  slot?: string;
  itemQuery: string; // fuzzy search term for item name
}

export interface UnequipIntent {
  type: 'unequip_item';
  slot?: string;
}

export interface SkinColorIntent {
  type: 'set_skin_color';
  direction: 'lighter' | 'darker' | 'set';
  color?: string; // hex if 'set'
}

export interface ResetIntent {
  type: 'reset';
  scope: 'all' | 'body' | 'face' | 'wardrobe';
}

export interface UnknownIntent {
  type: 'unknown';
  raw: string;
}

export type CharacterIntent =
  | MorphIntent
  | EquipIntent
  | UnequipIntent
  | SkinColorIntent
  | ResetIntent
  | UnknownIntent;

// ── Synonym maps ────────────────────────────────────────────────────────────

/** Maps natural language keywords → morph target IDs */
const MORPH_KEYWORDS: Record<string, string[]> = {
  body_height: ['height', 'tall', 'taller', 'short', 'shorter', 'stature'],
  body_build: [
    'build',
    'muscular',
    'muscle',
    'buff',
    'slim',
    'thin',
    'skinny',
    'bulky',
    'stocky',
    'athletic',
  ],
  body_shoulders: ['shoulder', 'shoulders', 'broad'],
  body_chest: ['chest', 'bust', 'torso'],
  body_waist: ['waist', 'belly', 'stomach', 'tummy', 'core'],
  body_hips: ['hip', 'hips'],
  body_arms: ['arm', 'arms', 'arm length'],
  body_legs: ['leg', 'legs', 'leg length'],
  face_eye_size: ['eye', 'eyes', 'eye size'],
  face_eye_spacing: ['eye spacing', 'eye distance', 'eyes apart', 'eyes closer'],
  face_nose_width: ['nose width', 'nose', 'nostrils'],
  face_nose_length: ['nose length', 'nose long', 'nose short'],
  face_mouth_width: ['mouth', 'lips', 'lip width'],
  face_jaw_width: ['jaw', 'jawline', 'chin'],
  face_cheek: ['cheek', 'cheeks', 'cheekbone'],
  face_brow: ['brow', 'eyebrow', 'eyebrows', 'forehead'],
};

/** Keywords indicating increase vs decrease */
const INCREASE_WORDS = [
  'bigger',
  'larger',
  'more',
  'wider',
  'taller',
  'broader',
  'thicker',
  'higher',
  'increase',
  'up',
  'max',
  'full',
  'muscular',
  'buff',
  'bulky',
  'athletic',
  'broad',
];
const DECREASE_WORDS = [
  'smaller',
  'less',
  'narrower',
  'shorter',
  'thinner',
  'lower',
  'decrease',
  'down',
  'min',
  'slim',
  'thin',
  'skinny',
  'petite',
];

/** Wardrobe slot keywords */
const SLOT_KEYWORDS: Record<string, string[]> = {
  hair: ['hair', 'hairstyle', 'haircut'],
  top: ['top', 'shirt', 'tshirt', 't-shirt', 'hoodie', 'jacket', 'blazer', 'armor', 'chest piece'],
  bottom: ['bottom', 'pants', 'jeans', 'shorts', 'skirt', 'trousers'],
  shoes: ['shoes', 'boots', 'sneakers', 'heels', 'footwear'],
  accessory_1: ['glasses', 'hat', 'cap', 'headwear', 'accessory'],
  accessory_2: ['backpack', 'wings', 'cape', 'bag'],
};

/** Skin color keywords */
const LIGHTER_WORDS = ['lighter', 'paler', 'fair', 'light'];
const DARKER_WORDS = ['darker', 'tanner', 'dark', 'tan', 'deep'];

// ── Parser ──────────────────────────────────────────────────────────────────

/**
 * Parse a natural language string into a CharacterIntent.
 * Uses keyword matching — no LLM required.
 */
export function parseCharacterIntent(input: string): CharacterIntent {
  const text = input.toLowerCase().trim();
  if (!text) return { type: 'unknown', raw: input };

  // ── Reset commands ──────────────────────────────────────────────
  if (/\breset\s+(all|everything)\b/.test(text)) {
    return { type: 'reset', scope: 'all' };
  }
  if (/\breset\s+(body|figure)\b/.test(text)) {
    return { type: 'reset', scope: 'body' };
  }
  if (/\breset\s+face\b/.test(text)) {
    return { type: 'reset', scope: 'face' };
  }
  if (/\breset\s+(wardrobe|outfit|clothes|clothing)\b/.test(text)) {
    return { type: 'reset', scope: 'wardrobe' };
  }

  // ── Unequip commands ────────────────────────────────────────────
  if (/\b(remove|take off|unequip)\b/.test(text)) {
    const slot = matchSlot(text);
    return { type: 'unequip_item', slot: slot ?? undefined };
  }

  // ── Equip commands ──────────────────────────────────────────────
  if (/\b(equip|wear|put on|add|give)\b/.test(text)) {
    const slot = matchSlot(text);
    // Extract the item query (everything after the verb)
    const itemQuery = text
      .replace(/\b(equip|wear|put on|add|give)\b/, '')
      .replace(/\b(the|a|an|some|me)\b/g, '')
      .trim();
    return { type: 'equip_item', slot: slot ?? undefined, itemQuery };
  }

  // ── Skin color ──────────────────────────────────────────────────
  if (/\bskin\b/.test(text)) {
    if (LIGHTER_WORDS.some((w) => text.includes(w))) {
      return { type: 'set_skin_color', direction: 'lighter' };
    }
    if (DARKER_WORDS.some((w) => text.includes(w))) {
      return { type: 'set_skin_color', direction: 'darker' };
    }
    // Check for hex color
    const hexMatch = text.match(/#[0-9a-f]{6}/i);
    if (hexMatch) {
      return { type: 'set_skin_color', direction: 'set', color: hexMatch[0] };
    }
  }

  // ── Morph target commands ───────────────────────────────────────
  const morphTarget = matchMorphTarget(text);
  if (morphTarget) {
    const direction = getDirection(text);
    // Check for explicit value ("set height to 80")
    const valueMatch = text.match(/\b(\d{1,3})\b/);
    if (valueMatch) {
      const value = Math.max(0, Math.min(100, parseInt(valueMatch[1], 10)));
      return { type: 'set_morph', target: morphTarget, direction: 'set', value };
    }
    return { type: 'set_morph', target: morphTarget, direction };
  }

  return { type: 'unknown', raw: input };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function matchMorphTarget(text: string): string | null {
  // Check multi-word matches first (more specific)
  let bestMatch: string | null = null;
  let bestLen = 0;

  for (const [targetId, keywords] of Object.entries(MORPH_KEYWORDS)) {
    for (const keyword of keywords) {
      if (text.includes(keyword) && keyword.length > bestLen) {
        bestMatch = targetId;
        bestLen = keyword.length;
      }
    }
  }

  return bestMatch;
}

function matchSlot(text: string): string | null {
  for (const [slot, keywords] of Object.entries(SLOT_KEYWORDS)) {
    if (keywords.some((k) => text.includes(k))) return slot;
  }
  return null;
}

function getDirection(text: string): 'increase' | 'decrease' {
  const incScore = INCREASE_WORDS.filter((w) => text.includes(w)).length;
  const decScore = DECREASE_WORDS.filter((w) => text.includes(w)).length;
  return decScore > incScore ? 'decrease' : 'increase';
}

// ── Intent executor ─────────────────────────────────────────────────────────

export interface CharacterStoreActions {
  setMorphTarget: (name: string, value: number) => void;
  resetMorphTargets: () => void;
  setSkinColor: (color: string) => void;
  equipItem: (item: {
    id: string;
    name: string;
    slot: string;
    thumbnail: string;
    category: string;
  }) => void;
  unequipSlot: (slot: string) => void;
  clearWardrobe: () => void;
  morphTargets: Record<string, number>;
  skinColor: string;
}

/** Step size for increase/decrease commands (0-100 range) */
const STEP_SIZE = 15;

/**
 * Execute a parsed intent against the character store.
 * Returns a human-readable response string.
 */
export function executeCharacterIntent(
  intent: CharacterIntent,
  store: CharacterStoreActions
): string {
  switch (intent.type) {
    case 'set_morph': {
      const current = store.morphTargets[intent.target] ?? 50;
      let newValue: number;
      if (intent.direction === 'set' && intent.value !== undefined) {
        newValue = intent.value;
      } else if (intent.direction === 'increase') {
        newValue = Math.min(100, current + STEP_SIZE);
      } else {
        newValue = Math.max(0, current - STEP_SIZE);
      }
      store.setMorphTarget(intent.target, newValue);
      const label = intent.target.replace(/_/g, ' ').replace(/^(body|face) /, '');
      return `✨ Set ${label} to ${newValue}`;
    }

    case 'set_skin_color': {
      if (intent.direction === 'set' && intent.color) {
        store.setSkinColor(intent.color);
        return `🎨 Skin color set to ${intent.color}`;
      }
      // Lighten/darken by shifting the hex
      const hex = store.skinColor;
      const shift = intent.direction === 'lighter' ? 15 : -15;
      const r = Math.max(0, Math.min(255, parseInt(hex.slice(1, 3), 16) + shift));
      const g = Math.max(0, Math.min(255, parseInt(hex.slice(3, 5), 16) + shift));
      const b = Math.max(0, Math.min(255, parseInt(hex.slice(5, 7), 16) + shift));
      const newColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      store.setSkinColor(newColor);
      return `🎨 Skin ${intent.direction === 'lighter' ? 'lightened' : 'darkened'} to ${newColor}`;
    }

    case 'equip_item':
      return `👔 Searching wardrobe for "${intent.itemQuery}"…`;

    case 'unequip_item':
      if (intent.slot) {
        store.unequipSlot(intent.slot);
        return `👔 Removed ${intent.slot} item`;
      }
      return `👔 Which slot do you want to clear?`;

    case 'reset':
      if (intent.scope === 'all') {
        store.resetMorphTargets();
        store.clearWardrobe();
        return '🔄 Reset all customization and wardrobe';
      }
      if (intent.scope === 'wardrobe') {
        store.clearWardrobe();
        return '🔄 Wardrobe cleared';
      }
      // body/face — reset matching morph targets
      store.resetMorphTargets();
      return `🔄 Reset ${intent.scope} morphs`;

    case 'unknown':
      return `🤔 I didn't understand that. Try "make eyes bigger" or "equip hoodie".`;
  }
}
