export interface TraitPlatformSupport {
  r3f: boolean;
  gltf: boolean;
  unity: boolean;
  unreal: boolean;
  babylon: boolean;
  webxr: boolean;
  arcore: boolean;
  arkit: boolean;
}

export interface TraitPropertyInfo {
  name: string;
  type: string;
  required: boolean;
  default?: unknown;
  description?: string;
}

export interface TraitCoverage {
  hasExample: boolean;
  hasTest: boolean;
  hasDoc: boolean;
}

export interface TraitMatrixEntry {
  name: string;
  category: string;
  platforms: TraitPlatformSupport;
  features: string[];
  properties: TraitPropertyInfo[];
  requires: string[];
  conflicts: string[];
  coverage: TraitCoverage;
}

export type SortField = 'name' | 'category' | 'platforms' | 'coverage';
export type SortDir = 'asc' | 'desc';
