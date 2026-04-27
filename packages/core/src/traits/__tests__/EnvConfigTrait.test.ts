/**
 * EnvConfigTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { envConfigHandler } from '../EnvConfigTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __envConfigState: undefined as unknown,
});

const defaultConfig = { layers: ['default', 'env', 'override'] };
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('EnvConfigTrait — metadata', () => {
  it('has name "env_config"', () => {
    expect(envConfigHandler.name).toBe('env_config');
  });

  it('defaultConfig has three layers', () => {
    expect(envConfigHandler.defaultConfig?.layers).toHaveLength(3);
  });
});

describe('EnvConfigTrait — lifecycle', () => {
  it('onAttach initializes empty values map', () => {
    const node = makeNode();
    envConfigHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__envConfigState as { values: Map<string, unknown> };
    expect(state.values).toBeInstanceOf(Map);
    expect(state.values.size).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    envConfigHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    envConfigHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__envConfigState).toBeUndefined();
  });
});

describe('EnvConfigTrait — onEvent', () => {
  it('envconfig:set stores key-value', () => {
    const node = makeNode();
    envConfigHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    envConfigHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'envconfig:set', key: 'DB_URL', value: 'postgres://localhost/db', layer: 'env',
    } as never);
    const state = node.__envConfigState as { values: Map<string, { value: unknown; layer: string }> };
    expect(state.values.get('DB_URL')?.value).toBe('postgres://localhost/db');
    expect(state.values.get('DB_URL')?.layer).toBe('env');
  });

  it('envconfig:set defaults to override layer', () => {
    const node = makeNode();
    envConfigHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    envConfigHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'envconfig:set', key: 'KEY', value: 'val',
    } as never);
    const state = node.__envConfigState as { values: Map<string, { layer: string }> };
    expect(state.values.get('KEY')?.layer).toBe('override');
  });

  it('envconfig:get emits envconfig:result with value', () => {
    const node = makeNode();
    envConfigHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    envConfigHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'envconfig:set', key: 'APP_ENV', value: 'production',
    } as never);
    node.emit.mockClear();
    envConfigHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'envconfig:get', key: 'APP_ENV',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('envconfig:result', expect.objectContaining({
      key: 'APP_ENV', value: 'production',
    }));
  });

  it('envconfig:get returns source="missing" for unknown key', () => {
    const node = makeNode();
    envConfigHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    envConfigHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'envconfig:get', key: 'NONEXISTENT',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('envconfig:result', expect.objectContaining({
      value: null, source: 'missing',
    }));
  });

  it('envconfig:list emits all entries', () => {
    const node = makeNode();
    envConfigHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    envConfigHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, { type: 'envconfig:set', key: 'K1', value: 'V1' } as never);
    envConfigHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, { type: 'envconfig:set', key: 'K2', value: 'V2' } as never);
    node.emit.mockClear();
    envConfigHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'envconfig:list',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('envconfig:entries', expect.objectContaining({ count: 2 }));
  });
});
