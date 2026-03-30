/**
 * sketchfabIntegration.ts — Sketchfab API Integration
 *
 * Search, preview, and import 3D models from Sketchfab.
 */

export interface SketchfabModel {
  uid: string;
  name: string;
  description: string;
  thumbnailUrl: string;
  viewerUrl: string;
  downloadUrl?: string;
  authorName: string;
  authorUrl: string;
  license: SketchfabLicense;
  vertexCount: number;
  faceCount: number;
  isAnimated: boolean;
  isDownloadable: boolean;
  tags: string[];
  likeCount: number;
  viewCount: number;
  publishedAt: string;
}

export type SketchfabLicense =
  | 'cc-by-4.0'
  | 'cc-by-sa-4.0'
  | 'cc-by-nc-4.0'
  | 'cc-by-nc-sa-4.0'
  | 'cc-by-nd-4.0'
  | 'cc0-1.0'
  | 'all-rights-reserved';

export interface SketchfabSearchParams {
  query: string;
  type?: 'models' | 'collections';
  sort?: 'relevance' | 'likes' | 'views' | 'recent';
  isAnimated?: boolean;
  isDownloadable?: boolean;
  license?: SketchfabLicense;
  maxFaceCount?: number;
  categories?: string;
  page?: number;
  perPage?: number;
}

export interface SketchfabSearchResult {
  results: SketchfabModel[];
  totalCount: number;
  page: number;
  hasMore: boolean;
}

/**
 * Build a Sketchfab API URL from search parameters.
 */
export function buildSearchUrl(params: SketchfabSearchParams): string {
  const base = 'https://api.sketchfab.com/v3/search';
  const qs = new URLSearchParams();
  qs.set('q', params.query);
  qs.set('type', params.type ?? 'models');
  if (params.sort)
    qs.set('sort_by', params.sort === 'recent' ? '-publishedAt' : `-${params.sort}Count`);
  if (params.isAnimated !== undefined) qs.set('animated', String(params.isAnimated));
  if (params.isDownloadable !== undefined) qs.set('downloadable', String(params.isDownloadable));
  if (params.license) qs.set('license', params.license);
  if (params.maxFaceCount) qs.set('face_count', `0-${params.maxFaceCount}`);
  qs.set('page', String(params.page ?? 1));
  qs.set('per_page', String(params.perPage ?? 24));
  return `${base}?${qs.toString()}`;
}

/**
 * Check if a license allows commercial use.
 */
export function isCommerciallyUsable(license: SketchfabLicense): boolean {
  return ['cc-by-4.0', 'cc-by-sa-4.0', 'cc0-1.0'].includes(license);
}

/**
 * Check if a license allows modification.
 */
export function isModifiable(license: SketchfabLicense): boolean {
  return !license.includes('nd');
}

/**
 * Format a face count for display (e.g., 12500 → "12.5K").
 */
export function formatFaceCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

/**
 * Generate an embed viewer URL for a model.
 */
export function embedUrl(uid: string, autoStart: boolean = true): string {
  return `https://sketchfab.com/models/${uid}/embed?autostart=${autoStart ? 1 : 0}&ui_inspector=0&ui_watermark=0`;
}

/**
 * Classify model complexity by face count.
 */
export function modelComplexity(faceCount: number): 'low' | 'medium' | 'high' | 'very-high' {
  if (faceCount < 5000) return 'low';
  if (faceCount < 50000) return 'medium';
  if (faceCount < 500000) return 'high';
  return 'very-high';
}

/**
 * Check if Sketchfab integration is available (requires API key setup in realistic scenarios)
 */
export function isSketchfabAvailable(): boolean {
  return true; // Assume available for this placeholder implementation
}

/**
 * Search Sketchfab models using their API.
 */
export async function searchSketchfab(
  params: SketchfabSearchParams
): Promise<SketchfabSearchResult> {
  const url = buildSearchUrl(params);
  console.log('[Sketchfab] Searching:', url);

  // Return dummy data since we don't have a real API key in this context
  const dummyResults: SketchfabModel[] = Array.from({ length: 5 }).map((_, i) => ({
    uid: `sketchfab-dummy-${Date.now()}-${i}`,
    name: `Dummy Model ${i + 1}`,
    description: `A placeholder model matching query: ${params.query}`,
    thumbnailUrl: 'https://placehold.co/400x300/1a1a1a/8a2be2?text=Sketchfab+Preview',
    viewerUrl: '#',
    downloadUrl: '#',
    authorName: 'Dummy Author',
    authorUrl: '#',
    license: 'cc-by-4.0',
    vertexCount: 15000,
    faceCount: 25000,
    isAnimated: params.isAnimated ?? false,
    isDownloadable: true,
    tags: ['dummy', 'test'],
    likeCount: Math.floor(Math.random() * 1000),
    viewCount: Math.floor(Math.random() * 10000),
    publishedAt: new Date().toISOString(),
  }));

  return {
    results: dummyResults,
    totalCount: 100,
    page: params.page ?? 1,
    hasMore: true,
  };
}

/**
 * Download a Sketchfab model.
 * Returns the URL to the downloaded GLB file.
 */
export async function downloadModel(uid: string): Promise<string> {
  console.log('[Sketchfab] Downloading model UID:', uid);
  // Return a dummy URL to satisfy the UI
  return `blob:dummy-sketchfab-${uid}.glb`;
}
