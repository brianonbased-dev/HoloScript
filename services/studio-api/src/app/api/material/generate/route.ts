import { NextResponse } from 'next/server';
import {
  resolveOwnedLocalProvider,
  type ResolvedSovereignProvider,
} from '@holoscript/llm-provider';

const CALLER = 'studio-api /api/material/generate';

const NO_LOCAL_MODEL =
  'Material generation runs on our own local model server, and none is configured here. ' +
  'Set HOLOLLAMA_URL (HoloLlama) or HOLOSERVE_URL (HoloServe).';

/** POST /api/material/generate
 *  Body: { prompt: string; baseColor?: string; model?: string }
 *  Returns: { glsl: string; traits: string; raw: string; error?: string }
 *
 *  Runs on our own local model server: HoloServe when HOLOSERVE_URL is set, else HoloLlama
 *  when HOLOLLAMA_URL is set (D.117: HoloLlama replaced Ollama; OLLAMA_* is ignored here).
 *  With neither set it answers 503; when the server fails or does not answer in 30 s, 502.
 *  `body.model` is still accepted but no longer selects the model: HoloLlama answers with
 *  the model it loaded, and HoloServe refuses names it does not serve.
 */
export async function POST(req: Request) {
  let body: { prompt?: string; baseColor?: string; model?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { prompt, baseColor = '#ffffff' } = body;
  if (typeof prompt !== 'string' || !prompt) {
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

  let local: ResolvedSovereignProvider | null;
  try {
    local = resolveOwnedLocalProvider({ caller: CALLER, timeoutMs: 30_000 });
  } catch (err) {
    // e.g. the configured model is parity-pinned to HoloServe and needs the async resolver.
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `The local model server is configured but cannot be used here: ${message}` },
      { status: 503 }
    );
  }
  if (!local) {
    return NextResponse.json({ error: NO_LOCAL_MODEL }, { status: 503 });
  }

  let raw: string;
  try {
    const result = await local.provider.complete(
      {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        maxTokens: 512,
        temperature: 0.7,
      },
      local.model
    );
    raw = result.content ?? '';
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `The local model server (${local.providerName}) did not answer: ${message}` },
      { status: 502 }
    );
  }

  // Split on the separator
  const parts = raw.split('---TRAITS---');
  const glsl = (parts[0] ?? '').trim();
  const traits = (parts[1] ?? '').trim();

  if (!glsl.includes('void main')) {
    return NextResponse.json({ error: 'Model did not return valid GLSL', raw }, { status: 422 });
  }

  return NextResponse.json({ glsl, traits, raw });
}
