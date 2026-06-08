/**
 * Tests for the Gemini adapter — function calling, response parsing,
 * and model-list guard for deprecated image-preview models.
 *
 * Covers the A-020 migration (2026-06-08): Interactions API `outputs` removed,
 * new `steps[]` schema documented in adapter header; standard generateContent
 * `candidates[]` path tested here.
 */

import { describe, it, expect } from 'vitest';
import {
  GEMINI_MODELS,
  geminiToolsFromToolSpecs,
  mapGeminiFinishReason,
  parseGeminiResponse,
} from '../adapters/gemini';
import type { ToolSpec } from '../types';

// ---------------------------------------------------------------------------
// Model list guard
// ---------------------------------------------------------------------------

describe('GEMINI_MODELS', () => {
  it('does NOT include deprecated image-preview models shut down June 25 2026', () => {
    const modelList = GEMINI_MODELS as readonly string[];
    expect(modelList).not.toContain('gemini-3.1-flash-image-preview');
    expect(modelList).not.toContain('gemini-3-pro-image-preview');
  });

  it('contains the expected current models', () => {
    expect(GEMINI_MODELS).toContain('gemini-3.5-flash');
    expect(GEMINI_MODELS).toContain('gemini-2.0-flash');
    expect(GEMINI_MODELS).toContain('gemini-1.5-pro');
  });
});

// ---------------------------------------------------------------------------
// Finish reason mapping
// ---------------------------------------------------------------------------

describe('mapGeminiFinishReason', () => {
  it('maps STOP → stop', () => {
    expect(mapGeminiFinishReason('STOP')).toBe('stop');
  });

  it('maps MAX_TOKENS → length', () => {
    expect(mapGeminiFinishReason('MAX_TOKENS')).toBe('length');
  });

  it('maps SAFETY → content_filter', () => {
    expect(mapGeminiFinishReason('SAFETY')).toBe('content_filter');
  });

  it('maps FUNCTION_CALL → tool_use', () => {
    expect(mapGeminiFinishReason('FUNCTION_CALL')).toBe('tool_use');
  });

  it('defaults unknown reasons to stop', () => {
    expect(mapGeminiFinishReason(undefined)).toBe('stop');
    expect(mapGeminiFinishReason('OTHER')).toBe('stop');
  });
});

// ---------------------------------------------------------------------------
// Tool spec translation
// ---------------------------------------------------------------------------

