export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limiter';
import { checkCredits, deductCredits } from '@/lib/creditGate';
import { validateHoloOutput, stripMarkdownFences } from '@/lib/brittney/holoValidator';
import { requireAuth } from '@/lib/api-auth';
import { corsHeaders } from '../_lib/cors';
import { readJsonBody } from '../_lib/body-size';

const MAX_REQUESTS_PER_MIN = 10;
// SEC-T03: cap untrusted prompt length before any LLM spend.
const MAX_PROMPT_CHARS = 4000;

const STARTER_TEMPLATES = [
  {
    id: 'city',
    label: 'Urban City',
    emoji: '🏙️',
    description: 'Downtown scene with towers, street lights, and ambient city fog',
  },
  {
    id: 'forest',
    label: 'Forest',
    emoji: '🌲',
    description: 'Dense woodland with morning mist, pine trees, and dappled sunlight',
  },
  {
    id: 'space-station',
    label: 'Space Station',
    emoji: '🛸',
    description: 'Orbital station with rotating solar panels, starfield, and sci-fi lighting',
  },
  {
    id: 'abstract',
    label: 'Abstract',
    emoji: '✨',
    description: 'Geometric minimalist art piece with particle effects and gradient lighting',
  },
  {
    id: 'vr-room',
    label: 'VR Room',
    emoji: '🥽',
    description: 'Comfortable XR space with floating UI panels, ambient glow, and spatial audio',
  },
  {
    id: 'game-level',
    label: 'Game Level',
    emoji: '🎮',
    description: 'Top-down platformer arena with physics-enabled platforms, torches, and enemies',
  },
];

export function GET() {
  return NextResponse.json({ templates: STARTER_TEMPLATES });
}

const GENERATE_SYSTEM = `You are a HoloScript code generator. Given a description of ANY system, generate valid HoloScript code (.holo format).

HoloScript compiles to 37 targets: 2D apps (iOS/Android), 3D (Three.js/Unity/Unreal/Godot), XR (VisionOS/AndroidXR/OpenXR), robotics (URDF/SDF), AI agents, smart contracts, digital twins, and more.

Syntax:
- composition "Name" { ... } — root container
- object "Name" { position: [x,y,z]  @trait { prop: value } }
- scene "Name" { ... } — spatial container
- service "Name" { ... } — backend service
- pipeline "Name" { ... } — data pipeline
- agent "Name" { ... } — AI agent
- Traits: @physics, @ai_npc, @inventory_sync, @x402_paywall, @weather_sync, @geo_anchor, @quest_hub, @state_sync, @crdt, @wallet, @pathfinding, @behavior_tree, @multiplayer, and hundreds more

Examples:
- 2D mobile app: composition with UI objects + @navigation + @state_sync, target: native-2d
- Database orchestration: service blocks with @crdt + @pipeline + @state_sync, target: node-service
- VR experience: scene with spatial objects + @physics + @multiplayer, target: visionos
- AI agent: agent block with @model + @tool_use + @memory, target: agent-inference
- Dispensary: objects with @inventory_sync + @x402_paywall + @quest_hub, target: vrr
- Robot: joints with @physics + @urdf_link + @pid_controller, target: urdf

Return ONLY the HoloScript code — no markdown fences, no explanation.`;

const MOCK_SCENE_TEMPLATE = `composition "CloudFallbackScene" {
  scene "Main" {
    object "Placeholder" {
      position: [0, 1, 0]
      @glowing { intensity: 0.6 }
    }
  }
}`;

