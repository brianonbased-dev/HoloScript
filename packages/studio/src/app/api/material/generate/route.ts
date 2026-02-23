import { NextRequest, NextResponse } from 'next/server';

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? 'brittney-qwen-v23:latest';

/** POST /api/material/generate
 *  Body: { prompt: string; baseColor?: string; model?: string }
 *  Returns: { glsl: string; traits: string; error?: string }
 */
export async function POST(req: NextRequest) {
  let body: { prompt?: string; baseColor?: string; model?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { prompt, baseColor = '#ffffff', model = DEFAULT_MODEL } = body;
  if (!prompt) {
    return NextResponse.json({ error: '`prompt` is required' }, { status: 400 });
  }

  const systemPrompt = `You are a GLSL fragment shader expert. Your job is to generate a
complete, self-contained GLSL fragment shader for use in Three.js / WebGL.

Rules:
- Output ONLY two blocks separated by "---TRAITS---":
  1. A valid GLSL fragment shader string (void main(), use gl_FragCoord, vUv, uTime uniforms)
  2. A HoloScript @material trait string (one-liner with key:value pairs)
- Do NOT include markdown fences, explanations, or any text outside these two blocks.
- The shader must compile without errors.
- Use these available uniforms: float uTime, vec2 vUv, vec3 uBaseColor
- Base color is: ${baseColor}

Example output format:
precision mediump float;
uniform float uTime;
uniform vec2 vUv;
uniform vec3 uBaseColor;
void main() {
  float wave = sin(vUv.x * 10.0 + uTime) * 0.5 + 0.5;
  gl_FragColor = vec4(uBaseColor * wave, 1.0);
}
---TRAITS---
@material emissive:"#ff6600" emissiveIntensity:0.8 metalness:0.0 roughness:0.5`;

  try {
    const ollamaRes = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: `${systemPrompt}\n\nUser request: ${prompt}`,
        stream: false,
        options: { temperature: 0.7, num_predict: 512 },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!ollamaRes.ok) {
      return NextResponse.json(
        { error: `Ollama returned ${ollamaRes.status}` },
        { status: 502 }
      );
    }

    const data = (await ollamaRes.json()) as { response?: string; error?: string };
    const raw = data.response ?? '';

    // Split on the separator
    const parts = raw.split('---TRAITS---');
    const glsl = (parts[0] ?? '').trim();
    const traits = (parts[1] ?? '').trim();

    if (!glsl.includes('void main')) {
      return NextResponse.json({ error: 'Model did not return valid GLSL', raw }, { status: 422 });
    }

    return NextResponse.json({ glsl, traits, raw });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
