import { describe, expect, it } from 'vitest';
import { makeOllamaBaseline } from '../configs/ollama-baseline';
import type { Task } from '../types';

const TASK: Task = {
  id: 'QVL',
  tier: 'trivial-scene',
  prompt: 'Create a red cube.',
  evaluation_rubric: [{ id: 'cube', description: 'A cube exists.', required: true }],
  expected_artifacts: ['cube'],
};

function makeFetch(responseBody: unknown): typeof fetch {
  return async (): Promise<Response> =>
    new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
}

describe('ollama-baseline final-output gate', () => {
  it('fails qwen3-vl thinking-only length responses before Tower C output promotion', async () => {
    const cfg = makeOllamaBaseline({
      apiKey: 'test',
      model: 'qwen3-vl:4b',
      baseURL: 'https://ollama.test/v1',
      fetchImpl: makeFetch({
        id: 'chatcmpl_test',
        model: 'qwen3-vl:4b',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '',
              thinking: 'The screenshot appears to contain a 3D scene builder and code structure.',
            },
            finish_reason: 'length',
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 8192, total_tokens: 8204 },
      }),
    });

    const result = await cfg.run(TASK, new AbortController().signal);

    expect(result.output_text).toBe('');
    expect(result.scene_mutations).toEqual([]);
    expect(result.thinking_content).toContain('3D scene builder');
    expect(result.error).toContain('final-output-gate');
    expect(result.error).toContain('qwen3-vl:4b');
    expect(result.error).toContain('Tower C output promotion');
  });

  it('allows qwen3-vl tool-call output to remain evaluable', async () => {
    const cfg = makeOllamaBaseline({
      apiKey: 'test',
      model: 'qwen3-vl:4b',
      baseURL: 'https://ollama.test/v1',
      fetchImpl: makeFetch({
        id: 'chatcmpl_test',
        model: 'qwen3-vl:4b',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '',
              thinking: 'Need one red cube.',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'create_object',
                    arguments:
                      '{"name":"RedCube","type":"mesh","primitive":"cube","color":"red","position":[0,0,0]}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 128, total_tokens: 140 },
      }),
    });

    const result = await cfg.run(TASK, new AbortController().signal);

    expect(result.error).toBeUndefined();
    expect(result.tool_rounds).toBe(1);
    expect(result.thinking_content).toContain('red cube');
    expect(result.scene_mutations).toHaveLength(1);
    expect(result.scene_mutations[0].tool_name).toBe('create_object');
    expect(result.scene_mutations[0].input.primitive).toBe('cube');
  });
});
