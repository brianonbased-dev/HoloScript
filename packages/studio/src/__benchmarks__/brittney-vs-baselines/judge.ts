import Anthropic from '@anthropic-ai/sdk';
import { OllamaClient } from './lib/ollama-client';
import type { ConfigName, RubricCriterion, RubricVerdict, SceneMutation, Task, TokenUsage } from './types';

export interface JudgeOptions {
  client: Anthropic;
  model?: string;
  maxAttempts?: number;
  /** Optional Ollama client — used as fallback when Anthropic credits are depleted. */
  ollamaClient?: OllamaClient;
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

const VERDICT_TOOL_OLLAMA = {
  type: 'function' as const,
  function: {
    name: 'submit_verdicts',
    description:
      'Submit a per-criterion pass/fail verdict for the candidate output against the rubric.',
    parameters: {
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
  },
};

function formatMutations(mutations: SceneMutation[]): string {
  if (mutations.length === 0) return '_(none)_';
  return mutations
    .map((m) => {
      const status = m.sim_contract_passed === true ? 'passed' : m.sim_contract_passed === false ? 'rejected' : 'unknown';
      return `- ${m.tool_name}: ${JSON.stringify(m.input)} [sim_contract: ${status}]`;
    })
    .join('\n');
}

function buildPrompt(task: Task, candidateOutput: string, rubric: RubricCriterion[], mutations: SceneMutation[]): string {
  const rubricBlock = rubric
    .map(
      (c, i) =>
        `${i + 1}. id=${c.id} required=${c.required}\n   ${c.description}`
    )
    .join('\n');
  const isSpatialPattern =
    task.id === 'M02' || task.id === 'M06' || task.id === 'M09' || task.id === 'A01' || task.id === 'A04' || task.id === 'A10';

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
    `SCENE MUTATIONS (tool calls executed by the candidate):`,
    formatMutations(mutations),
    ``,
    `For each rubric criterion, decide if the candidate output OR the scene mutations satisfy it.`,
    `Be strict: if information is ambiguous or absent from both the output text and the mutations, mark FAIL.`,
    ...(isSpatialPattern
      ? [
          `IMPORTANT: This is a spatial pattern task. The scene mutations contain the ground-truth object positions, colors, and sizes. If the mutations show objects with correct properties arranged correctly, mark PASS even if the text description is vague or incomplete. Trust the geometric data over prose.`,
        ]
      : []),
    `Submit your verdicts via the submit_verdicts tool — every criterion must have exactly one verdict.`,
  ].join('\n');
}

export async function judgeRun(
  task: Task,
  config: ConfigName,
  trial: number,
  candidateOutput: string,
  mutations: SceneMutation[],
  opts: JudgeOptions
): Promise<JudgeResult> {
  const model = opts.model ?? 'claude-opus-4-7';
  const maxAttempts = opts.maxAttempts ?? 2;
  const usage: TokenUsage = { input_tokens: 0, output_tokens: 0 };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await opts.client.messages.create({
        model,
        max_tokens: 4096,
        tools: [VERDICT_TOOL],
        tool_choice: { type: 'tool', name: 'submit_verdicts' },
        messages: [
          {
            role: 'user',
            content: buildPrompt(task, candidateOutput, task.evaluation_rubric, mutations),
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isCreditOrRateLimit =
        msg.includes('credit balance is too low') || msg.includes('Rate limit') || msg.includes('429');
      if (isCreditOrRateLimit && opts.ollamaClient) {
        // Fallback to Ollama judge on Anthropic credit/rate-limit failure.
        return judgeWithOllama(
          task,
          config,
          trial,
          candidateOutput,
          mutations,
          opts.ollamaClient,
          opts.ollamaClient['model'] as string
        );
      }
      if (attempt === maxAttempts) {
        return {
          verdicts: task.evaluation_rubric.map((c) => ({
            task_id: task.id,
            config,
            trial,
            criterion_id: c.id,
            passed: false,
            rationale: `judge error: ${msg}`,
          })),
          usage,
          parse_error: 'judge_error',
        };
      }
    }
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

async function judgeWithOllama(
  task: Task,
  config: ConfigName,
  trial: number,
  candidateOutput: string,
  mutations: SceneMutation[],
  ollamaClient: OllamaClient,
  model: string
): Promise<JudgeResult> {
  const usage: TokenUsage = { input_tokens: 0, output_tokens: 0 };
  const prompt = buildPrompt(task, candidateOutput, task.evaluation_rubric, mutations);
  const inputChars = prompt.length;

  const response = await ollamaClient.chat({
    messages: [
      {
        role: 'system',
        content:
          'You are an exacting evaluator. For each rubric criterion, decide PASS or FAIL. Be strict: if information is ambiguous or absent from both output text and mutations, mark FAIL. Return ONLY a JSON object with a "verdicts" array.',
      },
      { role: 'user', content: prompt },
    ],
    tools: [VERDICT_TOOL_OLLAMA],
    tool_choice: { type: 'function', function: { name: 'submit_verdicts' } },
    max_tokens: 4096,
    temperature: 0,
  });

  usage.input_tokens = ollamaClient.estimateTokens(inputChars);
  usage.output_tokens =
    response.usage?.completion_tokens ?? ollamaClient.estimateTokens(JSON.stringify(response).length);

  const choice = response.choices[0];
  const toolCalls = choice?.message?.tool_calls;
  const tc = toolCalls?.find((t) => t.function.name === 'submit_verdicts');

  if (!tc) {
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

  let submitted: Array<{ criterion_id: string; passed: boolean; rationale: string }> = [];
  try {
    const parsed = JSON.parse(tc.function.arguments) as {
      verdicts?: Array<{ criterion_id: string; passed: boolean; rationale: string }>;
    };
    submitted = parsed.verdicts ?? [];
  } catch {
    return {
      verdicts: task.evaluation_rubric.map((c) => ({
        task_id: task.id,
        config,
        trial,
        criterion_id: c.id,
        passed: false,
        rationale: 'judge JSON parse error',
      })),
      usage,
      parse_error: 'json_parse_error',
    };
  }

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

export function isCompleted(verdicts: RubricVerdict[], rubric: RubricCriterion[]): boolean {
  for (const c of rubric) {
    if (!c.required) continue;
    const v = verdicts.find((x) => x.criterion_id === c.id);
    if (!v || !v.passed) return false;
  }
  return true;
}
