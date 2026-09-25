import { describe, it, expect } from 'vitest';
import type { ToolResultBlock, ToolUseBlock } from '@holoscript/llm-provider';
import {
  ContextLedger,
  MIN_ELIDE_CHARS,
  contextWindowCharsFor,
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

describe('ContextLedger', () => {
  it('passes the first copy through and points a same-call repeat at it', () => {
    const ledger = new ContextLedger();
    const body = big('line\n');
    const [first] = ledger.admit([use('a', 'read_file', { path: '/x' })], [ok('a', body)]);
    const [second] = ledger.admit([use('b', 'read_file', { path: '/x' })], [ok('b', body)]);
    expect(first.content).toBe(body);
    expect(second.tool_use_id).toBe('b');
    expect(second.content).toBe(
      `[unchanged: identical to the result of read_file a earlier in this conversation (${body.length} chars); not repeated]`
    );
    expect(ledger.stats.elided).toBe(1);
    expect(ledger.stats.charsSaved).toBe(body.length - second.content.length);
  });

  it('points a different call with byte-identical output at the first copy without "unchanged"', () => {
    const ledger = new ContextLedger();
    const body = big('same output ');
    ledger.admit([use('a', 'bash', { cmd: 'git status' })], [ok('a', body)]);
    const [r] = ledger.admit([use('b', 'bash', { cmd: 'git status --short' })], [ok('b', body)]);
    expect(r.content).toMatch(/^\[identical to the result of bash a earlier/);
  });

  it('sends a changed result for the same call in full', () => {
    const ledger = new ContextLedger();
    ledger.admit([use('a', 'read_file', { path: '/x' })], [ok('a', big('v1 '))]);
    const [r] = ledger.admit([use('b', 'read_file', { path: '/x' })], [ok('b', big('v2 '))]);
    expect(r.content).toBe(big('v2 '));
    expect(ledger.stats.elided).toBe(0);
  });

  it('never elides errors or results shorter than the threshold', () => {
    const ledger = new ContextLedger();
    const small = 'x'.repeat(MIN_ELIDE_CHARS - 1);
    const err: ToolResultBlock = { ...ok('e1', big('boom ')), is_error: true };
    ledger.admit([use('s1', 'bash', {}), use('e1', 'bash', {})], [ok('s1', small), err]);
    const out = ledger.admit(
      [use('s2', 'bash', {}), use('e2', 'bash', {})],
      [ok('s2', small), { ...err, tool_use_id: 'e2' }]
    );
    expect(out[0].content).toBe(small);
    expect(out[1].content).toBe(big('boom '));
    expect(ledger.stats.elided).toBe(0);
  });

  it('handles a repeat inside one parallel batch and does not mutate its inputs', () => {
    const ledger = new ContextLedger();
    const body = big('dup ');
    const results = [ok('a', body), ok('b', body)];
    const out = ledger.admit(
      [use('a', 'read_file', { path: '/x' }), use('b', 'read_file', { path: '/x' })],
      results
    );
    expect(out[0].content).toBe(body);
    expect(out[1].content).toMatch(/^\[unchanged: identical to the result of read_file a/);
    expect(results[1].content).toBe(body);
  });

  it('treats argument key order as the same call', () => {
    expect(stableStringify({ b: 1, a: { d: [2, { f: 1, e: 0 }], c: null } })).toBe(
      stableStringify({ a: { c: null, d: [2, { e: 0, f: 1 }] }, b: 1 })
    );
  });

  it('resends in full when the first copy may have fallen out of a small model window', () => {
    // A local server (Ollama / llama.cpp) silently drops the oldest context past num_ctx,
    // so a pointer to a copy that far back could name text the model no longer has.
    const body = big('far ');
    const ledger = new ContextLedger({ windowChars: body.length * 3 });
    ledger.admit([use('a', 'read_file', { path: '/x' })], [ok('a', body)]);
    ledger.admit([use('f', 'bash', {})], [ok('f', big('filler one '))]);
    ledger.admit([use('g', 'bash', {})], [ok('g', big('filler two '))]);
    ledger.admit([use('h', 'bash', {})], [ok('h', big('filler three '))]);
    const [far] = ledger.admit([use('b', 'read_file', { path: '/x' })], [ok('b', body)]);
    expect(far.content).toBe(body);
    // That full copy is the new anchor, so the next repeat points at it.
    const [near] = ledger.admit([use('c', 'read_file', { path: '/x' })], [ok('c', body)]);
    expect(near.content).toMatch(/^\[unchanged: identical to the result of read_file b/);
  });

  it('bounds the window for local models by num_ctx and leaves hosted APIs unbounded', () => {
    const prev = process.env.HOLOSCRIPT_LLM_NUM_CTX;
    const prevAgent = process.env.HOLOSCRIPT_AGENT_OLLAMA_NUM_CTX;
    delete process.env.HOLOSCRIPT_AGENT_OLLAMA_NUM_CTX;
    try {
      process.env.HOLOSCRIPT_LLM_NUM_CTX = '4096';
      expect(contextWindowCharsFor('local-llm')).toBe(8192);
      expect(contextWindowCharsFor('sovereign')).toBe(8192);
      expect(contextWindowCharsFor('anthropic')).toBe(Infinity);
      delete process.env.HOLOSCRIPT_LLM_NUM_CTX;
      expect(contextWindowCharsFor('local-llm')).toBe(16384 * 2);
    } finally {
      if (prev === undefined) delete process.env.HOLOSCRIPT_LLM_NUM_CTX;
      else process.env.HOLOSCRIPT_LLM_NUM_CTX = prev;
      if (prevAgent !== undefined) process.env.HOLOSCRIPT_AGENT_OLLAMA_NUM_CTX = prevAgent;
    }
  });
});
