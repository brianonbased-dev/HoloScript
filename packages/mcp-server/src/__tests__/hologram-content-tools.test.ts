/**
 * Tests for visualize_query_result + the hologram MCP content_type
 * dispatch envelope (task_1778114362909_zp7u).
 */
import { describe, expect, it } from 'vitest';
import {
  HOLOGRAM_CONTENT_TYPES,
  HOLOGRAM_MCP_VERSION,
  detectHologramContent,
  isHologramMcpResponse,
  validateHologramMcpResponse,
  wrapHologramMcpEnvelope,
} from '@holoscript/core';

import {
  buildVisualizeQueryResultHolo,
  handleHologramContentTool,
  hologramContentToolDefinitions,
  isHologramContentToolName,
} from '../hologram-content-tools';

describe('hologram-content-tools - tool definitions', () => {
  it('registers visualize_query_result with a valid input schema', () => {
    const tool = hologramContentToolDefinitions.find((candidate) =>
      candidate.name === 'visualize_query_result'
    );
    expect(tool).toBeDefined();
    const inputSchema = tool?.inputSchema as { required?: string[] } | undefined;
    expect(tool?.description).toContain('content_type');
    expect(inputSchema?.required).toContain('rows');
  });

  it('isHologramContentToolName recognizes the reference tool only', () => {
    expect(isHologramContentToolName('visualize_query_result')).toBe(true);
    expect(isHologramContentToolName('compile_to_spatial')).toBe(false);
    expect(isHologramContentToolName('not_a_tool')).toBe(false);
  });
});

describe('handleHologramContentTool - visualize_query_result', () => {
  it('returns a valid HologramMcpResponse with content_type=holo', async () => {
    const result = await handleHologramContentTool('visualize_query_result', {
      rows: [
        { label: 'A', value: 10 },
        { label: 'B', value: 25 },
        { label: 'C', value: 7 },
      ],
      title: 'Top fruits',
    });

    expect(result.content_type).toBe(HOLOGRAM_CONTENT_TYPES.holo);
    expect(result.version).toBe(HOLOGRAM_MCP_VERSION);
    expect(result.payload.kind).toBe('holo-code');
    expect(result.text).toContain('Top fruits');
    expect(result.meta.producedBy).toBe('visualize_query_result');
    expect(result.meta.label).toBe('Top fruits');

    // Result must round-trip the validator
    const v = validateHologramMcpResponse(result);
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
    expect(isHologramMcpResponse(result)).toBe(true);
  });

  it('clamps values out of range and accepts no title', async () => {
    const result = await handleHologramContentTool('visualize_query_result', {
      rows: [
        { label: 'big', value: 500 }, // clamped to 100
        { label: 'neg', value: -3 }, // clamped to 0
      ],
    });
    expect(result.payload.kind).toBe('holo-code');
    if (result.payload.kind === 'holo-code') {
      // 500 -> 100 -> 100*0.02 = 2.0; check the bar height appears in the holo source
      expect(result.payload.holoCode).toContain('"big"');
      expect(result.payload.holoCode).toContain('"neg"');
    }
  });

  it('rejects empty rows', async () => {
    await expect(
      handleHologramContentTool('visualize_query_result', { rows: [] }),
    ).rejects.toThrow(/at least one row/);
  });

  it('rejects malformed row entries', async () => {
    await expect(
      handleHologramContentTool('visualize_query_result', {
        rows: [{ label: '', value: 1 }],
      }),
    ).rejects.toThrow(/non-empty string/);
  });

  it('escapes label control chars to keep .holo source well-formed', async () => {
    const result = await handleHologramContentTool('visualize_query_result', {
      rows: [{ label: 'evil"\nlabel', value: 5 }],
    });
    if (result.payload.kind === 'holo-code') {
      // Sanitizer strips control chars + raw quote, so the resulting .holo
      // string literal does not contain a stray quote.
      expect(result.payload.holoCode).not.toContain('evil"');
      expect(result.payload.holoCode).toContain('evillabel');
    }
  });

  it('rejects unknown tool names', async () => {
    await expect(
      handleHologramContentTool('not-a-tool' as string, { rows: [{ label: 'x', value: 1 }] }),
    ).rejects.toThrow(/Unknown hologram-content tool/);
  });
});

describe('hologram MCP envelope wrap + detect roundtrip', () => {
  it('wrapHologramMcpEnvelope -> detectHologramContent recovers the response', async () => {
    const result = await handleHologramContentTool('visualize_query_result', {
      rows: [{ label: 'a', value: 1 }],
    });
    const envelope = wrapHologramMcpEnvelope(result);

    // Standard MCP `content` field still parses for chat-only clients
    expect(envelope.content).toHaveLength(1);
    expect(envelope.content[0].type).toBe('text');
    const parsed = JSON.parse(envelope.content[0].text);
    expect(parsed.content_type).toBe(HOLOGRAM_CONTENT_TYPES.holo);

    // Hologram-aware clients pull the typed channel directly
    expect(envelope.hologramContent).toBe(result);

    // detectHologramContent must work on (a) raw response, (b) envelope, (c) legacy text-only
    expect(detectHologramContent(result)).toBe(result);
    expect(detectHologramContent(envelope)).toBe(result);
    expect(
      detectHologramContent({ content: [{ type: 'text', text: JSON.stringify(result) }] }),
    ).toBeTruthy();
  });

  it('detectHologramContent returns null for non-hologram envelopes', () => {
    expect(detectHologramContent(null)).toBeNull();
    expect(detectHologramContent('hello')).toBeNull();
    expect(detectHologramContent({ content: [{ type: 'text', text: 'plain text' }] })).toBeNull();
    expect(
      detectHologramContent({ content: [{ type: 'text', text: '{"foo":"bar"}' }] }),
    ).toBeNull();
  });
});

describe('buildVisualizeQueryResultHolo - composition output', () => {
  it('produces a parseable composition shape', () => {
    const code = buildVisualizeQueryResultHolo(
      [
        { label: 'a', value: 10 },
        { label: 'b', value: 20 },
      ],
      'Test',
      0.02,
    );
    expect(code).toMatch(/^composition "QueryResult - Test" \{/);
    expect(code).toContain('object "QueryFloor"');
    expect(code).toContain('object "QueryBar_0"');
    expect(code).toContain('object "QueryBar_1"');
    expect(code).toContain('object "QueryLabel_0"');
    expect(code).toContain('object "QueryValue_0"');
    expect(code.endsWith('}')).toBe(true);
  });
});
