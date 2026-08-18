// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// A synthetic affordance table, so every branch is exercised regardless of which traits
// happen to be annotated in the repo today. The real generated table is asserted
// separately in @holoscript/core (derived-trait-ui.generated.test.ts) — together the two
// cover the whole chain: .holo `ui:` block → generated artifact → inspector controls.
vi.mock('@holoscript/core', () => ({
  TRAIT_UI_AFFORDANCES: {
    // Overlays a trait the built-in table already knows (material).
    material: [
      {
        name: 'metallic',
        type: 'number',
        label: 'Metalness',
        min: 0.2,
        max: 0.8,
        step: 0.05,
        defaultValue: 0.4,
      },
      { name: 'opacity', type: 'number', hidden: true },
    ],
    // A trait the built-in table does NOT know — the point of the feature.
    spatial_panel: [
      {
        name: 'width',
        type: 'number',
        label: 'Width (m)',
        min: 0.1,
        max: 5,
        step: 0.05,
        defaultValue: 1.2,
      },
      { name: 'title', type: 'string', label: 'Panel Title', defaultValue: 'Untitled' },
      { name: 'follow_head', type: 'boolean', label: 'Follow Head', defaultValue: true },
      {
        name: 'mode',
        type: 'enum',
        label: 'Mode',
        enumValues: ['compact', 'full'],
        defaultValue: 'full',
      },
      // Declared default whose shape does not fit the control — must be ignored, not bound.
      { name: 'height', type: 'number', label: 'Height (m)', defaultValue: 'tall' },
      { name: 'cache_key', type: 'string', hidden: true },
      { name: 'raw_blob', type: 'object', label: 'Raw Blob' },
    ],
    // Declares affordances only on props with no renderable control.
    opaque_only: [{ name: 'payload', type: 'object', label: 'Payload' }],
  },
}));

vi.mock('@/lib/stores', () => ({ useSceneStore: vi.fn() }));

const { resolveTraitControls, controlTypeFor, humanizeTraitName, coerceDeclaredDefault } =
  await import('../useNodeInspector');
const { useNodeInspector } = await import('../useNodeInspector');
const { useSceneStore } = await import('@/lib/stores');

describe('coerceDeclaredDefault', () => {
  it('accepts a value matching the control type', () => {
    expect(coerceDeclaredDefault(320, 'float')).toBe(320);
    expect(coerceDeclaredDefault(0, 'float')).toBe(0);
    expect(coerceDeclaredDefault(false, 'boolean')).toBe(false);
    expect(coerceDeclaredDefault('', 'string')).toBe('');
    expect(coerceDeclaredDefault('#fff', 'color')).toBe('#fff');
    expect(coerceDeclaredDefault('full', 'enum')).toBe('full');
    expect(coerceDeclaredDefault([1, 2, 3], 'vec3')).toEqual([1, 2, 3]);
  });

  it('rejects a value the control cannot hold', () => {
    expect(coerceDeclaredDefault('tall', 'float')).toBeUndefined();
    expect(coerceDeclaredDefault(1, 'boolean')).toBeUndefined();
    expect(coerceDeclaredDefault(42, 'string')).toBeUndefined();
    expect(coerceDeclaredDefault([1, 2], 'vec3')).toBeUndefined();
    expect(coerceDeclaredDefault(['a', 'b', 'c'], 'vec3')).toBeUndefined();
    expect(coerceDeclaredDefault(Number.NaN, 'float')).toBeUndefined();
  });

  it('treats absent as absent', () => {
    expect(coerceDeclaredDefault(undefined, 'float')).toBeUndefined();
    expect(coerceDeclaredDefault(null, 'string')).toBeUndefined();
  });
});

describe('controlTypeFor', () => {
  it('maps schema types onto inspector control types', () => {
    expect(controlTypeFor('number')).toBe('float');
    expect(controlTypeFor('vector3')).toBe('vec3');
    expect(controlTypeFor('color')).toBe('color');
    expect(controlTypeFor('boolean')).toBe('boolean');
    expect(controlTypeFor('enum')).toBe('enum');
    expect(controlTypeFor('string')).toBe('string');
  });

  it('returns null for types with no editable control', () => {
    // Rendering these as a text box would offer an edit that cannot round-trip.
    expect(controlTypeFor('array')).toBeNull();
    expect(controlTypeFor('object')).toBeNull();
    expect(controlTypeFor('any')).toBeNull();
    expect(controlTypeFor('nonsense')).toBeNull();
  });
});

describe('humanizeTraitName', () => {
  it('turns a snake_case trait name into a group heading', () => {
    expect(humanizeTraitName('spatial_panel')).toBe('Spatial Panel');
    expect(humanizeTraitName('transform')).toBe('Transform');
  });
});

