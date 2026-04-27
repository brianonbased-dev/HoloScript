import { describe, it, expect, vi } from 'vitest';
import { executeHoloObject, type HoloObjectContext } from '../holo-object-executor.js';

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<HoloObjectContext> = {}): HoloObjectContext {
  return {
    getTemplate: vi.fn().mockReturnValue(undefined),
    executeOrb: vi.fn().mockResolvedValue({ success: true, output: 'orb ok' }),
    ...overrides,
  };
}

function literalValue(v: unknown) {
  return { type: 'literal', value: v };
}

function prop(key: string, value: unknown) {
  return { key, value: literalValue(value) };
}

function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    type: 'HoloObject',
    name: 'TestObj',
    properties: [],
    directives: [],
    traits: [],
    children: [],
    state: null,
    template: null,
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────
// Phase 1+2: property flattening
// ──────────────────────────────────────────────────────────────────

describe('executeHoloObject — property flattening', () => {
  it('reads node.properties into the properties record', async () => {
    const executeOrb = vi.fn().mockResolvedValue({ success: true, output: '' });
    const ctx = makeCtx({ executeOrb });
    const node = makeNode({ properties: [prop('color', '#ff0000'), prop('scale', 2)] });
    await executeHoloObject(node as never, ctx);
    const orbNode = vi.mocked(executeOrb).mock.calls[0][0];
    expect(orbNode.properties.color).toEqual({ type: 'literal', value: '#ff0000' });
    expect(orbNode.properties.scale).toEqual({ type: 'literal', value: 2 });
  });

  it('folds state.properties into properties', async () => {
    const executeOrb = vi.fn().mockResolvedValue({ success: true, output: '' });
    const ctx = makeCtx({ executeOrb });
    const node = makeNode({
      state: { properties: [prop('hp', 100)] },
    });
    await executeHoloObject(node as never, ctx);
    const orbNode = vi.mocked(executeOrb).mock.calls[0][0];
    expect(orbNode.properties.hp).toEqual({ type: 'literal', value: 100 });
  });

  it('state properties override node properties for the same key', async () => {
    const executeOrb = vi.fn().mockResolvedValue({ success: true, output: '' });
    const ctx = makeCtx({ executeOrb });
    const node = makeNode({
      properties: [prop('hp', 50)],
      state: { properties: [prop('hp', 100)] },
    });
    await executeHoloObject(node as never, ctx);
    const orbNode = vi.mocked(executeOrb).mock.calls[0][0];
    // state.properties processed after properties → last-write wins
    expect(orbNode.properties.hp).toEqual({ type: 'literal', value: 100 });
  });
});

// ──────────────────────────────────────────────────────────────────
// Phase 3: hologram defaults
// ──────────────────────────────────────────────────────────────────

