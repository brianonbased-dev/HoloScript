/**
 * aiCharacterGeneration.ts — AI-Driven Character Generation
 *
 * Generate character meshes, traits, and backstories from text prompts.
 */

// Re-export AI generation service (Meshy/Rodin APIs)
export {
  type AIProvider,
  type GenerationRequest,
  type GenerationStatus,
  startGeneration,
  pollGenerationStatus,
  cancelGeneration,
  isAIGenerationAvailable,
  getAvailableProviders,
  estimateGenerationCost,
  imageToDataUrl,
  validatePrompt,
} from './character/aiCharacterGeneration';

export interface CharacterPrompt {
  description: string;
  style: 'realistic' | 'stylized' | 'anime' | 'pixel' | 'low-poly';
  bodyType: 'standard' | 'athletic' | 'heavy' | 'slim' | 'child';
  gender: 'male' | 'female' | 'androgynous' | 'non-binary';
  accessories?: string[];
}

export interface GeneratedCharacter {
  id: string;
  name: string;
  prompt: CharacterPrompt;
  meshId: string;
  textureIds: string[];
  skeleton: SkeletonConfig;
  backstory: string;
  traits: CharacterTrait[];
  createdAt: number;
}

export interface SkeletonConfig {
  boneCount: number;
  hasFingers: boolean;
  hasFacialBones: boolean;
  ikChains: string[]; // e.g., ['left-arm', 'right-arm', 'left-leg', 'right-leg']
}

export interface CharacterTrait {
  name: string;
  category: 'appearance' | 'personality' | 'ability' | 'equipment';
  value: string;
}

/**
 * Parse a text prompt into structured character parameters.
 */
export function parseCharacterPrompt(text: string): CharacterPrompt {
  const lower = text.toLowerCase();
  const style: CharacterPrompt['style'] = lower.includes('anime')
    ? 'anime'
    : lower.includes('pixel')
      ? 'pixel'
      : lower.includes('low-poly') || lower.includes('lowpoly')
        ? 'low-poly'
        : lower.includes('stylized') || lower.includes('cartoon')
          ? 'stylized'
          : 'realistic';

  const bodyType: CharacterPrompt['bodyType'] =
    lower.includes('athletic') || lower.includes('muscular')
      ? 'athletic'
      : lower.includes('heavy') || lower.includes('large')
        ? 'heavy'
        : lower.includes('slim') || lower.includes('thin')
          ? 'slim'
          : lower.includes('child') || lower.includes('kid')
            ? 'child'
            : 'standard';

  const gender: CharacterPrompt['gender'] =
    lower.includes('female') || lower.includes('woman') || lower.includes('girl')
      ? 'female'
      : lower.includes('male') || lower.includes('man') || lower.includes('boy')
        ? 'male'
        : lower.includes('androgynous')
          ? 'androgynous'
          : 'non-binary';

  const accessories: string[] = [];
  const accessoryKeywords = [
    'hat',
    'glasses',
    'sword',
    'shield',
    'cape',
    'armor',
    'wings',
    'tail',
    'horns',
    'staff',
    'bow',
    'backpack',
  ];
  for (const kw of accessoryKeywords) {
    if (lower.includes(kw)) accessories.push(kw);
  }

  return { description: text, style, bodyType, gender, accessories };
}

/**
 * Estimate polygon count for a character style.
 */
export function estimatePolyCount(style: CharacterPrompt['style'], hasFingers: boolean): number {
  const base: Record<CharacterPrompt['style'], number> = {
    pixel: 200,
    'low-poly': 1500,
    stylized: 8000,
    anime: 12000,
    realistic: 30000,
  };
  let count = base[style] || 10000;
  if (hasFingers) count += Math.round(count * 0.15);
  return count;
}

/**
 * Generate default skeleton configuration for a style.
 */
export function defaultSkeleton(style: CharacterPrompt['style']): SkeletonConfig {
  if (style === 'pixel' || style === 'low-poly') {
    return {
      boneCount: 18,
      hasFingers: false,
      hasFacialBones: false,
      ikChains: ['left-arm', 'right-arm', 'left-leg', 'right-leg'],
    };
  }
  return {
    boneCount: 65,
    hasFingers: true,
    hasFacialBones: style === 'realistic' || style === 'anime',
    ikChains: ['left-arm', 'right-arm', 'left-leg', 'right-leg', 'spine'],
  };
}

/**
 * Generate character traits from a prompt.
 */
export function generateTraits(prompt: CharacterPrompt): CharacterTrait[] {
  const traits: CharacterTrait[] = [
    { name: 'Body Type', category: 'appearance', value: prompt.bodyType },
    { name: 'Art Style', category: 'appearance', value: prompt.style },
  ];
  if (prompt.accessories) {
    for (const acc of prompt.accessories) {
      traits.push({ name: acc, category: 'equipment', value: acc });
    }
  }
  return traits;
}

/**
 * Generate a placeholder backstory.
 */
export function generateBackstory(prompt: CharacterPrompt): string {
  const origin =
    prompt.style === 'anime'
      ? 'a mystical academy'
      : prompt.style === 'pixel'
        ? 'a retro kingdom'
        : prompt.style === 'realistic'
          ? 'a modern city'
          : 'a distant land';
  return `A ${prompt.bodyType} ${prompt.gender} character from ${origin}. ${prompt.description}`;
}
