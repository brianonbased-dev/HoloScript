import { OllamaClient } from '../lib/ollama-client';
import type { ConfigRunner, ConfigRunResult, SceneMutation, Task, TokenUsage } from '../types';

const SYSTEM_PROMPT = `You are a 3D scene assistant. Create objects using the create_object tool with correct properties. Be precise with positions, colors, and dimensions.

GEOMETRIC FORMULAS — apply these when the task matches:
- Tangent circles/cylinders: center_distance = radius1 + radius2. Place second center at (r1+r2, 0, 0) from first.
- Grid layout: position = start + (index * spacing). Count items carefully.
- Stacked objects: next_center_y = prev_center_y + (prev_height/2 + next_height/2).
- Chessboard / checkerboard: tiles at (col + 0.5, 0, row + 0.5) for unit squares. Alternate colors by (row+col) % 2.
- Parking lot: spaces at (col * space_width, 0, row * space_depth). Cars sit centered inside their assigned space.
- Maze walls: place walls ON cell edges. A 5x5 grid has cells from (0,0) to (4,4). Verify there is exactly one path from start to goal.

OUTPUT RULES:
- Do NOT output reasoning, thinking, or explanation text.
- Use your reasoning silently, then emit ONLY tool_calls.
- Every object in the scene description MUST become a create_object tool call.

VERIFICATION STEP — before finishing, mentally verify spatial relationships are correct.`;

const SCENE_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'create_object',
      description:
        'Add a new object to the scene. Supports position, rotation, scale, geometry (primitive, radius, major/minor radius for torus), material (color), light type, camera projection, light direction, and camera look-at target.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Display name for the object' },
          type: {
            type: 'string',
            enum: ['mesh', 'light', 'camera', 'audio', 'group', 'splat'],
            description: 'Object type',
          },
          position: {
            type: 'array',
            items: { type: 'number' },
            description: '[x, y, z] position in world space',
          },
          primitive: {
            type: 'string',
            enum: ['cube', 'sphere', 'cylinder', 'plane', 'cone', 'torus'],
            description: 'Geometric primitive (only for mesh objects)',
          },
          color: {
            type: 'string',
            description: 'Color as CSS name or hex string',
          },
          scale: {
            type: 'array',
            items: { type: 'number' },
            description: '[x, y, z] scale factors',
          },
          rotation: {
            type: 'array',
            items: { type: 'number' },
            description: '[x, y, z] Euler rotation in radians',
          },
          direction: {
            type: 'array',
            items: { type: 'number' },
            description: '[x, y, z] direction vector for lights',
          },
          look_at: {
            type: 'array',
            items: { type: 'number' },
            description: '[x, y, z] target position for cameras',
          },
          radius: {
            type: 'number',
            description: 'Radius for sphere/cylinder/cone',
          },
          major_radius: {
            type: 'number',
            description: 'Major radius for torus',
          },
          minor_radius: {
            type: 'number',
            description: 'Minor radius for torus',
          },
          light_type: {
            type: 'string',
            enum: ['directional', 'point', 'spot'],
            description: 'Light type (only for light objects)',
          },
          projection: {
            type: 'string',
            enum: ['perspective', 'orthographic'],
            description: 'Camera projection type (only for camera objects)',
          },
        },
        required: ['name', 'type'],
      },
    },
  },
];

export interface OllamaBaselineOptions {
  apiKey: string;
  model?: string;
  baseURL?: string;
}

export function makeOllamaBaseline(opts: OllamaBaselineOptions): ConfigRunner {
  const client = new OllamaClient({
    apiKey: opts.apiKey,
    model: opts.model ?? 'qwen3.5:397b',
    baseURL: opts.baseURL,
  });

  return {
    name: 'ollama-baseline',
    perRunTimeoutMs: 240_000,
    async run(task: Task, signal: AbortSignal): Promise<ConfigRunResult> {
      if (signal.aborted) {
        return {
          output_text: '',
          tool_rounds: 0,
          usage: { input_tokens: 0, output_tokens: 0 },
          model_id: client as unknown as string,
          scene_mutations: [],
          error: 'aborted',
        };
      }

      try {
        const response = await client.chat({
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: task.prompt },
          ],
          tools: SCENE_TOOLS,
          tool_choice: 'auto',
          max_tokens: 8192,
          temperature: 0.2,
          signal,
          extra: { enable_thinking: false },
        });

        const choice = response.choices[0];
        const message = choice?.message;
        const usage: TokenUsage = {
          input_tokens: response.usage?.prompt_tokens ?? 0,
          output_tokens: response.usage?.completion_tokens ?? 0,
        };

        const outputText = message?.content ?? '';
        const mutations: SceneMutation[] = [];

        if (message?.tool_calls) {
          for (const tc of message.tool_calls) {
            if (tc.function.name === 'create_object') {
              let args: Record<string, unknown>;
              try {
                args = JSON.parse(tc.function.arguments);
              } catch {
                args = {};
              }
              mutations.push({
                tool_name: tc.function.name,
                input: args,
                sim_contract_passed: null,
              });
            }
          }
        }

        return {
          output_text: outputText,
          tool_rounds: message?.tool_calls ? 1 : 0,
          usage,
          model_id: response.model,
          scene_mutations: mutations,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          output_text: '',
          tool_rounds: 0,
          usage: { input_tokens: 0, output_tokens: 0 },
          model_id: 'ollama-error',
          scene_mutations: [],
          error: msg,
        };
      }
    },
  };
}
