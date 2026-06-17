/**
 * holotest-tools.test.ts — Tests for the execute_holotest MCP tool
 *
 * Covers: handleHolotestTool dispatch, assertion types (no_intersect, intersects,
 * within_volume, poly_count), auto-intersection detection (regex-based scene parser),
 * error feedback structure, and parse error handling.
 *
 * Uses the regex fallback parser by injecting object blocks directly in HoloScript format.
 */

import { describe, it, expect } from 'vitest';
import { handleHolotestTool, holotestTools } from '../holotest-tools';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build minimal .holo scene code with positioned objects.
 * The regex parser reads: object "id" { position: [x,y,z] size: [w,h,d] }
 */
function scene(
  ...objects: { id: string; pos: [number, number, number]; size: [number, number, number] }[]
) {
  return objects
    .map(
      (o) =>
        `object "${o.id}" {\n  position: [${o.pos.join(',')}]\n  size: [${o.size.join(',')}]\n}`
    )
    .join('\n\n');
}

// ── Tool registration ────────────────────────────────────────────────────────

describe('holotestTools — registration', () => {
  it('exports execute_holotest tool definition', () => {
    const tool = holotestTools.find((t) => t.name === 'execute_holotest');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('spatial assertions');
  });

  it('tool requires code in inputSchema', () => {
    const tool = holotestTools.find((t) => t.name === 'execute_holotest')!;
    expect((tool.inputSchema as any).required).toContain('code');
  });
});

// ── handleHolotestTool dispatch ──────────────────────────────────────────────

describe('handleHolotestTool — dispatch', () => {
  it('returns null for unknown tool names', async () => {
    const result = await handleHolotestTool('unknown_tool', {});
    expect(result).toBeNull();
  });

  it('returns a HolotestResult for execute_holotest', async () => {
    const result = await handleHolotestTool('execute_holotest', {
      code: scene({ id: 'floor', pos: [0, 0, 0], size: [10, 0.1, 10] }),
    });
    expect(result).not.toBeNull();
    expect(result!.tool_name).toBe('execute_holotest');
  });
});

// ── Auto-intersection detection ──────────────────────────────────────────────

describe('execute_holotest — auto-intersection', () => {
  it('passes when objects do not overlap (explicit assertion)', async () => {
    const code = scene(
      { id: 'a', pos: [0, 0, 0], size: [1, 1, 1] },
      { id: 'b', pos: [10, 0, 0], size: [1, 1, 1] }
    );
    // Use explicit no_intersect assertion to avoid parser-dependent auto-check
    const result = await handleHolotestTool('execute_holotest', {
      code,
      format: 'hs',
      assertions: [{ type: 'no_intersect', entityA: 'a', entityB: 'b' }],
    });
    expect(result!.status).toBe('passed');
  });

  it('detects overlap and provides agent_feedback', async () => {
    const code = scene(
      { id: 'crate', pos: [0, 0, 0], size: [2, 2, 2] },
      { id: 'barrel', pos: [0.5, 0, 0], size: [2, 2, 2] }
    );
    const result = await handleHolotestTool('execute_holotest', {
      code,
      format: 'hs',
      assertions: [{ type: 'no_intersect', entityA: 'crate', entityB: 'barrel' }],
    });
    expect(result!.status).toBe('failed');
    expect(result!.agent_feedback).toBeDefined();
    expect(result!.agent_feedback!.error_type).toBe('IntersectionViolation');
    expect(result!.agent_feedback!.semantic_message).toContain('crate');
    expect(result!.agent_feedback!.fix_suggestion).toContain('Adjust');
  });
});

// ── Explicit assertions ──────────────────────────────────────────────────────

