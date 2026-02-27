import { NextResponse } from 'next/server';
import { generateMockScene, refineMockScene } from '@/lib/mock-generator';

<<<<<<< HEAD
// ─── Starter Templates metadata (matching mock-generator template IDs) ─────────

const STARTER_TEMPLATES = [
  { id: 'city',          label: 'Urban City',     emoji: '🏙️', description: 'Downtown scene with towers, street lights, and ambient city fog' },
  { id: 'forest',        label: 'Forest',          emoji: '🌲', description: 'Dense woodland with morning mist, pine trees, and dappled sunlight' },
  { id: 'space-station', label: 'Space Station',   emoji: '🛸', description: 'Orbital station with rotating solar panels, starfield, and sci-fi lighting' },
  { id: 'abstract',      label: 'Abstract',        emoji: '✨', description: 'Geometric minimalist art piece with particle effects and gradient lighting' },
  { id: 'vr-room',       label: 'VR Room',         emoji: '🥽', description: 'Comfortable XR space with floating UI panels, ambient glow, and spatial audio' },
  { id: 'game-level',    label: 'Game Level',      emoji: '🎮', description: 'Top-down platformer arena with physics-enabled platforms, torches, and enemies' },
];

export function GET() {
  return NextResponse.json({ templates: STARTER_TEMPLATES });
}


=======
>>>>>>> feature/docs-examples-misc
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const LLM_SERVICE_URL = process.env.LLM_SERVICE_URL || 'http://localhost:8000';

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

    // Try LLM service first
    const llmResult = await tryLLMService(fullPrompt);
    if (llmResult) return NextResponse.json(llmResult);

    // Fall back to direct Ollama
    const ollamaResult = await tryOllama(fullPrompt, model);
    if (ollamaResult) return NextResponse.json(ollamaResult);

    // Final fallback: mock generator (always works, zero dependencies)
    const mockCode = existingCode
      ? refineMockScene(existingCode, prompt)
      : generateMockScene(prompt);
    return NextResponse.json({ success: true, code: mockCode, source: 'mock' });
  } catch (err) {
    return NextResponse.json({ success: false, code: '', error: String(err) }, { status: 500 });
  }
}

async function tryLLMService(prompt: string) {
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
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
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
