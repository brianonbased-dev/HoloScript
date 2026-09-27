/**
 * holotest-tools.test.ts — Tests for the execute_holotest MCP tool
 *
 * Covers: handleHolotestTool dispatch, assertion types (no_intersect, intersects,
 * within_volume, poly_count), auto-intersection detection (regex-based scene parser),
 * error feedback structure, and parse error handling.
 *
 * Uses the regex fallback parser by injecting object blocks directly in HoloScript format.
 */

import { describe, it, expect, vi } from 'vitest';
import { handleHolotestTool, holotestTools } from '../holotest-tools';
import * as llmProvider from '@holoscript/llm-provider';

/**
 * Run `fn` with the LLM provider registry emptied, so the judge genuinely cannot run.
 *
 * This forces the outage instead of waiting for one. The registry is restored afterwards
 * even if the assertion throws, so the surrounding tests — which DO use a live provider —
 * are unaffected by ordering.
 */
async function withNoProvider<T>(fn: () => Promise<T>): Promise<T> {
  const spy = vi.spyOn(llmProvider, 'createProviderManager').mockReturnValue({
    getRegisteredProviders: () => [],
    getProvider: () => undefined,
  } as unknown as ReturnType<typeof llmProvider.createProviderManager>);
  try {
    return await fn();
  } finally {
    spy.mockRestore();
  }
}

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

// ── A judge that did not run must not return a verdict ────────────────────────
//
// These tests run with no LLM provider configured, so they exercise the real outage path
// rather than a mock of it. Before this battery, that path returned `verdict: 'FAIL',
// overall_score: 0` with every dimension zeroed — which does not say "the judge was
// unavailable", it says "this work was examined and scored zero". An infrastructure
// condition arrived at the caller as a quality verdict, and the only way to tell the
// difference was to notice that `provider` was undefined, which no caller did.
//
// The suite already called execute_eval twice without a provider and never noticed, because
// both assertions only inspected the dimension NAMES. A wrong verdict sat under passing
// tests. That is why these assert the verdict itself.
// The outage is FORCED, not hoped for. The first version of this battery branched on
// `judge.provider !== undefined` and returned early if a provider existed — and in this
// environment one does, so both tests passed without executing a single assertion about
// UNGRADED. Proven, not assumed: an assertion of `toBe('PROVE_THIS_ASSERTION_RUNS')` still
// reported 27/27 green. A test that guards the very condition it exists to check will skip
// exactly when it matters and report success for it.
describe('execute_eval — the judge failing is not the subject failing', () => {
  it('reports UNGRADED, not FAIL, when no provider can run the judge', async () => {
    const result = await withNoProvider(() =>
      handleHolotestTool('execute_eval', {
        output: 'Any text at all.',
        rubric: 'Be accurate.',
      })
    );
    const judge = result!.judge_result!;
    expect(judge.provider).toBeUndefined();
    expect(judge.verdict).toBe('UNGRADED');
    expect(judge.verdict).not.toBe('FAIL');
    // 'error' distinguishes "the check did not run" from "the check said no". 'passed' would
    // be worse still — an unjudged output reported as having passed.
    expect(result!.status).toBe('error');
    expect(result!.status).not.toBe('passed');
    // The prose a human reads must not quote a score, or the false zero returns as text.
    expect(result!.summary).toContain('UNGRADED');
    expect(result!.summary).not.toMatch(/score 0\.0\/10/);
  });

  it('does not report NO_REGRESSION when neither side could be judged', async () => {
    const result = await withNoProvider(() =>
      handleHolotestTool('execute_eval', {
        output: 'Current output.',
        rubric: 'Be accurate.',
        reference_output: 'Reference output.',
        reference_trace_id: 'trace-1',
      })
    );
    const diff = result!.regression_diff;
    expect(diff).toBeDefined();
    // This is the worst of the three: both sides scored 0, the delta was 0, and the old code
    // returned NO_REGRESSION — the most reassuring answer available, from no evidence at all.
    // A false reassurance is worse than a false failure because nobody goes looking for it.
    expect(diff!.verdict).toBe('UNGRADED');
    expect(diff!.verdict).not.toBe('NO_REGRESSION');
    expect(diff!.summary).toMatch(/could not be judged|neither .* could be judged/);
    // And the sentence must not state the opposite of what happened — an earlier draft of
    // this repair rendered "the current output could be judged".
    expect(diff!.summary).not.toMatch(/output could be judged/);
  });
});
