/**
 * POST /api/brittney — Brittney AI chat endpoint.
 *
 * Streams Claude responses as SSE events. Supports tool use for
 * scene manipulation (add_trait, create_object, etc.).
 */

import Anthropic from '@anthropic-ai/sdk';
import { BRITTNEY_TOOLS } from '@/lib/brittney/BrittneyTools';

const SYSTEM_PROMPT = `You are Brittney, the AI assistant for HoloScript — the universal semantic platform.

HoloScript is NOT just for 3D scenes. The .holo format describes anything — scenes, APIs, robots, medical devices, smart contracts, digital twins, IoT systems, AI agents, dispensaries, games, spatial computing experiences, and more. It compiles to 24+ targets: Three.js, Unity, Unreal, USDZ, AndroidXR, VisionOS, WebGPU, WASM, Godot, URDF (robotics), Native 2D, Agent Inference, and others.

The architecture:
- Objects have traits (@physics, @ai_npc, @weather_sync, @x402_paywall, @inventory_sync, etc.)
- Traits are composable — stack them to create complex behavior from simple building blocks
- "Describe it, we compile it" — users describe what they want, you help them express it in HoloScript
- Simulation-first: digital twin before physical twin. Prove the concept before building it.

You help users by:
- Creating objects (mesh, light, camera, audio, group, splat — and any domain-specific type)
- Adding and composing traits to express behavior, physics, AI, payments, sync, networking
- Modifying trait properties to tune the experience
- Explaining how HoloScript connects different domains (a dispensary is objects + inventory_sync + x402_paywall + quest_hub)
- Suggesting compilation targets based on what the user is building

When the user asks you to modify the scene, use your tools. When they ask questions, respond conversationally. When they describe a business or system, help them model it in HoloScript.

Rules:
- Be concise. One sentence answers when possible.
- Use tools proactively — if user says "add a light", call create_object immediately.
- When composing multiple traits, use compose_traits instead of multiple add_trait calls.
- Position objects sensibly in 3D space (y=0 is ground, y>0 is up).
- Trait names never use the @ prefix in tool calls.
- Think beyond scenes — if someone describes a business, model it as objects with traits.`;

function convertToolsToClaudeFormat(): Anthropic.Tool[] {
  return BRITTNEY_TOOLS.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters as Anthropic.Tool['input_schema'],
  }));
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return sseResponse([
      { type: 'error', payload: 'ANTHROPIC_API_KEY not configured' },
      { type: 'done', payload: null },
    ]);
  }

  let body: { messages?: Array<{ role: string; content: string }>; sceneContext?: string };
  try {
    body = await request.json();
  } catch {
    return sseResponse([
      { type: 'error', payload: 'Invalid JSON body' },
      { type: 'done', payload: null },
    ]);
  }

  const { messages, sceneContext } = body;
  const client = new Anthropic({ apiKey });

  const claudeMessages: Anthropic.MessageParam[] = (messages ?? []).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  if (claudeMessages.length === 0) {
    return sseResponse([
      { type: 'error', payload: 'No messages provided' },
      { type: 'done', payload: null },
    ]);
  }

  const systemPrompt = sceneContext
    ? `${SYSTEM_PROMPT}\n\n--- Current Scene ---\n${sceneContext}`
    : SYSTEM_PROMPT;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: { type: string; payload: unknown }) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      try {
        // Accumulate tool use blocks during streaming
        let currentToolName = '';
        let currentToolInput = '';

        const response = await client.messages.create({
          model: process.env.BRITTNEY_MODEL || 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system: systemPrompt,
          messages: claudeMessages,
          tools: convertToolsToClaudeFormat(),
          stream: true,
        });

        for await (const event of response) {
          switch (event.type) {
            case 'content_block_start':
              if (event.content_block.type === 'tool_use') {
                currentToolName = event.content_block.name;
                currentToolInput = '';
              }
              break;

            case 'content_block_delta':
              if ('text' in event.delta && event.delta.text) {
                send({ type: 'text', payload: event.delta.text });
              }
              if ('partial_json' in event.delta && event.delta.partial_json) {
                currentToolInput += event.delta.partial_json;
              }
              break;

            case 'content_block_stop':
              if (currentToolName) {
                try {
                  const args = currentToolInput ? JSON.parse(currentToolInput) : {};
                  send({ type: 'tool_call', payload: { name: currentToolName, arguments: args } });
                } catch {
                  send({ type: 'tool_call', payload: { name: currentToolName, arguments: {} } });
                }
                currentToolName = '';
                currentToolInput = '';
              }
              break;
          }
        }

        send({ type: 'done', payload: null });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: 'error', payload: msg });
        send({ type: 'done', payload: null });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

function sseResponse(events: Array<{ type: string; payload: unknown }>): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(body, { headers: sseHeaders() });
}

function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  };
}
