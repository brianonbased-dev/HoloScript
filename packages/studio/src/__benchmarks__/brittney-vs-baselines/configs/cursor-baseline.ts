import Anthropic from '@anthropic-ai/sdk';
import type { ConfigRunner, ConfigRunResult, Task } from '../types';
import { runWithFsTools } from './run-with-fs-tools';

const SYSTEM_PROMPT =
  'You are a coding assistant in an IDE. The user describes a scene; you produce a self-contained scene description as files in the sandbox. Use write_file to emit a scene.json file containing every object, with type, position, dimensions, color. You have NO scene-context awareness — only what the user told you. Be concrete: emit one scene.json file capturing the full scene.';

export interface CursorBaselineOptions {
  client: Anthropic;
  model?: string;
}

export function makeCursorBaseline(opts: CursorBaselineOptions): ConfigRunner {
  const model = opts.model ?? 'claude-sonnet-4-6';
  return {
    name: 'cursor-baseline',
    async run(task: Task, signal: AbortSignal): Promise<ConfigRunResult> {
      return runWithFsTools({
        client: opts.client,
        model,
        systemPrompt: SYSTEM_PROMPT,
        task,
        maxToolRounds: 8,
        signal,
      });
    },
  };
}
