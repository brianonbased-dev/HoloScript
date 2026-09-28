import { describe, expect, it } from 'vitest';

import { validateGeneratedHoloOutput } from '../generatedOutputGate';

const VALID_GENERATED_SCENE = `composition "Generated Scene" {
  scene "Main" {
    object "Beacon" @glowing {
      geometry: "sphere"
      position: [0, 1, -2]
      scale: [0.5, 0.5, 0.5]
    }
  }
}`;

const SURFACE_ONLY_SCENE = `composition "Looks Like Studio UI" {
  hero "Landing" {
    headline: "A glowing cube in a beautiful room"
    cta: "Render it"
  }
}`;

describe('generatedOutputGate', () => {
  it('accepts generated scene output only after core parser produces an AST with primitives', () => {
    const validation = validateGeneratedHoloOutput(VALID_GENERATED_SCENE);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.ast?.type).toBe('Composition');
    expect(validation.ast?.scenes?.[0]?.objects[0]?.name).toBe('Beacon');
    expect(validation.corePrimitives.sceneObjects).toBe(1);
    expect(validation.corePrimitives.total).toBeGreaterThan(0);
  });

  it('rejects surface-only output even when it has a composition-shaped wrapper', () => {
    const validation = validateGeneratedHoloOutput(SURFACE_ONLY_SCENE);

    expect(validation.valid).toBe(false);
    expect(validation.ast?.type).toBe('Composition');
    expect(validation.corePrimitives.total).toBe(0);
    expect(validation.errors).toContain(
      'Generated HoloScript parsed but produced no core scene/world primitives'
    );
    expect(validation.warnings).toContain(
      '"hero" is not a HoloScript element, so its block does not count as scene content'
    );
  });

  it('still counts a domain block HoloScript defines', () => {
    const validation = validateGeneratedHoloOutput(`composition "Greenhouse" {
  sensor "Air" {
    type: "temperature"
  }
}`);

    expect(validation.ast?.domainBlocks?.[0]?.domain).toBe('iot');
    expect(validation.corePrimitives.domainBlocks).toBe(1);
    expect(validation.valid).toBe(true);
  });

  it('passes real scene content next to a user-defined block, and names that block', () => {
    const validation = validateGeneratedHoloOutput(`composition "Mixed" {
  hero "Landing" {
    headline: "A glowing cube"
  }
  object "Cube" {
    geometry: "box"
    position: [0, 1, 0]
  }
}`);

    expect(validation.valid).toBe(true);
    expect(validation.corePrimitives.objects).toBe(1);
    expect(validation.corePrimitives.domainBlocks).toBe(0);
    expect(validation.warnings).toContain(
      '"hero" is not a HoloScript element, so its block does not count as scene content'
    );
  });
});
