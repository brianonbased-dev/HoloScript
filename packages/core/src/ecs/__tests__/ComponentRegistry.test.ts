import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentRegistry, registerBuiltInComponents } from '../ComponentRegistry';

describe('ComponentRegistry', () => {
  let reg: ComponentRegistry;

  beforeEach(() => {
    reg = new ComponentRegistry();
  });

  it('starts empty', () => {
    expect(reg.count).toBe(0);
  });

  it('registers a schema', () => {
    reg.register({ type: 'position', defaultData: () => ({ x: 0, y: 0, z: 0 }) });
    expect(reg.has('position')).toBe(true);
    expect(reg.count).toBe(1);
  });

  it('getSchema returns registered schema', () => {
    reg.register({ type: 'health', defaultData: () => ({ hp: 100 }), description: 'HP component' });
    const schema = reg.getSchema('health');
    expect(schema).toBeDefined();
    expect(schema!.description).toBe('HP component');
  });

  it('getSchema returns undefined for unknown type', () => {
    expect(reg.getSchema('nonexistent')).toBeUndefined();
  });

  it('createDefault returns default data', () => {
    reg.register({ type: 'velocity', defaultData: () => ({ vx: 0, vy: 0 }) });
    const data = reg.createDefault('velocity');
    expect(data).toEqual({ vx: 0, vy: 0 });
  });

  it('createDefault returns undefined for unknown type', () => {
    expect(reg.createDefault('missing')).toBeUndefined();
  });

  it('listTypes returns all registered type names', () => {
    reg.register({ type: 'a', defaultData: () => ({}) });
    reg.register({ type: 'b', defaultData: () => ({}) });
    const types = reg.listTypes();
    expect(types).toContain('a');
    expect(types).toContain('b');
  });

  it('has returns false for unregistered type', () => {
    expect(reg.has('ghost')).toBe(false);
  });

  it('registerBuiltInComponents adds standard schemas', () => {
    registerBuiltInComponents(reg);
    expect(reg.has('transform')).toBe(true);
    expect(reg.has('renderable')).toBe(true);
    expect(reg.has('collider')).toBe(true);
    expect(reg.has('rigidbody')).toBe(true);
    expect(reg.has('audio_source')).toBe(true);
    expect(reg.has('ui_element')).toBe(true);
  });

  it('built-in transform has correct defaults', () => {
    registerBuiltInComponents(reg);
    const data = reg.createDefault('transform');
    expect(data.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(data.scale).toEqual({ x: 1, y: 1, z: 1 });
  });
});
