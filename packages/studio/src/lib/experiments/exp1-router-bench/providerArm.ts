/**
 * Live ArmModel adapter.
 *
 * Uses provider.complete() (one shot, returns content + token usage) rather than
 * the stream — the bench only needs the final mutation + token counts.
 *
 * GUARDRAIL: the provider must be passed in EXPLICITLY (Exp1Provider). There is no
 * silent fallback to the app's env-resolved provider — that path defaulted to a
 * paid frontier vendor (Anthropic) and contradicts the sovereign thesis. The
 * caller (run.ts) supplies a local sovereign provider by default; a frontier
 * baseline is an explicit opt-in there.
 *
 * No unit test for the live call (needs a running model). Typechecked against
 * @holoscript/llm-provider; the live run happens via run.ts.
 */

import { parseMutation } from './parseMutation';
import { assembleArmPrompt, EXP1_SYSTEM_PROMPT } from './promptAssembly';
import type { Exp1Provider } from './exp1Provider';
import type { ArmModel, ArmModelResult, BenchTask } from './types';

export interface ProviderArmOptions {
  /** REQUIRED: the explicitly-resolved provider this arm runs on (local by default). */
  resolved: Exp1Provider;
  /** Arm C: offload context (HoloGraph/GOLD retrieval) injected into the prompt. */
  retrieval?: (task: BenchTask) => string | undefined;
  /** Override the system prompt (default EXP1_SYSTEM_PROMPT). */
  systemPrompt?: string;
  /** Override maxTokens (default: the resolved provider's maxTokens). */
  maxTokens?: number;
}

/**
 * Build a live ArmModel bound to an EXPLICIT provider. The arm re-assembles the
 * full prompt from (task, arm, retrieval) — the `prompt` argument the runner
 * passes (the rendered instruction) is subsumed by the richer assembly, which
 * also needs the scene, tool schema, and offload.
 */
export function makeProviderArm(opts: ProviderArmOptions): ArmModel {
  const { resolved } = opts;
  const system = opts.systemPrompt ?? EXP1_SYSTEM_PROMPT;
  const maxTokens = opts.maxTokens ?? resolved.maxTokens;

  return async (_prompt: string, { task, arm }): Promise<ArmModelResult> => {
    const retrieval = opts.retrieval?.(task);
    const userPrompt = assembleArmPrompt(task, arm, retrieval);

    const resp = await resolved.provider.complete(
      {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
        maxTokens,
        temperature: 0,
      },
      resolved.model
    );

    return {
      rawOutput: resp.content,
      mutation: parseMutation(resp.content),
      inputTokens: resp.usage.promptTokens,
      outputTokens: resp.usage.completionTokens,
    };
  };
}
