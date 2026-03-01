/**
 * dreamJournal.ts — Dream Journal Visualizer Engine
 *
 * Text-to-3D surreal environments, emotion-driven color palettes,
 * impossible physics, dream symbol library, and lucidity tracking.
 */

export interface Vec3 { x: number; y: number; z: number }

export type EmotionCategory = 'joy' | 'fear' | 'sadness' | 'anger' | 'surprise' | 'peace' | 'confusion' | 'awe';
export type DreamClarity = 'vivid' | 'normal' | 'foggy' | 'fragment';
export type PhysicsMode = 'normal' | 'low-gravity' | 'zero-gravity' | 'underwater' | 'flight' | 'time-loop' | 'impossible';

export interface DreamEntry {
  id: string;
  date: string;
  title: string;
  narrative: string;
  emotions: EmotionCategory[];
  clarity: DreamClarity;
  lucid: boolean;
  recurring: boolean;
  symbols: string[];
  duration: number;          // estimated minutes
  physicsMode: PhysicsMode;
}

export interface DreamEnvironment {
  skyColor: string;
  groundColor: string;
  ambientLight: number;      // 0-1
  fogDensity: number;        // 0-1
  gravity: number;           // multiplier (1 = normal, 0 = zero-g)
  timeSpeed: number;         // multiplier (1 = real, 0.1 = slow-mo)
  distortion: number;        // 0-1 (0 = realistic, 1 = surreal)
}

export interface DreamSymbol {
  name: string;
  frequency: number;
  meanings: string[];
  associatedEmotions: EmotionCategory[];
}

// ═══════════════════════════════════════════════════════════════════
// Emotion → Color Palette
// ═══════════════════════════════════════════════════════════════════

export const EMOTION_PALETTES: Record<EmotionCategory, { primary: string; secondary: string; accent: string }> = {
  joy:       { primary: '#FFD700', secondary: '#FFA500', accent: '#FF69B4' },
  fear:      { primary: '#1a0a2e', secondary: '#2d0a4e', accent: '#ff0044' },
  sadness:   { primary: '#1e3a5f', secondary: '#2c3e50', accent: '#87ceeb' },
  anger:     { primary: '#8b0000', secondary: '#ff4500', accent: '#ffd700' },
  surprise:  { primary: '#9b59b6', secondary: '#e74c3c', accent: '#f1c40f' },
  peace:     { primary: '#2ecc71', secondary: '#1abc9c', accent: '#ecf0f1' },
  confusion: { primary: '#7f8c8d', secondary: '#95a5a6', accent: '#bdc3c7' },
  awe:       { primary: '#0a0a3e', secondary: '#1a1a6e', accent: '#gold' },
};

export function emotionToColorPalette(emotion: EmotionCategory) {
  return EMOTION_PALETTES[emotion];
}

export function blendEmotionColors(emotions: EmotionCategory[]): string {
  if (emotions.length === 0) return '#808080';
  if (emotions.length === 1) return EMOTION_PALETTES[emotions[0]].primary;
  // Blend first two primaries
  const a = EMOTION_PALETTES[emotions[0]].primary;
  const b = EMOTION_PALETTES[emotions[1]].primary;
  // Simple hex midpoint
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const mr = Math.round((ar + br) / 2).toString(16).padStart(2, '0');
  const mg = Math.round((ag + bg) / 2).toString(16).padStart(2, '0');
  const mb = Math.round((ab + bb) / 2).toString(16).padStart(2, '0');
  return `#${mr}${mg}${mb}`;
}

// ═══════════════════════════════════════════════════════════════════
// Dream Environment Generation
// ═══════════════════════════════════════════════════════════════════

export function generateEnvironment(entry: DreamEntry): DreamEnvironment {
  const palette = emotionToColorPalette(entry.emotions[0] ?? 'confusion');
  const gravityMap: Record<PhysicsMode, number> = {
    normal: 1, 'low-gravity': 0.3, 'zero-gravity': 0, underwater: 0.6,
    flight: 0.1, 'time-loop': 1, impossible: -0.5,
  };
  return {
    skyColor: palette.primary,
    groundColor: palette.secondary,
    ambientLight: entry.clarity === 'vivid' ? 0.9 : entry.clarity === 'foggy' ? 0.3 : 0.6,
    fogDensity: entry.clarity === 'foggy' ? 0.8 : entry.clarity === 'fragment' ? 0.6 : 0.1,
    gravity: gravityMap[entry.physicsMode],
    timeSpeed: entry.physicsMode === 'time-loop' ? 0.1 : 1,
    distortion: entry.lucid ? 0.2 : 0.7,
  };
}

export function clarityScore(clarity: DreamClarity): number {
  const scores: Record<DreamClarity, number> = { vivid: 1.0, normal: 0.7, foggy: 0.4, fragment: 0.2 };
  return scores[clarity];
}

// ═══════════════════════════════════════════════════════════════════
// Symbol Analysis
// ═══════════════════════════════════════════════════════════════════

