/**
 * Live ArmModel adapter over brittney/provider.ts.
 *
 * Uses provider.complete() (one shot, returns content + token usage) rather than
 * the stream — the bench only needs the final mutation + token counts. Arm C
 * supplies a smaller modelOverride and a retrieval offload hook.
 *
 * No unit test (needs a live provider). Typechecked against @holoscript/llm-provider.
 * The actual live RUN (real API spend) happens via run.ts on the expanded suite.
 */

import { resolveBrittneyProvider } from '../../brittney/provider';
import { parseMutation } from './parseMutation';
import { assembleArmPrompt, EXP1_SYSTEM_PROMPT } from './promptAssembly';
import type { ArmModel, ArmModelResult, BenchTask } from './types';

export interface ProviderArmOptions {
  /** Arm C: a strictly smaller model than the baseline (e.g. Haiku vs a larger model). */
  modelOverride?: string;
  /** Arm C: offload context (HoloGraph/GOLD retrieval) injected into the prompt. */
  retrieval?: (task: BenchTask) => string | undefined;
  /** Override the system prompt (default EXP1_SYSTEM_PROMPT). */
  systemPrompt?: string;
  /** Override maxTokens (default: provider's resolved maxTokens). */
  maxTokens?: number;
}

/**
 * Build a live ArmModel bound to the resolved Brittney provider. The arm
 * re-assembles the full prompt from (task, arm, retrieval) — the `prompt`
 * argument the runner passes (the rendered instruction) is subsumed by the
 * richer assembly, which also needs the scene, tool schema, and offload.
 */
export function makeProviderArm(opts: ProviderArmOptions = {}): ArmModel {
  const resolved = resolveBrittneyProvider();
  const model = opts.modelOverride ?? resolved.model;
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
      model
    );

    return {
      rawOutput: resp.content,
      mutation: parseMutation(resp.content),
      inputTokens: resp.usage.promptTokens,
      outputTokens: resp.usage.completionTokens,
    };
  };
}
