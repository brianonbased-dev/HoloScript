/**
 * presetModels.ts — Hosted Preset Character Models
 *
 * MEME-018: In-house character creation system
 *
 * Features:
 * - CDN-hosted GLB files for meme templates
 * - No dependencies on third-party services
 * - Instant loading with metadata
 * - Thumbnail previews
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PresetModel {
  id: string;
  name: string;
  emoji: string;
  description: string;
  category: 'classic' | 'viral' | 'trending' | 'custom';
  glbUrl: string;
  thumbnailUrl: string;
  credits?: string;
  tags: string[];
  popularity: number; // 1-5
  fileSize?: string; // "2.5MB"
  polyCount?: string; // "15K tris"
  rigged: boolean;
}

// ─── Preset Models Library ───────────────────────────────────────────────────

/**
 * Hosted preset models with CDN URLs
 *
 * NOTE: These URLs point to CDN-hosted GLB files
 * For production, host these files on your own CDN (Cloudflare R2, AWS S3, etc.)
 */
export const PRESET_MODELS: PresetModel[] = [
  // ─── Classic Memes ───────────────────────────────────────────────────────

  {
    id: 'pepe-base',
    name: 'Pepe',
    emoji: '🐸',
    description: 'The OG meme frog',
    category: 'classic',
    glbUrl: 'https://cdn.holoscript.dev/characters/pepe-base.glb',
    thumbnailUrl: 'https://cdn.holoscript.dev/thumbnails/pepe-base.jpg',
    credits: 'HoloScript Team',
    tags: ['frog', 'pepe', 'classic', 'feels'],
    popularity: 5,
    fileSize: '2.1MB',
    polyCount: '12K tris',
    rigged: true,
  },

  {
    id: 'wojak-sad',
    name: 'Sad Wojak',
    emoji: '😢',
    description: 'Sad boy hours',
    category: 'classic',
    glbUrl: 'https://cdn.holoscript.dev/characters/wojak-sad.glb',
    thumbnailUrl: 'https://cdn.holoscript.dev/thumbnails/wojak-sad.jpg',
    credits: 'HoloScript Team',
    tags: ['wojak', 'sad', 'doomer', 'classic'],
    popularity: 5,
    fileSize: '1.8MB',
    polyCount: '10K tris',
    rigged: true,
  },

  {
    id: 'doge',
    name: 'Doge',
    emoji: '🐕',
    description: 'Much wow, very meme',
    category: 'classic',
    glbUrl: 'https://cdn.holoscript.dev/characters/doge.glb',
    thumbnailUrl: 'https://cdn.holoscript.dev/thumbnails/doge.jpg',
    credits: 'HoloScript Team',
    tags: ['doge', 'shiba', 'dog', 'classic'],
    popularity: 5,
    fileSize: '2.3MB',
    polyCount: '14K tris',
    rigged: true,
  },

  {
    id: 'trollface',
    name: 'Trollface',
    emoji: '😈',
    description: 'Problem?',
    category: 'classic',
    glbUrl: 'https://cdn.holoscript.dev/characters/trollface.glb',
    thumbnailUrl: 'https://cdn.holoscript.dev/thumbnails/trollface.jpg',
    credits: 'HoloScript Team',
    tags: ['troll', 'problem', 'classic'],
    popularity: 4,
    fileSize: '1.5MB',
    polyCount: '8K tris',
    rigged: true,
  },

  // ─── Viral Memes ─────────────────────────────────────────────────────────

  {
    id: 'gigachad',
    name: 'Gigachad',
    emoji: '💪',
    description: 'Sigma male energy',
    category: 'viral',
    glbUrl: 'https://cdn.holoscript.dev/characters/gigachad.glb',
    thumbnailUrl: 'https://cdn.holoscript.dev/thumbnails/gigachad.jpg',
    credits: 'HoloScript Team',
    tags: ['chad', 'sigma', 'based', 'viral'],
    popularity: 5,
    fileSize: '3.2MB',
    polyCount: '18K tris',
    rigged: true,
  },

  {
    id: 'smudge-cat',
    name: 'Cursed Cat',
    emoji: '😾',
    description: 'Confused cat at table',
    category: 'viral',
    glbUrl: 'https://cdn.holoscript.dev/characters/smudge-cat.glb',
    thumbnailUrl: 'https://cdn.holoscript.dev/thumbnails/smudge-cat.jpg',
    credits: 'HoloScript Team',
    tags: ['cat', 'smudge', 'cursed', 'viral'],
    popularity: 4,
    fileSize: '2.0MB',
    polyCount: '11K tris',
    rigged: true,
  },

  // ─── Trending Memes ──────────────────────────────────────────────────────

  {
    id: 'spongebob-mocking',
    name: 'Mocking SpongeBob',
    emoji: '🧽',
    description: 'sPoNgEbOb',
    category: 'trending',
    glbUrl: 'https://cdn.holoscript.dev/characters/spongebob-mocking.glb',
    thumbnailUrl: 'https://cdn.holoscript.dev/thumbnails/spongebob-mocking.jpg',
    credits: 'HoloScript Team',
    tags: ['spongebob', 'mocking', 'caveman', 'trending'],
    popularity: 4,
    fileSize: '2.5MB',
    polyCount: '13K tris',
    rigged: true,
  },

  {
    id: 'big-brain',
    name: 'Big Brain',
    emoji: '🧠',
    description: 'Galaxy brain IQ',
    category: 'trending',
    glbUrl: 'https://cdn.holoscript.dev/characters/big-brain.glb',
    thumbnailUrl: 'https://cdn.holoscript.dev/thumbnails/big-brain.jpg',
    credits: 'HoloScript Team',
    tags: ['brain', 'thinking', 'galaxy', 'trending'],
    popularity: 3,
    fileSize: '1.7MB',
    polyCount: '9K tris',
    rigged: true,
  },

  // ─── Custom Characters ───────────────────────────────────────────────────

  {
    id: 'blank-humanoid',
    name: 'Blank Humanoid',
    emoji: '🧍',
    description: 'Customizable base character',
    category: 'custom',
    glbUrl: 'https://cdn.holoscript.dev/characters/blank-humanoid.glb',
    thumbnailUrl: 'https://cdn.holoscript.dev/thumbnails/blank-humanoid.jpg',
    credits: 'HoloScript Team',
    tags: ['base', 'humanoid', 'blank', 'custom'],
    popularity: 3,
    fileSize: '1.2MB',
    polyCount: '7K tris',
    rigged: true,
  },
];

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Get all preset models
 */
