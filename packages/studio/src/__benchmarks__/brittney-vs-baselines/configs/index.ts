import Anthropic from '@anthropic-ai/sdk';
import type { ConfigName, ConfigRunner } from '../types';
import { makeBrittneyProd } from './brittney-prod';
import { makeClaudeCodeBaseline } from './claude-code-baseline';
import { makeCursorBaseline } from './cursor-baseline';
import { makeVanillaBaseline } from './vanilla-baseline';

export interface BuildConfigsOptions {
  anthropicApiKey: string;
  brittneyEndpoint: string;
  brittneyAuthHeader?: string;
  brittneyCookie?: string;
  brittneyBenchmarkKey?: string;
}

const BENCHMARK_SYSTEM_PROMPT = `You are Brittney, a 3D scene construction assistant. You are being evaluated on a benchmark that tests your ability to create 3D scenes accurately.

CRITICAL RULES:
1. When given a scene description, you MUST create EVERY object mentioned using the create_object tool.
2. Do NOT just describe objects in text — each and every object must be instantiated via a tool call.
3. Be thorough: count the objects required and create all of them.
4. Use precise positions, sizes, colors, and properties as specified in the prompt.
5. Prefer creating all objects in a single turn if possible, or continue with additional tool calls until the scene is complete.
6. The benchmark judge evaluates the actual scene objects you create, not your text description.

SPATIAL PRECISION:
- Always specify exact numeric values for positions, dimensions, and radii. Use at least 2 decimal places.
- Stack objects by center positions, not by edge positions (e.g., two 1x1x1 cubes stacked vertically have centers at y=0.5 and y=1.5).
- For grid or checkerboard patterns, create every tile individually with explicit coordinates.
- Ensure objects that should touch have centers offset by exactly the sum of their touching radii or half-dimensions.`;

export function buildAllConfigs(opts: BuildConfigsOptions): ConfigRunner[] {
  const client = new Anthropic({ apiKey: opts.anthropicApiKey });
  return [
    makeBrittneyProd({
      endpoint: opts.brittneyEndpoint,
      authHeader: opts.brittneyAuthHeader,
      cookie: opts.brittneyCookie,
      benchmarkKey: opts.brittneyBenchmarkKey,
      systemPrompt: BENCHMARK_SYSTEM_PROMPT,
    }),
    makeCursorBaseline({ client }),
    makeClaudeCodeBaseline({ client }),
    makeVanillaBaseline({ client }),
  ];
}

export const ALL_CONFIG_NAMES: ConfigName[] = [
  'brittney-prod',
  'cursor-baseline',
  'claude-code-baseline',
  'vanilla-baseline',
];

export {
  makeBrittneyProd,
  makeCursorBaseline,
  makeClaudeCodeBaseline,
  makeVanillaBaseline,
};
