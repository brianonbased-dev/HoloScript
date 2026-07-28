/**
 * Raw-JSON tool-call rescue parser tests (founder repro 2026-06-10: a turn
 * that ended with {"name":"tend_garden","arguments":{}} as plain chat text).
 */
import { describe, it, expect } from 'vitest';
import { parseTextToolCall } from '../textToolCallRescue';

describe('parseTextToolCall', () => {
  it('parses a bare JSON tool invocation (the founder repro shape)', () => {
    const out = parseTextToolCall('{\n  "name": "tend_garden",\n  "arguments": {}\n}');
    expect(out).toEqual({ name: 'tend_garden', args: {} });
  });

  it('parses a fenced JSON tool invocation', () => {
    const out = parseTextToolCall(
      '```json\n{"name": "board_add_task", "arguments": {"tasks": []}}\n```'
    );
    expect(out).toEqual({ name: 'board_add_task', args: { tasks: [] } });
  });

  it('parses the qwen3.5-as-text shape {tool, tool_args} (live repro 2026-06-10)', () => {
    const out = parseTextToolCall(
      '```json\n{\n  "tool": "apply_code",\n  "tool_args": {\n    "code": "composition x {}"\n  }\n}\n```'
    );
    expect(out).toEqual({ name: 'apply_code', args: { code: 'composition x {}' } });
  });

  it('accepts {tool, args} as aliases', () => {
    expect(parseTextToolCall('{"tool": "x", "args": {"a": 1}}')).toEqual({
      name: 'x',
      args: { a: 1 },
    });
  });

  it('accepts "parameters" and "input" as the args key', () => {
    expect(parseTextToolCall('{"name": "x", "parameters": {"a": 1}}')).toEqual({
      name: 'x',
      args: { a: 1 },
    });
    expect(parseTextToolCall('{"name": "x", "input": {"b": 2}}')).toEqual({
      name: 'x',
      args: { b: 2 },
    });
  });

  it('defaults missing arguments to {}', () => {
    expect(parseTextToolCall('{"name": "mcp_list_servers"}')).toEqual({
      name: 'mcp_list_servers',
      args: {},
    });
  });

  it('rejects JSON embedded in prose — never rescues ordinary answers', () => {
    expect(parseTextToolCall('Sure! I would call {"name": "x", "arguments": {}} for that.')).toBe(
      null
    );
  });

  it('rejects non-tool-call JSON objects (unexpected keys)', () => {
    expect(parseTextToolCall('{"name": "Joe", "age": 41}')).toBe(null);
    expect(parseTextToolCall('{"title": "hello"}')).toBe(null);
  });

  it('rejects arrays, primitives, empty names, and malformed JSON', () => {
    expect(parseTextToolCall('[{"name": "x"}]')).toBe(null);
    expect(parseTextToolCall('"name"')).toBe(null);
    expect(parseTextToolCall('{"name": ""}')).toBe(null);
    expect(parseTextToolCall('{"name": "x", "arguments": }')).toBe(null);
    expect(parseTextToolCall('')).toBe(null);
  });

  it('rejects non-object arguments', () => {
    expect(parseTextToolCall('{"name": "x", "arguments": [1, 2]}')).toBe(null);
    expect(parseTextToolCall('{"name": "x", "arguments": "str"}')).toBe(null);
  });
});
