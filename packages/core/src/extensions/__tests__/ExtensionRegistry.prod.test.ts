/**
 * ExtensionRegistry Production Tests
 *
 * Extension lifecycle: load, unload, duplicate guard, error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExtensionRegistry } from '../ExtensionRegistry';
import type { HoloExtension } from '../ExtensionInterface';

function makeRuntime() {
  return {
    registerTrait: vi.fn(),
    registerGlobalFunction: vi.fn(),
  } as any;
}

function makeExtension(id: string, overrides: Partial<HoloExtension> = {}): HoloExtension {
  return {
    id,
    name: `Extension ${id}`,
    version: '1.0.0',
    onLoad: vi.fn(),
    onUnload: vi.fn(),
    ...overrides,
  };
}

describe('ExtensionRegistry — Production', () => {
  let runtime: any;
  let registry: ExtensionRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = makeRuntime();
    registry = new ExtensionRegistry(runtime);
  });

  describe('loadExtension', () => {
    it('loads and stores extension', () => {
      const ext = makeExtension('my_ext');
      registry.loadExtension(ext);

      expect(ext.onLoad).toHaveBeenCalled();
      expect(registry.getExtension('my_ext')).toBe(ext);
    });

    it('provides context with registerTrait and registerFunction', () => {
      const ext = makeExtension('ctx_ext', {
        onLoad: (ctx: any) => {
          ctx.registerTrait('custom_trait', {} as any);
          ctx.registerFunction('myFn', () => {});
        },
      });

      registry.loadExtension(ext);
      expect(runtime.registerTrait).toHaveBeenCalledWith('custom_trait', expect.anything());
      expect(runtime.registerGlobalFunction).toHaveBeenCalledWith('myFn', expect.any(Function));
    });

    it('skips duplicate load', () => {
      const ext = makeExtension('dup');
      registry.loadExtension(ext);
      registry.loadExtension(ext);

      expect(ext.onLoad).toHaveBeenCalledTimes(1);
    });

    it('throws on load error', () => {
      const ext = makeExtension('bad', {
        onLoad: () => {
          throw new Error('load failed');
        },
      });

      expect(() => registry.loadExtension(ext)).toThrow('load failed');
      expect(registry.getExtension('bad')).toBeUndefined();
    });
  });

  describe('unloadingExtension', () => {
    it('unloads and removes extension', () => {
      const ext = makeExtension('rm');
      registry.loadExtension(ext);
      registry.unloadingExtension('rm');

      expect(ext.onUnload).toHaveBeenCalled();
      expect(registry.getExtension('rm')).toBeUndefined();
    });

    it('no-op for unknown extension', () => {
      registry.unloadingExtension('nonexistent');
      // No crash
    });
  });

  describe('getExtension', () => {
    it('returns undefined for missing', () => {
      expect(registry.getExtension('nope')).toBeUndefined();
    });
  });
});
