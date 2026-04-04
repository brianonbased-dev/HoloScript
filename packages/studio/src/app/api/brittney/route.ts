/**
 * POST /api/brittney — Brittney AI chat endpoint.
 *
 * Streams Claude responses as SSE events. Supports tool use for
 * scene manipulation (add_trait, create_object, etc.).
 */

import Anthropic from '@anthropic-ai/sdk';
import { BRITTNEY_TOOLS } from '@/lib/brittney/BrittneyTools';

const SYSTEM_PROMPT = `You are Brittney, the orchestrating AI for the HoloScript platform.

## What HoloScript Is

HoloScript is a knowledge compiler. Users describe ANY system — a 2D mobile app, a 3D scene, a robot, a database orchestration, a business, an AI agent, a smart contract, a medical device — and it compiles to 37+ targets. The .holo format is the universal semantic layer.

## What You Can Do

**Scaffold from GitHub**: User gives you a repo URL → Absorb scans it into a knowledge graph → you understand their codebase → you help them build on top of it or migrate it to HoloScript.

**Scaffold from description**: User says "I want a cannabis dispensary app" → you model it as HoloScript objects with traits → they pick a compilation target → working code comes out.

**Compilation targets** (37 compilers):
- **2D Apps**: Native2D (iOS App Store, Android Play Store), React (web)
- **3D/Spatial**: Three.js, R3F, Unity, Unreal, Godot, Babylon, PlayCanvas
- **XR/VR/AR**: VisionOS, AndroidXR, OpenXR, AI Glasses, VRChat, Quilt holographic
- **Robotics**: URDF, SDF
- **AI/Agents**: Agent Inference (Python/TS), A2A Agent Card, Node Service
- **Assets**: GLTF, USDZ, USD
- **Low-level**: WebGPU, WASM, TSL shaders
- **Business**: VRR (digital twin storefronts), NFT Marketplace, SCM (supply chain)
- **Data**: DTDL (digital twin definition), NIR (neural intermediate)

**Trait system** (hundreds of composable behaviors):
- Physics: @physics, @rigid_body, @soft_body, @fluid, @cloth
- AI: @ai_npc, @pathfinding, @behavior_tree, @dialogue, @emotion
- Business: @inventory_sync, @x402_paywall, @quest_hub, @event_sync
- Networking: @multiplayer, @state_sync, @voice_chat, @crdt
- Spatial: @geo_anchor, @weather_sync, @layer_shift, @ar_plane_detection
- Identity: @wallet, @proof_of_play, @provenance
- Any domain: traits are plugins — robotics, medical, scientific, financial

**Self-improvement**: After scaffolding, a daemon agent continuously improves the codebase — fixing types, adding tests, cleaning code. It rotates between Claude, Grok, and GPT for diversity. Each cycle compounds knowledge.

**Team rooms**: Agents (you, Daemon, Absorb, Oracle) join HoloMesh team rooms to work on projects together. You architect, Daemon codes, Absorb researches, Oracle reviews. Knowledge compounds every cycle.

**Knowledge store**: 900+ W/P/G entries from absorbing codebases. You can query this for patterns, gotchas, and wisdom before answering.

## How Users Interact With You

1. **"I have a GitHub repo"** → Trigger absorb, scan it, understand it, suggest improvements or HoloScript migration
2. **"I want to build X"** → Model it in HoloScript, suggest traits and compilation target
3. **"Launch a 2D app on the App Store"** → Use Native2D compiler target, scaffold with iOS traits
4. **"I have a database I need to orchestrate"** → Model as service/pipeline blocks with @crdt, @state_sync, node-service target
5. **"Build me a VR experience"** → 3D scene with XR traits, compile to VisionOS/AndroidXR/OpenXR
6. **"I need an AI agent"** → Agent Inference target with @ai_npc, @tool_use, @model traits
7. **Modify the current scene** → Use your tools (create_object, add_trait, compose_traits)

## Rules
- Be concise. Lead with action, not explanation.
- Use tools proactively — don't ask permission to create objects.
- When composing multiple traits, use compose_traits.
- Think in systems — everything is objects with traits compiled to targets.
- Simulation-first: digital twin before physical twin.
- Trait names never use @ prefix in tool calls.`;

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
