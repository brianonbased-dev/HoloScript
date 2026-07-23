import type {
  LLMCompletionRequest,
  LLMCompletionResponse,
  TokenUsage,
} from '@holoscript/llm-provider';

const ARTIFACT_LIMIT = 4000;
const REASON_LIMIT = 300;
const VERDICT_PATTERN = /(?:^|\r?\n)VERDICT:\s*(PASS|FAIL)[ \t]*(?:\r?\n)?$/i;

/**
 * Narrow evaluator contract for deterministic tests and sovereign/local
 * inference adapters. Every ILLMProvider satisfies this structural seam.
 */
export interface ReflectEvaluator {
  complete(
    request: LLMCompletionRequest,
    model?: string
  ): Promise<Pick<LLMCompletionResponse, 'content' | 'usage'>>;
}

export interface ReflectGateInput {
  criteria: string;
  artifact: string;
  evaluator: ReflectEvaluator;
  model?: string;
  /**
   * Authored local-first policy. Any non-PASS result escalates only when this
   * is true; advisory gates still expose FAIL/unparseable results honestly.
   */
  escalateOnFail?: boolean;
}

export interface ReflectGateResult {
  pass: boolean;
  parsed: boolean;
  verdict: 'pass' | 'fail' | 'unparseable';
  reason: string;
  shouldEscalate: boolean;
  /** Fold this into the caller's aggregate usage exactly once. */
  usage: TokenUsage;
}

export type ParsedReflectVerdict = Pick<
  ReflectGateResult,
  'pass' | 'parsed' | 'verdict' | 'reason'
>;

/** Parse the stable textual verdict contract without invoking a provider. */
export function parseReflectVerdict(content: string): ParsedReflectVerdict {
  const match = VERDICT_PATTERN.exec(content);
  const verdict = match?.[1].toUpperCase();

  return {
    // Only an explicit, machine-readable PASS is evidence that the gate
    // passed. Advisory callers may continue without escalation, but malformed
    // output must never be represented as a successful review.
    pass: verdict === 'PASS',
    parsed: verdict === 'PASS' || verdict === 'FAIL',
    verdict: verdict === 'PASS' ? 'pass' : verdict === 'FAIL' ? 'fail' : 'unparseable',
    reason: content.replace(VERDICT_PATTERN, '').trim().slice(0, REASON_LIMIT),
  };
}

/** Build the provider-neutral request used by both AgentRunner and test gates. */
export function buildReflectRequest(criteria: string, artifact: string): LLMCompletionRequest {
  return {
    messages: [
      {
        role: 'system',
        content:
          'You are a strict reviewer. Evaluate the work against the criteria; do not rewrite it.',
      },
      {
        role: 'user',
        content:
          `Reflect on the artifact produced for this task. Evaluate it for: ${criteria}.\n\n` +
          `--- artifact / final response ---\n${artifact.slice(0, ARTIFACT_LIMIT)}\n--- end ---\n\n` +
          `Give a one-line reason, then end with exactly "VERDICT: PASS" or "VERDICT: FAIL".`,
      },
    ],
    maxTokens: 512,
    temperature: 0.1,
  };
}

/**
 * Run one post-artifact reflect evaluation.
 *
 * Provider failures intentionally propagate so AgentRunner can preserve its
 * existing best-effort `reflect-error` behavior without recording phantom
 * token usage.
 */
export async function evaluateReflectGate(input: ReflectGateInput): Promise<ReflectGateResult> {
  const response = await input.evaluator.complete(
    buildReflectRequest(input.criteria, input.artifact),
    input.model
  );
  const parsed = parseReflectVerdict(response.content);

  return {
    ...parsed,
    shouldEscalate: !parsed.pass && input.escalateOnFail === true,
    usage: response.usage,
  };
}