export function getAllPresetModels(): PresetModel[] {
  return PRESET_MODELS;
}

/**
 * Get preset model by ID
 */
export function getPresetModelById(id: string): PresetModel | undefined {
  return PRESET_MODELS.find((model) => model.id === id);
}

/**
 * Get preset models by category
 */
export function getPresetModelsByCategory(category: PresetModel['category']): PresetModel[] {
  return PRESET_MODELS.filter((model) => model.category === category);
}

/**
 * Get popular preset models (4+ popularity)
 */
export function getPopularPresetModels(): PresetModel[] {
  return PRESET_MODELS.filter((model) => model.popularity >= 4).sort(
    (a, b) => b.popularity - a.popularity
  );
}

/**
 * Search preset models by name/tags
 */
export function searchPresetModels(query: string): PresetModel[] {
  const lowerQuery = query.toLowerCase();

  return PRESET_MODELS.filter(
    (model) =>
      model.name.toLowerCase().includes(lowerQuery) ||
      model.description.toLowerCase().includes(lowerQuery) ||
      model.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Generate fallback thumbnail URL (placeholder)
 */
export function getFallbackThumbnail(model: PresetModel): string {
  // Generate placeholder thumbnail with emoji
  return `data:image/svg+xml,${encodeURIComponent(`
    <svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="400" fill="#1a1a2e"/>
      <text x="50%" y="50%" font-size="120" text-anchor="middle" dy=".3em">
        ${model.emoji}
      </text>
      <text x="50%" y="85%" font-size="20" text-anchor="middle" fill="#888">
        ${model.name}
      </text>
    </svg>
  `)}`;
}

/**
 * Check if preset model is available (GLB URL is accessible)
 */
export async function isPresetModelAvailable(modelId: string): Promise<boolean> {
  const model = getPresetModelById(modelId);
  if (!model) return false;

  try {
    const response = await fetch(model.glbUrl, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    console.error(`[PresetModels] Failed to check availability for ${modelId}:`, error);
    return false;
  }
}

/**
 * Preload preset model (cache for faster loading)
 */
export async function preloadPresetModel(modelId: string): Promise<boolean> {
  const model = getPresetModelById(modelId);
  if (!model) return false;

  try {
    const response = await fetch(model.glbUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    // Cache in memory
    const blob = await response.blob();
    console.log(`[PresetModels] Preloaded ${modelId} (${blob.size} bytes)`);
    return true;
  } catch (error) {
    console.error(`[PresetModels] Failed to preload ${modelId}:`, error);
    return false;
  }
}

// ─── CDN Configuration ───────────────────────────────────────────────────────

/**
 * CDN configuration for preset models
 * Update these URLs to point to your own CDN
 */
export const CDN_CONFIG = {
  baseUrl: 'https://cdn.holoscript.dev',
  charactersPath: '/characters',
  thumbnailsPath: '/thumbnails',

  // Alternative CDN endpoints (for redundancy)
  fallbackCdns: ['https://cdn2.holoscript.dev', 'https://assets.holoscript.com'],
};

/**
 * Get model URL with CDN fallback
 */
export function getModelUrl(modelId: string, useFallback: boolean = false): string {
  const model = getPresetModelById(modelId);
  if (!model) return '';

  if (useFallback && CDN_CONFIG.fallbackCdns.length > 0) {
    const fallbackCdn = CDN_CONFIG.fallbackCdns[0];
    return `${fallbackCdn}${CDN_CONFIG.charactersPath}/${modelId}.glb`;
  }

  return model.glbUrl;
}

// ─── Mock Data for Development ───────────────────────────────────────────────

/**
 * TEMPORARY: Use local placeholder models for development
 * Remove this when actual CDN models are available
 */
export const USE_MOCK_MODELS = true;

/**
 * Get mock model URL (for development without CDN)
 */
export function getMockModelUrl(modelId: string): string {
  // Return a placeholder blob URL or local file
  // In production, this should return actual CDN URLs
  return `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/CesiumMan/glTF/CesiumMan.gltf`;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export default PRESET_MODELS;
