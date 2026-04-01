import { logger } from '@/lib/logger';
/**
 * sketchfabIntegration.ts — Sketchfab Search & Download
 *
 * MEME-018: Sketchfab integration for character discovery
 *
 * Features:
 * - Search 3M+ models on Sketchfab
 * - Filter by license, format, poly count
 * - Preview thumbnails and model info
 * - Download GLB files (respecting licenses)
 * - OAuth authentication (optional, for private models)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SketchfabModel {
  uid: string;
  name: string;
  description?: string;
  thumbnail: string;
  author: {
    username: string;
    displayName: string;
    profileUrl: string;
  };
  license: {
    uid: string;
    label: string;
    requirements: string;
    url: string;
  };
  faceCount: number;
  vertexCount: number;
  animationCount: number;
  viewCount: number;
  likeCount: number;
  downloadCount?: number;
  isDownloadable: boolean;
  viewerUrl: string;
  embedUrl: string;
  tags: string[];
}

export interface SketchfabSearchParams {
  query: string;
  categories?: string; // e.g., "characters-creatures"
  license?: string; // e.g., "CC BY" for commercial use
  animated?: boolean;
  rigged?: boolean;
  maxFaceCount?: number; // Filter by poly count
  sort?: 'relevance' | 'likes' | 'views' | 'recent';
}

// ─── API Configuration ───────────────────────────────────────────────────────

/**
 * Get Sketchfab API key from localStorage (third-party integration)
 */
function getSketchfabAPIKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('holoscript_sketchfab_api_key') || '';
}

/**
 * Sketchfab API configuration
 * Docs: https://docs.sketchfab.com/data-api/v3/index.html
 * Uses localStorage for API key (third-party integration)
 */
function getSketchfabAPI() {
  return {
    baseUrl: 'https://api.sketchfab.com/v3',
    // API key is optional for public search
    // Required for downloading models (rate limits are higher with API key)
    apiKey: getSketchfabAPIKey(),
  };
}

// ─── Search ──────────────────────────────────────────────────────────────────

/**
 * Search Sketchfab models
 */
export async function searchSketchfab(
  params: SketchfabSearchParams,
  page: number = 1
): Promise<{ models: SketchfabModel[]; nextPage: number | null; totalCount: number }> {
  logger.debug('[Sketchfab] Searching:', params);

  // Build query parameters
  const queryParams = new URLSearchParams({
    q: params.query,
    type: 'models',
    downloadable: 'true', // Only show downloadable models
    count: '24', // Results per page
    cursor: ((page - 1) * 24).toString(),
  });

  // Add optional filters
  if (params.categories) {
    queryParams.set('categories', params.categories);
  }

  if (params.license) {
    queryParams.set('licenses', params.license);
  }

  if (params.animated) {
    queryParams.set('animated', 'true');
  }

  if (params.rigged) {
    queryParams.set('rigged', 'true');
  }

  if (params.maxFaceCount) {
    queryParams.set('max_face_count', params.maxFaceCount.toString());
  }

  if (params.sort) {
    queryParams.set('sort_by', params.sort === 'relevance' ? '-relevance' : `-${params.sort}`);
  }

  // Make API request
  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (getSketchfabAPI().apiKey) {
      headers['Authorization'] = `Token ${getSketchfabAPI().apiKey}`;
    }

    const response = await fetch(`${getSketchfabAPI().baseUrl}/search?${queryParams}`, {
      headers,
    });

    if (!response.ok) {
      throw new Error(`Sketchfab API error: ${response.status}`);
    }

    const data = await response.json();

    // Transform results
    const models: SketchfabModel[] = data.results.map((result: any) => ({
      uid: result.uid,
      name: result.name,
      description: result.description,
      thumbnail: result.thumbnails?.images?.[0]?.url || '',
      author: {
        username: result.user?.username || '',
        displayName: result.user?.displayName || result.user?.username || 'Unknown',
        profileUrl: result.user?.profileUrl || '',
      },
      license: {
        uid: result.license?.uid || '',
        label: result.license?.label || 'Unknown',
        requirements: result.license?.requirements || '',
        url: result.license?.url || '',
      },
      faceCount: result.faceCount || 0,
      vertexCount: result.vertexCount || 0,
      animationCount: result.animationCount || 0,
      viewCount: result.viewCount || 0,
      likeCount: result.likeCount || 0,
      downloadCount: result.downloadCount,
      isDownloadable: result.isDownloadable || false,
      viewerUrl: `https://sketchfab.com/models/${result.uid}`,
      embedUrl: `https://sketchfab.com/models/${result.uid}/embed`,
      tags: result.tags?.map((t: any) => t.name) || [],
    }));

    return {
      models,
      nextPage: data.next ? page + 1 : null,
      totalCount: data.count || 0,
    };
  } catch (error) {
    logger.error('[Sketchfab] Search failed:', error);
    throw new Error('Failed to search Sketchfab. Please try again.');
  }
}

// ─── Model Details ───────────────────────────────────────────────────────────

/**
 * Get detailed model information
 */
