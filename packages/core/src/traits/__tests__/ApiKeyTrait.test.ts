/**
 * ApiKeyTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { apiKeyHandler } from '../ApiKeyTrait';

const makeNode = () => ({
  id: 'node-1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __apiKeyState: undefined as unknown,
});

const defaultConfig = { prefix: 'sk_', max_keys: 50 };

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('ApiKeyTrait — metadata', () => {
  it('has name "api_key"', () => {
    expect(apiKeyHandler.name).toBe('api_key');
  });

  it('defaultConfig has correct values', () => {
    expect(apiKeyHandler.defaultConfig?.prefix).toBe('sk_');
    expect(apiKeyHandler.defaultConfig?.max_keys).toBe(50);
  });
});

describe('ApiKeyTrait — lifecycle', () => {
  it('onAttach initializes keys map', () => {
    const node = makeNode();
    apiKeyHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__apiKeyState as { keys: Map<string, unknown> };
    expect(state.keys).toBeInstanceOf(Map);
    expect(state.keys.size).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    apiKeyHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    apiKeyHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__apiKeyState).toBeUndefined();
  });
});

describe('ApiKeyTrait — onEvent', () => {
  it('apikey:generate creates a key with the configured prefix', () => {
    const node = makeNode();
    apiKeyHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    apiKeyHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'apikey:generate', name: 'my-key',
    } as never);
    const state = node.__apiKeyState as { keys: Map<string, { name: string }> };
    expect(state.keys.size).toBe(1);
    const [key] = [...state.keys.keys()];
    expect(key).toMatch(/^sk_/);
    expect(node.emit).toHaveBeenCalledWith('apikey:generated', expect.objectContaining({ key }));
  });

  it('apikey:generate respects max_keys limit', () => {
    const node = makeNode();
    const cfg = { prefix: 'sk_', max_keys: 2 };
    apiKeyHandler.onAttach!(node as never, cfg, makeCtx(node) as never);
    for (let i = 0; i < 5; i++) {
      apiKeyHandler.onEvent!(node as never, cfg, makeCtx(node) as never, {
        type: 'apikey:generate', name: `key-${i}`,
      } as never);
    }
    const state = node.__apiKeyState as { keys: Map<string, unknown> };
    expect(state.keys.size).toBe(2);
  });

  it('apikey:validate returns true for existing key', () => {
    const node = makeNode();
    apiKeyHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    apiKeyHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'apikey:generate', name: 'v-key',
    } as never);
    const state = node.__apiKeyState as { keys: Map<string, unknown> };
    const [key] = [...state.keys.keys()];
    node.emit.mockClear();
    apiKeyHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'apikey:validate', key,
    } as never);
    expect(node.emit).toHaveBeenCalledWith('apikey:validated', { key, valid: true });
  });

  it('apikey:validate returns false for unknown key', () => {
    const node = makeNode();
    apiKeyHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    apiKeyHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'apikey:validate', key: 'sk_fake_key',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('apikey:validated', { key: 'sk_fake_key', valid: false });
  });

  it('apikey:revoke removes the key', () => {
    const node = makeNode();
    apiKeyHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    apiKeyHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'apikey:generate', name: 'r-key',
    } as never);
    const state = node.__apiKeyState as { keys: Map<string, unknown> };
    const [key] = [...state.keys.keys()];
    apiKeyHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'apikey:revoke', key,
    } as never);
    expect(state.keys.size).toBe(0);
    expect(node.emit).toHaveBeenCalledWith('apikey:revoked', { key });
  });
});
