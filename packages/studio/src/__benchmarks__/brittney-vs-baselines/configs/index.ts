import Anthropic from '@anthropic-ai/sdk';
import type { ConfigName, ConfigRunner } from '../types';
import { makeBrittneyProd } from './brittney-prod';
import { makeClaudeCodeBaseline } from './claude-code-baseline';
import { makeCursorBaseline } from './cursor-baseline';
import { makeVanillaBaseline } from './vanilla-baseline';
import { makeOllamaBaseline } from './ollama-baseline';

export interface BuildConfigsOptions {
  anthropicApiKey: string;
  brittneyEndpoint: string;
  brittneyAuthHeader?: string;
  brittneyCookie?: string;
  brittneyBenchmarkKey?: string;
  ollamaApiKey?: string;
  ollamaModel?: string;
  ollamaBaseURL?: string;
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
- Ensure objects that should touch have centers offset by exactly the sum of their touching radii or half-dimensions.

GEOMETRIC FORMULAS — apply these when the task matches:
- Tangent circles/cylinders: center_distance = radius1 + radius2. Place second center at (r1+r2, 0, 0) from first.
- Grid layout: position = start + (index * spacing). Count items carefully.
- Stacked objects: next_center_y = prev_center_y + (prev_height/2 + next_height/2).
- Chessboard / checkerboard: tiles at (col + 0.5, 0, row + 0.5) for unit squares. Alternate colors by (row+col) % 2.
- Parking lot: spaces at (col * space_width, 0, row * space_depth). Cars sit centered inside their assigned space.
- Maze walls: place walls ON cell edges. A 5x5 grid has cells from (0,0) to (4,4). Verify there is exactly one path from start to goal.

FEW-SHOT EXAMPLES (use these patterns):

Example A10 — tangent gears:
create_object(name=\"LargeGear\", primitive=\"cylinder\", position=[0,0,0], radius=1.0, scale=[1,0.2,1], color=\"silver\")
create_object(name=\"SmallGear\", primitive=\"cylinder\", position=[1.4,0,0], radius=0.4, scale=[1,0.2,1], color=\"silver\")
// Teeth: 8 cubes around each gear rim at distance = radius from gear center

Example A09 — chessboard + pawns:
// 64 tiles at (col+0.5, 0, row+0.5), color = (row+col)%2==0 ? \"white\" : \"black\"
// 8 white pawns at (file+0.5, 0.25, 1.5) — row index 1, one per file
// 8 black pawns at (file+0.5, 0.25, 6.5) — row index 6, one per file

VERIFICATION STEP — before finishing, mentally verify:
- A10: dist(large_gear, small_gear) == 1.0 + 0.4 ?
- A09: 64 tiles + 8 white + 8 black pawns = 80 objects total?
- A04: Start (0,0) connects to Goal (4,4) through exactly one path?
- A08: 3 cars, each centered in a distinct 2.5x5m space?`

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
    ...(opts.ollamaApiKey
      ? [
          makeOllamaBaseline({
            apiKey: opts.ollamaApiKey,
            model: opts.ollamaModel,
            baseURL: opts.ollamaBaseURL,
          }),
        ]
      : []),
  ];
}

export const ALL_CONFIG_NAMES: ConfigName[] = [
  'brittney-prod',
  'cursor-baseline',
  'claude-code-baseline',
  'vanilla-baseline',
  'ollama-baseline',
];

export {
  makeBrittneyProd,
  makeCursorBaseline,
  makeClaudeCodeBaseline,
  makeVanillaBaseline,
};
