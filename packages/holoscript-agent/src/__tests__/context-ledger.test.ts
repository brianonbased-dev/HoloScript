import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  resolveLocalNumCtx,
  type LLMMessage,
  type ToolResultBlock,
  type ToolUseBlock,
} from '@holoscript/llm-provider';
import {
  ContextLedger,
  MIN_ELIDE_CHARS,
  contextWindowCharsFor,
  messageChars,
  stableStringify,
} from '../context-ledger.js';

const big = (seed: string) => seed.repeat(Math.ceil((MIN_ELIDE_CHARS * 2) / seed.length));
const use = (id: string, name: string, input: Record<string, unknown>): ToolUseBlock => ({
  type: 'tool_use',
  id,
  name,
  input,
});
const ok = (id: string, content: string): ToolResultBlock => ({
  type: 'tool_result',
  tool_use_id: id,
  content,
});

/**
 * Drives a ledger the way the runner does: each call appends the assistant turn that
 * asked for the tools, then the admitted results as one user message.
 */
function conversation(ledger: ContextLedger) {
  const history: LLMMessage[] = [{ role: 'system', content: 'sys' }];
  return {
    history,
    call(uses: ToolUseBlock[], results: ToolResultBlock[]): ToolResultBlock[] {
      history.push({ role: 'assistant', content: uses as never });
      const out = ledger.admit(history, uses, results);
      history.push({ role: 'user', content: out as never });
      return out;
    },
  };
}

