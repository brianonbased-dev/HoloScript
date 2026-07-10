/**
 * Tests for the Gemini adapter — function calling, response parsing,
 * and model-list guards for shut-down/deprecated models.
 *
 * Covers the A-020 migration (2026-06-08): Interactions API `outputs` removed,
 * new `steps[]` schema documented in adapter header; standard generateContent
 * `candidates[]` path tested here.
 */

import { describe, it, expect } from 'vitest';
import {
  GEMINI_CAPABILITIES,
  GEMINI_MODEL_METADATA,
  GEMINI_MODELS,
  GeminiAdapter,
  geminiToolsFromToolSpecs,
  getGeminiModelMetadata,
  isGeminiDefaultRoutingEligible,
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

  it('does NOT include Gemini 2.0 Flash models shut down June 1 2026', () => {
    const modelList = GEMINI_MODELS as readonly string[];
    expect(modelList).not.toContain('gemini-2.0-flash');
    expect(modelList).not.toContain('gemini-2.0-flash-lite');
  });

  it('does NOT include retired Veo/Imagen media-generation IDs (media routes via Interactions API, not this chat registry; A-020 ihoc)', () => {
    const modelList = GEMINI_MODELS as readonly string[];
    // Veo shut down 2026-06-30 (already live); Imagen 4 shutdown announced 2026-08-17.
    for (const retired of [
      'veo-2.0-generate-001',
      'veo-3.0-generate-001',
      'veo-3.0-fast-generate-001',
      'imagen-4.0-generate-001',
      'imagen-4.0-ultra-generate-001',
      'imagen-4.0-fast-generate-001',
    ]) {
      expect(modelList).not.toContain(retired);
    }
  });

  it('contains the expected current models', () => {
    expect(GEMINI_MODELS).toContain('gemini-3.5-flash');
    expect(GEMINI_MODELS).toContain('gemini-3.1-flash-tts-preview');
    expect(GEMINI_MODELS).toContain('gemini-omni-flash-preview');
    expect(GEMINI_MODELS).toContain('gemini-3-flash-preview');
    expect(GEMINI_MODELS).toContain('gemini-1.5-pro');
  });

  it('marks Gemini Omni Flash Preview as Interactions-only media metadata', () => {
    const metadata = GEMINI_MODEL_METADATA['gemini-omni-flash-preview'];

    expect(metadata).toMatchObject({
      id: 'gemini-omni-flash-preview',
      status: 'preview',
      apiSurface: 'interactions',
      defaultRoutingEligible: false,
      supportsTextCompletion: false,
      supportsFunctionCalling: false,
      supportsVideoGeneration: true,
      supportsVideoEditing: true,
      supportsImageAnimation: true,
      supportsConversationalMediaEditing: true,
      lastVerified: '2026-06-30',
    });
    expect(metadata.routingNotes.join('\n')).toContain('do not route normal HoloScript text');
    expect(metadata.sources).toContain('https://ai.google.dev/gemini-api/docs/omni');
  });

  it('keeps Interactions-only Gemini models out of default text routing', () => {
    expect(isGeminiDefaultRoutingEligible('gemini-3.5-flash')).toBe(true);
    expect(isGeminiDefaultRoutingEligible('gemini-omni-flash-preview')).toBe(false);
    expect(getGeminiModelMetadata('gemini-omni-flash-preview')?.apiSurface).toBe(
      'interactions'
    );
  });
});

// ---------------------------------------------------------------------------
// Capability manifest
// ---------------------------------------------------------------------------

describe('GEMINI_CAPABILITIES', () => {
  it('exposes streaming speech generation as audio output, not generic text streaming only', () => {
    expect(GEMINI_CAPABILITIES.streaming).toBe(true);
    expect(GEMINI_CAPABILITIES.audioOutput).toBe(true);
    expect(GEMINI_CAPABILITIES.streamingSpeechGeneration).toBe(true);
  });

  it('maps the streaming speech flag through adapter instances', () => {
    const adapter = new GeminiAdapter({ apiKey: 'test-key' });
    expect(adapter.capabilities.streamingSpeechGeneration).toBe(true);
    expect(adapter.capabilities.audioOutput).toBe(true);
  });

  it('exposes Gemini Omni media-editing axes separately from video generation', () => {
    expect(GEMINI_CAPABILITIES.videoGeneration).toBe(true);
    expect(GEMINI_CAPABILITIES.videoEditing).toBe(true);
    expect(GEMINI_CAPABILITIES.imageAnimation).toBe(true);
    expect(GEMINI_CAPABILITIES.conversationalMediaEditing).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateContent route guard
// ---------------------------------------------------------------------------

describe('GeminiAdapter route guards', () => {
  it('rejects Gemini Omni Flash Preview before making a generateContent request', async () => {
    const adapter = new GeminiAdapter({ apiKey: 'test-key' });

    await expect(
      adapter.complete(
        {
          messages: [{ role: 'user', content: 'Generate a short video of a marble run.' }],
        },
        'gemini-omni-flash-preview'
      )
    ).rejects.toThrow(/Interactions API/);
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

    const result = parseGeminiResponse(response, 'gemini-3.5-flash');
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
