// STATUS: Scaffold — requires absorb service connection and LLM provider for production use
/**
 * PromptOptimizer — A/B test prompts to find the most effective phrasing.
 *
 * @experimental
 *
 * Part of FW-1.0 self-evolution: the framework optimizes its own prompts
 * by running controlled experiments and measuring quality metrics.
 */

import { callLLM } from '../llm/llm-adapter';
import type { ModelConfig } from '../types';

export interface ABTestConfig {
  /** LLM model configuration for running the test */
  model: ModelConfig;
  /** Number of runs per prompt variant (default: 3) */
  runs?: number;
  /** Evaluation criteria (default: quality + relevance) */
  criteria?: EvaluationCriteria[];
  /** Maximum tokens per response */
  maxTokens?: number;
  /** Temperature for test runs */
  temperature?: number;
}

export interface EvaluationCriteria {
  name: string;
  description: string;
  weight: number;
}

export interface PromptVariantResult {
  prompt: string;
  responses: string[];
  avgScore: number;
  scores: number[];
  avgTokens: number;
  avgLatencyMs: number;
}

export interface ABTestResult {
  /** The task/question both prompts were tested against */
  task: string;
  /** Results for prompt A */
  variantA: PromptVariantResult;
  /** Results for prompt B */
  variantB: PromptVariantResult;
  /** Which variant won ('A' | 'B' | 'tie') */
  winner: 'A' | 'B' | 'tie';
  /** Confidence in the result (0-1, based on score delta and consistency) */
  confidence: number;
  /** Total tokens consumed across all runs */
  totalTokens: number;
}

const DEFAULT_CRITERIA: EvaluationCriteria[] = [
  { name: 'relevance', description: 'How relevant is the response to the task?', weight: 0.4 },
  { name: 'quality', description: 'How well-structured and clear is the response?', weight: 0.3 },
  { name: 'completeness', description: 'Does the response fully address the task?', weight: 0.3 },
];

const JUDGE_SYSTEM = `You are a prompt quality evaluator. Score the following response on a scale of 1-10 for each criterion. Return ONLY a JSON object with scores, e.g.: {"relevance": 8, "quality": 7, "completeness": 9}`;

/**
 * PromptOptimizer — A/B tests prompt variants to find the best one.
 *
 * @experimental
 *
 * Usage:
 * ```ts
 * const optimizer = new PromptOptimizer({
 *   model: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' }
 * });
 * const result = await optimizer.abTest(
 *   'Explain HoloScript in one paragraph.',
 *   'You are a HoloScript expert. Explain HoloScript concisely.',
 *   'What is HoloScript?'
 * );
 * console.log(`Winner: ${result.winner} (confidence: ${result.confidence})`);
 * ```
 */
export class PromptOptimizer {
  private readonly config: ABTestConfig;

  constructor(config: ABTestConfig) {
    this.config = {
      runs: 3,
      criteria: DEFAULT_CRITERIA,
      maxTokens: 1024,
      temperature: 0.7,
      ...config,
    };
  }

  /**
   * Run an A/B test comparing two prompt variants on a given task.
   */
  async abTest(promptA: string, promptB: string, task: string): Promise<ABTestResult> {
    const runs = this.config.runs!;

    const [variantA, variantB] = await Promise.all([
      this.runVariant(promptA, task, runs),
      this.runVariant(promptB, task, runs),
    ]);

    const delta = variantA.avgScore - variantB.avgScore;
    const winner: 'A' | 'B' | 'tie' = Math.abs(delta) < 0.5 ? 'tie' : delta > 0 ? 'A' : 'B';

    // Confidence: based on score delta magnitude and low variance
    const varianceA = this.variance(variantA.scores);
    const varianceB = this.variance(variantB.scores);
    const avgVariance = (varianceA + varianceB) / 2;
    const confidence = Math.min(1, Math.abs(delta) / 3) * Math.max(0.3, 1 - avgVariance / 10);

    return {
      task,
      variantA,
      variantB,
      winner,
      confidence: Math.round(confidence * 100) / 100,
      totalTokens: variantA.avgTokens * runs + variantB.avgTokens * runs,
    };
  }

  /**
   * Run a single variant N times and evaluate.
   */
  private async runVariant(prompt: string, task: string, runs: number): Promise<PromptVariantResult> {
    const responses: string[] = [];
    const scores: number[] = [];
    let totalTokens = 0;
    let totalLatency = 0;

    for (let i = 0; i < runs; i++) {
      const start = Date.now();
      const response = await callLLM(this.config.model, [
        { role: 'system', content: prompt },
        { role: 'user', content: task },
      ], {
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });
      const latency = Date.now() - start;

      responses.push(response.content);
      totalTokens += response.tokensUsed ?? 0;
      totalLatency += latency;

      // Judge the response
      const score = await this.judge(response.content, task);
      scores.push(score);
    }

    return {
      prompt,
      responses,
      avgScore: scores.reduce((a, b) => a + b, 0) / scores.length,
      scores,
      avgTokens: totalTokens / runs,
      avgLatencyMs: totalLatency / runs,
    };
  }

  /**
   * Judge a response using the LLM as evaluator.
   * Returns a weighted score (0-10).
   */
  private async judge(response: string, task: string): Promise<number> {
    const criteria = this.config.criteria!;

    try {
      const judgeResponse = await callLLM(this.config.model, [
        { role: 'system', content: JUDGE_SYSTEM },
        {
          role: 'user',
          content: [
            `Task: ${task}`,
            `Response: ${response}`,
            `Criteria: ${criteria.map(c => `${c.name} (${c.description})`).join(', ')}`,
          ].join('\n'),
        },
      ], { maxTokens: 200, temperature: 0 });

      const parsed = JSON.parse(judgeResponse.content) as Record<string, number>;
      let weightedSum = 0;
      let totalWeight = 0;

      for (const c of criteria) {
        const score = parsed[c.name];
        if (typeof score === 'number' && score >= 1 && score <= 10) {
          weightedSum += score * c.weight;
          totalWeight += c.weight;
        }
      }

      return totalWeight > 0 ? weightedSum / totalWeight : 5;
    } catch {
      // If judge fails, return neutral score
      return 5;
    }
  }

  /**
   * Compute variance of a number array.
   */
  private variance(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  }
}
