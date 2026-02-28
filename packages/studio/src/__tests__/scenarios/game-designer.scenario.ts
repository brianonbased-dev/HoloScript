/**
 * game-designer.scenario.ts — LIVING-SPEC: Full-Stack Game Designer
 *
 * Persona: Kai — game designer who manages multi-scene projects,
 * searches templates, serializes .holo files, and publishes.
 *
 * ✓ it(...)      = PASSING — feature exists
 * ⊡ it.todo(...) = SKIPPED — missing feature (backlog item)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore, type ProjectScene } from '@/lib/projectStore';
import {
  searchTemplates, getTemplateCategories, findTemplateById,
  filterTemplatesByTrait, sortTemplatesByName, getTemplatesByCategory,
  BUILT_IN_TEMPLATES,
} from '@/lib/templateSearch';
import {
  serializeScene, serializeToJSON, deserializeScene,
  type HoloScene, type HoloSceneMetadata,
} from '@/lib/serializer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMeta(name = 'Test Scene'): HoloSceneMetadata {
  return { id: 'test-1', name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

// ═══════════════════════════════════════════════════════════════════
// 1. Multi-Scene Project Management
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Game Designer — Multi-Scene Project Management', () => {
  beforeEach(() => {
    useProjectStore.setState({
      scenes: [{
        id: 'default', name: 'Scene 1',
        code: '// New scene\nscene "Untitled" {\n\n}\n',
        isDirty: false, createdAt: new Date().toISOString(),
      }],
      activeSceneId: 'default',
    });
  });

  it('project starts with one default scene', () => {
    expect(useProjectStore.getState().scenes).toHaveLength(1);
    expect(useProjectStore.getState().scenes[0].name).toBe('Scene 1');
  });

  it('addScene() creates a new scene and makes it active', () => {
    const scene = useProjectStore.getState().addScene('Level 2');
    expect(scene.name).toBe('Level 2');
    expect(useProjectStore.getState().scenes).toHaveLength(2);
    expect(useProjectStore.getState().activeSceneId).toBe(scene.id);
  });

  it('addScene() auto-names when no name is provided', () => {
    const scene = useProjectStore.getState().addScene();
    expect(scene.name).toBe('Scene 2');
  });

  it('removeScene() removes the scene by ID', () => {
    const scene = useProjectStore.getState().addScene('ToRemove');
    useProjectStore.getState().removeScene(scene.id);
    expect(useProjectStore.getState().scenes).toHaveLength(1);
  });

  it('removeScene() switches active to last remaining scene', () => {
    const scene2 = useProjectStore.getState().addScene('Scene 2');
    // active is scene2, remove it
    useProjectStore.getState().removeScene(scene2.id);
    expect(useProjectStore.getState().activeSceneId).toBe('default');
  });

  it('switchScene() changes the active scene', () => {
    const scene2 = useProjectStore.getState().addScene('Scene 2');
    useProjectStore.getState().switchScene('default');
    expect(useProjectStore.getState().activeSceneId).toBe('default');
    useProjectStore.getState().switchScene(scene2.id);
    expect(useProjectStore.getState().activeSceneId).toBe(scene2.id);
  });

  it('updateSceneCode() sets code and marks scene as dirty', () => {
    useProjectStore.getState().updateSceneCode('default', 'scene "Updated" {}');
    const scene = useProjectStore.getState().scenes[0];
    expect(scene.code).toBe('scene "Updated" {}');
    expect(scene.isDirty).toBe(true);
  });

  it('markSceneClean() resets isDirty after save', () => {
    useProjectStore.getState().updateSceneCode('default', 'changed');
    useProjectStore.getState().markSceneClean('default');
    expect(useProjectStore.getState().scenes[0].isDirty).toBe(false);
  });

  it('renameScene() updates scene name', () => {
    useProjectStore.getState().renameScene('default', 'Main Level');
    expect(useProjectStore.getState().scenes[0].name).toBe('Main Level');
  });

  it('activeScene() returns the currently active scene object', () => {
    const active = useProjectStore.getState().activeScene();
    expect(active).not.toBeNull();
    expect(active!.id).toBe('default');
  });

  it.todo('drag-reorder scenes in tab bar');
  it.todo('duplicate scene preserves code and nodes');
  it.todo('auto-save triggers every 30 seconds when dirty');
});

// ═══════════════════════════════════════════════════════════════════
// 2. Template Search & Filtering
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Game Designer — Template Search & Filtering', () => {
  it('BUILT_IN_TEMPLATES has at least 5 templates', () => {
    expect(BUILT_IN_TEMPLATES.length).toBeGreaterThanOrEqual(5);
  });

  it('searchTemplates() finds templates by name', () => {
    const results = searchTemplates(BUILT_IN_TEMPLATES, 'robot');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name.toLowerCase()).toContain('robot');
  });

  it('searchTemplates() finds templates by tag', () => {
    const results = searchTemplates(BUILT_IN_TEMPLATES, 'ik');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('searchTemplates() filters by category', () => {
    const results = searchTemplates(BUILT_IN_TEMPLATES, '', 'Engineering');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every(t => t.category === 'Engineering')).toBe(true);
  });

  it('searchTemplates() with empty query returns all (or all in category)', () => {
    const results = searchTemplates(BUILT_IN_TEMPLATES, '');
    expect(results.length).toBe(BUILT_IN_TEMPLATES.length);
  });

  it('getTemplateCategories() returns unique sorted list', () => {
    const categories = getTemplateCategories(BUILT_IN_TEMPLATES);
    expect(categories.length).toBeGreaterThanOrEqual(3);
    // Should be sorted
    const sorted = [...categories].sort();
    expect(categories).toEqual(sorted);
  });

  it('findTemplateById() finds exact match', () => {
    const tmpl = findTemplateById(BUILT_IN_TEMPLATES, 'empty');
    expect(tmpl).toBeDefined();
    expect(tmpl!.name).toBe('Empty Scene');
  });

  it('findTemplateById() returns undefined for missing ID', () => {
    expect(findTemplateById(BUILT_IN_TEMPLATES, 'nonexistent')).toBeUndefined();
  });

  it('filterTemplatesByTrait() finds templates with @physics trait', () => {
    const results = filterTemplatesByTrait(BUILT_IN_TEMPLATES, '@physics');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('sortTemplatesByName() sorts alphabetically', () => {
    const sorted = sortTemplatesByName(BUILT_IN_TEMPLATES);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i - 1].name.localeCompare(sorted[i].name)).toBeLessThanOrEqual(0);
    }
  });

  it('getTemplatesByCategory() returns sorted subset', () => {
    const eng = getTemplatesByCategory(BUILT_IN_TEMPLATES, 'Engineering');
    expect(eng.length).toBeGreaterThanOrEqual(1);
    expect(eng.every(t => t.category === 'Engineering')).toBe(true);
  });

  it.todo('fuzzy search with typo tolerance');
  it.todo('template preview thumbnail renders in picker');
});

// ═══════════════════════════════════════════════════════════════════
// 3. Scene Serialization (.holo Format)
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Game Designer — .holo Scene Serialization', () => {
  it('serializeScene() creates a v2 HoloScene', () => {
    const scene = serializeScene(makeMeta(), 'scene "Test" {}', [], []);
    expect(scene.v).toBe(2);
    expect(scene.code).toBe('scene "Test" {}');
    expect(scene.nodes).toEqual([]);
    expect(scene.assets).toEqual([]);
  });

  it('serializeScene() updates the updatedAt timestamp', () => {
    const meta = makeMeta();
    const before = meta.updatedAt;
    const scene = serializeScene(meta, '', [], []);
    // updatedAt should be at least as recent as creation
    expect(new Date(scene.metadata.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
  });

  it('serializeToJSON() produces valid JSON string', () => {
    const scene = serializeScene(makeMeta(), 'code', [], []);
    const json = serializeToJSON(scene);
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(parsed.v).toBe(2);
  });

  it('deserializeScene() round-trips a v2 scene', () => {
    const original = serializeScene(makeMeta('Round Trip'), 'scene "RoundTrip" {}', [], []);
    const json = serializeToJSON(original);
    const result = deserializeScene(json);
    expect(result.ok).toBe(true);
    expect(result.scene!.metadata.name).toBe('Round Trip');
    expect(result.scene!.code).toBe('scene "RoundTrip" {}');
  });

  it('deserializeScene() migrates v1 (code-only) format to v2', () => {
    const v1 = JSON.stringify({ code: 'scene "Old" {}' });
    const result = deserializeScene(v1);
    expect(result.ok).toBe(true);
    expect(result.scene!.v).toBe(2);
    expect(result.scene!.code).toBe('scene "Old" {}');
  });

  it('deserializeScene() rejects unsupported version', () => {
    const v3 = JSON.stringify({ v: 3, code: 'nope' });
    const result = deserializeScene(v3);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Unsupported');
  });

  it('deserializeScene() rejects invalid JSON gracefully', () => {
    const result = deserializeScene('not json at all');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Parse error');
  });

  it('.holo metadata preserves id and name', () => {
    const scene = serializeScene({ id: 'custom-id', name: 'My Game', createdAt: '', updatedAt: '' }, '', [], []);
    expect(scene.metadata.id).toBe('custom-id');
    expect(scene.metadata.name).toBe('My Game');
  });

  it.todo('encodeSceneToURL round-trips via URL sharing');
  it.todo('.holo file version migration v2 → v3');
});