describe('ContextLedger', () => {
  it('passes the first copy through and points a same-call repeat at it', () => {
    const ledger = new ContextLedger();
    const c = conversation(ledger);
    const body = big('line\n');
    const [first] = c.call([use('a', 'read_file', { path: '/x' })], [ok('a', body)]);
    const [second] = c.call([use('b', 'read_file', { path: '/x' })], [ok('b', body)]);
    expect(first.content).toBe(body);
    expect(second.tool_use_id).toBe('b');
    expect(second.content).toBe(
      `[unchanged: identical to what the 1st read_file call with these same arguments returned (tool_use_id a; ${body.length} chars); not repeated]`
    );
    expect(ledger.stats.elided).toBe(1);
    expect(ledger.stats.charsSaved).toBe(body.length - second.content.length);
  });

  it('names a different call with byte-identical output by its arguments, without "unchanged"', () => {
    const c = conversation(new ContextLedger());
    const body = big('same output ');
    c.call([use('a', 'bash', { cmd: 'git status' })], [ok('a', body)]);
    const [r] = c.call([use('b', 'bash', { cmd: 'git status --short' })], [ok('b', body)]);
    expect(r.content).toMatch(
      /^\[identical to what the 1st bash call with arguments \{"cmd":"git status"\} returned \(tool_use_id a;/
    );
  });

  it('names the earlier call unambiguously when an adapter reuses ids such as call_0', () => {
    // local-llm (Ollama returns no id), brittney-cloud and gemini number calls per turn,
    // so single-call turns all produce call_0.
    const c = conversation(new ContextLedger());
    const a = big('file a ');
    c.call([use('call_0', 'read_file', { path: 'a.json' })], [ok('call_0', a)]);
    c.call([use('call_0', 'read_file', { path: 'b.json' })], [ok('call_0', big('file b '))]);
    const [again] = c.call([use('call_0', 'read_file', { path: 'a.json' })], [ok('call_0', a)]);
    expect(again.content).toMatch(
      /^\[unchanged: identical to what the 1st read_file call with these same arguments returned/
    );
    // A later copy of the same content still names the call that produced the first one.
    c.call([use('call_0', 'read_file', { path: 'a.json' })], [ok('call_0', big('edited a '))]);
    const [other] = c.call([use('call_0', 'bash', { cmd: 'cat a.json' })], [ok('call_0', a)]);
    expect(other.content).toMatch(
      /^\[identical to what the 1st read_file call with arguments \{"path":"a.json"\} returned/
    );
  });

  it('counts calls with the same arguments, so a pointer can name the 2nd of them', () => {
    const c = conversation(new ContextLedger());
    c.call([use('a', 'read_file', { path: '/x' })], [ok('a', big('v1 '))]);
    c.call([use('b', 'read_file', { path: '/x' })], [ok('b', big('v2 '))]);
    const [r] = c.call([use('c', 'read_file', { path: '/x' })], [ok('c', big('v2 '))]);
    expect(r.content).toMatch(/^\[unchanged: identical to what the 2nd read_file call with these/);
    expect(r.content).toContain('tool_use_id b;');
  });

  it('shortens long arguments in a pointer', () => {
    const c = conversation(new ContextLedger());
    const body = big('out ');
    c.call([use('a', 'bash', { cmd: 'x'.repeat(500) })], [ok('a', body)]);
    const [r] = c.call([use('b', 'bash', { cmd: 'y' })], [ok('b', body)]);
    expect(r.content.length).toBeLessThan(300);
    expect(r.content).toContain('…');
  });

  it('sends a changed result for the same call in full', () => {
    const ledger = new ContextLedger();
    const c = conversation(ledger);
    c.call([use('a', 'read_file', { path: '/x' })], [ok('a', big('v1 '))]);
    const [r] = c.call([use('b', 'read_file', { path: '/x' })], [ok('b', big('v2 '))]);
    expect(r.content).toBe(big('v2 '));
    expect(ledger.stats.elided).toBe(0);
  });

  it('never elides errors or results shorter than the threshold', () => {
    const ledger = new ContextLedger();
    const c = conversation(ledger);
    const small = 'x'.repeat(MIN_ELIDE_CHARS - 1);
    const err: ToolResultBlock = { ...ok('e1', big('boom ')), is_error: true };
    c.call([use('s1', 'bash', {}), use('e1', 'bash', {})], [ok('s1', small), err]);
    const out = c.call(
      [use('s2', 'bash', {}), use('e2', 'bash', {})],
      [ok('s2', small), { ...err, tool_use_id: 'e2' }]
    );
    expect(out[0].content).toBe(small);
    expect(out[1].content).toBe(big('boom '));
    expect(ledger.stats.elided).toBe(0);
  });

  it('handles a repeat inside one parallel batch and does not mutate its inputs', () => {
    const c = conversation(new ContextLedger());
    const body = big('dup ');
    const results = [ok('a', body), ok('b', body)];
    const out = c.call(
      [use('a', 'read_file', { path: '/x' }), use('b', 'read_file', { path: '/x' })],
      results
    );
    expect(out[0].content).toBe(body);
    expect(out[1].content).toMatch(/^\[unchanged: identical to what the 1st read_file call/);
    expect(results[1].content).toBe(body);
  });

  it('treats argument key order as the same call', () => {
    expect(stableStringify({ b: 1, a: { d: [2, { f: 1, e: 0 }], c: null } })).toBe(
      stableStringify({ a: { c: null, d: [2, { e: 0, f: 1 }] }, b: 1 })
    );
  });

  it('resends in full when tool output alone has pushed the first copy out of the window', () => {
    const body = big('far ');
    const c = conversation(new ContextLedger({ windowChars: body.length * 3 }));
    c.call([use('a', 'read_file', { path: '/x' })], [ok('a', body)]);
    c.call([use('f', 'bash', {})], [ok('f', big('filler one '))]);
    c.call([use('g', 'bash', {})], [ok('g', big('filler two '))]);
    c.call([use('h', 'bash', {})], [ok('h', big('filler three '))]);
    const [far] = c.call([use('b', 'read_file', { path: '/x' })], [ok('b', body)]);
    expect(far.content).toBe(body);
    // That full copy is the new anchor, so the next repeat points at it.
    const [near] = c.call([use('c', 'read_file', { path: '/x' })], [ok('c', body)]);
    expect(near.content).toMatch(/^\[unchanged: .*tool_use_id b;/);
  });

  it("counts the assistant's own turns toward the window, not only tool output", () => {
    // The review's probe: read a spec, write three large files, read the spec again.
    // The writes are assistant turns (their bodies are sent verbatim) and their tool
    // results are tiny, so a window over tool output alone would point at a copy a
    // local server has already dropped.
    const spec = 's'.repeat(9_000);
    const window = 32_768;
    const ledger = new ContextLedger({ windowChars: window });
    const c = conversation(ledger);
    c.call([use('r1', 'read_file', { path: 'spec.md' })], [ok('r1', spec)]);
    for (const id of ['w1', 'w2', 'w3']) {
      c.call(
        [use(id, 'write_file', { path: `${id}.ts`, content: 'w'.repeat(24_000) })],
        [ok(id, 'ok')]
      );
    }
    const [again] = c.call([use('r2', 'read_file', { path: 'spec.md' })], [ok('r2', spec)]);
    expect(again.content).toBe(spec);
    expect(ledger.stats.elided).toBe(0);

    // The same sequence with small writes stays inside the window and is elided.
    const small = conversation(new ContextLedger({ windowChars: window }));
    small.call([use('r1', 'read_file', { path: 'spec.md' })], [ok('r1', spec)]);
    small.call(
      [use('w1', 'write_file', { path: 'w1.ts', content: 'w'.repeat(100) })],
      [ok('w1', 'ok')]
    );
    const [near] = small.call([use('r2', 'read_file', { path: 'spec.md' })], [ok('r2', spec)]);
    expect(near.content).toMatch(/^\[unchanged: /);
  });

  it('measures a message as sent: text length, or its blocks serialized', () => {
    expect(messageChars({ role: 'user', content: 'hello' })).toBe(5);
    const blocks = [{ type: 'tool_result', tool_use_id: 'a', content: 'x' }];
    expect(messageChars({ role: 'user', content: blocks as never })).toBe(
      JSON.stringify(blocks).length
    );
  });
});

describe('contextWindowCharsFor', () => {
  afterEach(() => vi.unstubAllEnvs());
  const request = { maxTokens: 1024, fixedChars: 3_000 };

  it('leaves hosted APIs unbounded', () => {
    expect(contextWindowCharsFor('anthropic', request)).toBe(Infinity);
    expect(contextWindowCharsFor('openrouter', request)).toBe(Infinity);
  });

  it('sizes a local window as num_ctx minus the output reserve, minus the fixed prompt', () => {
    vi.stubEnv('HOLOSCRIPT_AGENT_OLLAMA_NUM_CTX', '');
    vi.stubEnv('HOLOSCRIPT_LLM_NUM_CTX', '4096');
    expect(contextWindowCharsFor('local-llm', request)).toBe((4096 - 1024) * 2 - 3_000);
    expect(contextWindowCharsFor('sovereign', request)).toBe((4096 - 1024) * 2 - 3_000);
  });

  it('never elides when the reserve and fixed prompt already fill the window', () => {
    vi.stubEnv('HOLOSCRIPT_LLM_NUM_CTX', '4096');
    expect(contextWindowCharsFor('local-llm', { maxTokens: 8192, fixedChars: 0 })).toBe(0);
    expect(contextWindowCharsFor('local-llm', { maxTokens: 0, fixedChars: 10_000 })).toBe(0);
  });

  it('reads num_ctx with the same parser the local adapter sends to the server', () => {
    vi.stubEnv('HOLOSCRIPT_LLM_NUM_CTX', '8192 # jetson');
    expect(resolveLocalNumCtx()).toBe(8192);
    expect(contextWindowCharsFor('local-llm', request)).toBe((8192 - 1024) * 2 - 3_000);
    vi.stubEnv('HOLOSCRIPT_LLM_NUM_CTX', '');
    vi.stubEnv('HOLOSCRIPT_AGENT_OLLAMA_NUM_CTX', '');
    expect(resolveLocalNumCtx()).toBe(16384);
  });
});
