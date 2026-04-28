import Anthropic from '@anthropic-ai/sdk';
import type { ConfigRunner, ConfigRunResult, Task } from '../types';
import { runWithFsTools } from './run-with-fs-tools';

const SYSTEM_PROMPT =
  'You are Claude Code, an interactive CLI agent. The user describes a scene; you have read_file, write_file, edit_file, and list_files tools operating on a sandbox. You have NO scene-context awareness or rendering tooling. Produce a self-contained scene description by writing one or more files (e.g. scene.json) that describe every object: type, position, dimensions, color. Be concrete and complete.';

export interface ClaudeCodeBaselineOptions {
  client: Anthropic;
  model?: string;
}

export function makeClaudeCodeBaseline(opts: ClaudeCodeBaselineOptions): ConfigRunner {
  const model = opts.model ?? 'claude-opus-4-7';
  return {
    name: 'claude-code-baseline',
    async run(task: Task, signal: AbortSignal): Promise<ConfigRunResult> {
      return runWithFsTools({
        client: opts.client,
        model,
        systemPrompt: SYSTEM_PROMPT,
        task,
        maxToolRounds: 10,
        signal,
      });
    },
  };
}
