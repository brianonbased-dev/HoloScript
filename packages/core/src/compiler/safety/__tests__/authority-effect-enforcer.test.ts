import { describe, expect, it } from 'vitest';
import type {
  HoloComposition,
  HoloObjectTrait,
  HoloValue,
} from '../../../parser/HoloCompositionTypes';
import {
  assertAuthorityEffects,
  checkAuthorityEffects,
  CompileTimeAuthorityEffectError,
} from '../AuthorityEffectEnforcer';

function trait(
  name: string,
  config: Record<string, HoloValue> = {},
  args?: HoloValue[]
): HoloObjectTrait {
  return {
    type: 'ObjectTrait',
    name,
    config,
    args,
  } as HoloObjectTrait;
}

function sandboxComposition(traits: HoloObjectTrait[]): HoloComposition {
  return {
    type: 'Composition',
    name: 'AuthoritySandbox',
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

describe('AuthorityEffectEnforcer', () => {
  it('does not emit effect nodes for constrained sandbox execution', () => {
    const result = checkAuthorityEffects(
      sandboxComposition([
        trait('sandbox_execution', {
          allow_native_modules: true,
          permissions: { filesystem: 'read', network: 'none', environment: 'none' },
        }),
      ])
    );

    expect(result.passed).toBe(true);
    expect(result.nodes).toHaveLength(0);
  });

  it('fails elevated sandbox execution without authority:own', () => {
    const result = checkAuthorityEffects(
      sandboxComposition([
        trait('sandbox_execution', {
          allow_native_modules: true,
          permissions: { filesystem: 'all', network: 'none', environment: 'none' },
        }),
      ])
    );

    expect(result.passed).toBe(false);
    expect(result.nodes).toHaveLength(1);
    expect(result.violations[0]?.effect).toBe('authority:world');
    expect(result.violations[0]?.message).toContain('Undeclared effect');
  });

  it('accepts authority:world declared on the sandbox trait config', () => {
    const result = checkAuthorityEffects(
      sandboxComposition([
        trait('sandbox_execution', {
          allow_native_modules: true,
          permissions: { filesystem: 'all' },
          effects: ['authority:world'],
        }),
      ])
    );

    expect(result.passed).toBe(true);
    expect(result.nodes[0]?.declaredEffects).toEqual(['authority:world']);
  });

  it('accepts sibling @effects(authority:world) declarations', () => {
    const result = checkAuthorityEffects(
      sandboxComposition([
        trait('sandbox_execution', {
          allow_native_modules: true,
          permissions: { filesystem: 'all' },
        }),
        trait('effects', {}, ['authority:world']),
      ])
    );

    expect(result.passed).toBe(true);
    expect(result.nodes[0]?.declaredEffects).toEqual(['authority:world']);
  });

  it('throws a compile-time authority error for violating compositions', () => {
    expect(() =>
      assertAuthorityEffects(
        sandboxComposition([
          trait('sandbox_execution', {
            allow_native_modules: true,
            permissions: { filesystem: 'all' },
          }),
        ])
      )
    ).toThrow(CompileTimeAuthorityEffectError);
  });
});
