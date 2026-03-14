/**
 * edit-holo-tools.test.ts — Tests for the edit_holo MCP tool
 *
 * Covers: set_property (new + existing), remove_property, add_trait,
 * remove_trait, rename, multi-edit, missing target, format preservation,
 * and .holo vs .hsplus format support.
 */

import { describe, it, expect } from 'vitest';
import { handleEditHoloTool, editHoloTools } from '../edit-holo-tools';

// ── Test fixtures ────────────────────────────────────────────────────────────

const HOLO_SCENE = `composition "TestScene" {
  environment {
    skybox: "nebula"
    ambient_light: 0.4
  }

  object "Player" @grabbable @physics {
    geometry: "capsule"
    position: [0, 1, 0]
    color: "blue"
    // Player avatar
    height: 1.8
  }

  object "Floor" {
    geometry: "plane"
    position: [0, 0, 0]
    size: [20, 0.1, 20]
  }

  object "Crate" @grabbable {
    geometry: "cube"
    position: [3, 0.5, 2]
    color: "brown"
  }
}`;

const HSPLUS_SCENE = `cube Player @grabbable @physics {
  position: [0, 1, 0]
  color: "blue"
}

object Floor {
  position: [0, 0, 0]
  size: [20, 0.1, 20]
}`;

// ── Tool registration ────────────────────────────────────────────────────────

describe('editHoloTools — registration', () => {
  it('exports edit_holo tool definition', () => {
    const tool = editHoloTools.find(t => t.name === 'edit_holo');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('Surgically edit');
  });

  it('requires code, target, edits', () => {
    const tool = editHoloTools.find(t => t.name === 'edit_holo')!;
    const required = (tool.inputSchema as any).required;
    expect(required).toContain('code');
    expect(required).toContain('target');
    expect(required).toContain('edits');
  });
});

// ── Dispatch ─────────────────────────────────────────────────────────────────

describe('handleEditHoloTool — dispatch', () => {
  it('returns null for unknown tool names', async () => {
    const result = await handleEditHoloTool('other_tool', {});
    expect(result).toBeNull();
  });

  it('returns EditHoloResult for edit_holo', async () => {
    const result = await handleEditHoloTool('edit_holo', {
      code: HOLO_SCENE,
      target: 'Player',
      edits: [{ op: 'set_property', key: 'speed', value: '5.0' }],
    });
    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
  });
});

// ── set_property ─────────────────────────────────────────────────────────────

describe('edit_holo — set_property', () => {
  it('adds a new property to the object block', async () => {
    const result = await handleEditHoloTool('edit_holo', {
      code: HOLO_SCENE,
      target: 'Player',
      edits: [{ op: 'set_property', key: 'speed', value: '5.0' }],
    });
    expect(result!.success).toBe(true);
    expect(result!.code).toContain('speed: 5.0');
    expect(result!.diff).toContain('+speed: 5.0');
  });

  it('updates an existing property value', async () => {
    const result = await handleEditHoloTool('edit_holo', {
      code: HOLO_SCENE,
      target: 'Player',
      edits: [{ op: 'set_property', key: 'color', value: '"red"' }],
    });
    expect(result!.success).toBe(true);
    expect(result!.code).toContain('color: "red"');
    expect(result!.code).not.toContain('color: "blue"');
  });

  it('updates position array', async () => {
    const result = await handleEditHoloTool('edit_holo', {
      code: HOLO_SCENE,
      target: 'Crate',
      edits: [{ op: 'set_property', key: 'position', value: '[5, 1, 3]' }],
    });
    expect(result!.code).toContain('position: [5, 1, 3]');
  });
});

// ── remove_property ──────────────────────────────────────────────────────────

describe('edit_holo — remove_property', () => {
  it('removes an existing property', async () => {
    const result = await handleEditHoloTool('edit_holo', {
      code: HOLO_SCENE,
      target: 'Player',
      edits: [{ op: 'remove_property', key: 'color' }],
    });
    expect(result!.success).toBe(true);
    expect(result!.code).not.toContain('color: "blue"');
    // Other properties still present
    expect(result!.code).toContain('geometry: "capsule"');
  });

  it('reports missing property gracefully', async () => {
    const result = await handleEditHoloTool('edit_holo', {
      code: HOLO_SCENE,
      target: 'Player',
      edits: [{ op: 'remove_property', key: 'nonexistent' }],
    });
    expect(result!.success).toBe(true);
    expect(result!.diff.some(d => d.includes('not found'))).toBe(true);
  });
});

// ── add_trait ────────────────────────────────────────────────────────────────

