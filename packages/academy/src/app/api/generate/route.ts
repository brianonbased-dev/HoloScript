import { NextResponse } from 'next/server';
import { generateMockScene, refineMockScene } from '@/lib/mock-generator';
import { extractUserKeys, getApiKey, resolveProviderLabel, type UserKeys } from '@/lib/byok';
import { rateLimit } from '@/lib/rateLimit';

const MAX_REQUESTS_PER_MIN = 30;

// ─── Starter Templates metadata (matching mock-generator template IDs) ─────────

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

const BRITTNEY_SERVICE_URL = process.env.BRITTNEY_SERVICE_URL || '';
const LLM_SERVICE_URL = process.env.LLM_SERVICE_URL || '';

const SYSTEM_PROMPT = `You are a HoloScript expert. Generate valid HoloScript code from user descriptions.

HoloScript uses composition syntax for 3D scenes:

composition "Scene Name" {
  environment {
    skybox: "sky_day"
    ambient: 0.5
  }

  object "ObjectName" @trait1 @trait2 {
    geometry: "sphere"
    position: [0, 1, -3]
    color: "#ff6600"
    material: "glass"
    scale: [1, 1, 1]
  }
}

GEOMETRIES: sphere, cube, cylinder, cone, plane, torus, capsule, box, pyramid
MATERIALS: glass, metal, chrome, gold, copper, crystal, wood, fabric, stone, marble, hologram, neon, emissive, water, shiny, velvet, matte, wireframe
TRAITS: @grabbable, @throwable, @hoverable, @clickable, @collidable, @animated, @glowing, @particle_emitter, @physics, @networked, @spatial_audio

RULES:
1. Use descriptive quoted object names
2. Position objects logically in 3D space (y is up, negative z faces camera)
3. Include environment block for skybox/lighting
4. Output ONLY valid HoloScript code, no markdown fences, no explanations
5. Use negative z positions so objects are visible from default camera`;

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const limit = rateLimit(ip, MAX_REQUESTS_PER_MIN);
  if (!limit.allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded', retryAfter: limit.retryAfter }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(limit.retryAfter || 60),
        'X-RateLimit-Limit': String(MAX_REQUESTS_PER_MIN),
        'X-RateLimit-Remaining': '0',
      },
    });
  }

  const userKeys = extractUserKeys(request);
  const providerLabel = resolveProviderLabel(userKeys);
  const headers = { 'x-llm-provider': providerLabel, 'X-RateLimit-Limit': String(MAX_REQUESTS_PER_MIN), 'X-RateLimit-Remaining': String(limit.remaining) };

  try {
    const { prompt, existingCode, model } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { success: false, code: '', error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Build the full prompt
    let fullPrompt = prompt;
    if (existingCode) {
      fullPrompt = `Here is the current HoloScript scene:\n\n${existingCode}\n\nModify it according to this instruction: ${prompt}\n\nReturn the COMPLETE updated HoloScript code.`;
    }

    // Try Brittney Cloud Service first (GPU inference)
    const brittneyResult = await tryBrittneyCloud(fullPrompt);
    if (brittneyResult) return NextResponse.json(brittneyResult, { headers });

    // Try cloud providers (OpenRouter > Anthropic > OpenAI) — BYOK keys resolved inside
    const cloudResult = await tryCloudProvider(fullPrompt, userKeys);
    if (cloudResult) return NextResponse.json(cloudResult, { headers });

    // Try LLM service next
    const llmResult = await tryLLMService(fullPrompt);
    if (llmResult) return NextResponse.json(llmResult, { headers });

    // Ollama as optional local fallback (only if OLLAMA_URL is set)
    const ollamaResult = await tryOllama(fullPrompt, model);
    if (ollamaResult) return NextResponse.json(ollamaResult, { headers });

    // Final fallback: mock generator (always works, zero dependencies)
    const mockCode = existingCode
      ? refineMockScene(existingCode, prompt)
      : generateMockScene(prompt);
    return NextResponse.json({ success: true, code: mockCode, source: 'mock' }, { headers: { 'x-llm-provider': 'mock' } });
  } catch (err) {
    return NextResponse.json({ success: false, code: '', error: String(err) }, { status: 500 });
  }
}

async function tryBrittneyCloud(prompt: string) {
  if (!BRITTNEY_SERVICE_URL) return null;
  try {
    const res = await fetch(`${BRITTNEY_SERVICE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, context: 'holoscript' }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.success && data.code) {
      return { success: true, code: data.code, source: 'brittney-cloud' };
    }
    return null;
  } catch {
    return null;
  }
}

async function tryCloudProvider(prompt: string, userKeys: UserKeys) {
  const openrouterKey = getApiKey(userKeys, 'openrouter');
  const anthropicKey = getApiKey(userKeys, 'anthropic');
  const openaiKey = getApiKey(userKeys, 'openai');

  // Try OpenRouter
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
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          max_tokens: 2048,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const data = await res.json();
        const raw = data.choices?.[0]?.message?.content || '';
        const code = extractHoloScript(raw);
        if (code) return { success: true, code, source: 'openrouter' };
      }
    } catch { /* try next */ }
  }

  // Try Anthropic
  if (anthropicKey) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const data = await res.json();
        const raw = data.content?.[0]?.text || '';
        const code = extractHoloScript(raw);
        if (code) return { success: true, code, source: 'anthropic' };
      }
    } catch { /* try next */ }
  }

  // Try OpenAI
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
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          max_tokens: 2048,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const data = await res.json();
        const raw = data.choices?.[0]?.message?.content || '';
        const code = extractHoloScript(raw);
        if (code) return { success: true, code, source: 'openai' };
      }
    } catch { /* try next */ }
  }

  return null;
}

async function tryLLMService(prompt: string) {
  if (!LLM_SERVICE_URL) return null;
  try {
    const res = await fetch(`${LLM_SERVICE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, context: 'holoscript' }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.success && data.code) {
      return { success: true, code: data.code };
    }
    return null;
  } catch {
    return null;
  }
}

async function tryOllama(prompt: string, model?: string) {
  const ollamaUrl = process.env.OLLAMA_URL;
  if (!ollamaUrl) return null; // Ollama is optional — skip if not configured
  try {
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'brittney-qwen-v23:latest',
        prompt: `${SYSTEM_PROMPT}\n\nUser request: ${prompt}`,
        stream: false,
        options: { temperature: 0.7, num_predict: 2048 },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const code = extractHoloScript(data.response || '');
    if (code) {
      return { success: true, code };
    }
    return null;
  } catch {
    return null;
  }
}

function extractHoloScript(text: string): string {
  // Remove markdown code fences if present
  let cleaned = text.replace(/```(?:holoscript|holo|hs)?\n?/g, '').replace(/```\n?/g, '');

  // Trim whitespace
  cleaned = cleaned.trim();

  // If it starts with composition, it's likely valid
  if (cleaned.startsWith('composition')) {
    return cleaned;
  }

  // Try to find a composition block
  const match = cleaned.match(/composition\s+".+?"\s*\{[\s\S]*\}/);
  if (match) {
    return match[0];
  }

  // If it starts with object/orb, wrap in a composition
  if (cleaned.match(/^(object|orb)\s+"/)) {
    return `composition "Generated Scene" {\n  environment {\n    skybox: "sky_day"\n    ambient: 0.5\n  }\n\n  ${cleaned}\n}`;
  }

  // Return as-is if non-empty
  return cleaned || '';
}
