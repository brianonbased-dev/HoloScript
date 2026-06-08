import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseHolo } from '@holoscript/core';

/**
 * Task 2b0q — generate->validate->retry loop for LLM tail-variability.
 *
 * Two layers:
 *  1. normalizeGeneratedHoloScript deterministic repairs (c) `=`->`:` and
 *     (d) dotted-value quoting — verified against the REAL @holoscript/core parser,
 *     not a regex stand-in, with explicit arrow/equality/float safety guards.
 *  2. tryGenerateWithAI (via generateSceneForMCP) actually re-parses provider output
 *     and re-prompts on parse failure before returning, instead of trusting the old
 *     brace-count/substring isUsable* heuristic that let `=`-laden output through.
 */

// ---------------------------------------------------------------------------
// Layer 1: deterministic repairs (no provider needed)
// ---------------------------------------------------------------------------
describe('normalizeGeneratedHoloScript — tail-variability repairs', () => {
  it('rewrites `=` to `:` inside trait arg lists so the parser accepts it', async () => {
    const { normalizeGeneratedHoloScript } = await import('../generators');
    const raw = 'composition "X" {\n  object "C" {\n    @box(width = 5, height = 3)\n  }\n}';
    expect(parseHolo(raw).success).toBe(false); // raw form is parser-fatal
    const repaired = normalizeGeneratedHoloScript(raw, 'holo');
    expect(repaired).toContain('width: 5');
    expect(repaired).toContain('height: 3');
    expect(parseHolo(repaired).success).toBe(true);
  });

  it('rewrites a `key = value` property line to `key: value`', async () => {
    const { normalizeGeneratedHoloScript } = await import('../generators');
    const raw = 'composition "X" {\n  object "C" {\n    width = 5\n  }\n}';
    expect(parseHolo(raw).success).toBe(false);
    const repaired = normalizeGeneratedHoloScript(raw, 'holo');
    expect(parseHolo(repaired).success).toBe(true);
  });

  it('quotes an unquoted dotted value (theme.primary -> "theme.primary")', async () => {
    const { normalizeGeneratedHoloScript } = await import('../generators');
    const raw = 'composition "X" {\n  object "C" {\n    color: theme.primary\n  }\n}';
    const repaired = normalizeGeneratedHoloScript(raw, 'holo');
    expect(repaired).toContain('"theme.primary"');
    expect(parseHolo(repaired).success).toBe(true);
  });

  it('is idempotent on already-valid output (no over-repair)', async () => {
    const { normalizeGeneratedHoloScript } = await import('../generators');
    const valid = 'composition "X" {\n  object "C" {\n    position: [0,1,0]\n    color: "#3366ff"\n  }\n}';
    expect(normalizeGeneratedHoloScript(valid, 'holo')).toBe(valid);
  });

  it('does NOT corrupt `=>` arrows, `==` equality, or numeric floats', async () => {
    const { normalizeGeneratedHoloScript } = await import('../generators');
    // arrow inside an action body (parser skips the body, but the emitted code must not be mangled)
    const arrowBody =
      'composition "X" {\n  object "C" {\n    action onTap() {\n      doThing = () => run()\n    }\n  }\n}';
    expect(normalizeGeneratedHoloScript(arrowBody, 'holo')).toContain('=> run()');
    expect(normalizeGeneratedHoloScript('@when(x == 3)', 'holo')).toBe('@when(x == 3)');
    expect(normalizeGeneratedHoloScript('a: 1.5', 'holo')).toBe('a: 1.5');
  });

  it('names an anonymous composition root', async () => {
    const { normalizeGeneratedHoloScript } = await import('../generators');
    const raw = 'composition {\n  object "C" {\n    position: [0,1,0]\n  }\n}';
    const repaired = normalizeGeneratedHoloScript(raw, 'holo');
    expect(repaired).toContain('composition "GeneratedScene"');
    expect(parseHolo(repaired).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Layer 2: the retry loop in tryGenerateWithAI (via generateSceneForMCP)
// Real parser, mocked provider. The provider returns parser-fatal output on the
// first call and parse-clean output on the second — proving the loop re-prompts.
// ---------------------------------------------------------------------------
const generateHoloScriptMock = vi.fn();

vi.mock('@holoscript/llm-provider', () => ({
  createProviderManager: vi.fn(() => ({
    getRegisteredProviders: () => ['bitnet'],
    getProvider: () => ({
      generateHoloScript: (req: { prompt: string }) => generateHoloScriptMock(req),
    }),
  })),
}));

describe('tryGenerateWithAI — validate-retry loop', () => {
  beforeEach(() => {
    generateHoloScriptMock.mockReset();
    delete process.env.HOLOSCRIPT_MCP_AI_PROVIDER;
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('re-prompts the provider after a parse failure and returns the parse-clean retry', async () => {
    const { generateSceneForMCP } = await import('../generators');

    // Attempt 1: structurally a composition (passes the usability gate) but carries a
    // syntax error the deterministic repair deliberately does NOT touch (`==` equality),
    // so it stays parse-failed and must trigger a re-prompt.
    generateHoloScriptMock.mockResolvedValueOnce({
      code: 'composition "Bad" {\n  object "C" {\n    @t(a == 5 = 3)\n    color: "#fff"\n  }\n}',
      provider: 'bitnet',
      detectedTraits: [],
    });
    // Attempt 2: clean output the model returns after seeing the parse error.
    generateHoloScriptMock.mockResolvedValueOnce({
      code: 'composition "Good" {\n  object "C" {\n    position: [0,1,0]\n  }\n}',
      provider: 'bitnet',
      detectedTraits: [],
    });

    const result = await generateSceneForMCP('a 3x2 grid');

    // The provider was called twice → the retry actually fired.
    expect(generateHoloScriptMock).toHaveBeenCalledTimes(2);
    // The second call's prompt carried the parse-error context.
    expect(generateHoloScriptMock.mock.calls[1][0].prompt).toContain('FAILED to parse');
    // The returned code is the parse-clean one and it really parses.
    expect(result.source).toBe('ai');
    expect(result.code).toContain('"Good"');
    expect(parseHolo(result.code).success).toBe(true);
  });

  it('accepts a `=`-laden first response when the deterministic repair makes it parse (no retry needed)', async () => {
    const { generateSceneForMCP } = await import('../generators');

    // `=` in trait args is repaired deterministically -> parses on attempt 1, so the
    // provider should be called exactly once.
    generateHoloScriptMock.mockResolvedValueOnce({
      code: 'composition "Repairable" {\n  object "C" {\n    @box(width = 5)\n  }\n}',
      provider: 'bitnet',
      detectedTraits: ['@box'],
    });

    const result = await generateSceneForMCP('a box');

    expect(generateHoloScriptMock).toHaveBeenCalledTimes(1);
    expect(result.source).toBe('ai');
    expect(parseHolo(result.code).success).toBe(true);
  });

  it('falls back to the heuristic generator when every attempt stays unparseable', async () => {
    const { generateSceneForMCP } = await import('../generators');

    // Persistent non-HoloScript output: the tolerant parser would accept this as an
    // empty implicit composition, but the structural gate (no composition root with
    // renderable content) rejects it on every attempt, exhausting retries.
    generateHoloScriptMock.mockResolvedValue({
      code: 'this is not holoscript at all {{{ <<< )))',
      provider: 'bitnet',
      detectedTraits: [],
    });

    const result = await generateSceneForMCP('a forest');

    // Retries were exhausted (>1 call), then the deterministic heuristic took over.
    expect(generateHoloScriptMock.mock.calls.length).toBeGreaterThan(1);
    expect(result.source).toBe('heuristic');
    expect(result.code).toContain('composition');
    expect(parseHolo(result.code).success).toBe(true);
  });
});
