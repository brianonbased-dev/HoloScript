import { NextRequest, NextResponse } from 'next/server';

/** POST /api/material/generate
 *  Body: { prompt: string; baseColor?: string; model?: string }
 *  Returns: { glsl: string; traits: string; error?: string }
 *
 *  Cloud-first: tries OpenRouter, Anthropic, OpenAI, then Ollama as optional fallback.
 */
export async function POST(req: NextRequest) {

  let body: { prompt?: string; baseColor?: string; model?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { prompt, baseColor = '#ffffff' } = body;
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

  const userPrompt = `${systemPrompt}\n\nUser request: ${prompt}`;

  // Try cloud providers in order, then Ollama as optional fallback
  const raw = await tryCloudProviders(systemPrompt, prompt) ?? await tryOllamaFallback(userPrompt, body.model);

  if (!raw) {
    return NextResponse.json(
      { error: 'No AI provider available. Set OPENROUTER_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY in .env' },
      { status: 503 }
    );
  }

  // Split on the separator
  const parts = raw.split('---TRAITS---');
  const glsl = (parts[0] ?? '').trim();
  const traits = (parts[1] ?? '').trim();

  if (!glsl.includes('void main')) {
    return NextResponse.json({ error: 'Model did not return valid GLSL', raw }, { status: 422 });
  }

  return NextResponse.json({ glsl, traits, raw }, { headers: { 'x-llm-provider': 'server' } });
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
          max_tokens: 512,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
      }
    } catch { /* try next */ }
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
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
          max_tokens: 512,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.content?.[0]?.text;
        if (text) return text;
      }
    } catch { /* try next */ }
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
          max_tokens: 512,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
      }
    } catch { /* try next */ }
  }

  return null;
}

async function tryOllamaFallback(fullPrompt: string, model?: string): Promise<string | null> {
  const ollamaUrl = process.env.OLLAMA_URL ?? process.env.OLLAMA_BASE_URL;
  if (!ollamaUrl) return null; // Ollama is optional
  try {
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'brittney-qwen-v23:latest',
        prompt: fullPrompt,
        stream: false,
        options: { temperature: 0.7, num_predict: 512 },
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
