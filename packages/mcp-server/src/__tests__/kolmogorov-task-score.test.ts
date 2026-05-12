import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  holoTaskKolmogorovScore,
  handleKolmogorovTaskScoreTool,
  kolmogorovTaskScoreTools,
  type KolmogorovScoreResult,
} from '../tools/kolmogorov_task_score';

// We deliberately do NOT import `../handlers` or `../tools` here — they
// transitively pull the whole MCP graph (engine/, mesh/, …) and would force
// every consumer to build the world before unit-testing a pure scoring fn.
// Instead, registration is verified by:
//   (a) `kolmogorovTaskScoreTools` self-shape (definition exists, name matches)
//   (b) text-grep against `../tools.ts` and `../handlers.ts` source
// This is G.GOLD.011 / G.GOLD.015 applied: stay at the narrowest test surface
// that proves the contract, instead of forcing the failure category to be
// "the rest of the graph didn't build".

describe('holo_task_kolmogorov_score', () => {
  // ─── Registration (text-level, no transitive import) ─────────────────────

  it('exports a well-formed tool definition', () => {
    expect(kolmogorovTaskScoreTools).toHaveLength(1);
    const def = kolmogorovTaskScoreTools[0];
    expect(def.name).toBe('holo_task_kolmogorov_score');
    expect(typeof def.description).toBe('string');
    expect(def.description.length).toBeGreaterThan(0);
    expect(def.inputSchema).toMatchObject({
      type: 'object',
      required: ['taskDescription', 'agentContext'],
    });
  });

  it('is wired into the central tool list (../tools.ts)', () => {
    const toolsSrc = readFileSync(resolve(__dirname, '..', 'tools.ts'), 'utf-8');
    expect(toolsSrc).toMatch(/kolmogorovTaskScoreTools/);
    expect(toolsSrc).toMatch(/['"]\.\/tools\/kolmogorov_task_score['"]/);
    expect(toolsSrc).toMatch(/\.\.\.kolmogorovTaskScoreTools/);
  });

  it('is wired into the central handler dispatcher (../handlers.ts)', () => {
    const handlersSrc = readFileSync(resolve(__dirname, '..', 'handlers.ts'), 'utf-8');
    expect(handlersSrc).toMatch(/handleKolmogorovTaskScoreTool/);
    expect(handlersSrc).toMatch(/holo_task_kolmogorov_score/);
  });

  it('handler returns a well-typed result for a happy-path call', async () => {
    const result = (await handleKolmogorovTaskScoreTool('holo_task_kolmogorov_score', {
      taskDescription: 'add a kolmogorov score MCP tool to holoscript',
      agentContext: { recentDoneEntries: ['shipped kolmogorov scoring tool', 'wired MCP server'] },
    })) as KolmogorovScoreResult;
    expect(result).toBeTruthy();
    expect(typeof result.score).toBe('number');
    expect(typeof result.mdlBytes).toBe('number');
    expect(typeof result.baselineBytes).toBe('number');
    expect(typeof result.ratio).toBe('number');
  });

  // ─── FALSE/TRUE pair 1: empty agent context ──────────────────────────────

  describe('G.GOLD.013 pair: empty agent context', () => {
    const task =
      'fix the gaussian budget analyzer regression in packages/core/src/compiler';

    it('FALSE case: empty recentDoneEntries → ratio ≈ 1.0 and score ≈ 0', () => {
      const r = holoTaskKolmogorovScore({
        taskDescription: task,
        agentContext: { recentDoneEntries: [] },
      });
      expect(r.baselineBytes).toBeGreaterThan(0);
      expect(r.mdlBytes).toBe(r.baselineBytes);
      expect(r.ratio).toBe(1);
      expect(r.score).toBe(0);
    });

    it('TRUE case: overlapping done entries → mdl < baseline, ratio < 1, score > 0', () => {
      const r = holoTaskKolmogorovScore({
        taskDescription: task,
        agentContext: {
          recentDoneEntries: [
            'fixed gaussian budget analyzer compile pass',
            'refactored packages/core/src/compiler trait normalization',
            'patched regression in compiler test fixture',
          ],
        },
      });
      expect(r.baselineBytes).toBeGreaterThan(0);
      expect(r.mdlBytes).toBeLessThan(r.baselineBytes);
      expect(r.ratio).toBeLessThan(1);
      expect(r.score).toBeGreaterThan(0);
    });
  });

  // ─── FALSE/TRUE pair 2: empty task description ──────────────────────────

  describe('G.GOLD.013 pair: empty task description', () => {
    it('FALSE case: empty taskDescription → all-zero result (contract: graceful, not throw)', () => {
      const r = holoTaskKolmogorovScore({
        taskDescription: '',
        agentContext: { recentDoneEntries: ['something', 'another'] },
      });
      expect(r).toEqual({ score: 0, mdlBytes: 0, baselineBytes: 0, ratio: 0 });
    });

    it('TRUE case: non-empty taskDescription → non-zero baseline bytes', () => {
      const r = holoTaskKolmogorovScore({
        taskDescription: 'hello world',
        agentContext: { recentDoneEntries: [] },
      });
      expect(r.baselineBytes).toBeGreaterThan(0);
    });
  });

  // ─── Monotonicity ────────────────────────────────────────────────────────

  it('TRUE: monotonicity — more relevant done entries → non-decreasing score', () => {
    const task =
      'audit security architecture compiler-level lexical firewalling for hololand npc trait';
    const oneEntry = holoTaskKolmogorovScore({
      taskDescription: task,
      agentContext: {
        recentDoneEntries: [
          'security audit hololand npc trait compiler lexical firewalling',
        ],
      },
    });
    const tenEntries = holoTaskKolmogorovScore({
      taskDescription: task,
      agentContext: {
        recentDoneEntries: [
          'security audit hololand npc trait compiler lexical firewalling',
          'audited architecture compiler-level firewall',
          'reviewed lexical firewalling for npc traits',
          'compiler-level security audit completed',
          'audit security architecture review',
          'hololand npc trait inventory',
          'lexical firewalling trait composition',
          'compiler audit for npc trait',
          'security architecture review',
          'firewalling audit complete',
        ],
      },
    });
    expect(tenEntries.score).toBeGreaterThanOrEqual(oneEntry.score);
  });

  // ─── Normalization across task length ────────────────────────────────────

  it('TRUE: normalization — same overlap pattern at 100 vs 1000 chars yields comparable scores', () => {
    const shortTask = 'audit hololand npc trait security';
    const longTask = (shortTask + ' ').repeat(30).trim(); // ~1000 chars, same vocabulary
    const dictEntries = [
      'audited hololand npc trait',
      'security review for hololand traits',
      'npc trait audit complete',
    ];

    const short = holoTaskKolmogorovScore({
      taskDescription: shortTask,
      agentContext: { recentDoneEntries: dictEntries },
    });
    const long = holoTaskKolmogorovScore({
      taskDescription: longTask,
      agentContext: { recentDoneEntries: dictEntries },
    });

    // Absolute bytes scale with task length.
    expect(long.baselineBytes).toBeGreaterThan(short.baselineBytes);
    // Both score > 0 and within the same order of magnitude (ratio comparable).
    expect(short.score).toBeGreaterThan(0);
    expect(long.score).toBeGreaterThan(0);
    // Score normalization sanity: long-task score should be within a 3x band of short-task score
    // (gzip window saturation can drift things, but they should never differ by >10x for the
    // same vocabulary).
    const ratioBetweenScores = Math.max(long.score, short.score) / Math.max(0.001, Math.min(long.score, short.score));
    expect(ratioBetweenScores).toBeLessThan(10);
  });

  // ─── FALSE case: unrelated agent context shouldn't help ─────────────────

  it('FALSE/TRUE: related dictionary scores meaningfully higher than unrelated one', () => {
    // For short tasks the gzip-header floor inflates BOTH baseline and mdl,
    // so the right contract is comparative (related vs unrelated on the
    // same task), not absolute. This is the §3 limitation made executable:
    // absolute scores are not meaningful across different tasks, but for the
    // same task the *ordering* across agents is what task-routing consumes.
    const task =
      'fix typescript strict mode error in the webgpu shader emit path of the gaussian budget analyzer compiler trait composition layer';

    const unrelated = holoTaskKolmogorovScore({
      taskDescription: task,
      agentContext: {
        recentDoneEntries: [
          'wrote a poem about the sky being blue and clouds at sunset',
          'organized kitchen utensils alphabetically by handle length',
          'walked the dog for thirty minutes in the park near the lake',
        ],
      },
    });

    const related = holoTaskKolmogorovScore({
      taskDescription: task,
      agentContext: {
        recentDoneEntries: [
          'fixed typescript strict mode error in webgpu shader emit',
          'patched gaussian budget analyzer compiler trait composition',
          'refactored shader emit path strict mode for compiler trait',
        ],
      },
    });

    // The related dictionary must produce a meaningfully better score.
    // Margin > 0.05 is comfortably above gzip-header / common-token noise
    // for a 130-char task.
    expect(related.score).toBeGreaterThan(unrelated.score + 0.05);
  });

  // ─── capabilityTags participate in compression ──────────────────────────

  it('TRUE: capabilityTags also feed the dictionary', () => {
    const task = 'lean4 formalize the simulation contract semantics';
    const withoutTags = holoTaskKolmogorovScore({
      taskDescription: task,
      agentContext: { recentDoneEntries: [] },
    });
    const withTags = holoTaskKolmogorovScore({
      taskDescription: task,
      agentContext: {
        recentDoneEntries: [],
        capabilityTags: ['lean4', 'formalize', 'simulation', 'contract', 'semantics'],
      },
    });
    expect(withTags.score).toBeGreaterThan(withoutTags.score);
  });

  // ─── Handler argument robustness ────────────────────────────────────────

  it('handler tolerates malformed args (FALSE case: missing/wrong-typed fields)', async () => {
    // No taskDescription, no agentContext → graceful empty-task contract.
    const r1 = (await handleKolmogorovTaskScoreTool(
      'holo_task_kolmogorov_score',
      {} as Record<string, unknown>
    )) as KolmogorovScoreResult;
    expect(r1).toEqual({ score: 0, mdlBytes: 0, baselineBytes: 0, ratio: 0 });

    // Wrong-typed taskDescription → treated as empty.
    const r2 = (await handleKolmogorovTaskScoreTool(
      'holo_task_kolmogorov_score',
      { taskDescription: 42, agentContext: { recentDoneEntries: [] } }
    )) as KolmogorovScoreResult;
    expect(r2).toEqual({ score: 0, mdlBytes: 0, baselineBytes: 0, ratio: 0 });

    // recentDoneEntries with non-string members are filtered.
    const r3 = (await handleKolmogorovTaskScoreTool(
      'holo_task_kolmogorov_score',
      {
        taskDescription: 'hello',
        agentContext: { recentDoneEntries: ['real entry', 42, null, 'second entry'] },
      }
    )) as KolmogorovScoreResult;
    expect(r3.baselineBytes).toBeGreaterThan(0);
  });

  // ─── Wrong tool name returns null ───────────────────────────────────────

  it('handler returns null for non-matching tool name', async () => {
    const r = await handleKolmogorovTaskScoreTool('holo_some_other_tool', {
      taskDescription: 'x',
      agentContext: { recentDoneEntries: [] },
    });
    expect(r).toBeNull();
  });
});
