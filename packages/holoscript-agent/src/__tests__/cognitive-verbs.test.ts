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
    // rag_query now reads grep (local JSONL) + Absorb GraphRAG (W.754) — default no-op.
    queryGrep: vi.fn(async (): Promise<KnowledgeEntry[]> => []),
    queryAbsorb: vi.fn(async (): Promise<KnowledgeEntry[]> => []),
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

  // ── rag_query (grep stage 1 + Absorb GraphRAG stage 2, W.754) ──────────────

  it('rag_query injects grep results and records the grep source', async () => {
    const queryGrep = vi.fn(
      async (): Promise<KnowledgeEntry[]> => [{ id: 'k1', content: 'widgets need a frobnicator' }]
    );
    const d = deps({
      onTaskActions: [{ verb: 'rag_query', config: { query: 'widget', limit: 3 } }],
      queryGrep,
    });
    const out = await augmentWithOnTaskCognition(d);
    expect(queryGrep).toHaveBeenCalledWith('widget', 3);
    expect(out).toContain('[Grep results for "widget"]');
    expect(out).toContain('frobnicator');
    expect(d.log).toHaveBeenCalledWith(
      expect.objectContaining({ ev: 'on-task-rag-query', sources: ['grep'] })
    );
  });

  it('rag_query injects Absorb GraphRAG results alongside grep', async () => {
    const queryGrep = vi.fn(
      async (): Promise<KnowledgeEntry[]> => [{ id: 'g', content: 'grep hit' }]
    );
    const queryAbsorb = vi.fn(
      async (): Promise<KnowledgeEntry[]> => [{ id: 'a', content: 'absorb semantic hit' }]
    );
    const d = deps({
      onTaskActions: [{ verb: 'rag_query', config: { query: 'widget', limit: 4 } }],
      queryGrep,
      queryAbsorb,
    });
    const out = await augmentWithOnTaskCognition(d);
    expect(queryAbsorb).toHaveBeenCalledWith('widget', 4);
    expect(out).toContain('[Grep results for "widget"]');
    expect(out).toContain('[Absorb knowledge for "widget"]');
    expect(out).toContain('absorb semantic hit');
    expect(d.log).toHaveBeenCalledWith(
      expect.objectContaining({ ev: 'on-task-rag-query', sources: ['grep', 'absorb-graphrag'] })
    );
  });

  it('rag_query falls back to the task title when no query given, and logs sources + retrieved', async () => {
    const d = deps({ onTaskActions: [{ verb: 'rag_query', config: {} }] });
    await augmentWithOnTaskCognition(d);
    expect(d.queryGrep).toHaveBeenCalledWith('Build the widget', 5);
    expect(d.log).toHaveBeenCalledWith(
      expect.objectContaining({ ev: 'on-task-rag-query', sources: [], retrieved: 0 })
    );
  });

  // ── recall (private workspace) ─────────────────────────────────────────────

  it('recall pulls private knowledge and filters by query client-side', async () => {
    const queryPrivateKnowledge = vi.fn(
      async (): Promise<KnowledgeEntry[]> => [
        { id: 'p1', content: 'last time the widget broke on null input' },
        { id: 'p2', content: 'unrelated note about coffee' },
      ]
    );
    const out = await augmentWithOnTaskCognition(
      deps({
        onTaskActions: [{ verb: 'recall', config: { query: 'widget' } }],
        queryPrivateKnowledge,
      })
    );
    expect(out).toContain('[Recalled memory for "widget"]');
    expect(out).toContain('null input');
    expect(out).not.toContain('coffee');
  });

  it('recall ranks the private workspace SEMANTICALLY when an embed route resolves (W.753)', async () => {
    const queryPrivateKnowledge = vi.fn(
      async (): Promise<KnowledgeEntry[]> => [
        { id: 'p1', content: 'last time the widget broke on null input' },
        { id: 'p2', content: 'unrelated note about coffee' },
      ]
    );
    const embed = vi.fn(async (t: string) => [
      /widget|gadget/i.test(t) ? 1 : 0,
      /coffee/i.test(t) ? 1 : 0,
    ]);
    const similarity = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1];
    const d = deps({
      onTaskActions: [{ verb: 'recall', config: { query: 'gadget', limit: 1 } }],
      queryPrivateKnowledge,
      embed,
      similarity,
    });
    const out = await augmentWithOnTaskCognition(d);
    expect(out).toContain('null input');
    expect(out).not.toContain('coffee');
    expect(d.log).toHaveBeenCalledWith(
      expect.objectContaining({ ev: 'on-task-recall', mode: 'semantic' })
    );
  });

  it('recall falls back to the substring filter when the embed route is unavailable (returns null)', async () => {
    const queryPrivateKnowledge = vi.fn(
      async (): Promise<KnowledgeEntry[]> => [
        { id: 'p1', content: 'the widget broke' },
        { id: 'p2', content: 'coffee note' },
      ]
    );
    const embed = vi.fn(async () => null);
    const similarity = vi.fn(() => 0);
    const d = deps({
      onTaskActions: [{ verb: 'recall', config: { query: 'widget' } }],
      queryPrivateKnowledge,
      embed,
      similarity,
    });
    const out = await augmentWithOnTaskCognition(d);
    expect(out).toContain('the widget broke');
    expect(out).not.toContain('coffee');
    expect(d.log).toHaveBeenCalledWith(
      expect.objectContaining({ ev: 'on-task-recall', mode: 'substring' })
    );
  });

  // ── plan ───────────────────────────────────────────────────────────────────

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

  // ── ask_peer (agent-to-agent questioning + CITE-by-ID grounding gate) ────────

  it('ask_peer injects a grounded peer answer with a verified-citation footer', async () => {
    const askPeer = vi.fn(async () => ({
      answer: 'Use the approach from W.810.',
      peer: 'jetson-orin',
    }));
    const groundingCorpus = vi.fn(async () => [{ id: 'W.810', content: 'ollama ctx OOM' }]);
    const d = deps({
      onTaskActions: [
        { verb: 'ask_peer', config: { question: 'how do I fix the GPU?', capability: 'hardware' } },
      ],
      askPeer,
      groundingCorpus,
    });
    const out = await augmentWithOnTaskCognition(d);
    expect(askPeer).toHaveBeenCalledWith('how do I fix the GPU?', {
      capability: 'hardware',
      peer: undefined,
    });
    expect(out).toContain('[Peer answer from jetson-orin re "how do I fix the GPU?"]');
    expect(out).toContain('[citation grounding: 1/1 citations verified]');
    expect(d.log).toHaveBeenCalledWith(
      expect.objectContaining({
        ev: 'on-task-ask-peer',
        answered: true,
        citationsGrounded: 1,
        citationsConfabulated: 0,
      })
    );
  });

  it('ask_peer injects a mixed answer but flags confabulated citations', async () => {
    const askPeer = vi.fn(async () => ({
      answer: 'See W.810 (real) and W.999 (invented).',
      peer: 'peer-x',
    }));
    const groundingCorpus = vi.fn(async () => [{ id: 'W.810', content: 'real entry' }]);
    const out = await augmentWithOnTaskCognition(
      deps({
        onTaskActions: [{ verb: 'ask_peer', config: { question: 'q' } }],
        askPeer,
        groundingCorpus,
      })
    );
    expect(out).toContain('[Peer answer from peer-x');
    expect(out).toContain('1/2 citations verified');
    expect(out).toContain('UNVERIFIED');
    expect(out).toContain('W.999');
  });

  it('ask_peer REJECTS an all-confabulated answer when grounding is required (default)', async () => {
    const askPeer = vi.fn(async () => ({ answer: 'Per W.999 and W.888, do X.', peer: 'liar' }));
    const groundingCorpus = vi.fn(async () => [{ id: 'W.810', content: 'the only real entry' }]);
    const d = deps({
      onTaskActions: [{ verb: 'ask_peer', config: { question: 'q' } }],
      askPeer,
      groundingCorpus,
    });
    const out = await augmentWithOnTaskCognition(d);
    expect(out).toBe(BASE); // rejected → nothing injected
    expect(d.log).toHaveBeenCalledWith(
      expect.objectContaining({ ev: 'on-task-ask-peer', rejected: true, citationsConfabulated: 2 })
    );
  });

  it('ask_peer keeps an all-confabulated answer when require_grounding:false', async () => {
    const askPeer = vi.fn(async () => ({ answer: 'Per W.999, do X.', peer: 'p' }));
    const groundingCorpus = vi.fn(async () => [{ id: 'W.810', content: 'real' }]);
    const out = await augmentWithOnTaskCognition(
      deps({
        onTaskActions: [{ verb: 'ask_peer', config: { question: 'q', require_grounding: false } }],
        askPeer,
        groundingCorpus,
      })
    );
    expect(out).toContain('[Peer answer from p');
    expect(out).toContain('0/1 citations verified');
  });

  it('ask_peer with a citation-free answer injects it as-is (no footer, not rejected)', async () => {
    const askPeer = vi.fn(async () => ({ answer: 'Just write the file directly.', peer: 'p' }));
    const out = await augmentWithOnTaskCognition(
      deps({ onTaskActions: [{ verb: 'ask_peer', config: { question: 'q' } }], askPeer })
    );
    expect(out).toContain('Just write the file directly.');
    expect(out).not.toContain('citation grounding');
  });

  it('skips ask_peer when no askPeer dep is provided', async () => {
    const out = await augmentWithOnTaskCognition(
      deps({ onTaskActions: [{ verb: 'ask_peer', config: { question: 'q' } }] })
    );
    expect(out).toBe(BASE);
  });

  // ── council (multi-peer convergence) ─────────────────────────────────────────

  it('council consults N seats (diverse lenses) and injects a grounded convergence synthesis', async () => {
    const askPeer = vi.fn(async () => ({ answer: 'The fix is W.810.', peer: 'node' }));
    const groundingCorpus = vi.fn(async () => [{ id: 'W.810', content: 'real entry' }]);
    const out = await augmentWithOnTaskCognition(
      deps({
        onTaskActions: [{ verb: 'council', config: { question: 'how?', seats: 2 } }],
        askPeer,
        groundingCorpus,
      })
    );
    expect(askPeer).toHaveBeenCalledTimes(2);
    // distinct lenses → distinct seats → W.810 corroborated by ≥2 peers
    expect(out).toContain('[Council of 2 peer(s) re "how?"]');
    expect(out).toContain('Corroborated (≥2 peers, verified): W.810');
    expect(askPeer.mock.calls[0][1]).toEqual(expect.objectContaining({ lens: 'correctness' }));
    expect(askPeer.mock.calls[1][1]).toEqual(expect.objectContaining({ lens: 'skeptic' }));
  });

  it('council REJECTS an all-confabulated council when grounding is required (default)', async () => {
    const askPeer = vi.fn(async () => ({ answer: 'Per W.999, do it.', peer: 'liar' }));
    const groundingCorpus = vi.fn(async () => [{ id: 'W.810', content: 'the only real entry' }]);
    const d = deps({
      onTaskActions: [{ verb: 'council', config: { question: 'q', seats: 2 } }],
      askPeer,
      groundingCorpus,
    });
    const out = await augmentWithOnTaskCognition(d);
    expect(out).toBe(BASE); // every seat confabulated → rejected, nothing injected
    expect(d.log).toHaveBeenCalledWith(
      expect.objectContaining({ ev: 'on-task-council', rejected: true })
    );
  });

  it('skips council when no askPeer dep is provided', async () => {
    const out = await augmentWithOnTaskCognition(
      deps({ onTaskActions: [{ verb: 'council', config: { question: 'q' } }] })
    );
    expect(out).toBe(BASE);
  });

  // ── ordering + resilience ────────────────────────────────────────────────────

  it('executes verbs in authored order (rag before llm_call)', async () => {
    const out = await augmentWithOnTaskCognition(
      deps({
        onTaskActions: [
          { verb: 'rag_query', config: { query: 'a' } },
          { verb: 'llm_call', config: { prompt: 'ZZZ' } },
        ],
        queryGrep: vi.fn(
          async (): Promise<KnowledgeEntry[]> => [{ id: 'k', content: 'AAA-knowledge' }]
        ),
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
      queryGrep: vi.fn(async () => {
        throw new Error('grep blew up');
      }),
    });
    const out = await augmentWithOnTaskCognition(d);
    expect(d.log).toHaveBeenCalledWith(
      expect.objectContaining({ ev: 'on-task-verb-error', verb: 'rag_query' })
    );
    expect(out).toContain('still appended');
  });
});
