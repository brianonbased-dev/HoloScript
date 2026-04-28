import Anthropic from '@anthropic-ai/sdk';
import type { ConfigName, RubricCriterion, RubricVerdict, Task, TokenUsage } from './types';

export interface JudgeOptions {
  client: Anthropic;
  model?: string;
  maxAttempts?: number;
}

export interface JudgeResult {
  verdicts: RubricVerdict[];
  usage: TokenUsage;
  parse_error?: string;
}

const VERDICT_TOOL: Anthropic.Tool = {
  name: 'submit_verdicts',
  description:
    'Submit a per-criterion pass/fail verdict for the candidate output against the rubric.',
  input_schema: {
    type: 'object',
    properties: {
      verdicts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            criterion_id: { type: 'string' },
            passed: { type: 'boolean' },
            rationale: { type: 'string' },
          },
          required: ['criterion_id', 'passed', 'rationale'],
        },
      },
    },
    required: ['verdicts'],
  },
};

function buildPrompt(task: Task, candidateOutput: string, rubric: RubricCriterion[]): string {
  const rubricBlock = rubric
    .map(
      (c, i) =>
        `${i + 1}. id=${c.id} required=${c.required}\n   ${c.description}`
    )
    .join('\n');
  return [
    `You are evaluating a candidate output against a rubric for the following task:`,
    ``,
    `TASK PROMPT:`,
    task.prompt,
    ``,
    `RUBRIC:`,
    rubricBlock,
    ``,
    `CANDIDATE OUTPUT:`,
    `--- BEGIN OUTPUT ---`,
    candidateOutput.length > 16000
      ? `${candidateOutput.slice(0, 16000)}\n[...truncated]`
      : candidateOutput,
    `--- END OUTPUT ---`,
    ``,
    `For each rubric criterion, decide if the candidate output satisfies it.`,
    `Be strict: if information is ambiguous or absent from the output, mark FAIL.`,
    `Submit your verdicts via the submit_verdicts tool — every criterion must have exactly one verdict.`,
  ].join('\n');
}

export async function judgeRun(
  task: Task,
  config: ConfigName,
  trial: number,
  candidateOutput: string,
  opts: JudgeOptions
): Promise<JudgeResult> {
  const model = opts.model ?? 'claude-opus-4-7';
  const maxAttempts = opts.maxAttempts ?? 2;
  const usage: TokenUsage = { input_tokens: 0, output_tokens: 0 };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await opts.client.messages.create({
      model,
      max_tokens: 4096,
      tools: [VERDICT_TOOL],
      tool_choice: { type: 'tool', name: 'submit_verdicts' },
      messages: [
        {
          role: 'user',
          content: buildPrompt(task, candidateOutput, task.evaluation_rubric),
        },
      ],
    });

    usage.input_tokens += response.usage.input_tokens;
    usage.output_tokens += response.usage.output_tokens;

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'submit_verdicts'
    );
    if (!toolUse) {
      if (attempt === maxAttempts) {
        return {
          verdicts: task.evaluation_rubric.map((c) => ({
            task_id: task.id,
            config,
            trial,
            criterion_id: c.id,
            passed: false,
            rationale: 'judge produced no tool call',
          })),
          usage,
          parse_error: 'no_tool_use_block',
        };
      }
      continue;
    }

    const input = toolUse.input as {
      verdicts?: Array<{ criterion_id: string; passed: boolean; rationale: string }>;
    };
    const submitted = input.verdicts ?? [];
    const byId = new Map(submitted.map((v) => [v.criterion_id, v] as const));

    const verdicts: RubricVerdict[] = task.evaluation_rubric.map((c) => {
      const found = byId.get(c.id);
      return {
        task_id: task.id,
        config,
        trial,
        criterion_id: c.id,
        passed: found?.passed ?? false,
        rationale: found?.rationale ?? 'missing in judge response',
      };
    });

    return { verdicts, usage };
  }

  return {
    verdicts: task.evaluation_rubric.map((c) => ({
      task_id: task.id,
      config,
      trial,
      criterion_id: c.id,
      passed: false,
      rationale: 'exhausted attempts',
    })),
    usage,
    parse_error: 'exhausted_attempts',
  };
}

export function isCompleted(verdicts: RubricVerdict[], rubric: RubricCriterion[]): boolean {
  for (const c of rubric) {
    if (!c.required) continue;
    const v = verdicts.find((x) => x.criterion_id === c.id);
    if (!v || !v.passed) return false;
  }
  return true;
}
