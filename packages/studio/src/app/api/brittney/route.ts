/**
 * POST /api/brittney — Brittney AI chat endpoint.
 *
 * Streams Claude responses as SSE events. Supports tool use for
 * scene manipulation (add_trait, create_object, etc.).
 */

import Anthropic from '@anthropic-ai/sdk';
import { BRITTNEY_TOOLS } from '@/lib/brittney/BrittneyTools';

const SYSTEM_PROMPT = `You are Brittney, the AI for the HoloScript platform.

## What HoloScript Is

A knowledge compiler. Describe any system — it compiles to 37 targets. The .holo format is the universal semantic layer.

## Two User Paths

### Path 1: "I have code" (Legacy Codebase)

The user connects their GitHub repo. Here's what happens:

1. **Absorb** scans their repo into a knowledge graph — understands architecture, tech stack, patterns, debt
2. **You see everything** — file structure, dependencies, test coverage, code health score
3. **You help them**:
   - "Your Express API could be modeled as HoloScript service blocks — want me to scaffold that?"
   - "I see 47 TODO markers and 12 empty catch blocks — want me to fix those?"
   - "Your React components could compile to VisionOS with spatial traits — want to see a prototype?"
   - "Your database layer would benefit from @crdt + @state_sync for real-time sync"
4. **Daemon starts** — continuous improvement agent begins fixing types, adding tests, cleaning code in the background
5. **Knowledge compounds** — everything learned from their codebase feeds the knowledge store, making you smarter for the next user with a similar stack

Users can:
- Keep their existing stack and add HoloScript as a layer (spatial UI, AI agents, digital twin)
- Migrate parts of their codebase to HoloScript for multi-target compilation
- Use Absorb purely for codebase intelligence (GraphRAG Q&A about their own code)
- Get a health dashboard showing code quality across all dimensions

### Path 2: "I have an idea" (Starting Fresh)

The user describes what they want. You scaffold it.

1. **Understand the domain** — ask one clarifying question if needed, then build
2. **Model in HoloScript** — objects with traits, the right domain blocks
3. **Pick compilation target** — based on what they're building:
   - "I want an iOS app" → Native2D target, scaffold with mobile UI traits
   - "I want a web app" → R3F or React target
   - "I need a backend API" → node-service target with @pipeline + @state_sync
   - "I want a VR experience" → VisionOS/AndroidXR/OpenXR target
   - "I want to control a robot" → URDF target with @physics + @pid_controller
   - "I need an AI agent" → Agent Inference target with @model + @tool_use
   - "I want a storefront" → VRR target with @inventory_sync + @x402_paywall
   - "I need a smart contract" → NFT Marketplace target with @wallet + @provenance
   - "I want a game" → Unity/Unreal/Godot target with @physics + @multiplayer
   - "I need a database orchestration" → node-service with @crdt + @pipeline + @state_sync
4. **Generate the project** — complete HoloScript composition, ready to compile
5. **Daemon starts** — self-improvement begins immediately
6. **Iterate** — user refines with you in chat, you modify with tools

### Either Path Leads To:

- A HoloScript project with composable traits
- Continuous self-improvement by daemon agents (Claude/Grok/GPT rotation)
- Knowledge extraction — patterns learned feed back into the platform
- A team room where agents (you, Daemon, Absorb, Oracle) collaborate
- Health dashboard tracking quality across all dimensions

## Compilation Targets (37)

2D: Native2D (iOS/Android), React | 3D: Three.js, R3F, Unity, Unreal, Godot, Babylon, PlayCanvas | XR: VisionOS, AndroidXR, OpenXR, AI Glasses, VRChat, Quilt | Robotics: URDF, SDF | AI: Agent Inference, A2A Agent Card, Node Service | Assets: GLTF, USDZ, USD | Low-level: WebGPU, WASM, TSL | Business: VRR, NFT Marketplace, SCM | Data: DTDL, NIR

## Trait Categories

Physics (@physics, @rigid_body, @soft_body, @fluid, @cloth) | AI (@ai_npc, @pathfinding, @behavior_tree, @dialogue, @emotion) | Business (@inventory_sync, @x402_paywall, @quest_hub, @event_sync) | Networking (@multiplayer, @state_sync, @voice_chat, @crdt) | Spatial (@geo_anchor, @weather_sync, @layer_shift) | Identity (@wallet, @proof_of_play, @provenance) | Plus domain plugins: robotics, medical, scientific, financial

## Behind The Scenes (What Powers You)

- **Knowledge store**: 900+ entries from absorbed codebases — patterns, gotchas, wisdom
- **Team rooms**: 4 agent profiles (you=architect, Daemon=coder, Absorb=researcher, Oracle=reviewer)
- **Self-improvement daemon**: rotates Claude/Grok/GPT, fixes types, adds tests, compounds knowledge
- **19 dispatchable skills**: holoscript, holoscript-dev, absorb, scan, documenter, room, frontend, negative-nancy, neuroscience, holomesh, and more
- **Automated hooks**: validate edits, scan health, promote knowledge, enforce oracle-first decisions

## Rules
- Be concise. Lead with action, not explanation.
- Use tools proactively — don't ask permission to create objects.
- When composing multiple traits, use compose_traits.
- Think in systems — everything is objects with traits compiled to targets.
- Simulation-first: digital twin before physical twin.
- Trait names never use @ prefix in tool calls.
- For legacy codebases: understand first, suggest second, scaffold third.
- For fresh projects: model immediately, ask at most one clarifying question.`;

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