describe('edit_holo — add_trait', () => {
  it('adds a trait to the declaration line', async () => {
    const result = await handleEditHoloTool('edit_holo', {
      code: HOLO_SCENE,
      target: 'Floor',
      edits: [{ op: 'add_trait', trait: '@collidable' }],
    });
    expect(result!.success).toBe(true);
    // The Floor declaration should now contain @collidable
    const floorLine = result!.code.split('\n').find(l => l.includes('"Floor"'));
    expect(floorLine).toContain('@collidable');
  });

  it('normalizes trait without @ prefix', async () => {
    const result = await handleEditHoloTool('edit_holo', {
      code: HOLO_SCENE,
      target: 'Floor',
      edits: [{ op: 'add_trait', trait: 'walkable' }],
    });
    const floorLine = result!.code.split('\n').find(l => l.includes('"Floor"'));
    expect(floorLine).toContain('@walkable');
  });

  it('skips duplicate trait', async () => {
    const result = await handleEditHoloTool('edit_holo', {
      code: HOLO_SCENE,
      target: 'Player',
      edits: [{ op: 'add_trait', trait: '@grabbable' }],
    });
    expect(result!.diff.some(d => d.includes('already present'))).toBe(true);
  });
});

// ── remove_trait ─────────────────────────────────────────────────────────────

describe('edit_holo — remove_trait', () => {
  it('removes a trait from the declaration', async () => {
    const result = await handleEditHoloTool('edit_holo', {
      code: HOLO_SCENE,
      target: 'Player',
      edits: [{ op: 'remove_trait', trait: '@physics' }],
    });
    expect(result!.success).toBe(true);
    const playerLine = result!.code.split('\n').find(l => l.includes('"Player"'));
    expect(playerLine).not.toContain('@physics');
    expect(playerLine).toContain('@grabbable'); // other trait preserved
  });

  it('reports missing trait gracefully', async () => {
    const result = await handleEditHoloTool('edit_holo', {
      code: HOLO_SCENE,
      target: 'Player',
      edits: [{ op: 'remove_trait', trait: '@nonexistent' }],
    });
    expect(result!.diff.some(d => d.includes('not found'))).toBe(true);
  });
});

// ── rename ───────────────────────────────────────────────────────────────────

describe('edit_holo — rename', () => {
  it('renames a quoted object', async () => {
    const result = await handleEditHoloTool('edit_holo', {
      code: HOLO_SCENE,
      target: 'Crate',
      edits: [{ op: 'rename', newName: 'Barrel' }],
    });
    expect(result!.success).toBe(true);
    expect(result!.code).toContain('"Barrel"');
    expect(result!.code).not.toContain('"Crate"');
  });
});

// ── Multi-edit ───────────────────────────────────────────────────────────────

describe('edit_holo — multi-edit', () => {
  it('applies multiple edits in sequence', async () => {
    const result = await handleEditHoloTool('edit_holo', {
      code: HOLO_SCENE,
      target: 'Player',
      edits: [
        { op: 'set_property', key: 'color', value: '"green"' },
        { op: 'set_property', key: 'speed', value: '10' },
        { op: 'remove_property', key: 'height' },
        { op: 'add_trait', trait: '@glowing' },
      ],
    });
    expect(result!.success).toBe(true);
    expect(result!.code).toContain('color: "green"');
    expect(result!.code).toContain('speed: 10');
    expect(result!.code).not.toContain('height: 1.8');
    const playerLine = result!.code.split('\n').find(l => l.includes('"Player"'));
    expect(playerLine).toContain('@glowing');
    expect(result!.diff).toHaveLength(4);
  });
});

// ── Missing target ───────────────────────────────────────────────────────────

describe('edit_holo — missing target', () => {
  it('returns error for unknown object name', async () => {
    const result = await handleEditHoloTool('edit_holo', {
      code: HOLO_SCENE,
      target: 'NonExistent',
      edits: [{ op: 'set_property', key: 'x', value: '1' }],
    });
    expect(result!.success).toBe(false);
    expect(result!.error).toContain('NonExistent');
  });
});

// ── Format preservation ──────────────────────────────────────────────────────

