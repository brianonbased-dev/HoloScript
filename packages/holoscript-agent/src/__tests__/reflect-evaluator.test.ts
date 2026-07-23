import type {
  LLMCompletionRequest,
  LLMCompletionResponse,
  TokenUsage,
} from '@holoscript/llm-provider';
import { describe, expect, it, vi } from 'vitest';
import { evaluateReflectGate, type ReflectEvaluator } from '../reflect-evaluator.js';

const USAGE: TokenUsage = {
  promptTokens: 13,
  completionTokens: 5,
  totalTokens: 18,
};

function evaluatorWith(content: string): {
  evaluator: ReflectEvaluator;
  complete: ReturnType<typeof vi.fn>;
} {
  const complete = vi.fn(
    async (
      _request: LLMCompletionRequest,
      _model?: string
    ): Promise<Pick<LLMCompletionResponse, 'content' | 'usage'>> => ({
      content,
      usage: USAGE,
    })
  );
  return { evaluator: { complete }, complete };
}

describe('evaluateReflectGate', () => {
  it('returns a parsed PASS verdict and the evaluator usage for caller accounting', async () => {
    const { evaluator, complete } = evaluatorWith(
      'The artifact satisfies every declared criterion.\r\nVERDICT: PASS\r\n'
    );

    const result = await evaluateReflectGate({
      criteria: 'valid HoloScript and a green coverage gate',
      artifact: 'composition Example {}',
      evaluator,
      model: 'owned-model',
      escalateOnFail: true,
    });

    expect(result).toEqual({
      pass: true,
      parsed: true,
      verdict: 'pass',
      reason: 'The artifact satisfies every declared criterion.',
      shouldEscalate: false,
      usage: USAGE,
    });
    expect(complete).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0]?.[1]).toBe('owned-model');
    expect(complete.mock.calls[0]?.[0]).toMatchObject({
      maxTokens: 512,
      temperature: 0.1,
    });
  });

  it('returns a parsed FAIL verdict and derives escalation from the authored policy', async () => {
    const { evaluator } = evaluatorWith('The artifact violates the declared frame.\nVERDICT: FAIL');

    const result = await evaluateReflectGate({
      criteria: 'stay inside the declared frame',
      artifact: 'tool_call("treasury")',
      evaluator,
      escalateOnFail: true,
    });

    expect(result.pass).toBe(false);
    expect(result.parsed).toBe(true);
    expect(result.verdict).toBe('fail');
    expect(result.shouldEscalate).toBe(true);
    expect(result.reason).toBe('The artifact violates the declared frame.');
    expect(result.usage).toEqual(USAGE);
  });

  it('fails closed and escalates an unparseable verdict when the brain requires escalation', async () => {
    const artifact = `prefix-${'x'.repeat(5000)}`;
    const { evaluator, complete } = evaluatorWith('Looks acceptable, ship it.');

    const result = await evaluateReflectGate({
      criteria: 'deterministic output',
      artifact,
      evaluator,
      escalateOnFail: true,
    });

    expect(result).toEqual({
      pass: false,
      parsed: false,
      verdict: 'unparseable',
      reason: 'Looks acceptable, ship it.',
      shouldEscalate: true,
      usage: USAGE,
    });
    const request = complete.mock.calls[0]?.[0] as LLMCompletionRequest;
    const userPrompt = request.messages.find((message) => message.role === 'user')?.content;
    expect(userPrompt).toContain(artifact.slice(0, 4000));
    expect(userPrompt).not.toContain(artifact.slice(0, 4001));
  });

  it('reports an unparseable advisory verdict honestly without forcing escalation', async () => {
    const { evaluator } = evaluatorWith('No machine-readable verdict was returned.');

    const result = await evaluateReflectGate({
      criteria: 'deterministic output',
      artifact: 'composition Example {}',
      evaluator,
      escalateOnFail: false,
    });

    expect(result).toMatchObject({
      pass: false,
      parsed: false,
      verdict: 'unparseable',
      reason: 'No machine-readable verdict was returned.',
      shouldEscalate: false,
    });
  });

  it('rejects a PASS token that does not satisfy the final verdict-line contract', async () => {
    const { evaluator } = evaluatorWith(
      'VERDICT: PASS\nAdditional commentary after the verdict makes it malformed.'
    );

    const result = await evaluateReflectGate({
      criteria: 'machine-readable review',
      artifact: 'composition Example {}',
      evaluator,
      escalateOnFail: true,
    });

    expect(result).toMatchObject({
      pass: false,
      parsed: false,
      verdict: 'unparseable',
      shouldEscalate: true,
    });
  });
});