describe('geminiToolsFromToolSpecs', () => {
  it('converts ToolSpec to Gemini function declaration shape', () => {
    const tools: ToolSpec[] = [
      {
        name: 'get_weather',
        description: 'Returns weather for a city',
        input_schema: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      },
    ];

    const result = geminiToolsFromToolSpecs(tools);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('get_weather');
    expect(result[0].description).toBe('Returns weather for a city');
    expect(result[0].parameters.type).toBe('object');
    expect(result[0].parameters.properties).toEqual({ city: { type: 'string' } });
    expect(result[0].parameters.required).toEqual(['city']);
  });

  it('returns empty array for no tools', () => {
    expect(geminiToolsFromToolSpecs([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseGeminiResponse — plain text
// ---------------------------------------------------------------------------

describe('parseGeminiResponse — plain text', () => {
  it('extracts text content from candidates', () => {
    const response = {
      candidates: [
        {
          content: {
            parts: [{ text: 'Hello, world!' }],
            role: 'model',
          },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    };

    const result = parseGeminiResponse(response, 'gemini-3.5-flash');

    expect(result.content).toBe('Hello, world!');
    expect(result.finishReason).toBe('stop');
    expect(result.toolUses).toBeUndefined();
    expect(result.assistantBlocks).toHaveLength(1);
    expect(result.assistantBlocks![0]).toEqual({ type: 'text', text: 'Hello, world!' });
    expect(result.usage.promptTokens).toBe(10);
    expect(result.usage.completionTokens).toBe(5);
    expect(result.usage.totalTokens).toBe(15);
    expect(result.provider).toBe('gemini');
    expect(result.model).toBe('gemini-3.5-flash');
  });

  it('concatenates multiple text parts', () => {
    const response = {
      candidates: [
        {
          content: {
            parts: [{ text: 'Hello, ' }, { text: 'world!' }],
            role: 'model',
          },
          finishReason: 'STOP',
        },
      ],
    };

    const result = parseGeminiResponse(response, 'gemini-2.0-flash');
    expect(result.content).toBe('Hello, world!');
    expect(result.assistantBlocks).toHaveLength(2);
  });

  it('handles empty candidates gracefully', () => {
    const result = parseGeminiResponse({}, 'gemini-3.5-flash');
    expect(result.content).toBe('');
    expect(result.finishReason).toBe('stop');
    expect(result.toolUses).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseGeminiResponse — function calling (A-020 core case)
// ---------------------------------------------------------------------------

describe('parseGeminiResponse — function calling', () => {
  it('extracts functionCall parts as ToolUseBlocks', () => {
    const response = {
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name: 'get_weather',
                  args: { city: 'London' },
                },
              },
            ],
            role: 'model',
          },
          finishReason: 'FUNCTION_CALL',
        },
      ],
    };

    const result = parseGeminiResponse(response, 'gemini-3.5-flash');

    expect(result.finishReason).toBe('tool_use');
    expect(result.toolUses).toHaveLength(1);
    expect(result.toolUses![0].type).toBe('tool_use');
    expect(result.toolUses![0].name).toBe('get_weather');
    expect(result.toolUses![0].input).toEqual({ city: 'London' });
    expect(result.toolUses![0].id).toMatch(/^call_0_get_weather$/);
    expect(result.assistantBlocks).toHaveLength(1);
    expect(result.assistantBlocks![0]).toEqual(result.toolUses![0]);
  });

  it('forces finishReason=tool_use when functionCall parts present regardless of candidate finishReason', () => {
    const response = {
      candidates: [
        {
          content: {
            parts: [{ functionCall: { name: 'search', args: { q: 'test' } } }],
            role: 'model',
          },
          finishReason: 'STOP', // should be overridden
        },
      ],
    };

    const result = parseGeminiResponse(response, 'gemini-3.5-flash');
    expect(result.finishReason).toBe('tool_use');
  });

  it('handles mixed text + functionCall parts', () => {
    const response = {
      candidates: [
        {
          content: {
            parts: [
              { text: 'Let me check the weather.' },
              { functionCall: { name: 'get_weather', args: { city: 'Paris' } } },
            ],
            role: 'model',
          },
          finishReason: 'FUNCTION_CALL',
        },
      ],
    };

    const result = parseGeminiResponse(response, 'gemini-3.5-flash');

    expect(result.content).toBe('Let me check the weather.');
    expect(result.finishReason).toBe('tool_use');
    expect(result.toolUses).toHaveLength(1);
    expect(result.toolUses![0].name).toBe('get_weather');
    // assistantBlocks preserves order: text first, then tool_use
    expect(result.assistantBlocks).toHaveLength(2);
    expect(result.assistantBlocks![0]).toEqual({ type: 'text', text: 'Let me check the weather.' });
    expect(result.assistantBlocks![1]).toEqual(result.toolUses![0]);
  });

  it('assigns unique IDs to multiple function calls', () => {
    const response = {
      candidates: [
        {
          content: {
            parts: [
              { functionCall: { name: 'tool_a', args: {} } },
              { functionCall: { name: 'tool_b', args: {} } },
            ],
            role: 'model',
          },
          finishReason: 'FUNCTION_CALL',
        },
      ],
    };

    const result = parseGeminiResponse(response, 'gemini-3.5-flash');

    expect(result.toolUses).toHaveLength(2);
    expect(result.toolUses![0].id).toBe('call_0_tool_a');
    expect(result.toolUses![1].id).toBe('call_1_tool_b');
    // IDs must be unique
    const ids = result.toolUses!.map((t) => t.id);
    expect(new Set(ids).size).toBe(2);
  });
});