export const COMMON_SYMBOLS: DreamSymbol[] = [
  { name: 'water', frequency: 0.35, meanings: ['emotions', 'unconscious', 'purification'], associatedEmotions: ['peace', 'fear'] },
  { name: 'flying', frequency: 0.25, meanings: ['freedom', 'ambition', 'escape'], associatedEmotions: ['joy', 'awe'] },
  { name: 'falling', frequency: 0.30, meanings: ['loss of control', 'anxiety', 'letting go'], associatedEmotions: ['fear', 'surprise'] },
  { name: 'teeth', frequency: 0.15, meanings: ['self-image', 'anxiety', 'transition'], associatedEmotions: ['fear', 'confusion'] },
  { name: 'chase', frequency: 0.20, meanings: ['avoidance', 'threat', 'unresolved conflict'], associatedEmotions: ['fear', 'anger'] },
  { name: 'house', frequency: 0.30, meanings: ['self', 'psyche', 'security'], associatedEmotions: ['peace', 'sadness'] },
  { name: 'animal', frequency: 0.25, meanings: ['instinct', 'nature', 'untamed qualities'], associatedEmotions: ['surprise', 'awe'] },
  { name: 'mirror', frequency: 0.10, meanings: ['self-reflection', 'identity', 'hidden truth'], associatedEmotions: ['confusion', 'awe'] },
];

export function findSymbol(name: string): DreamSymbol | undefined {
  return COMMON_SYMBOLS.find(s => s.name === name);
}

export function symbolsInDream(entry: DreamEntry): DreamSymbol[] {
  return entry.symbols.map(s => findSymbol(s)).filter((s): s is DreamSymbol => s !== undefined);
}

export function lucidDreamRatio(entries: DreamEntry[]): number {
  if (entries.length === 0) return 0;
  return entries.filter(e => e.lucid).length / entries.length;
}

export function recurringDreamCount(entries: DreamEntry[]): number {
  return entries.filter(e => e.recurring).length;
}

export function averageDreamDuration(entries: DreamEntry[]): number {
  if (entries.length === 0) return 0;
  return entries.reduce((sum, e) => sum + e.duration, 0) / entries.length;
}

// ═══════════════════════════════════════════════════════════════════
// Dream Symbol Graph
// ═══════════════════════════════════════════════════════════════════

export interface SymbolConnection {
  symbolA: string;
  symbolB: string;
  coOccurrences: number;
  sharedEmotions: EmotionCategory[];
}

export interface DreamSymbolGraph {
  nodes: Array<{ symbol: string; frequency: number; firstSeen: string; lastSeen: string }>;
  connections: SymbolConnection[];
}

/**
 * Builds a symbol co-occurrence graph across dream entries.
 * Links symbols that appear together in the same dream.
 */
export function dreamSymbolGraph(entries: DreamEntry[]): DreamSymbolGraph {
  const freq = new Map<string, { count: number; firstSeen: string; lastSeen: string }>();
  const coOccur = new Map<string, number>();
  const sharedEmo = new Map<string, Set<string>>();

  for (const entry of entries) {
    for (const symbol of entry.symbols) {
      const existing = freq.get(symbol);
      if (!existing) {
        freq.set(symbol, { count: 1, firstSeen: entry.date, lastSeen: entry.date });
      } else {
        existing.count++;
        existing.lastSeen = entry.date;
      }
    }

    // Build co-occurrence pairs
    for (let i = 0; i < entry.symbols.length; i++) {
      for (let j = i + 1; j < entry.symbols.length; j++) {
        const key = [entry.symbols[i], entry.symbols[j]].sort().join('|');
        coOccur.set(key, (coOccur.get(key) ?? 0) + 1);
        if (!sharedEmo.has(key)) sharedEmo.set(key, new Set());
        for (const emo of entry.emotions) sharedEmo.get(key)!.add(emo);
      }
    }
  }

  const nodes = Array.from(freq.entries()).map(([symbol, data]) => ({
    symbol,
    frequency: data.count,
    firstSeen: data.firstSeen,
    lastSeen: data.lastSeen,
  }));

  const connections: SymbolConnection[] = Array.from(coOccur.entries()).map(([key, count]) => {
    const [a, b] = key.split('|');
    return {
      symbolA: a,
      symbolB: b,
      coOccurrences: count,
      sharedEmotions: Array.from(sharedEmo.get(key) ?? []) as EmotionCategory[],
    };
  });

  return { nodes, connections };
}

// ═══════════════════════════════════════════════════════════════════
// Text-to-3D Parser
// ═══════════════════════════════════════════════════════════════════

export interface EnvironmentKeyword {
  term: string;
  category: 'terrain' | 'sky' | 'object' | 'lighting' | 'weather' | 'creature';
  confidence: number;
}

const ENVIRONMENT_LEXICON: Record<string, EnvironmentKeyword['category']> = {
  mountain: 'terrain', ocean: 'terrain', forest: 'terrain', desert: 'terrain', cave: 'terrain',
  city: 'terrain', river: 'terrain', island: 'terrain', field: 'terrain', cliff: 'terrain',
  sun: 'sky', moon: 'sky', stars: 'sky', clouds: 'sky', sky: 'sky', aurora: 'sky',
  tree: 'object', door: 'object', bridge: 'object', tower: 'object', castle: 'object',
  dark: 'lighting', bright: 'lighting', glow: 'lighting', shadow: 'lighting',
  rain: 'weather', storm: 'weather', fog: 'weather', snow: 'weather', wind: 'weather',
  dragon: 'creature', wolf: 'creature', bird: 'creature', cat: 'creature', snake: 'creature',
};

/**
 * Extracts 3D environment keywords from a dream narrative.
 */
export function textTo3DParser(narrative: string): EnvironmentKeyword[] {
  const words = narrative.toLowerCase().split(/\W+/);
  const found: EnvironmentKeyword[] = [];
  const seen = new Set<string>();
  for (const word of words) {
    if (ENVIRONMENT_LEXICON[word] && !seen.has(word)) {
      seen.add(word);
      found.push({ term: word, category: ENVIRONMENT_LEXICON[word], confidence: 0.8 });
    }
  }
  return found;
}
