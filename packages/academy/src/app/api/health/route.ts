import { NextResponse } from 'next/server';

/**
 * GET /api/health
 *
 * Cloud-first health check. Detects available AI providers via env vars.
 * Ollama is an optional local fallback — never required.
 */

function detectProvider(): { provider: string; connected: boolean } {
  if (process.env.OPENROUTER_API_KEY) return { provider: 'openrouter', connected: true };
  if (process.env.ANTHROPIC_API_KEY) return { provider: 'anthropic', connected: true };
  if (process.env.OPENAI_API_KEY) return { provider: 'openai', connected: true };
  if (process.env.OLLAMA_URL) return { provider: 'ollama', connected: true };
  return { provider: 'none', connected: false };
}

export async function GET() {
  const ai = detectProvider();

  // Legacy compat: ollama field mirrors ai.connected for old clients
  return NextResponse.json({
    ai,
    ollama: ai.connected,
    models: ai.provider !== 'none' ? [ai.provider] : [],
  });
}