describe('execute_holotest — explicit assertions', () => {
  const twoObjects = scene(
    { id: 'floor', pos: [0, 0, 0], size: [10, 0.1, 10] },
    { id: 'crate', pos: [0, 5, 0], size: [1, 1, 1] }
  );

  it('no_intersect passes for separated objects', async () => {
    const result = await handleHolotestTool('execute_holotest', {
      code: twoObjects,
      assertions: [{ type: 'no_intersect', entityA: 'floor', entityB: 'crate' }],
    });
    expect(result!.status).toBe('passed');
  });

  it('intersects fails for separated objects', async () => {
    const result = await handleHolotestTool('execute_holotest', {
      code: twoObjects,
      assertions: [{ type: 'intersects', entityA: 'floor', entityB: 'crate' }],
    });
    expect(result!.status).toBe('failed');
  });

  it('within_volume passes when entity is inside container', async () => {
    const result = await handleHolotestTool('execute_holotest', {
      code: twoObjects,
      assertions: [
        {
          type: 'within_volume',
          entityA: 'crate',
          container: { min: [-10, 0, -10], max: [10, 20, 10] },
        },
      ],
    });
    expect(result!.status).toBe('passed');
  });

  it('within_volume fails when entity protrudes', async () => {
    const result = await handleHolotestTool('execute_holotest', {
      code: twoObjects,
      assertions: [
        {
          type: 'within_volume',
          entityA: 'crate',
          container: { min: [0, 0, 0], max: [0.1, 0.1, 0.1] }, // tiny box
        },
      ],
    });
    expect(result!.status).toBe('failed');
    expect(result!.agent_feedback!.error_type).toBe('OutOfBounds');
  });

  it('poly_count passes within limit', async () => {
    const result = await handleHolotestTool('execute_holotest', {
      code: twoObjects,
      assertions: [{ type: 'poly_count', value: 50000, limit: 100000 }],
    });
    expect(result!.status).toBe('passed');
  });

  it('poly_count fails when exceeding limit', async () => {
    const result = await handleHolotestTool('execute_holotest', {
      code: twoObjects,
      assertions: [{ type: 'poly_count', value: 150000, limit: 100000 }],
    });
    expect(result!.status).toBe('failed');
    expect(result!.agent_feedback!.error_type).toBe('ValueViolation');
    expect(result!.agent_feedback!.semantic_message).toContain('150000');
  });
});

// ── Missing entity handling ──────────────────────────────────────────────────

describe('execute_holotest — missing entities', () => {
  it('reports missing entityA', async () => {
    const code = scene({ id: 'floor', pos: [0, 0, 0], size: [10, 0.1, 10] });
    const result = await handleHolotestTool('execute_holotest', {
      code,
      assertions: [{ type: 'no_intersect', entityA: 'nonexistent', entityB: 'floor' }],
    });
    expect(result!.status).toBe('failed');
    expect(result!.agent_feedback!.semantic_message).toContain('nonexistent');
  });

  it('reports incomplete assertion params', async () => {
    const code = scene({ id: 'floor', pos: [0, 0, 0], size: [10, 0.1, 10] });
    const result = await handleHolotestTool('execute_holotest', {
      code,
      assertions: [{ type: 'no_intersect' }],
    });
    expect(result!.status).toBe('failed');
    expect(result!.agent_feedback!.semantic_message).toContain('required');
  });
});

// ── Test report structure ────────────────────────────────────────────────────

describe('execute_holotest — result structure', () => {
  it('includes summary with count and timing', async () => {
    const code = scene(
      { id: 'a', pos: [0, 0, 0], size: [1, 1, 1] },
      { id: 'b', pos: [5, 0, 0], size: [1, 1, 1] }
    );
    const result = await handleHolotestTool('execute_holotest', { code });
    expect(result!.summary).toMatch(/\d+ tests/);
    expect(result!.summary).toMatch(/passed/);
  });

  it('each test report has name, status, and duration_ms', async () => {
    const code = scene(
      { id: 'a', pos: [0, 0, 0], size: [1, 1, 1] },
      { id: 'b', pos: [5, 0, 0], size: [1, 1, 1] }
    );
    const result = await handleHolotestTool('execute_holotest', { code });
    for (const test of result!.tests) {
      expect(test.name).toBeTruthy();
      expect(['passed', 'failed', 'skipped']).toContain(test.status);
      expect(typeof test.duration_ms).toBe('number');
    }
  });

  it('failed test includes error with all AgentFeedback fields', async () => {
    const code = scene(
      { id: 'x', pos: [0, 0, 0], size: [2, 2, 2] },
      { id: 'y', pos: [0.5, 0, 0], size: [2, 2, 2] }
    );
    const result = await handleHolotestTool('execute_holotest', { code });
    const failedTest = result!.tests.find((t) => t.status === 'failed')!;
    expect(failedTest.error).toBeDefined();
    expect(failedTest.error!.error_type).toBeTruthy();
    expect(failedTest.error!.semantic_message).toBeTruthy();
    expect(failedTest.error!.spatial_hint).toBeTruthy();
    expect(failedTest.error!.fix_suggestion).toBeTruthy();
    expect(Array.isArray(failedTest.error!.affected_lines)).toBe(true);
  });
});