export async function getModelDetails(uid: string): Promise<SketchfabModel> {
  logger.debug('[Sketchfab] Fetching model details:', uid);

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (getSketchfabAPI().apiKey) {
    headers['Authorization'] = `Token ${getSketchfabAPI().apiKey}`;
  }

  const response = await fetch(`${getSketchfabAPI().baseUrl}/models/${uid}`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Sketchfab API error: ${response.status}`);
  }

  const data = await response.json();

  return {
    uid: data.uid,
    name: data.name,
    description: data.description,
    thumbnail: data.thumbnails?.images?.[0]?.url || '',
    author: {
      username: data.user?.username || '',
      displayName: data.user?.displayName || data.user?.username || 'Unknown',
      profileUrl: data.user?.profileUrl || '',
    },
    license: {
      uid: data.license?.uid || '',
      label: data.license?.label || 'Unknown',
      requirements: data.license?.requirements || '',
      url: data.license?.url || '',
    },
    faceCount: data.faceCount || 0,
    vertexCount: data.vertexCount || 0,
    animationCount: data.animationCount || 0,
    viewCount: data.viewCount || 0,
    likeCount: data.likeCount || 0,
    downloadCount: data.downloadCount,
    isDownloadable: data.isDownloadable || false,
    viewerUrl: `https://sketchfab.com/models/${data.uid}`,
    embedUrl: `https://sketchfab.com/models/${data.uid}/embed`,
    tags: data.tags?.map((t: any) => t.name) || [],
  };
}

// ─── Download ────────────────────────────────────────────────────────────────

/**
 * Get download URL for model
 * NOTE: Requires API key or OAuth authentication
 */
export async function getDownloadUrl(uid: string): Promise<string> {
  logger.debug('[Sketchfab] Getting download URL:', uid);

  if (!getSketchfabAPI().apiKey) {
    throw new Error(
      'Sketchfab API key required for downloads. Please configure NEXT_PUBLIC_SKETCHFAB_API_KEY'
    );
  }

  const response = await fetch(`${getSketchfabAPI().baseUrl}/models/${uid}/download`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${getSketchfabAPI().apiKey}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Sketchfab authentication required. Please configure your API key.');
    }
    if (response.status === 403) {
      throw new Error('Model cannot be downloaded. Check license or authentication.');
    }
    throw new Error(`Sketchfab API error: ${response.status}`);
  }

  const data = await response.json();

  // Get GLB format URL
  const glbFormat = data.gltf?.url || data.source?.url;

  if (!glbFormat) {
    throw new Error('GLB format not available for this model');
  }

  return glbFormat;
}

/**
 * Download model as GLB
 */
export async function downloadModel(uid: string): Promise<Blob> {
  const downloadUrl = await getDownloadUrl(uid);

  const response = await fetch(downloadUrl);

  if (!response.ok) {
    throw new Error('Failed to download model');
  }

  return await response.blob();
}

// ─── License Helpers ─────────────────────────────────────────────────────────

/**
 * Check if license allows commercial use
 */
export function allowsCommercialUse(license: SketchfabModel['license']): boolean {
  const commercialFriendly = ['CC BY', 'CC BY-SA', 'CC0', 'Public Domain'];
  return commercialFriendly.some((l) => license.label.includes(l));
}

/**
 * Check if license requires attribution
 */
export function requiresAttribution(license: SketchfabModel['license']): boolean {
  return license.label.includes('BY') || license.requirements.includes('attribution');
}

/**
 * Get license summary for UI
 */
export function getLicenseSummary(license: SketchfabModel['license']): {
  commercial: boolean;
  attribution: boolean;
  derivative: boolean;
  summary: string;
} {
  const commercial = allowsCommercialUse(license);
  const attribution = requiresAttribution(license);
  const derivative = !license.label.includes('ND'); // No Derivatives

  let summary = license.label;

  if (commercial) {
    summary += ' • ✅ Commercial use OK';
  } else {
    summary += ' • ⚠️ Non-commercial only';
  }

  if (attribution) {
    summary += ' • Credit required';
  }

  if (!derivative) {
    summary += ' • No modifications';
  }

  return {
    commercial,
    attribution,
    derivative,
    summary,
  };
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Format poly count for display
 */
export function formatPolyCount(faceCount: number): string {
  if (faceCount < 1000) return `${faceCount} tris`;
  if (faceCount < 1000000) return `${(faceCount / 1000).toFixed(1)}K tris`;
  return `${(faceCount / 1000000).toFixed(1)}M tris`;
}

/**
 * Format view count for display
 */
export function formatViewCount(viewCount: number): string {
  if (viewCount < 1000) return viewCount.toString();
  if (viewCount < 1000000) return `${(viewCount / 1000).toFixed(1)}K`;
  return `${(viewCount / 1000000).toFixed(1)}M`;
}

/**
 * Check if Sketchfab API is available
 */
export function isSketchfabAvailable(): boolean {
  return !!getSketchfabAPI().apiKey;
}

/**
 * Get common character search categories
 */
export function getCharacterCategories(): Array<{ id: string; label: string }> {
  return [
    { id: 'characters-creatures', label: 'Characters & Creatures' },
    { id: 'people', label: 'People' },
    { id: 'animals-pets', label: 'Animals & Pets' },
    { id: 'fantasy', label: 'Fantasy' },
    { id: 'sci-fi', label: 'Sci-Fi' },
    { id: 'cartoon', label: 'Cartoon' },
    { id: 'anime', label: 'Anime' },
    { id: 'horror', label: 'Horror' },
  ];
}

// ─── Export ──────────────────────────────────────────────────────────────────

export default {
  searchSketchfab,
  getModelDetails,
  downloadModel,
  allowsCommercialUse,
  requiresAttribution,
  getLicenseSummary,
  formatPolyCount,
  formatViewCount,
  isSketchfabAvailable,
  getCharacterCategories,
};
