import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OpenAIAdapter } from '../adapters/openai';
import type { LLMCompletionRequest } from '../types';

const responsesCreate = vi.hoisted(() => vi.fn());
const chatCreate = vi.hoisted(() => vi.fn());

vi.mock('openai', () => ({
  default: class MockOpenAI {
    responses = { create: responsesCreate };
    chat = { completions: { create: chatCreate } };
  },
}));

const request: LLMCompletionRequest = {
  messages: [{ role: 'user', content: 'Submit one bounded plan.' }],
  maxTokens: 100,
  tools: [
    {
      name: 'submit_agent_plan',
      description: 'Submit one bounded plan',
      input_schema: {
        type: 'object',
        properties: { summary: { type: 'string' } },
        required: ['summary'],
      },
    },
  ],
  provider: {
    openai: { toolChoice: 'required', parallelToolCalls: false },
  },
};

describe('OpenAIAdapter provider-native wiring', () => {
  beforeEach(() => {
    responsesCreate.mockReset();
    chatCreate.mockReset();
  });

  it('sends required tool controls and AbortSignal through Responses', async () => {
    responsesCreate.mockResolvedValueOnce({
      id: 'resp-1',
      model: 'gpt-test',
      status: 'completed',
      output: [
        {
          type: 'function_call',
          call_id: 'call-1',
          name: 'submit_agent_plan',
          arguments: '{"summary":"One plan"}',
        },
      ],
      usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
    });
    const signal = new AbortController().signal;
    const adapter = new OpenAIAdapter({
      apiKey: 'test-key',
      apiSurface: 'responses',
      maxRetries: 0,
    });

    const response = await adapter.complete(request, 'gpt-test', { signal });

    expect(responsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-test',
        tool_choice: 'required',
        parallel_tool_calls: false,
        tools: [expect.objectContaining({ name: 'submit_agent_plan' })],
      }),
      { signal }
    );
    expect(response.finishReason).toBe('tool_use');
    expect(response.reportedModel).toBe('gpt-test');
  });

  it('sends required tool controls and AbortSignal through Chat Completions', async () => {
    chatCreate.mockResolvedValueOnce({
      id: 'chat-1',
      model: 'gpt-test',
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            content: null,
            tool_calls: [
              {
                id: 'call-1',
                type: 'function',
                function: {
                  name: 'submit_agent_plan',
                  arguments: '{"summary":"One plan"}',
                },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    });
    const signal = new AbortController().signal;
    const adapter = new OpenAIAdapter({
      apiKey: 'test-key',
      apiSurface: 'chat-completions',
      maxRetries: 0,
    });

    const response = await adapter.complete(request, 'gpt-test', { signal });

    expect(chatCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-test',
        tool_choice: 'required',
        parallel_tool_calls: false,
        tools: [
          expect.objectContaining({
            type: 'function',
            function: expect.objectContaining({ name: 'submit_agent_plan' }),
          }),
        ],
      }),
      { signal }
    );
    expect(response.finishReason).toBe('tool_use');
    expect(response.reportedModel).toBe('gpt-test');
  });
});