describe('executeHoloObject — hologram defaults', () => {
  it('uses default shape when geometry is absent', async () => {
    const executeOrb = vi.fn().mockResolvedValue({ success: true, output: '' });
    const ctx = makeCtx({ executeOrb });
    await executeHoloObject(makeNode() as never, ctx);
    const orbNode = vi.mocked(executeOrb).mock.calls[0][0];
    expect(orbNode.hologram.shape).toBe('sphere');
  });

  it('uses default color when color is absent', async () => {
    const executeOrb = vi.fn().mockResolvedValue({ success: true, output: '' });
    const ctx = makeCtx({ executeOrb });
    await executeHoloObject(makeNode() as never, ctx);
    const orbNode = vi.mocked(executeOrb).mock.calls[0][0];
    expect(orbNode.hologram.color).toBe('#ffffff');
  });

  it('uses default size when scale/size are absent', async () => {
    const executeOrb = vi.fn().mockResolvedValue({ success: true, output: '' });
    const ctx = makeCtx({ executeOrb });
    await executeHoloObject(makeNode() as never, ctx);
    const orbNode = vi.mocked(executeOrb).mock.calls[0][0];
    expect(orbNode.hologram.size).toBe(1);
  });

  it('defaults interactive to true', async () => {
    const executeOrb = vi.fn().mockResolvedValue({ success: true, output: '' });
    const ctx = makeCtx({ executeOrb });
    await executeHoloObject(makeNode() as never, ctx);
    const orbNode = vi.mocked(executeOrb).mock.calls[0][0];
    expect(orbNode.hologram.interactive).toBe(true);
  });

  it('interactive can be set to false explicitly', async () => {
    const executeOrb = vi.fn().mockResolvedValue({ success: true, output: '' });
    const ctx = makeCtx({ executeOrb });
    const node = makeNode({ properties: [{ key: 'interactive', value: false }] });
    await executeHoloObject(node as never, ctx);
    const orbNode = vi.mocked(executeOrb).mock.calls[0][0];
    expect(orbNode.hologram.interactive).toBe(false);
  });

  it('uses supplied geometry/color/scale', async () => {
    const executeOrb = vi.fn().mockResolvedValue({ success: true, output: '' });
    const ctx = makeCtx({ executeOrb });
    const node = makeNode({
      properties: [
        { key: 'geometry', value: 'cube' },
        { key: 'color', value: '#0000ff' },
        { key: 'scale', value: 3 },
      ],
    });
    await executeHoloObject(node as never, ctx);
    const orbNode = vi.mocked(executeOrb).mock.calls[0][0];
    expect(orbNode.hologram.shape).toBe('cube');
    expect(orbNode.hologram.color).toBe('#0000ff');
    expect(orbNode.hologram.size).toBe(3);
  });
});

// ──────────────────────────────────────────────────────────────────
// Phase 4-5: directives and traits
// ──────────────────────────────────────────────────────────────────

describe('executeHoloObject — directives and traits', () => {
  it('sets orbNode.name from node.name', async () => {
    const executeOrb = vi.fn().mockResolvedValue({ success: true, output: '' });
    const ctx = makeCtx({ executeOrb });
    await executeHoloObject(makeNode({ name: 'MyBall' }) as never, ctx);
    const orbNode = vi.mocked(executeOrb).mock.calls[0][0];
    expect(orbNode.name).toBe('MyBall');
  });

  it('maps node.traits to directive shape', async () => {
    const executeOrb = vi.fn().mockResolvedValue({ success: true, output: '' });
    const ctx = makeCtx({ executeOrb });
    const node = makeNode({
      traits: [{ name: 'grabbable', config: { force: 10 } }],
    });
    await executeHoloObject(node as never, ctx);
    const orbNode = vi.mocked(executeOrb).mock.calls[0][0];
    const traitDir = orbNode.directives.find((d: { type: string; name: string }) => d.type === 'trait' && d.name === 'grabbable');
    expect(traitDir).toBeDefined();
    expect(traitDir?.force).toBe(10);
  });

  it('populates traits Map from node.traits', async () => {
    const executeOrb = vi.fn().mockResolvedValue({ success: true, output: '' });
    const ctx = makeCtx({ executeOrb });
    const node = makeNode({
      traits: [{ name: 'collidable', config: {} }],
    });
    await executeHoloObject(node as never, ctx);
    const orbNode = vi.mocked(executeOrb).mock.calls[0][0];
    expect(orbNode.traits.get('collidable')).toBeDefined();
  });

  it('appends node.directives before trait directives', async () => {
    const executeOrb = vi.fn().mockResolvedValue({ success: true, output: '' });
    const ctx = makeCtx({ executeOrb });
    const rawDirective = { type: 'state', name: 'active' };
    const node = makeNode({ directives: [rawDirective] });
    await executeHoloObject(node as never, ctx);
    const orbNode = vi.mocked(executeOrb).mock.calls[0][0];
    expect(orbNode.directives[0]).toBe(rawDirective);
  });
});

// ──────────────────────────────────────────────────────────────────
// Phase 4 continued: template directives
// ──────────────────────────────────────────────────────────────────

describe('executeHoloObject — template directives', () => {
  it('appends template.directives at the end', async () => {
    const templateDir = { type: 'trait', name: 'glowing' };
    const template = {
      name: 'GlowTemplate',
      directives: [templateDir],
      properties: [],
      state: null,
    };
    const executeOrb = vi.fn().mockResolvedValue({ success: true, output: '' });
    const ctx = makeCtx({
      getTemplate: vi.fn().mockReturnValue(template),
      executeOrb,
    });
    const node = makeNode({ template: 'GlowTemplate' });
    await executeHoloObject(node as never, ctx);
    const orbNode = vi.mocked(executeOrb).mock.calls[0][0];
    expect(orbNode.directives).toContain(templateDir);
  });
});

