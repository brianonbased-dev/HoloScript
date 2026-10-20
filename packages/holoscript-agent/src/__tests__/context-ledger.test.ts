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
      `[unchanged: identical to the result of this same read_file call 1 tool call back (tool_use_id a; ${body.length} chars); not repeated]`
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
      /^\[identical to the result of the bash call with arguments \{"cmd":"git status"\}, 1 tool call back \(tool_use_id a;/
    );
  });

  it('counts back from the current call, so the pointer holds when ids repeat and the oldest messages are gone', () => {
    // The review's case: local-llm (Ollama returns no id), brittney-cloud and gemini number
    // calls per turn, so every id is call_0; and a local server may have dropped the v1
    // read. Counting from the start of the task ("the 2nd read") would then name the wrong
    // call. Every result after the first copy is still there, so "N calls back" does not.
    const c = conversation(new ContextLedger());
    const read = () => use('call_0', 'read_file', { path: 'a.ts' });
    c.call([read()], [ok('call_0', big('v1 '))]);
    c.call([use('call_0', 'write_file', { path: 'a.ts' })], [ok('call_0', 'ok')]);
    c.call([read()], [ok('call_0', big('v2 '))]);
    const [again] = c.call([read()], [ok('call_0', big('v2 '))]);
    expect(again.content).toMatch(
      /^\[unchanged: identical to the result of this same read_file call 1 tool call back/
    );

    // Further back, and through a different call with the same content.
    c.call([use('call_0', 'bash', { cmd: 'ls' })], [ok('call_0', 'a.ts')]);
    const [other] = c.call(
      [use('call_0', 'bash', { cmd: 'cat a.ts' })],
      [ok('call_0', big('v2 '))]
    );
    expect(other.content).toMatch(
      /^\[identical to the result of the read_file call with arguments \{"path":"a.ts"\}, 3 tool calls back/
    );
  });

  it('shortens long arguments in a pointer', () => {
    const c = conversation(new ContextLedger());
    const body = big('out ');
    c.call([use('a', 'bash', { cmd: 'x'.repeat(500) })], [ok('a', body)]);
    const [r] = c.call([use('b', 'bash', { cmd: 'y' })], [ok('b', body)]);
    expect(r.content.length).toBeLessThan(300);
    expect(r.content).toContain('…');
  });

  it('tells a local model to call the tool again if it can no longer see the earlier result', () => {
    // The first copy can still leave a local window after the pointer is written, because
    // the history keeps growing. Hosted providers keep the whole history, so no hint there.
    const body = big('seen ');
    const local = conversation(new ContextLedger({ windowChars: 100_000 }));
    local.call([use('a', 'read_file', { path: '/x' })], [ok('a', body)]);
    const [l] = local.call([use('b', 'read_file', { path: '/x' })], [ok('b', body)]);
    expect(l.content).toMatch(
      /not repeated; if you can no longer see that result, call read_file again\]$/
    );

    const hosted = conversation(new ContextLedger());
    hosted.call([use('a', 'read_file', { path: '/x' })], [ok('a', body)]);
    const [h] = hosted.call([use('b', 'read_file', { path: '/x' })], [ok('b', body)]);
    expect(h.content).toMatch(/not repeated\]$/);
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
    expect(out[1].content).toMatch(
      /^\[unchanged: identical to the result of this same read_file call 1 tool call back/
    );
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

  it('checks the window against the whole batch, since a server drops whole messages', () => {
    // A repeat and a large sibling come back in one message. Counting only up to the
    // repeat would miss the sibling that follows it in the same message.
    const body = big('anchor ');
    const window = body.length * 3;
    const c = conversation(new ContextLedger({ windowChars: window }));
    c.call([use('a', 'read_file', { path: '/x' })], [ok('a', body)]);
    const [repeat, sibling] = c.call(
      [use('b', 'read_file', { path: '/x' }), use('s', 'bash', { cmd: 'dump' })],
      [ok('b', body), ok('s', 'z'.repeat(window))]
    );
    expect(repeat.content).toBe(body);
    expect(sibling.content).toBe('z'.repeat(window));
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
