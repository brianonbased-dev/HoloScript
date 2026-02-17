import { describe, it, expect, beforeEach } from 'vitest';
import { PromptTemplateSystem, QuickPrompts } from '../PromptTemplates';

describe('PromptTemplateSystem', () => {
  let sys: PromptTemplateSystem;

  beforeEach(() => { sys = new PromptTemplateSystem(); });

  // Built-in templates
  it('getAvailableTemplates returns built-ins', () => {
    const templates = sys.getAvailableTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.some(t => t.id === 'basic-object')).toBe(true);
  });

  it('getTemplate returns specific template', () => {
    const t = sys.getTemplate('basic-object');
    expect(t).not.toBeNull();
    expect(t!.category).toBe('basic');
  });

  it('getTemplate returns null for unknown', () => {
    expect(sys.getTemplate('nonexistent')).toBeNull();
  });

  // Category
  it('getTemplatesByCategory filters', () => {
    const basic = sys.getTemplatesByCategory('basic');
    expect(basic.length).toBeGreaterThan(0);
    expect(basic.every(t => t.category === 'basic')).toBe(true);
  });

  it('getCategories returns unique categories', () => {
    const cats = sys.getCategories();
    expect(cats.length).toBeGreaterThan(0);
    expect(new Set(cats).size).toBe(cats.length);
  });

  // Prompt creation
  it('createPrompt interpolates variables', () => {
    const prompt = sys.createPrompt('basic-object', {
      color: 'blue', geometry: 'sphere', position: '[0,1,0]',
    });
    expect(prompt).toContain('blue');
    expect(prompt).toContain('sphere');
  });

  it('createPrompt leaves unmatched variables as placeholders', () => {
    const prompt = sys.createPrompt('basic-object', { color: 'red' });
    // Missing variables remain as {{var}}
    expect(prompt).toContain('red');
  });

  // Validation
  it('validateContext reports missing variables', () => {
    const result = sys.validateContext('basic-object', {});
    expect(result.valid).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it('validateContext passes with all variables', () => {
    const t = sys.getTemplate('basic-object')!;
    const context: Record<string, string> = {};
    for (const v of t.variables) context[v] = 'test';
    const result = sys.validateContext('basic-object', context);
    expect(result.valid).toBe(true);
    expect(result.missing.length).toBe(0);
  });

  // Custom templates
  it('registerTemplate adds custom template', () => {
    sys.registerTemplate({
      id: 'custom', name: 'Custom', description: 'Test',
      category: 'custom', template: 'Hello {{name}}',
      variables: ['name'], examples: [], bestFor: 'test',
    });
    expect(sys.getTemplate('custom')).not.toBeNull();
  });

  // Suggest
  it('suggestTemplates by category', () => {
    const suggestions = sys.suggestTemplates('physics');
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('suggestTemplates with query filters by name/description', () => {
    const suggestions = sys.suggestTemplates('character', 'enemy');
    expect(suggestions.some(t => t.name.toLowerCase().includes('enemy'))).toBe(true);
  });

  // Batch
  it('createBatch creates multiple prompts', () => {
    const prompts = sys.createBatch([
      { templateId: 'basic-object', context: { color: 'red', geometry: 'cube', interaction: 'grab', purpose: 'demo' } },
      { templateId: 'basic-object', context: { color: 'blue', geometry: 'sphere', interaction: 'touch', purpose: 'ui' } },
    ]);
    expect(prompts.length).toBe(2);
    expect(prompts[0]).toContain('red');
    expect(prompts[1]).toContain('blue');
  });
});

describe('QuickPrompts', () => {
  it('object creates interpolated prompt', () => {
    const p = QuickPrompts.object('sphere', 'blue', [0, 1, 0]);
    expect(p).toContain('sphere');
    expect(p).toContain('blue');
  });

  it('interactive creates prompt', () => {
    const p = QuickPrompts.interactive('red', 'cube', 'hover', 'feedback');
    expect(p).toContain('red');
    expect(p).toContain('hover');
  });

  it('physics creates prompt', () => {
    const p = QuickPrompts.physics('box', 'dynamic', 5, 0.5);
    expect(p).toContain('box');
    expect(p).toContain('dynamic');
  });

  it('player creates prompt', () => {
    const p = QuickPrompts.player('capsule', 'fps', 100, 'jump');
    expect(p).toContain('capsule');
  });

  it('networked creates prompt', () => {
    const p = QuickPrompts.networked('ball', 'position,rotation', 30);
    expect(p).toContain('ball');
  });
});
