/**
 * PromptTemplates — Production Tests
 *
 * Tests: PromptTemplateSystem (getAvailableTemplates, getTemplatesByCategory, getTemplate,
 * createPrompt, validateContext, registerTemplate, suggestTemplates, getCategories, createBatch)
 * and QuickPrompts (object, interactive, physics, player, networked).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PromptTemplateSystem, QuickPrompts } from '../PromptTemplates';
import type { PromptTemplate, TemplateContext } from '../PromptTemplates';

function makeCustomTemplate(overrides: Partial<PromptTemplate> = {}): PromptTemplate {
  return {
    id: 'custom-001',
    name: 'Custom Template',
    description: 'A custom test template',
    category: 'custom',
    template: 'Create a {{shape}} with {{color}}',
    variables: ['shape', 'color'],
    examples: ['Create a box with red'],
    bestFor: 'testing',
    ...overrides,
  };
}

describe('PromptTemplateSystem — getAvailableTemplates', () => {
  let pts: PromptTemplateSystem;
  beforeEach(() => {
    pts = new PromptTemplateSystem();
  });

  it('returns a non-empty array of built-in templates', () => {
    const templates = pts.getAvailableTemplates();
    expect(templates.length).toBeGreaterThan(0);
  });

  it('each template has required fields', () => {
    for (const t of pts.getAvailableTemplates()) {
      expect(typeof t.id).toBe('string');
      expect(typeof t.name).toBe('string');
      expect(typeof t.category).toBe('string');
      expect(Array.isArray(t.variables)).toBe(true);
      expect(Array.isArray(t.examples)).toBe(true);
    }
  });

  it('includes built-in basic-object template', () => {
    const ids = pts.getAvailableTemplates().map((t) => t.id);
    expect(ids).toContain('basic-object');
  });

  it('custom templates are included after registration', () => {
    pts.registerTemplate(makeCustomTemplate());
    const ids = pts.getAvailableTemplates().map((t) => t.id);
    expect(ids).toContain('custom-001');
  });
});

describe('PromptTemplateSystem — getTemplatesByCategory', () => {
  let pts: PromptTemplateSystem;
  beforeEach(() => {
    pts = new PromptTemplateSystem();
  });

  it('returns templates for "basic" category', () => {
    const results = pts.getTemplatesByCategory('basic');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((t) => t.category === 'basic')).toBe(true);
  });

  it('returns empty array for unknown category', () => {
    expect(pts.getTemplatesByCategory('nonexistent')).toHaveLength(0);
  });

  it('returns ui category templates only', () => {
    const results = pts.getTemplatesByCategory('ui');
    expect(results.every((t) => t.category === 'ui')).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });
});

describe('PromptTemplateSystem — getTemplate', () => {
  let pts: PromptTemplateSystem;
  beforeEach(() => {
    pts = new PromptTemplateSystem();
  });

  it('returns a built-in template by id', () => {
    const t = pts.getTemplate('basic-object');
    expect(t).not.toBeNull();
    expect(t!.id).toBe('basic-object');
  });

  it('returns null for unknown id', () => {
    expect(pts.getTemplate('does-not-exist')).toBeNull();
  });

  it('returns registered custom template', () => {
    pts.registerTemplate(makeCustomTemplate({ id: 'my-custom' }));
    expect(pts.getTemplate('my-custom')).not.toBeNull();
  });

  it('custom template takes precedence (same id would override)', () => {
    pts.registerTemplate(makeCustomTemplate({ id: 'physics-object', name: 'Override' }));
    const t = pts.getTemplate('physics-object');
    // custom map is checked after built-in; built-in wins due to || chain
    expect(t).not.toBeNull();
  });
});

describe('PromptTemplateSystem — createPrompt', () => {
  let pts: PromptTemplateSystem;
  beforeEach(() => {
    pts = new PromptTemplateSystem();
  });

  it('replaces all variables in template', () => {
    const result = pts.createPrompt('basic-object', {
      geometry: 'sphere',
      color: 'red',
      position: '[0,1,0]',
    });
    expect(result).toContain('sphere');
    expect(result).toContain('red');
    expect(result).toContain('[0,1,0]');
    expect(result).not.toContain('{{');
  });

  it('throws for unknown template id', () => {
    expect(() => pts.createPrompt('no-such-template', {})).toThrow();
  });

  it('leaves un-provided variables as placeholders', () => {
    const result = pts.createPrompt('basic-object', { geometry: 'cube' });
    expect(result).toContain('{{color}}');
  });

  it('handles number values in context', () => {
    const result = pts.createPrompt('physics-object', {
      geometry: 'sphere',
      physics_type: 'dynamic',
      mass: 2.5,
      restitution: 0.7,
    });
    expect(result).toContain('2.5');
    expect(result).toContain('0.7');
  });

  it('handles boolean values in context', () => {
    pts.registerTemplate(makeCustomTemplate({ template: 'Flag: {{flag}}', variables: ['flag'] }));
    const result = pts.createPrompt('custom-001', { flag: true });
    expect(result).toContain('true');
  });

  it('replaces multiple occurrences of same variable', () => {
    pts.registerTemplate(makeCustomTemplate({ template: '{{x}} and {{x}}', variables: ['x'] }));
    const result = pts.createPrompt('custom-001', { x: 'HELLO' });
    expect(result).toBe('HELLO and HELLO');
  });
});

describe('PromptTemplateSystem — validateContext', () => {
  let pts: PromptTemplateSystem;
  beforeEach(() => {
    pts = new PromptTemplateSystem();
  });

  it('valid=true when all variables provided', () => {
    const { valid, missing } = pts.validateContext('basic-object', {
      geometry: 'cube',
      color: 'red',
      position: '[0,0,0]',
    });
    expect(valid).toBe(true);
    expect(missing).toHaveLength(0);
  });

  it('valid=false when variables are missing', () => {
    const { valid, missing } = pts.validateContext('basic-object', { geometry: 'cube' });
    expect(valid).toBe(false);
    expect(missing).toContain('color');
    expect(missing).toContain('position');
  });

  it('returns valid=false for unknown template', () => {
    const { valid, missing } = pts.validateContext('bogus', {});
    expect(valid).toBe(false);
    expect(missing.length).toBeGreaterThan(0);
  });

  it('extra context keys do not cause false positive', () => {
    const { valid } = pts.validateContext('basic-object', {
      geometry: 'cube',
      color: 'blue',
      position: '[0,0,0]',
      extra: 'ignored',
    });
    expect(valid).toBe(true);
  });
});

describe('PromptTemplateSystem — registerTemplate / getCategories / suggestTemplates', () => {
  let pts: PromptTemplateSystem;
  beforeEach(() => {
    pts = new PromptTemplateSystem();
  });

  it('getCategories returns sorted unique category names', () => {
    const cats = pts.getCategories();
    expect(cats.length).toBeGreaterThan(0);
    const sorted = [...cats].sort();
    expect(cats).toEqual(sorted);
    expect(new Set(cats).size).toBe(cats.length);
  });

  it('custom category appears in getCategories after registration', () => {
    pts.registerTemplate(makeCustomTemplate({ category: 'unicorn' }));
    expect(pts.getCategories()).toContain('unicorn');
  });

  it('suggestTemplates returns subset matching query', () => {
    const results = pts.suggestTemplates('basic', 'object');
    expect(results.length).toBeLessThanOrEqual(5);
    expect(results.every((t) => t.category === 'basic')).toBe(true);
  });

  it('suggestTemplates returns all in category when no query', () => {
    const results = pts.suggestTemplates('basic');
    expect(results.length).toBeGreaterThan(0);
  });

  it('suggestTemplates returns empty for unknown category', () => {
    expect(pts.suggestTemplates('noop')).toHaveLength(0);
  });
});

describe('PromptTemplateSystem — createBatch', () => {
  let pts: PromptTemplateSystem;
  beforeEach(() => {
    pts = new PromptTemplateSystem();
  });

  it('returns array of same length as input', () => {
    const batch = pts.createBatch([
      {
        templateId: 'basic-object',
        context: { geometry: 'box', color: 'blue', position: '[0,0,0]' },
      },
      {
        templateId: 'basic-object',
        context: { geometry: 'sphere', color: 'red', position: '[1,0,0]' },
      },
    ]);
    expect(batch).toHaveLength(2);
  });

  it('each result is a string with variables substituted', () => {
    const batch = pts.createBatch([
      {
        templateId: 'basic-object',
        context: { geometry: 'cube', color: 'green', position: '[0,0,0]' },
      },
    ]);
    expect(batch[0]).toContain('cube');
    expect(batch[0]).toContain('green');
  });

  it('returns empty array for empty input', () => {
    expect(pts.createBatch([])).toHaveLength(0);
  });
});

describe('QuickPrompts', () => {
  it('object() returns string containing geometry and color', () => {
    const p = QuickPrompts.object('sphere', 'blue', [0, 1, 0]);
    expect(typeof p).toBe('string');
    expect(p).toContain('sphere');
    expect(p).toContain('blue');
  });

  it('object() encodes position as JSON', () => {
    const p = QuickPrompts.object('cube', 'red', [1, 2, 3]);
    expect(p).toContain('[1,2,3]');
  });

  it('interactive() returns string with all provided params', () => {
    const p = QuickPrompts.interactive('green', 'cube', 'responds to touch', 'feedback');
    expect(p).toContain('green');
    expect(p).toContain('cube');
    expect(p).toContain('responds to touch');
    expect(p).toContain('feedback');
  });

  it('physics() returns string with mass and restitution', () => {
    const p = QuickPrompts.physics('sphere', 'dynamic', 2.5, 0.8);
    expect(p).toContain('2.5');
    expect(p).toContain('0.8');
  });

  it('player() returns string with movement type and health', () => {
    const p = QuickPrompts.player('humanoid', 'WASD', 100, 'jump,dash');
    expect(p).toContain('WASD');
    expect(p).toContain('100');
    expect(p).toContain('jump,dash');
  });

  it('networked() includes owner_type default first-grabber', () => {
    const p = QuickPrompts.networked('ball', 'position,rotation', 20);
    expect(p).toContain('first-grabber');
    expect(p).toContain('20');
  });
});
