import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentRegistry, registerBuiltInComponents } from '../ComponentRegistry';

describe('ComponentRegistry', () => {
  let registry: ComponentRegistry;

  beforeEach(() => { registry = new ComponentRegistry(); });

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  it('registers a component schema', () => {
    registry.register({ type: 'health', defaultData: () => ({ hp: 100 }) });
    expect(registry.has('health')).toBe(true);
    expect(registry.count).toBe(1);
  });

  it('overwrites duplicate type silently', () => {
    registry.register({ type: 'a', defaultData: () => 1 });
    registry.register({ type: 'a', defaultData: () => 2 });
    expect(registry.count).toBe(1);
    expect(registry.createDefault('a')).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Schema Retrieval
  // ---------------------------------------------------------------------------

  it('getSchema returns registered schema', () => {
    registry.register({ type: 'foo', defaultData: () => 'bar', description: 'test' });
    const schema = registry.getSchema('foo');
    expect(schema).toBeDefined();
    expect(schema!.type).toBe('foo');
    expect(schema!.description).toBe('test');
  });

  it('getSchema returns undefined for unknown type', () => {
    expect(registry.getSchema('nope')).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Default Data
  // ---------------------------------------------------------------------------

  it('createDefault produces fresh data each call', () => {
    registry.register({ type: 'pos', defaultData: () => ({ x: 0, y: 0 }) });
    const a = registry.createDefault('pos');
    const b = registry.createDefault('pos');
    expect(a).toEqual({ x: 0, y: 0 });
    expect(a).not.toBe(b);
  });

  it('createDefault returns undefined for unknown type', () => {
    expect(registry.createDefault('missing')).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  it('has returns false for unregistered type', () => {
    expect(registry.has('ghost')).toBe(false);
  });

  it('listTypes returns all registered type strings', () => {
    registry.register({ type: 'a', defaultData: () => 1 });
    registry.register({ type: 'b', defaultData: () => 2 });
    expect(registry.listTypes().sort()).toEqual(['a', 'b']);
  });

  it('count reflects current size', () => {
    expect(registry.count).toBe(0);
    registry.register({ type: 'x', defaultData: () => 0 });
    expect(registry.count).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Built-in Components
  // ---------------------------------------------------------------------------

  it('registerBuiltInComponents adds standard schemas', () => {
    registerBuiltInComponents(registry);
    expect(registry.has('transform')).toBe(true);
    expect(registry.has('renderable')).toBe(true);
    expect(registry.has('collider')).toBe(true);
    expect(registry.has('rigidbody')).toBe(true);
    expect(registry.has('audio_source')).toBe(true);
    expect(registry.has('ui_element')).toBe(true);
    expect(registry.count).toBe(6);
  });

  it('built-in transform default has position/rotation/scale', () => {
    registerBuiltInComponents(registry);
    const t = registry.createDefault('transform');
    expect(t.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(t.scale).toEqual({ x: 1, y: 1, z: 1 });
  });
});