describe('edit_holo — format preservation', () => {
  it('preserves comments in the edited block', async () => {
    const result = await handleEditHoloTool('edit_holo', {
      code: HOLO_SCENE,
      target: 'Player',
      edits: [{ op: 'set_property', key: 'speed', value: '5' }],
    });
    expect(result!.code).toContain('// Player avatar');
  });

  it('preserves other objects untouched', async () => {
    const result = await handleEditHoloTool('edit_holo', {
      code: HOLO_SCENE,
      target: 'Player',
      edits: [{ op: 'set_property', key: 'speed', value: '5' }],
    });
    // Floor and Crate should be identical
    expect(result!.code).toContain('object "Floor"');
    expect(result!.code).toContain('object "Crate" @grabbable');
    expect(result!.code).toContain('size: [20, 0.1, 20]');
  });

  it('preserves environment block', async () => {
    const result = await handleEditHoloTool('edit_holo', {
      code: HOLO_SCENE,
      target: 'Player',
      edits: [{ op: 'set_property', key: 'speed', value: '5' }],
    });
    expect(result!.code).toContain('skybox: "nebula"');
    expect(result!.code).toContain('ambient_light: 0.4');
  });
});

// ── .hsplus format ───────────────────────────────────────────────────────────

describe('edit_holo — hsplus format', () => {
  it('locates unquoted object names', async () => {
    const result = await handleEditHoloTool('edit_holo', {
      code: HSPLUS_SCENE,
      target: 'Player',
      edits: [{ op: 'set_property', key: 'speed', value: '3' }],
    });
    expect(result!.success).toBe(true);
    expect(result!.code).toContain('speed: 3');
  });
});

// ── Sequential chained edits (source-preserving composability) ───────────────

describe('edit_holo — chained sequential edits', () => {
  it('feeds output of edit A as input to edit B', async () => {
    // Step 1: add speed to Player
    const step1 = await handleEditHoloTool('edit_holo', {
      code: HOLO_SCENE,
      target: 'Player',
      edits: [{ op: 'set_property', key: 'speed', value: '5' }],
    });
    expect(step1!.success).toBe(true);

    // Step 2: use step1's output to edit Crate
    const step2 = await handleEditHoloTool('edit_holo', {
      code: step1!.code,
      target: 'Crate',
      edits: [{ op: 'add_trait', trait: '@collidable' }],
    });
    expect(step2!.success).toBe(true);

    // Both edits should be present in final output
    expect(step2!.code).toContain('speed: 5');
    const crateLine = step2!.code.split('\n').find(l => l.includes('"Crate"'));
    expect(crateLine).toContain('@collidable');

    // Source structure preserved
    expect(step2!.code).toContain('skybox: "nebula"');
    expect(step2!.code).toContain('// Player avatar');
  });

  it('preserves source through 3+ chained edits', async () => {
    let code = HOLO_SCENE;

    // Chain: rename Crate → Box, add trait to Box, set property on Player
    const r1 = await handleEditHoloTool('edit_holo', {
      code,
      target: 'Crate',
      edits: [{ op: 'rename', newName: 'Box' }],
    });
    code = r1!.code;

    const r2 = await handleEditHoloTool('edit_holo', {
      code,
      target: 'Box',
      edits: [{ op: 'add_trait', trait: '@destructible' }],
    });
    code = r2!.code;

    const r3 = await handleEditHoloTool('edit_holo', {
      code,
      target: 'Player',
      edits: [{ op: 'set_property', key: 'health', value: '100' }],
    });
    code = r3!.code;

    // All 3 edits present
    expect(code).toContain('"Box"');
    expect(code).not.toContain('"Crate"');
    expect(code).toContain('@destructible');
    expect(code).toContain('health: 100');
    // Source integrity
    expect(code).toContain('composition "TestScene"');
    expect(code).toContain('ambient_light: 0.4');
  });
});

// ── Guardrails for unsafe/ambiguous edits ─────────────────────────────────────

describe('edit_holo — guardrails', () => {
  it('handles empty code gracefully', async () => {
    const result = await handleEditHoloTool('edit_holo', {
      code: '',
      target: 'Player',
      edits: [{ op: 'set_property', key: 'x', value: '1' }],
    });
    expect(result!.success).toBe(false);
  });

  it('handles empty edits array gracefully', async () => {
    const result = await handleEditHoloTool('edit_holo', {
      code: HOLO_SCENE,
      target: 'Player',
      edits: [],
    });
    // Whether success or error, source should not be corrupted
    if (result!.success) {
      expect(result!.code).toContain('composition "TestScene"');
      expect(result!.code).toContain('object "Player"');
    }
  });

  it('handles invalid op type gracefully', async () => {
    const result = await handleEditHoloTool('edit_holo', {
      code: HOLO_SCENE,
      target: 'Player',
      edits: [{ op: 'delete_everything' as any }],
    });
    // Should not corrupt the source
    if (result!.success) {
      expect(result!.code).toContain('composition "TestScene"');
    }
  });
});
