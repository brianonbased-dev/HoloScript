import { describe, it, expect } from 'vitest';
import { extractTextToolCalls } from '../tool-call-fallback.js';

describe('extractTextToolCalls', () => {
  it('returns [] for plain prose answers (no false positives)', () => {
    expect(extractTextToolCalls('The capital of France is Paris.')).toEqual([]);
    expect(extractTextToolCalls('')).toEqual([]);
    expect(extractTextToolCalls('   ')).toEqual([]);
  });

  it('does not misread a JSON blob without arguments/parameters as a call', () => {
    // Has a `name` but no arguments/parameters — must NOT be treated as a tool call.
    expect(extractTextToolCalls('{"name": "gemma-4-e4b", "size": "4B"}')).toEqual([]);
  });

  it('recovers a Hermes/Qwen <tool_call> block', () => {
    const content =
      'Let me check that.\n<tool_call>{"name": "query_codebase", "arguments": {"q": "findTool"}}</tool_call>';
    const calls = extractTextToolCalls(content);
    expect(calls).toHaveLength(1);
    expect(calls[0].function.name).toBe('query_codebase');
    expect(calls[0].function.arguments).toEqual({ q: 'findTool' });
  });

  it('recovers a fenced ```json code block', () => {
    const content = 'Sure:\n```json\n{"name": "list_traits", "arguments": {}}\n```';
    const calls = extractTextToolCalls(content);
    expect(calls).toHaveLength(1);
    expect(calls[0].function.name).toBe('list_traits');
  });

  it('recovers a bare JSON object that is the whole message', () => {
    const calls = extractTextToolCalls('{"name": "get_world", "arguments": {"id": "w1"}}');
    expect(calls).toHaveLength(1);
    expect(calls[0].function.name).toBe('get_world');
    expect(calls[0].function.arguments).toEqual({ id: 'w1' });
  });

  it('accepts `parameters` as an alias for `arguments`', () => {
    const calls = extractTextToolCalls('{"name": "explain_trait", "parameters": {"trait": "physics"}}');
    expect(calls).toHaveLength(1);
    expect(calls[0].function.arguments).toEqual({ trait: 'physics' });
  });

  it('unwraps {tool_call: {...}} and {function: {...}} envelopes', () => {
    const a = extractTextToolCalls('{"tool_call": {"name": "a", "arguments": {}}}');
    expect(a[0]?.function.name).toBe('a');
    const b = extractTextToolCalls('{"function": {"name": "b", "arguments": {}}}');
    expect(b[0]?.function.name).toBe('b');
  });

  it('recovers multiple calls from an array', () => {
    const content =
      '```json\n[{"name": "a", "arguments": {}}, {"name": "b", "parameters": {"x": 1}}]\n```';
    const calls = extractTextToolCalls(content);
    expect(calls.map((c) => c.function.name)).toEqual(['a', 'b']);
  });

  it('preserves a provided id and synthesizes one otherwise', () => {
    const withId = extractTextToolCalls('{"id": "abc", "name": "a", "arguments": {}}');
    expect(withId[0].id).toBe('abc');
    const without = extractTextToolCalls('{"name": "a", "arguments": {}}');
    expect(without[0].id).toBe('fallback-0');
  });

  it('keeps string-form arguments intact (normalizeArgs handles them downstream)', () => {
    const calls = extractTextToolCalls('{"name": "a", "arguments": "{\\"x\\": 1}"}');
    expect(calls[0].function.arguments).toBe('{"x": 1}');
  });
});
