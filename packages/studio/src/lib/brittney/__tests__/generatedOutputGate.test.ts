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

const NO_CORE_PRIMITIVES =
  'Generated HoloScript parsed but produced no core scene/world primitives';

/** A web-page block (parses as 'custom', counts nothing) next to the block under test. */
function withPageBlock(body: string): string {
  return `composition "Generated" {
  hero "Landing" {
    headline: "A glowing cube"
  }
${body}
}`;
}

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
      `"hero" parsed as a 'custom' block, which does not count as scene content`
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
      `"hero" parsed as a 'custom' block, which does not count as scene content`
    );
  });

  describe('counts content, not the containers or definitions around it', () => {
    it('rejects a page block next to an empty scene, and names the scene', () => {
      const validation = validateGeneratedHoloOutput(withPageBlock(`  scene "Empty" {}`));

      expect(validation.ast?.scenes?.map((scene) => scene.objects.length)).toEqual([0]);
      expect(validation.valid).toBe(false);
      expect(validation.corePrimitives.scenes).toBe(1);
      expect(validation.corePrimitives.total).toBe(0);
      expect(validation.errors).toContain(NO_CORE_PRIMITIVES);
      expect(validation.warnings).toContain(
        'scene "Empty" has no objects, so it does not count as scene content'
      );
    });

    it('passes a page block next to a scene holding one object', () => {
      const validation = validateGeneratedHoloOutput(
        withPageBlock(`  scene "Main" {
    object "Cube" {
      geometry: "box"
    }
  }`)
      );

      expect(validation.valid).toBe(true);
      expect(validation.corePrimitives.scenes).toBe(1);
      expect(validation.corePrimitives.sceneObjects).toBe(1);
      expect(validation.corePrimitives.total).toBe(1);
    });

    it('passes a spatial group holding one object, counting the object and not the group', () => {
      const validation = validateGeneratedHoloOutput(
        withPageBlock(`  spatial_group "Shelf" {
    object "Cube" {
      geometry: "box"
    }
  }`)
      );

      expect(validation.ast?.spatialGroups?.[0]?.objects[0]?.name).toBe('Cube');
      expect(validation.valid).toBe(true);
      expect(validation.corePrimitives.spatialGroups).toBe(1);
      expect(validation.corePrimitives.spatialGroupContent).toBe(1);
      expect(validation.corePrimitives.total).toBe(1);
    });

    it('counts an object inside a nested spatial group', () => {
      const validation = validateGeneratedHoloOutput(
        withPageBlock(`  spatial_group "Room" {
    spatial_group "Shelf" {
      object "Cube" {
        geometry: "box"
      }
    }
  }`)
      );

      expect(validation.ast?.spatialGroups?.[0]?.objects).toEqual([]);
      expect(validation.ast?.spatialGroups?.[0]?.groups?.[0]?.objects).toHaveLength(1);
      expect(validation.valid).toBe(true);
      expect(validation.corePrimitives.spatialGroupContent).toBe(1);
      expect(validation.corePrimitives.total).toBe(1);
    });

    it('rejects a page block next to an empty spatial group, and names the group', () => {
      const validation = validateGeneratedHoloOutput(withPageBlock(`  spatial_group "Shelf" {}`));

      expect(validation.ast?.spatialGroups?.map((group) => group.name)).toEqual(['Shelf']);
      expect(validation.valid).toBe(false);
      expect(validation.corePrimitives.spatialGroups).toBe(1);
      expect(validation.corePrimitives.total).toBe(0);
      expect(validation.errors).toContain(NO_CORE_PRIMITIVES);
      expect(validation.warnings).toContain(
        'spatial_group "Shelf" has no objects or lights, so it does not count as scene content'
      );
    });

    it('rejects a spatial group that holds only an empty group, naming the outer one', () => {
      const validation = validateGeneratedHoloOutput(
        withPageBlock(`  spatial_group "Room" {
    spatial_group "Shelf" {}
  }`)
      );

      expect(validation.ast?.spatialGroups?.[0]?.groups?.map((group) => group.name)).toEqual([
        'Shelf',
      ]);
      expect(validation.valid).toBe(false);
      expect(validation.corePrimitives.total).toBe(0);
      expect(validation.warnings.filter((w) => w.startsWith('spatial_group'))).toEqual([
        'spatial_group "Room" has no objects or lights, so it does not count as scene content',
      ]);
    });

    it('counts a light inside a spatial group, as it counts a light outside one', () => {
      const validation = validateGeneratedHoloOutput(
        withPageBlock(`  spatial_group "Lamp" {
    light "Sun" {
      intensity: 1
    }
  }`)
      );

      expect(validation.ast?.lights).toEqual([]);
      expect(validation.ast?.spatialGroups?.[0]?.lights).toHaveLength(1);
      expect(validation.valid).toBe(true);
      expect(validation.corePrimitives.lights).toBe(0);
      expect(validation.corePrimitives.spatialGroupContent).toBe(1);
      expect(validation.corePrimitives.total).toBe(1);
    });

    it('rejects a page block next to a template nothing uses', () => {
      const validation = validateGeneratedHoloOutput(
        withPageBlock(`  template "Crate" {
    geometry: "box"
  }`)
      );

      expect(validation.ast?.templates?.map((template) => template.name)).toEqual(['Crate']);
      expect(validation.valid).toBe(false);
      expect(validation.corePrimitives.templates).toBe(1);
      expect(validation.corePrimitives.total).toBe(0);
      expect(validation.errors).toContain(NO_CORE_PRIMITIVES);
    });

    it('passes a template once an object uses it, counting the object', () => {
      const validation = validateGeneratedHoloOutput(
        withPageBlock(`  template "Crate" {
    geometry: "box"
  }
  object "Crate1" using "Crate" {
    position: [0, 0, 0]
  }`)
      );

      expect(validation.ast?.objects?.[0]?.template).toBe('Crate');
      expect(validation.valid).toBe(true);
      expect(validation.corePrimitives.templates).toBe(1);
      expect(validation.corePrimitives.objects).toBe(1);
      expect(validation.corePrimitives.total).toBe(1);
    });
  });
});
