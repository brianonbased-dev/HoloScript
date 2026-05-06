/**
 * OpenAIAdapter — Responses API mapping and parsing.
 */

import { describe, it, expect } from 'vitest';

import {
  messagesToOpenAIResponsesInput,
  parseOpenAIResponsesResult,
  toolSpecsToOpenAIResponseTools,
} from '../adapters/openai';
import type { LLMMessage, ToolSpec } from '../types';

describe('toolSpecsToOpenAIResponseTools', () => {
  it('maps HoloScript tool specs to Responses function tools', () => {
    const tools: ToolSpec[] = [
      {
        name: 'create_object',
        description: 'Create a HoloScript object',
        input_schema: {
          type: 'object',
          properties: {
            shape: { type: 'string' },
          },
          required: ['shape'],
        },
      },
    ];

    expect(toolSpecsToOpenAIResponseTools(tools)).toEqual([
      {
        type: 'function',
        name: 'create_object',
        description: 'Create a HoloScript object',
        parameters: tools[0].input_schema,
        strict: false,
      },
    ]);
  });
});

describe('messagesToOpenAIResponsesInput', () => {
  it('round-trips assistant tool calls and user tool results as Responses items', () => {
    const messages: LLMMessage[] = [
      { role: 'system', content: 'You write HoloScript.' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I need the catalog.' },
          {
            type: 'tool_use',
            id: 'call_1',
            name: 'list_traits',
            input: { family: 'physics' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call_1',
            content: '{"traits":["@physics","@gravity"]}',
          },
        ],
      },
    ];

    expect(messagesToOpenAIResponsesInput(messages)).toEqual([
      { role: 'system', content: 'You write HoloScript.' },
      { role: 'assistant', content: 'I need the catalog.' },
      {
        type: 'function_call',
        call_id: 'call_1',
        name: 'list_traits',
        arguments: '{"family":"physics"}',
      },
      {
        type: 'function_call_output',
        call_id: 'call_1',
        output: '{"traits":["@physics","@gravity"]}',
      },
    ]);
  });
});

describe('parseOpenAIResponsesResult', () => {
  it('extracts text, tool calls, usage, and request ids', () => {
    const result = parseOpenAIResponsesResult(
      {
        id: 'resp_123',
        _request_id: 'req_123',
        model: 'gpt-5.5',
        status: 'completed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'I will add a cube.' }],
          },
          {
            type: 'function_call',
            id: 'fc_123',
            call_id: 'call_123',
            name: 'create_object',
            arguments: '{"shape":"cube","position":[0,1,0]}',
          },
        ],
        usage: {
          input_tokens: 12,
          output_tokens: 8,
          total_tokens: 20,
        },
      },
      'gpt-5.5'
    );

    expect(result.content).toBe('I will add a cube.');
    expect(result.finishReason).toBe('tool_use');
    expect(result.usage).toEqual({
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
    });
    expect(result.requestId).toBe('req_123');
    expect(result.toolUses).toEqual([
      {
        type: 'tool_use',
        id: 'call_123',
        name: 'create_object',
        input: { shape: 'cube', position: [0, 1, 0] },
      },
    ]);
    expect(result.assistantBlocks).toEqual([
      { type: 'text', text: 'I will add a cube.' },
      {
        type: 'tool_use',
        id: 'call_123',
        name: 'create_object',
        input: { shape: 'cube', position: [0, 1, 0] },
      },
    ]);
  });

  it('uses output_text when output items are absent', () => {
    const result = parseOpenAIResponsesResult(
      {
        output_text: 'cube { @position(0, 1, 0) }',
        usage: { input_tokens: 1, output_tokens: 2 },
      },
      'gpt-5.4-mini'
    );

    expect(result.content).toBe('cube { @position(0, 1, 0) }');
    expect(result.model).toBe('gpt-5.4-mini');
    expect(result.finishReason).toBe('stop');
    expect(result.usage.totalTokens).toBe(3);
  });
});
