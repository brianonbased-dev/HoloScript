/**
 * templateSearch.ts
 *
 * Search and filter functions for the Scene Template Library.
 * Used by the Scene Composer's template picker UI.
 */

export interface SceneTemplate {
  id: string;
  name: string;
  category: string;
  description?: string;
  tags?: string[];
  /** Initial nodes to auto-add when the template is applied */
  nodes?: Array<{
    name: string;
    type: string;
    traits: string[];
  }>;
}

// ── Built-in Template Library ────────────────────────────────────────────────

export const BUILT_IN_TEMPLATES: SceneTemplate[] = [
  {
    id: 'empty',
    name: 'Empty Scene',
    category: 'Basics',
    description: 'A clean scene with only ambient light',
    tags: ['blank', 'starter'],
    nodes: [],
  },
  {
    id: 'basic-lighting',
    name: 'Basic Lighting',
    category: 'Basics',
    description: 'Directional + ambient light setup',
    tags: ['lighting', 'starter'],
    nodes: [
      { name: 'Directional Light', type: 'light', traits: ['@directional'] },
      { name: 'Ambient Light', type: 'light', traits: ['@ambient'] },
    ],
  },
  {
    id: 'robot-scene',
    name: 'Robot Scene',
    category: 'Engineering',
    description: 'Pre-rigged robot arm with IK bones',
    tags: ['robot', 'ik', 'mechanical'],
    nodes: [
      { name: 'Base', type: 'mesh', traits: ['@spawn'] },
      { name: 'Arm Joint', type: 'mesh', traits: ['@joint', '@physics'] },
    ],
  },
  {
    id: 'industrial-plant',
    name: 'Industrial Plant',
    category: 'Engineering',
    description: 'Factory floor with safety zones and equipment placeholders',
    tags: ['industrial', 'plant', 'safety'],
    nodes: [
      { name: 'Floor Grid', type: 'group', traits: ['@grid'] },
      { name: 'Safety Zone A', type: 'mesh', traits: ['@sensor'] },
    ],
  },
  {
    id: 'character-rig',
    name: 'Character Rig',
    category: 'Character',
    description: 'Humanoid character with skeleton and IK handles',
    tags: ['character', 'rig', 'animation'],
    nodes: [
      { name: 'Hips', type: 'mesh', traits: ['@joint'] },
      { name: 'Spine', type: 'mesh', traits: ['@joint'] },
    ],
  },
  {
    id: 'paint-scene',
    name: 'Sculpt Canvas',
    category: 'Art',
    description: 'Single high-poly mesh ready for texture painting',
    tags: ['sculpt', 'paint', 'art'],
    nodes: [
      { name: 'Sculpt Mesh', type: 'mesh', traits: ['@paintable'] },
    ],
  },
  {
    id: 'vr-experience',
    name: 'VR Experience',
    category: 'Interactive',
    description: 'VR-ready scene with teleport zones and XR rig',
    tags: ['vr', 'xr', 'interactive'],
    nodes: [
      { name: 'XR Rig', type: 'group', traits: ['@xr'] },
      { name: 'Teleport Zone', type: 'mesh', traits: ['@teleport'] },
    ],
  },
  {
    id: 'ambient-audio',
    name: 'Ambient Audio Scene',
    category: 'Audio',
    description: 'Spatialized audio emitters across a landscape',
    tags: ['audio', 'spatial', 'ambient'],
    nodes: [
      { name: 'Wind Emitter', type: 'audio', traits: ['@audio'] },
      { name: 'Rain Emitter', type: 'audio', traits: ['@audio'] },
    ],
  },
];

// ── Search Functions ──────────────────────────────────────────────────────────

/**
 * Search templates by name, description, tags, or category.
 * Case-insensitive. Returns matching templates ordered by relevance.
 *
 * @param templates  Source template list (defaults to BUILT_IN_TEMPLATES)
 * @param query      Search string
 * @param category   Optional category filter
 */
export function searchTemplates(
  templates: SceneTemplate[],
  query: string,
  category?: string,
): SceneTemplate[] {
  const q = query.toLowerCase().trim();
  let results = templates;

  if (category) {
    results = results.filter(t => t.category.toLowerCase() === category.toLowerCase());
  }

  if (!q) return results;

  return results.filter(t => {
    const nameMatch = t.name.toLowerCase().includes(q);
    const descMatch = t.description?.toLowerCase().includes(q) ?? false;
    const tagMatch  = t.tags?.some(tag => tag.toLowerCase().includes(q)) ?? false;
    const catMatch  = t.category.toLowerCase().includes(q);
    return nameMatch || descMatch || tagMatch || catMatch;
  });
}

/**
 * Get all unique categories from a template list.
 */
export function getTemplateCategories(templates: SceneTemplate[]): string[] {
  return [...new Set(templates.map(t => t.category))].sort();
}

/**
 * Find a template by exact ID.
 */
export function findTemplateById(
  templates: SceneTemplate[],
  id: string,
): SceneTemplate | undefined {
  return templates.find(t => t.id === id);
}

/**
 * Filter templates that contain a specific trait in their initial nodes.
 */
export function filterTemplatesByTrait(
  templates: SceneTemplate[],
  trait: string,
): SceneTemplate[] {
  const t = trait.startsWith('@') ? trait : `@${trait}`;
  return templates.filter(tmpl =>
    tmpl.nodes?.some(n => n.traits.includes(t)) ?? false,
  );
}

/**
 * Get templates sorted by name (ascending).
 */
export function sortTemplatesByName(templates: SceneTemplate[]): SceneTemplate[] {
  return [...templates].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get templates for a given category, sorted by name.
 */
export function getTemplatesByCategory(
  templates: SceneTemplate[],
  category: string,
): SceneTemplate[] {
  return sortTemplatesByName(
    templates.filter(t => t.category.toLowerCase() === category.toLowerCase()),
  );
}
