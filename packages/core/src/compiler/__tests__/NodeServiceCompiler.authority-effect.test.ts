import { describe, expect, it, vi } from 'vitest';
import { NodeServiceCompiler } from '../NodeServiceCompiler';
import { CompileTimeAuthorityEffectError } from '../safety/AuthorityEffectEnforcer';
import type {
  HoloComposition,
  HoloObjectTrait,
  HoloValue,
} from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

function trait(name: string, config: Record<string, HoloValue> = {}): HoloObjectTrait {
  return {
    type: 'ObjectTrait',
    name,
    config,
  } as HoloObjectTrait;
}

function compositionWithSandbox(traits: HoloObjectTrait[]): HoloComposition {
  return {
    type: 'Composition',
    name: 'AuthorityNodeService',
    objects: [
      {
        type: 'Object',
        name: 'NativeSandbox',
        properties: [],
        traits,
      },
    ],
  } as HoloComposition;
}

describe('NodeServiceCompiler Authority effects', () => {
  it('rejects elevated sandbox_execution without an Authority effect declaration', () => {
    const compiler = new NodeServiceCompiler();
    const composition = compositionWithSandbox([
      trait('sandbox_execution', {
        allow_native_modules: true,
        permissions: { filesystem: 'all', network: 'none', environment: 'none' },
      }),
    ]);

    let error: unknown;
    try {
      compiler.compile(composition, 'test-token');
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(CompileTimeAuthorityEffectError);
    expect((error as Error).message).toContain('authority:world');
    expect((error as Error).message).toContain('@sandbox_execution');
  });

  it('compiles elevated sandbox_execution when authority:own is declared', () => {
    const compiler = new NodeServiceCompiler();
    const composition = compositionWithSandbox([
      trait('sandbox_execution', {
        allow_native_modules: true,
        permissions: { filesystem: 'all' },
        effects: ['authority:world'],
      }),
    ]);

    const result = compiler.compile(composition, 'test-token');

    expect(result['index.ts']).toBeDefined();
    expect(result['package.json']).toBeDefined();
  });
});
