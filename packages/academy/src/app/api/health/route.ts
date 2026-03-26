import { NextResponse } from 'next/server';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

export async function GET() {
  try {
    // Check Ollama
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });

    if (!ollamaRes.ok) {
      return NextResponse.json({ ollama: false, models: [] });
    }

    const data = await ollamaRes.json();
    const models = (data.models || []).map((m: any) => m.name);

    return NextResponse.json({ ollama: true, models });
  } catch {
    return NextResponse.json({ ollama: false, models: [] });
  }
}
