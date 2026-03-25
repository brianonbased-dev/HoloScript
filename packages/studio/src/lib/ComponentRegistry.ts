/**
 * ComponentRegistry.ts — Studio Component Ownership Registry
 *
 * Tracks all studio components, detects duplicates, and establishes
 * canonical ownership to prevent component sprawl.
 */

export interface ComponentEntry {
  /** Canonical component name */
  name: string;
  /** File path relative to packages/studio/src/ */
  path: string;
  /** Component category */
  category: ComponentCategory;
  /** Owner package or team */
  owner: string;
  /** Known duplicates that should be consolidated */
  duplicates?: string[];
  /** Whether this is the canonical version */
  isCanonical: boolean;
}

export type ComponentCategory =
  | 'editor'
  | 'panel'
  | 'shader'
  | 'export'
  | 'scene'
  | 'trait'
  | 'debug'
  | 'marketplace'
  | 'ai'
  | 'vr'
  | 'layout'
  | 'command';

/**
 * Registry of all Studio components with duplicate detection.
 *
 * Known duplicate pairs identified during audit:
 * - ShaderEditor vs ShaderEditorPanel
 * - ExportPanel vs ExportPipelinePanel
 * - SceneView vs SceneViewport
 * - TraitInspector vs TraitPanel
 */
export const COMPONENT_REGISTRY: ComponentEntry[] = [
  // ── Shader ──
  {
    name: 'ShaderEditor',
    path: 'components/shader/ShaderEditor.tsx',
    category: 'shader',
    owner: 'studio-core',
    isCanonical: true,
    duplicates: ['components/panels/ShaderEditorPanel.tsx'],
  },
  {
    name: 'ShaderEditorPanel',
    path: 'components/panels/ShaderEditorPanel.tsx',
    category: 'shader',
    owner: 'studio-core',
    isCanonical: false,
    duplicates: ['components/shader/ShaderEditor.tsx'],
  },

  // ── Export ──
  {
    name: 'ExportPanel',
    path: 'components/export/ExportPanel.tsx',
    category: 'export',
    owner: 'studio-core',
    isCanonical: true,
    duplicates: ['components/panels/ExportPipelinePanel.tsx'],
  },
  {
    name: 'ExportPipelinePanel',
    path: 'components/panels/ExportPipelinePanel.tsx',
    category: 'export',
    owner: 'studio-core',
    isCanonical: false,
    duplicates: ['components/export/ExportPanel.tsx'],
  },

  // ── Scene ──
  {
    name: 'ScenarioGallery',
    path: 'industry/scenarios/ScenarioGallery.tsx',
    category: 'scene',
    owner: 'studio-core',
    isCanonical: true,
  },
  {
    name: 'ScenarioCard',
    path: 'industry/scenarios/ScenarioCard.tsx',
    category: 'scene',
    owner: 'studio-core',
    isCanonical: true,
  },

  // ── Command ──
  {
    name: 'CommandPalette',
    path: 'components/command-palette/CommandPalette.tsx',
    category: 'command',
    owner: 'studio-core',
    isCanonical: true,
  },

  // ── AI ──
  {
    name: 'AIPromptOverlay',
    path: 'app/create/page.tsx',
    category: 'ai',
    owner: 'studio-app',
    isCanonical: true,
  },

  // ── Layout ──
  {
    name: 'PhysicsPanel',
    path: 'components/physics/PhysicsPanel.tsx',
    category: 'panel',
    owner: 'studio-core',
    isCanonical: true,
  },
];

/**
 * Find the canonical version of a component by name.
 * Returns the canonical entry, or the first match if none is canonical.
 */
export function findCanonical(name: string): ComponentEntry | undefined {
  const matches = COMPONENT_REGISTRY.filter((c) => c.name.toLowerCase() === name.toLowerCase());
  return matches.find((c) => c.isCanonical) ?? matches[0];
}

/**
 * Find all duplicate pairs in the registry.
 */
export function findDuplicates(): Array<{
  canonical: ComponentEntry;
  duplicates: ComponentEntry[];
}> {
  const canonicals = COMPONENT_REGISTRY.filter(
    (c) => c.isCanonical && c.duplicates && c.duplicates.length > 0
  );

  return canonicals.map((canonical) => ({
    canonical,
    duplicates: COMPONENT_REGISTRY.filter(
      (c) =>
        !c.isCanonical && canonical.duplicates?.some((d) => c.path.endsWith(d.split('/').pop()!))
    ),
  }));
}

/**
 * Get all components by category.
 */
export function getByCategory(category: ComponentCategory): ComponentEntry[] {
  return COMPONENT_REGISTRY.filter((c) => c.category === category);
}

/**
 * Get registry health report.
 */
export function getRegistryHealth(): {
  total: number;
  canonical: number;
  duplicates: number;
  categories: Record<string, number>;
} {
  const categories: Record<string, number> = {};
  for (const entry of COMPONENT_REGISTRY) {
    categories[entry.category] = (categories[entry.category] ?? 0) + 1;
  }

  return {
    total: COMPONENT_REGISTRY.length,
    canonical: COMPONENT_REGISTRY.filter((c) => c.isCanonical).length,
    duplicates: COMPONENT_REGISTRY.filter((c) => !c.isCanonical).length,
    categories,
  };
}