describe('resolveTraitControls', () => {
  describe('a trait the built-in table knows', () => {
    it('keeps the built-in group identity and untouched props', () => {
      const resolved = resolveTraitControls('transform');
      expect(resolved).not.toBeNull();
      expect(resolved!.label).toBe('Transform');
      // No affordances declared for transform — identical to the built-in table.
      expect(resolved!.props.find((p) => p.key === 'rotation')).toMatchObject({
        min: -360,
        max: 360,
        step: 1,
      });
    });

    it('lets a declared affordance override the built-in label, range and step', () => {
      const metallic = resolveTraitControls('material')!.props.find((p) => p.key === 'metallic');
      // Built-in said: label 'Metallic', 0..1 step 0.01. The trait now says otherwise.
      expect(metallic).toMatchObject({ label: 'Metalness', min: 0.2, max: 0.8, step: 0.05 });
    });

    it('drops a property the trait marks hidden', () => {
      const keys = resolveTraitControls('material')!.props.map((p) => p.key);
      expect(keys).not.toContain('opacity');
      expect(keys).toContain('roughness'); // its siblings survive
    });

    it('leaves sibling props of an overridden one alone', () => {
      const roughness = resolveTraitControls('material')!.props.find((p) => p.key === 'roughness');
      expect(roughness).toMatchObject({ label: 'Roughness', min: 0, max: 1, step: 0.01 });
    });
  });

  describe('a trait the built-in table does NOT know', () => {
    it('builds a group from the declared affordances alone', () => {
      const resolved = resolveTraitControls('spatial_panel');
      expect(resolved).not.toBeNull();
      expect(resolved!.label).toBe('Spatial Panel');
    });

    it('carries label, range, step and declared default onto the control', () => {
      const width = resolveTraitControls('spatial_panel')!.props.find((p) => p.key === 'width');
      expect(width).toEqual({
        key: 'width',
        type: 'float',
        label: 'Width (m)',
        min: 0.1,
        max: 5,
        step: 0.05,
        declaredDefault: 1.2,
      });
    });

    it('carries enum members through as selectable options', () => {
      const mode = resolveTraitControls('spatial_panel')!.props.find((p) => p.key === 'mode');
      expect(mode).toMatchObject({ type: 'enum', options: ['compact', 'full'] });
    });

    it('omits hidden props and props with no renderable control', () => {
      const keys = resolveTraitControls('spatial_panel')!.props.map((p) => p.key);
      expect(keys).not.toContain('cache_key'); // hidden
      expect(keys).not.toContain('raw_blob'); // object — no control
      expect(keys).toEqual(['width', 'title', 'follow_head', 'mode', 'height']);
    });
  });

  describe('declared defaults', () => {
    const propOf = (trait: string, key: string) =>
      resolveTraitControls(trait)!.props.find((p) => p.key === key);

    it('carries a declared default of each control type', () => {
      expect(propOf('spatial_panel', 'title')!.declaredDefault).toBe('Untitled');
      expect(propOf('spatial_panel', 'follow_head')!.declaredDefault).toBe(true);
      expect(propOf('spatial_panel', 'mode')!.declaredDefault).toBe('full');
    });

    it('carries a declared default onto a built-in prop too', () => {
      expect(propOf('material', 'metallic')!.declaredDefault).toBe(0.4);
    });

    it('ignores a default whose shape does not fit the control', () => {
      // `height` declares the string "tall" on a number control. Binding it would put a
      // value into a slider that cannot represent it.
      const height = propOf('spatial_panel', 'height')!;
      expect(height.type).toBe('float');
      expect(height).not.toHaveProperty('declaredDefault');
    });

    it('leaves props that declare no default without one', () => {
      expect(propOf('material', 'roughness')).not.toHaveProperty('declaredDefault');
    });
  });

  describe('refusals', () => {
    it('returns null for a trait neither source knows', () => {
      expect(resolveTraitControls('no_such_trait')).toBeNull();
    });

    it('returns null when every declared prop is unrenderable', () => {
      // An empty group is worse than no group: it implies there is nothing to edit
      // when in fact there is nothing the inspector can edit.
      expect(resolveTraitControls('opaque_only')).toBeNull();
    });
  });
});

describe('value precedence — scene value, then declared default, then empty', () => {
  const propIn = (code: string, objectName: string, trait: string, key: string) => {
    (useSceneStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: unknown) => unknown) => selector({ code, setCode: vi.fn() })
    );
    const { result } = renderHook(() => useNodeInspector(objectName));
    return result.current.groups.find((g) => g.trait === trait)?.props.find((p) => p.key === key);
  };

  beforeEach(() => {
    (useSceneStore as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  it('prefers what the scene sets', () => {
    const code = 'object "p1" {\n  @spatial_panel {\n    width: 3.5\n  }\n}';
    expect(propIn(code, 'p1', 'spatial_panel', 'width')?.value).toBe(3.5);
  });

  it('falls back to the trait-declared default when the scene is silent', () => {
    // THE FIX: every one of these used to open at 0 / '' / false, because the parser
    // discarded the `= default` and the inspector had nothing to fall back to.
    const code = 'object "p1" {\n  @spatial_panel {\n  }\n}';
    expect(propIn(code, 'p1', 'spatial_panel', 'width')?.value).toBe(1.2);
    expect(propIn(code, 'p1', 'spatial_panel', 'title')?.value).toBe('Untitled');
    expect(propIn(code, 'p1', 'spatial_panel', 'follow_head')?.value).toBe(true);
    expect(propIn(code, 'p1', 'spatial_panel', 'mode')?.value).toBe('full');
  });

  it('falls back to an empty value when neither the scene nor a usable default exists', () => {
    // `height` declares "tall" on a number control — unusable, so the empty value stands.
    const code = 'object "p1" {\n  @spatial_panel {\n  }\n}';
    expect(propIn(code, 'p1', 'spatial_panel', 'height')?.value).toBe(0);
  });

  it('does not leak declaredDefault onto the rendered prop', () => {
    // The panel renders SceneProp; declaredDefault is an input to choosing `value`,
    // not something a control should read.
    const code = 'object "p1" {\n  @spatial_panel {\n  }\n}';
    expect(propIn(code, 'p1', 'spatial_panel', 'width')).not.toHaveProperty('declaredDefault');
  });
});
