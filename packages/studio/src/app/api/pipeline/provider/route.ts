/**
 * GET /api/pipeline/provider — Diagnostic endpoint to check which LLM provider is configured.
 */

import { NextResponse } from 'next/server';
import { detectLLMProviderName } from '@/lib/recursive/llmProvider';

export async function GET() {
  const provider = detectLLMProviderName();

  const modelMap: Record<string, string> = {
    anthropic: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929',
    xai: process.env.XAI_MODEL || 'grok-3-mini',
    openai: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    ollama: process.env.OLLAMA_MODEL || process.env.BRITTNEY_MODEL || 'llama3.1:8b',
  };

  return NextResponse.json({
    provider,
    model: modelMap[provider],
    available: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      xai: !!process.env.XAI_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      ollama: true, // Always available as fallback
    },
  });
}
