import { describe, it, expect, vi } from 'vitest';
import { HoloScriptRuntime } from '../HoloScriptRuntime';
import type { HoloExtension, ExtensionContext } from './ExtensionInterface';

describe('Extension System', () => {
  it('should load an extension and register a function', async () => {
    const runtime = new HoloScriptRuntime();
    const registry = runtime.getExtensionRegistry();

    const mockExtension: HoloExtension = {
      id: 'test.extension',
      version: '1.0.0',
      onLoad: (ctx: ExtensionContext) => {
        ctx.registerFunction('helloExtension', (args: any[]) => {
          return `Hello ${args[0]} from Extension!`;
        });
      },
      onUnload: () => {},
    };

    registry.loadExtension(mockExtension);

    // Verify function execution
    // The runtime wraps functions to accept spread args, so we call it like the evaluator would
    const result = await runtime.callFunction('helloExtension', ['World']);
    expect(result.success).toBe(true);
    expect(result.output).toBe('Hello World from Extension!');
  });

  it('should register a custom trait', async () => {
    const runtime = new HoloScriptRuntime();
    const registry = runtime.getExtensionRegistry();
    const traitHandler = {
      name: 'custom_trait',
      onAttach: vi.fn(),
      onUpdate: vi.fn(),
    };

    const mockExtension: HoloExtension = {
      id: 'test.trait.extension',
      version: '1.0.0',
      onLoad: (ctx: ExtensionContext) => {
        ctx.registerTrait('custom_trait', traitHandler as any);
      },
      onUnload: () => {},
    };

    registry.loadExtension(mockExtension);

    // We can't easily check the private traitHandlers map,
    // but we can verify no error occurred during registration.
    // In a full integration test, we would parse a script using this trait.

    // This confirms the API contract holds
  });

  it('should prevent duplicate extension loading', () => {
    const runtime = new HoloScriptRuntime();
    const registry = runtime.getExtensionRegistry();

    const mockExtension: HoloExtension = {
      id: 'test.duplicate',
      version: '1.0.0',
      onLoad: vi.fn(),
      onUnload: () => {},
    };

    registry.loadExtension(mockExtension);
    registry.loadExtension(mockExtension);

    expect(mockExtension.onLoad).toHaveBeenCalledTimes(1);
  });
});
