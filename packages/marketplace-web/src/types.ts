/**
 * HoloScript Marketplace Web Types
 *
 * Client-side type definitions for the marketplace UI
 */

//=============================================================================
// Core Types (mirroring API types for client use)
//=============================================================================

export type TraitCategory =
  | 'rendering'
  | 'physics'
  | 'networking'
  | 'audio'
  | 'ui'
  | 'ai'
  | 'blockchain'
  | 'utility';

export type Platform = 'web' | 'unity' | 'unreal' | 'godot' | 'native' | 'mobile' | 'vr' | 'ar';

export interface Author {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  verified: boolean;
  github?: string;
  website?: string;
}

export interface TraitPackage {
  id: string;
  name: string;
  version: string;
  description: string;
  author: Author;
  license: string;
  keywords: string[];
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  repository?: string;
  homepage?: string;
  source: string;
  types?: string;
  readme?: string;
  examples?: Example[];
  platforms: Platform[];
  category: TraitCategory;
  verified: boolean;
  deprecated: boolean;
  deprecationMessage?: string;
  downloads: number;
  weeklyDownloads: number;
  rating: number;
  ratingCount: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date;
}

export interface Example {
  name: string;
  description?: string;
  code: string;
}

export interface TraitSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  author: Pick<Author, 'id' | 'name' | 'avatar' | 'verified'>;
  category: TraitCategory;
  platforms: Platform[];
  verified: boolean;
  deprecated: boolean;
  downloads: number;
  weeklyDownloads: number;
  rating: number;
  ratingCount: number;
  updatedAt: Date;
}

export interface VersionInfo {
  version: string;
  publishedAt: Date;
  downloads: number;
  deprecated: boolean;
  deprecationMessage?: string;
}

//=============================================================================
// Search & Filter Types
//=============================================================================

export interface SearchQuery {
  q?: string;
  category?: TraitCategory;
  platform?: Platform;
  author?: string;
  verified?: boolean;
  sortBy?: 'relevance' | 'downloads' | 'rating' | 'updated' | 'name';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface SearchResult {
  traits: TraitSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  facets: SearchFacets;
}

export interface SearchFacets {
  categories: Record<TraitCategory, number>;
  platforms: Record<Platform, number>;
  licenses: Record<string, number>;
}

export interface FilterState {
  category: TraitCategory | null;
  platform: Platform | null;
  verified: boolean | null;
  sortBy: 'relevance' | 'downloads' | 'rating' | 'updated' | 'name';
  sortOrder: 'asc' | 'desc';
}

//=============================================================================
// Dependency Types
//=============================================================================

export interface DependencyNode {
  id: string;
  version: string;
  resolvedVersion: string;
  dependencies: DependencyNode[];
  isOptional: boolean;
  isPeer: boolean;
}

export interface DependencyTree {
  root: string;
  nodes: DependencyNode[];
  flatList: Array<{ id: string; version: string }>;
  conflicts: DependencyConflict[];
}

export interface DependencyConflict {
  traitId: string;
  requestedVersions: Array<{ by: string; version: string }>;
  resolvedVersion: string;
  severity: 'warning' | 'error';
}

//=============================================================================
// Stats & Analytics Types
//=============================================================================

export interface DownloadStats {
  total: number;
  lastDay: number;
  lastWeek: number;
  lastMonth: number;
  history: DailyDownloads[];
}

export interface DailyDownloads {
  date: string;
  count: number;
}

export interface TraitRating {
  userId: string;
  rating: number;
  review?: string;
  createdAt: Date;
}

//=============================================================================
// UI State Types
//=============================================================================

export interface MarketplaceState {
  // Search state
  query: string;
  filters: FilterState;
  results: SearchResult | null;
  isSearching: boolean;

  // Selected trait
  selectedTrait: TraitPackage | null;
  selectedVersion: string | null;

  // Actions
  setQuery: (query: string) => void;
  setFilters: (filters: Partial<FilterState>) => void;
  search: () => Promise<void>;
  selectTrait: (traitId: string, version?: string) => Promise<void>;
  clearSelection: () => void;
}

export interface InstallState {
  installing: Set<string>;
  installed: Set<string>;
  errors: Map<string, string>;

  install: (traitId: string, version: string) => Promise<void>;
  uninstall: (traitId: string) => Promise<void>;
  isInstalling: (traitId: string) => boolean;
  isInstalled: (traitId: string) => boolean;
}

//=============================================================================
// API Response Types
//=============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

//=============================================================================
// Component Props Types
//=============================================================================

export interface TraitCardProps {
  trait: TraitSummary;
  onClick?: () => void;
  onInstall?: () => void;
  isInstalled?: boolean;
  isInstalling?: boolean;
}

export interface CategoryBadgeProps {
  category: TraitCategory;
  size?: 'sm' | 'md' | 'lg';
}

export interface PlatformIconsProps {
  platforms: Platform[];
  maxDisplay?: number;
}

export interface RatingDisplayProps {
  rating: number;
  count: number;
  size?: 'sm' | 'md' | 'lg';
  interactive?: boolean;
  onRate?: (rating: number) => void;
}

export interface DependencyGraphProps {
  tree: DependencyTree;
  onNodeClick?: (nodeId: string) => void;
}

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  isLoading?: boolean;
}

export interface FilterPanelProps {
  filters: FilterState;
  facets: SearchFacets;
  onChange: (filters: Partial<FilterState>) => void;
  onReset: () => void;
}

//=============================================================================
// Utility Types
//=============================================================================

export type CategoryColors = Record<TraitCategory, string>;

export const CATEGORY_COLORS: CategoryColors = {
  rendering: '#f97316',
  physics: '#22c55e',
  networking: '#3b82f6',
  audio: '#a855f7',
  ui: '#ec4899',
  ai: '#14b8a6',
  blockchain: '#f59e0b',
  utility: '#6b7280',
};

export const CATEGORY_LABELS: Record<TraitCategory, string> = {
  rendering: 'Rendering',
  physics: 'Physics',
  networking: 'Networking',
  audio: 'Audio',
  ui: 'UI',
  ai: 'AI',
  blockchain: 'Blockchain',
  utility: 'Utility',
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  web: 'Web',
  unity: 'Unity',
  unreal: 'Unreal',
  godot: 'Godot',
  native: 'Native',
  mobile: 'Mobile',
  vr: 'VR',
  ar: 'AR',
};

export const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'downloads', label: 'Downloads' },
  { value: 'rating', label: 'Rating' },
  { value: 'updated', label: 'Recently Updated' },
  { value: 'name', label: 'Name' },
] as const;
