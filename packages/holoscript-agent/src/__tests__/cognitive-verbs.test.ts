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

  it('rag_query falls back to the task title when no query given, and logs mode + retrieved', async () => {
    const d = deps({
      onTaskActions: [{ verb: 'rag_query', config: {} }],
      queryTeamKnowledge: vi.fn(async (): Promise<KnowledgeEntry[]> => []),
    });
    await augmentWithOnTaskCognition(d);
    expect(d.queryTeamKnowledge).toHaveBeenCalledWith('Build the widget', 5);
    expect(d.log).toHaveBeenCalledWith(
      expect.objectContaining({ ev: 'on-task-rag-query', mode: 'team-knowledge', retrieved: 0 })
    );
  });

  it('rag_query uses codebase GraphRAG when queryCodebase is wired and returns results', async () => {
    const queryCodebase = vi.fn(async () => [
      { name: 'WidgetFactory.create', type: 'function', file: 'src/widget.ts', line: 42, score: 0.92, signature: 'create(opts: WidgetOpts): Widget' },
    ]);
    const queryTeamKnowledge = vi.fn(async (): Promise<KnowledgeEntry[]> => []);
    const d = deps({
      onTaskActions: [{ verb: 'rag_query', config: { query: 'widget factory', limit: 3 } }],
      queryCodebase,
      queryTeamKnowledge,
    });
    const out = await augmentWithOnTaskCognition(d);
    // Codebase path wins → symbol names injected, team knowledge NOT called
    expect(queryCodebase).toHaveBeenCalledWith('widget factory', 3);
    expect(queryTeamKnowledge).not.toHaveBeenCalled();
    expect(out).toContain('[Codebase search for "widget factory"]');
    expect(out).toContain('WidgetFactory.create');
    expect(out).toContain('src/widget.ts');
    expect(d.log).toHaveBeenCalledWith(expect.objectContaining({ ev: 'on-task-rag-query', mode: 'codebase-graphrag' }));
  });

  it('rag_query falls back to team knowledge when queryCodebase returns empty (graph not loaded)', async () => {
    const queryCodebase = vi.fn(async () => []); // graph cold → empty
    const queryTeamKnowledge = vi.fn(async (): Promise<KnowledgeEntry[]> => [
      { id: 'k2', content: 'widget docs from team store' },
    ]);
    const d = deps({
      onTaskActions: [{ verb: 'rag_query', config: { query: 'widget', limit: 3 } }],
      queryCodebase,
      queryTeamKnowledge,
    });
    const out = await augmentWithOnTaskCognition(d);
    expect(queryCodebase).toHaveBeenCalledWith('widget', 3);
    expect(queryTeamKnowledge).toHaveBeenCalledWith('widget', 3);
    expect(out).toContain('[Retrieved knowledge for "widget"]');
    expect(out).toContain('widget docs from team store');
    expect(d.log).toHaveBeenCalledWith(expect.objectContaining({ ev: 'on-task-rag-query', mode: 'team-knowledge' }));
  });

  it('rag_query uses team knowledge when queryCodebase dep is absent', async () => {
    const queryTeamKnowledge = vi.fn(async (): Promise<KnowledgeEntry[]> => [
      { id: 'k3', content: 'team-only knowledge' },
    ]);
    // No queryCodebase dep → should call queryTeamKnowledge as before
    const d = deps({
      onTaskActions: [{ verb: 'rag_query', config: { query: 'widget', limit: 3 } }],
      queryTeamKnowledge,
    });
    const out = await augmentWithOnTaskCognition(d);
    expect(queryTeamKnowledge).toHaveBeenCalledWith('widget', 3);
    expect(out).toContain('team-only knowledge');
    expect(d.log).toHaveBeenCalledWith(expect.objectContaining({ ev: 'on-task-rag-query', mode: 'team-knowledge' }));
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