export async function POST(request: NextRequest) {
  // SEC-T03: require auth on every paid-LLM route. Rate-limit + credit gates
  // are kept below for defense in depth.
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const limit = rateLimit(
    request,
    { max: MAX_REQUESTS_PER_MIN, label: 'Rate limit exceeded' },
    'generate'
  );
  if (!limit.ok) {
    return limit.response;
  }

  const headers = {
    'x-llm-provider': 'server',
    'X-RateLimit-Limit': String(MAX_REQUESTS_PER_MIN),
    'X-RateLimit-Remaining': String(limit.remaining),
  };

  // Credit gate — must pass before any LLM call
  const gate = await checkCredits(request, 'studio_generate');
  if (gate.error) return gate.error;

  // SEC-T17: cap body bytes. Prompt is internally capped at MAX_PROMPT_CHARS
  // (4KB); 32KB body budget leaves ample JSON/existingCode headroom.
  const parsed = await readJsonBody<{ prompt?: unknown; existingCode?: unknown }>(
    request,
    { maxBytes: 32_000 }
  );
  if (!parsed.ok) {
    return NextResponse.json(
      { success: false, code: '', error: parsed.error },
      { status: parsed.status, headers }
    );
  }

  try {
    const body = parsed.body;
    const { prompt, existingCode } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { success: false, code: '', error: 'Prompt is required' },
        { status: 400 }
      );
    }

    if (prompt.length > MAX_PROMPT_CHARS) {
      return NextResponse.json(
        { success: false, code: '', error: `Prompt exceeds ${MAX_PROMPT_CHARS} chars` },
        { status: 400 }
      );
    }

    let userPrompt = prompt;
    if (existingCode) {
      userPrompt = `Here is the current HoloScript scene:\n\n${existingCode}\n\nModify it according to this instruction: ${prompt}\n\nReturn the COMPLETE updated HoloScript code.`;
    } else {
      userPrompt = `Generate a HoloScript scene for: ${prompt}`;
    }

    // Cloud-first provider rotation: OpenRouter → Anthropic → OpenAI.
    // Optional local fallback: Ollama (if configured).
    const generated =
      (await tryCloudProviders(GENERATE_SYSTEM, userPrompt)) ??
      (await tryOllamaFallback(userPrompt));

    const rawCode = generated?.trim();

    // Graceful cloud-first fallback for pre-launch/dev environments
    if (!rawCode) {
      deductCredits(gate.userId, 'studio_generate').catch(() => {});
      return NextResponse.json(
        {
          success: true,
          code: MOCK_SCENE_TEMPLATE,
          source: 'mock',
          warning:
            'Using template fallback (cloud AI unavailable). Configure OPENROUTER_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY for live generation.',
        },
        { headers }
      );
    }

    // Strip markdown fences if the LLM wrapped the output
    const code = stripMarkdownFences(rawCode);

    // Validate the generated HoloScript before returning to the user
    const validation = validateHoloOutput(code);

    // Deduct credits after successful generation (fire-and-forget)
    deductCredits(gate.userId, 'studio_generate').catch(() => {});

    return NextResponse.json(
      {
        success: true,
        code,
        source: 'cloud',
        ...(validation.errors.length > 0 && { validationErrors: validation.errors }),
        ...(validation.warnings.length > 0 && { validationWarnings: validation.warnings }),
      },
      { headers }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, code: '', error: msg }, { status: 500 });
  }
}

async function tryCloudProviders(systemPrompt: string, prompt: string): Promise<string | null> {
  const openrouterKey = process.env.OPENROUTER_API_KEY || '';
  const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
  const openaiKey = process.env.OPENAI_API_KEY || '';

  // OpenRouter
  if (openrouterKey) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openrouterKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          max_tokens: 4096,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
      }
    } catch {
      // try next provider
    }
  }

  // Anthropic
  if (anthropicKey) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: (() => {
          const model =
            process.env.BRITTNEY_MODEL ||
            process.env.ANTHROPIC_MODEL ||
            'claude-opus-4-7';
          // Opus 4.7 removes temperature/top_p (400 if sent). Only send
          // temperature for models that still accept it.
          const isOpus47 = model === 'claude-opus-4-7';
          return JSON.stringify({
            model,
            max_tokens: 16000,
            system: systemPrompt,
            messages: [{ role: 'user', content: prompt }],
            ...(isOpus47 ? {} : { temperature: 0.7 }),
          });
        })(),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { content?: Array<{ text?: string }> };
        const text = data.content?.[0]?.text;
        if (text) return text;
      }
    } catch {
      // try next provider
    }
  }

  // OpenAI
  if (openaiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4.1',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          max_tokens: 4096,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
      }
    } catch {
      // no-op, fallback to local if configured
    }
  }

  return null;
}

async function tryOllamaFallback(fullPrompt: string): Promise<string | null> {
  const ollamaUrl = process.env.OLLAMA_URL ?? process.env.OLLAMA_BASE_URL;
  if (!ollamaUrl) return null; // Optional local fallback

  try {
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || 'brittney-qwen-v23:latest',
        prompt: `${GENERATE_SYSTEM}\n\n${fullPrompt}`,
        stream: false,
        options: { temperature: 0.7, num_predict: 2048 },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: string };
    return data.response ?? null;
  } catch {
    return null;
  }
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, {
      methods: 'GET, POST, OPTIONS',
    }),
  });
}
