import { describe, it, expect, vi } from 'vitest';
import { augmentWithOnTaskCognition } from '../cognitive-verbs.js';
import type { OnTaskAction } from '../types.js';
import type { KnowledgeEntry } from '../holomesh-client.js';

const BASE = 'BASE PROMPT';
const TASK = { id: 't1', title: 'Build the widget' };

function deps(over: Partial<Parameters<typeof augmentWithOnTaskCognition>[0]> = {}) {
  return {
    systemPrompt: BASE,
    onTaskActions: [] as OnTaskAction[],
    task: TASK,
    queryTeamKnowledge: vi.fn(async (): Promise<KnowledgeEntry[]> => []),
    queryPrivateKnowledge: vi.fn(async (): Promise<KnowledgeEntry[]> => []),
    plan: vi.fn(async () => 'PLAN TEXT'),
    log: vi.fn(),
    ...over,
  };
}

describe('augmentWithOnTaskCognition', () => {
  it('returns the base prompt unchanged when there are no verbs', async () => {
    const out = await augmentWithOnTaskCognition(deps());
    expect(out).toBe(BASE);
  });

  it('llm_call appends the prompt as a directive', async () => {
    const out = await augmentWithOnTaskCognition(
      deps({ onTaskActions: [{ verb: 'llm_call', config: { prompt: 'focus on edge cases' } }] })
    );
    expect(out).toContain('[Brain on_task directive]');
    expect(out).toContain('focus on edge cases');
  });

  it('rag_query retrieves team knowledge and injects it', async () => {
    const queryTeamKnowledge = vi.fn(async (): Promise<KnowledgeEntry[]> => [
      { id: 'k1', content: 'widgets need a frobnicator' },
    ]);
    const d = deps({
      onTaskActions: [{ verb: 'rag_query', config: { query: 'widget', limit: 3 } }],
      queryTeamKnowledge,
    });
    const out = await augmentWithOnTaskCognition(d);
    expect(queryTeamKnowledge).toHaveBeenCalledWith('widget', 3);
    expect(out).toContain('[Retrieved knowledge for "widget"]');
    expect(out).toContain('frobnicator');
  });

  it('rag_query falls back to the task title when no query given, and logs retrieved count', async () => {
    const d = deps({
      onTaskActions: [{ verb: 'rag_query', config: {} }],
      queryTeamKnowledge: vi.fn(async (): Promise<KnowledgeEntry[]> => []),
    });
    await augmentWithOnTaskCognition(d);
    expect(d.queryTeamKnowledge).toHaveBeenCalledWith('Build the widget', 5);
    expect(d.log).toHaveBeenCalledWith(
      expect.objectContaining({ ev: 'on-task-rag-query', retrieved: 0 })
    );
  });

  it('recall pulls private knowledge and filters by query client-side', async () => {
    const queryPrivateKnowledge = vi.fn(async (): Promise<KnowledgeEntry[]> => [
      { id: 'p1', content: 'last time the widget broke on null input' },
      { id: 'p2', content: 'unrelated note about coffee' },
    ]);
    const out = await augmentWithOnTaskCognition(
      deps({ onTaskActions: [{ verb: 'recall', config: { query: 'widget' } }], queryPrivateKnowledge })
    );
    expect(out).toContain('[Recalled memory for "widget"]');
    expect(out).toContain('null input');
    expect(out).not.toContain('coffee');
  });

  it('recall ranks the private workspace SEMANTICALLY when an embed route resolves (W.753)', async () => {
    const queryPrivateKnowledge = vi.fn(async (): Promise<KnowledgeEntry[]> => [
      { id: 'p1', content: 'last time the widget broke on null input' },
      { id: 'p2', content: 'unrelated note about coffee' },
    ]);
    // Fake embed: 'gadget' and 'widget' share an axis → a semantic hit the substring
    // filter would MISS (the query word never appears literally in any entry).
    const embed = vi.fn(async (t: string) => [/widget|gadget/i.test(t) ? 1 : 0, /coffee/i.test(t) ? 1 : 0]);
    const similarity = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1];
    const d = deps({
      // limit 1 → only the TOP-ranked entry returns, proving semantic RANKING (not just retrieval).
      onTaskActions: [{ verb: 'recall', config: { query: 'gadget', limit: 1 } }],
      queryPrivateKnowledge,
      embed,
      similarity,
    });
    const out = await augmentWithOnTaskCognition(d);
    expect(out).toContain('null input'); // semantic ranked the widget entry #1 for "gadget" (substring would find nothing)
    expect(out).not.toContain('coffee'); // the lower-scored entry is ranked out by limit 1
    expect(d.log).toHaveBeenCalledWith(expect.objectContaining({ ev: 'on-task-recall', mode: 'semantic' }));
  });

  it('recall falls back to the substring filter when the embed route is unavailable (returns null)', async () => {
    const queryPrivateKnowledge = vi.fn(async (): Promise<KnowledgeEntry[]> => [
      { id: 'p1', content: 'the widget broke' },
      { id: 'p2', content: 'coffee note' },
    ]);
    const embed = vi.fn(async () => null); // fleet/registry unreachable → null
    const similarity = vi.fn(() => 0);
    const d = deps({
      onTaskActions: [{ verb: 'recall', config: { query: 'widget' } }],
      queryPrivateKnowledge,
      embed,
      similarity,
    });
    const out = await augmentWithOnTaskCognition(d);
    expect(out).toContain('the widget broke'); // substring fallback still recalls
    expect(out).not.toContain('coffee');
    expect(d.log).toHaveBeenCalledWith(expect.objectContaining({ ev: 'on-task-recall', mode: 'substring' }));
  });

  it('plan calls the planner and injects the result', async () => {
    const plan = vi.fn(async () => '1. read spec\n2. write code');
    const out = await augmentWithOnTaskCognition(
      deps({ onTaskActions: [{ verb: 'plan', config: { goal: 'ship it' } }], plan })
    );
    expect(plan).toHaveBeenCalledOnce();
    expect(out).toContain('[Plan]');
    expect(out).toContain('read spec');
  });

  it('skips plan when no planner is provided', async () => {
    const out = await augmentWithOnTaskCognition(
      deps({ onTaskActions: [{ verb: 'plan', config: {} }], plan: undefined })
    );
    expect(out).toBe(BASE);
  });

  it('executes verbs in authored order (rag before llm_call)', async () => {
    const out = await augmentWithOnTaskCognition(
      deps({
        onTaskActions: [
          { verb: 'rag_query', config: { query: 'a' } },
          { verb: 'llm_call', config: { prompt: 'ZZZ' } },
        ],
        queryTeamKnowledge: vi.fn(async (): Promise<KnowledgeEntry[]> => [{ id: 'k', content: 'AAA-knowledge' }]),
      })
    );
    expect(out.indexOf('AAA-knowledge')).toBeLessThan(out.indexOf('ZZZ'));
  });

  it('a failing verb is logged and does not break the chain', async () => {
    const d = deps({
      onTaskActions: [
        { verb: 'rag_query', config: { query: 'x' } },
        { verb: 'llm_call', config: { prompt: 'still appended' } },
      ],
      queryTeamKnowledge: vi.fn(async () => {
        throw new Error('mesh down');
      }),
    });
    const out = await augmentWithOnTaskCognition(d);
    expect(d.log).toHaveBeenCalledWith(
      expect.objectContaining({ ev: 'on-task-verb-error', verb: 'rag_query' })
    );
    expect(out).toContain('still appended');
  });
});