// ──────────────────────────────────────────────────────────────────
// Phase 6: template inheritance (object-wins)
// ──────────────────────────────────────────────────────────────────

describe('executeHoloObject — template inheritance', () => {
  it('inherits template.properties when object does not set them', async () => {
    const template = {
      name: 'BaseTemplate',
      directives: [],
      properties: [{ key: 'speed', value: { type: 'literal', value: 5 } }],
      state: null,
    };
    const executeOrb = vi.fn().mockResolvedValue({ success: true, output: '' });
    const ctx = makeCtx({
      getTemplate: vi.fn().mockReturnValue(template),
      executeOrb,
    });
    const node = makeNode({ template: 'BaseTemplate' });
    await executeHoloObject(node as never, ctx);
    const orbNode = vi.mocked(executeOrb).mock.calls[0][0];
    expect(orbNode.properties.speed).toEqual({ type: 'literal', value: 5 });
  });

  it('object property wins over template property for same key', async () => {
    const template = {
      name: 'BaseTemplate',
      directives: [],
      properties: [{ key: 'speed', value: { type: 'literal', value: 5 } }],
      state: null,
    };
    const executeOrb = vi.fn().mockResolvedValue({ success: true, output: '' });
    const ctx = makeCtx({
      getTemplate: vi.fn().mockReturnValue(template),
      executeOrb,
    });
    const node = makeNode({
      template: 'BaseTemplate',
      properties: [prop('speed', 99)],
    });
    await executeHoloObject(node as never, ctx);
    const orbNode = vi.mocked(executeOrb).mock.calls[0][0];
    expect(orbNode.properties.speed).toEqual({ type: 'literal', value: 99 });
  });

  it('inherits template.state.properties (object-wins)', async () => {
    const template = {
      name: 'StatefulTemplate',
      directives: [],
      properties: [],
      state: {
        properties: [{ key: 'hp', value: { type: 'literal', value: 200 } }],
      },
    };
    const executeOrb = vi.fn().mockResolvedValue({ success: true, output: '' });
    const ctx = makeCtx({
      getTemplate: vi.fn().mockReturnValue(template),
      executeOrb,
    });
    const node = makeNode({ template: 'StatefulTemplate' });
    await executeHoloObject(node as never, ctx);
    const orbNode = vi.mocked(executeOrb).mock.calls[0][0];
    expect(orbNode.properties.hp).toEqual({ type: 'literal', value: 200 });
  });

  it('does not call getTemplate when node.template is null', async () => {
    const getTemplate = vi.fn();
    const ctx = makeCtx({ getTemplate });
    await executeHoloObject(makeNode() as never, ctx);
    expect(getTemplate).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────
// Phase 7: delegation to executeOrb
// ──────────────────────────────────────────────────────────────────

describe('executeHoloObject — delegation', () => {
  it('calls executeOrb exactly once', async () => {
    const executeOrb = vi.fn().mockResolvedValue({ success: true, output: 'done' });
    const ctx = makeCtx({ executeOrb });
    await executeHoloObject(makeNode() as never, ctx);
    expect(executeOrb).toHaveBeenCalledTimes(1);
  });

  it('passes orbNode with type=orb', async () => {
    const executeOrb = vi.fn().mockResolvedValue({ success: true, output: '' });
    const ctx = makeCtx({ executeOrb });
    await executeHoloObject(makeNode() as never, ctx);
    const orbNode = vi.mocked(executeOrb).mock.calls[0][0];
    expect(orbNode.type).toBe('orb');
  });

  it('returns the result from executeOrb', async () => {
    const ctx = makeCtx({
      executeOrb: vi.fn().mockResolvedValue({ success: false, output: 'err' }),
    });
    const result = await executeHoloObject(makeNode() as never, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toBe('err');
  });
});
