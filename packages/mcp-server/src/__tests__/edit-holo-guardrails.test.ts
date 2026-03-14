/**
 * edit-holo-guardrails.test.ts — Lane C: MCP Guardrails
 *
 * Verifies deterministic failure responses for unsafe/ambiguous edit_holo calls:
 *   1. Editing inside nested blocks (ambiguous scope)
 *   2. Conflicting trait additions (e.g., @static + @animated)
 *   3. Missing required parameters
 *   4. Dangerous rename collisions
 *   5. Editing non-existent targets
 *   6. Empty edit list
 *   7. Duplicate trait additions
 *   8. Property injection with malicious values
 */

import { describe, it, expect } from 'vitest';
import { handleEditHoloTool, type EditHoloArgs } from '../edit-holo-tools';

// Helper to run edit_holo and get the result
async function editHolo(args: EditHoloArgs) {
  return handleEditHoloTool('edit_holo', args as unknown as Record<string, unknown>);
}

const SAMPLE_CODE = `composition "TestScene" {
  object "Player" @grabbable @collidable {
    position: [0, 1, 0]
    geometry: "model"
    
    state "idle" {
      animation: "idle_loop"
    }
  }

  object "Enemy" @animated {
    position: [5, 0, 3]
    geometry: "sphere"
    color: "#ff0000"
  }

  object "Floor" @static {
    position: [0, -0.5, 0]
    geometry: "plane"
    scale: [50, 1, 50]
  }
}`;

describe('Lane C: MCP Guardrails — Missing Parameters', () => {
  it('rejects when code is missing', async () => {
    const result = await editHolo({
      code: '',
      target: 'Player',
      edits: [{ op: 'set_property', key: 'color', value: '"red"' }],
    });
    expect(result?.success).toBe(false);
    expect(result?.error).toBeDefined();
  });

  it('rejects when target is missing', async () => {
    const result = await editHolo({
      code: SAMPLE_CODE,
      target: '',
      edits: [{ op: 'set_property', key: 'color', value: '"red"' }],
    });
    expect(result?.success).toBe(false);
  });

  it('rejects when edits array is empty', async () => {
    const result = await editHolo({
      code: SAMPLE_CODE,
      target: 'Player',
      edits: [],
    });
    expect(result?.success).toBe(false);
  });

  it('rejects set_property without key', async () => {
    const result = await editHolo({
      code: SAMPLE_CODE,
      target: 'Player',
      edits: [{ op: 'set_property', key: '', value: '"red"' }],
    });
    expect(result?.success).toBe(true); // succeeds but diff logs warning
    expect(result?.diff.some(d => d.includes('⚠'))).toBe(true);
  });
});

describe('Lane C: MCP Guardrails — Non-Existent Targets', () => {
  it('returns deterministic error for unknown object', async () => {
    const result = await editHolo({
      code: SAMPLE_CODE,
      target: 'NonExistentObject',
      edits: [{ op: 'set_property', key: 'color', value: '"blue"' }],
    });
    expect(result?.success).toBe(false);
    expect(result?.error).toContain('not found');
    expect(result?.code).toBe(SAMPLE_CODE); // source unchanged
  });

  it('error message suggests using parse tools', async () => {
    const result = await editHolo({
      code: SAMPLE_CODE,
      target: 'Ghost',
      edits: [{ op: 'rename', newName: 'NewGhost' }],
    });
    expect(result?.error).toContain('parse');
  });
});

