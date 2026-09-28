import { NextResponse } from 'next/server';
import { checkHostedOllama } from '@holoscript/llm-provider';
import { getStudioPersistenceProbe } from '../../../lib/studio-dev-persistence';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

export async function GET() {
  // The routes refuse a hosted Ollama (ollama.com); health must not report it as up.
  const hosted = checkHostedOllama(OLLAMA_URL, { caller: 'studio-api /api/health' });
  if (hosted.refused) {
    return NextResponse.json({
      ollama: false,
      refused: hosted.refused.reason,
      models: [],
      persistence: getStudioPersistenceProbe(),
    });
  }
  try {
    // Check Ollama
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });

    if (!ollamaRes.ok) {
      return NextResponse.json({ ollama: false, models: [], persistence: getStudioPersistenceProbe() });
    }

    const data = await ollamaRes.json();
    const models = (data.models || []).map((m: any) => m.name);

    return NextResponse.json({ ollama: true, models, persistence: getStudioPersistenceProbe() });
  } catch {
    return NextResponse.json({ ollama: false, models: [], persistence: getStudioPersistenceProbe() });
  }
}