// ── CG-086: LLM judge + execute_eval (no provider → graceful FAIL) ──────────
// These tests do NOT require a live LLM. They verify the structural contract
// of the llm_judge branch: schema wiring, result shape, fallback behavior.

describe('holotestTools — execute_eval registration (CG-086)', () => {
  it('exports execute_eval tool definition', () => {
    const tool = holotestTools.find((t) => t.name === 'execute_eval');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('LLM-as-judge');
  });

  it('execute_eval requires output and rubric in inputSchema', () => {
    const tool = holotestTools.find((t) => t.name === 'execute_eval')!;
    const required = (tool.inputSchema as { required?: string[] }).required ?? [];
    expect(required).toContain('output');
    expect(required).toContain('rubric');
  });

  it('execute_holotest schema includes llm_judge and regression_suite options', () => {
    const tool = holotestTools.find((t) => t.name === 'execute_holotest')!;
    const props = (tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
    expect(props['llm_judge']).toBeDefined();
    expect(props['regression_suite']).toBeDefined();
    expect(props['output']).toBeDefined();
  });
});

describe('handleHolotestTool — execute_eval dispatch (CG-086)', () => {
  it('returns a HolotestResult with tool_name=execute_eval', async () => {
    const result = await handleHolotestTool('execute_eval', {
      output: 'The bridge collapsed due to resonant frequency.',
      rubric: 'The explanation must be physically accurate and cite the resonance mechanism.',
    });
    expect(result).not.toBeNull();
    expect(result!.tool_name).toBe('execute_eval');
    expect(['passed', 'failed', 'error']).toContain(result!.status);
  });

  it('returns judge_result with required fields even when no provider is available', async () => {
    const result = await handleHolotestTool('execute_eval', {
      output: 'Some output text.',
      rubric: 'Must be correct.',
    });
    expect(result!.judge_result).toBeDefined();
    const jr = result!.judge_result!;
    expect(typeof jr.overall_score).toBe('number');
    expect(jr.overall_score).toBeGreaterThanOrEqual(0);
    expect(jr.overall_score).toBeLessThanOrEqual(10);
    expect(['PASS', 'FAIL', 'DEGRADED']).toContain(jr.verdict);
    expect(Array.isArray(jr.scores)).toBe(true);
    expect(typeof jr.summary).toBe('string');
    expect(typeof jr.rubric).toBe('string');
  });

  it('returns regression_diff when reference_output is provided', async () => {
    const result = await handleHolotestTool('execute_eval', {
      output: 'Current answer.',
      rubric: 'Must be accurate.',
      reference_output: 'Baseline answer.',
      reference_trace_id: 'trace-abc123',
    });
    expect(result!.regression_diff).toBeDefined();
    const rd = result!.regression_diff!;
    expect(['NO_REGRESSION', 'REGRESSION', 'IMPROVEMENT']).toContain(rd.verdict);
    expect(typeof rd.score_delta).toBe('number');
    expect(rd.reference_trace_id).toBe('trace-abc123');
  });

  it('execute_holotest with llm_judge routes to judge branch', async () => {
    const result = await handleHolotestTool('execute_holotest', {
      code: 'world TestScene {}',
      output: 'The scene is valid.',
      llm_judge: {
        rubric: 'The output must confirm scene validity.',
        scoring_dimensions: ['correctness'],
      },
    });
    expect(result).not.toBeNull();
    expect(result!.judge_result).toBeDefined();
    expect(result!.judge_result!.scores.some((s) => s.dimension === 'correctness')).toBe(true);
  });

  it('scores default to three dimensions when scoring_dimensions is omitted', async () => {
    const result = await handleHolotestTool('execute_eval', {
      output: 'Some text.',
      rubric: 'Be accurate.',
    });
    const dims = result!.judge_result!.scores.map((s) => s.dimension);
    expect(dims).toContain('correctness');
    expect(dims).toContain('completeness');
    expect(dims).toContain('conciseness');
  });
});