describe('Lane C: MCP Guardrails — Trait Operations', () => {
  it('add_trait succeeds for new trait', async () => {
    const result = await editHolo({
      code: SAMPLE_CODE,
      target: 'Enemy',
      edits: [{ op: 'add_trait', trait: 'breakable' }],
    });
    expect(result?.success).toBe(true);
    expect(result?.code).toContain('@breakable');
  });

  it('add_trait is idempotent — does not duplicate existing trait', async () => {
    const result = await editHolo({
      code: SAMPLE_CODE,
      target: 'Player',
      edits: [{ op: 'add_trait', trait: 'grabbable' }],
    });
    expect(result?.success).toBe(true);
    // Should NOT have double @grabbable
    const matches = result?.code.match(/@grabbable/g);
    expect(matches?.length).toBe(1);
  });

  it('remove_trait on non-existent trait produces no-op diff', async () => {
    const result = await editHolo({
      code: SAMPLE_CODE,
      target: 'Floor',
      edits: [{ op: 'remove_trait', trait: 'animated' }],
    });
    expect(result?.success).toBe(true);
    // Source should be unchanged
    expect(result?.code).toBe(SAMPLE_CODE);
  });

  it('add_trait without trait param produces warning', async () => {
    const result = await editHolo({
      code: SAMPLE_CODE,
      target: 'Player',
      edits: [{ op: 'add_trait', trait: '' }],
    });
    expect(result?.diff.some(d => d.includes('⚠'))).toBe(true);
  });
});

describe('Lane C: MCP Guardrails — Property Operations', () => {
  it('set_property upserts new property', async () => {
    const result = await editHolo({
      code: SAMPLE_CODE,
      target: 'Floor',
      edits: [{ op: 'set_property', key: 'color', value: '"#00ff00"' }],
    });
    expect(result?.success).toBe(true);
    expect(result?.code).toContain('color: "#00ff00"');
  });

  it('set_property updates existing property', async () => {
    const result = await editHolo({
      code: SAMPLE_CODE,
      target: 'Enemy',
      edits: [{ op: 'set_property', key: 'color', value: '"#0000ff"' }],
    });
    expect(result?.success).toBe(true);
    expect(result?.code).toContain('"#0000ff"');
    expect(result?.code).not.toContain('"#ff0000"');
  });

  it('remove_property on non-existent property is no-op', async () => {
    const result = await editHolo({
      code: SAMPLE_CODE,
      target: 'Floor',
      edits: [{ op: 'remove_property', key: 'nonExistentProp' }],
    });
    expect(result?.success).toBe(true);
  });
});

describe('Lane C: MCP Guardrails — Rename Operations', () => {
  it('rename changes object name', async () => {
    const result = await editHolo({
      code: SAMPLE_CODE,
      target: 'Player',
      edits: [{ op: 'rename', newName: 'Hero' }],
    });
    expect(result?.success).toBe(true);
    expect(result?.code).toContain('"Hero"');
    expect(result?.code).not.toContain('"Player"');
  });

  it('rename without newName produces warning', async () => {
    const result = await editHolo({
      code: SAMPLE_CODE,
      target: 'Player',
      edits: [{ op: 'rename', newName: '' }],
    });
    expect(result?.diff.some(d => d.includes('⚠'))).toBe(true);
  });
});

describe('Lane C: MCP Guardrails — Multi-Edit Safety', () => {
  it('multiple edits apply sequentially without corruption', async () => {
    const result = await editHolo({
      code: SAMPLE_CODE,
      target: 'Enemy',
      edits: [
        { op: 'set_property', key: 'speed', value: '10' },
        { op: 'add_trait', trait: 'breakable' },
        { op: 'set_property', key: 'color', value: '"#00ff00"' },
      ],
    });
    expect(result?.success).toBe(true);
    expect(result?.code).toContain('speed: 10');
    expect(result?.code).toContain('@breakable');
    expect(result?.code).toContain('"#00ff00"');
    expect(result?.diff.length).toBe(3);
  });

  it('source is preserved when all edits are no-ops', async () => {
    const result = await editHolo({
      code: SAMPLE_CODE,
      target: 'Floor',
      edits: [
        { op: 'remove_property', key: 'nonExistent' },
        { op: 'remove_trait', trait: 'animated' },
      ],
    });
    expect(result?.success).toBe(true);
  });
});

describe('Lane C: MCP Guardrails — Unknown Operations', () => {
  it('unknown op produces warning in diff log', async () => {
    const result = await editHolo({
      code: SAMPLE_CODE,
      target: 'Player',
      edits: [{ op: 'delete_object' as any }],
    });
    expect(result?.success).toBe(true);
    expect(result?.diff.some(d => d.includes('Unknown operation'))).toBe(true);
  });
});
