import Anthropic from '@anthropic-ai/sdk';
import type { ConfigRunResult, Task, TokenUsage } from '../types';
import { FS_TOOLS, InMemoryFsSandbox, executeFsTool } from './fs-sandbox';

export interface RunWithFsOptions {
  client: Anthropic;
  model: string;
  systemPrompt: string;
  task: Task;
  maxToolRounds: number;
  signal: AbortSignal;
}

const MAX_TOOL_ROUNDS_DEFAULT = 8;

function accumulateUsage(target: TokenUsage, src: Anthropic.Usage): void {
  target.input_tokens += src.input_tokens;
  target.output_tokens += src.output_tokens;
  if ('cache_creation_input_tokens' in src && src.cache_creation_input_tokens != null) {
    target.cache_creation_input_tokens =
      (target.cache_creation_input_tokens ?? 0) + src.cache_creation_input_tokens;
  }
  if ('cache_read_input_tokens' in src && src.cache_read_input_tokens != null) {
    target.cache_read_input_tokens =
      (target.cache_read_input_tokens ?? 0) + src.cache_read_input_tokens;
  }
}

export async function runWithFsTools(
  opts: RunWithFsOptions
): Promise<ConfigRunResult> {
  const { client, model, systemPrompt, task, signal } = opts;
  const maxRounds = opts.maxToolRounds ?? MAX_TOOL_ROUNDS_DEFAULT;
  const sandbox = new InMemoryFsSandbox();
  const usage: TokenUsage = { input_tokens: 0, output_tokens: 0 };
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: task.prompt }];

  let rounds = 0;
  let outputText = '';

  while (rounds <= maxRounds) {
    if (signal.aborted) {
      return {
        output_text: outputText,
        tool_rounds: rounds,
        usage,
        model_id: model,
        scene_mutations: [],
        error: 'aborted',
      };
    }

    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
      tools: FS_TOOLS,
    });

    accumulateUsage(usage, response.usage);

    const toolUses: Anthropic.ToolUseBlock[] = [];
    for (const block of response.content) {
      if (block.type === 'text') {
        outputText += block.text;
      } else if (block.type === 'tool_use') {
        toolUses.push(block);
      }
    }

    if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
      break;
    }

    messages.push({ role: 'assistant', content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = toolUses.map((tu) => {
      const r = executeFsTool(sandbox, tu.name, tu.input as Record<string, unknown>);
      return {
        type: 'tool_result' as const,
        tool_use_id: tu.id,
        content: JSON.stringify(r.success ? r.data : { error: r.error }),
        is_error: !r.success,
      };
    });
    messages.push({ role: 'user', content: toolResults });
    rounds += 1;
  }

  const snapshot = sandbox.snapshot();
  const sandboxAsText = Object.entries(snapshot)
    .map(([p, c]) => `--- ${p} ---\n${c}`)
    .join('\n\n');
  const combined = sandboxAsText ? `${outputText}\n\n${sandboxAsText}` : outputText;

  return {
    output_text: combined,
    tool_rounds: rounds,
    usage,
    model_id: model,
    scene_mutations: [],
  };
}
