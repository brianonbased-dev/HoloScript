import Anthropic from '@anthropic-ai/sdk';
import type { ConfigRunner, ConfigRunResult, Task, TokenUsage } from '../types';

const SYSTEM_PROMPT =
  'You are a helpful assistant. Describe scenes in plain text — list every object you would create with its type, position, dimensions, and color. Be concrete and specific so a downstream system could realize the scene from your description alone.';

export interface VanillaBaselineOptions {
  client: Anthropic;
  model?: string;
}

export function makeVanillaBaseline(opts: VanillaBaselineOptions): ConfigRunner {
  const model = opts.model ?? 'claude-opus-4-7';
  return {
    name: 'vanilla-baseline',
    async run(task: Task, signal: AbortSignal): Promise<ConfigRunResult> {
      if (signal.aborted) {
        return {
          output_text: '',
          tool_rounds: 0,
          usage: { input_tokens: 0, output_tokens: 0 },
          model_id: model,
          scene_mutations: [],
          error: 'aborted',
        };
      }
      const response = await opts.client.messages.create({
        model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: task.prompt }],
      });
      const usage: TokenUsage = {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      };
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      return {
        output_text: text,
        tool_rounds: 0,
        usage,
        model_id: model,
        scene_mutations: [],
      };
    },
  };
}
