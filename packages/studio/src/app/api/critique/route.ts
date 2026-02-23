import { NextResponse } from 'next/server';

/**
 * POST /api/critique
 *
 * Body: { code: string }
 *
 * Sends the HoloScript code to Ollama and asks for a structured scene critique.
 * Returns: { suggestions: string[] } — list of actionable improvement tips.
 */

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'llama3.2';

const CRITIQUE_SYSTEM = `You are Brittney, an expert HoloScript scene director. 
When given a HoloScript scene, you return exactly 5 concise improvement suggestions.
Format your response as a numbered list (1. ... 2. ... 3. ... 4. ... 5. ...).
Each suggestion must be actionable and specific to the provided code.
Focus on: trait completeness, lighting quality, interactivity, performance, and visual interest.`;

export async function POST(request: Request) {
  let code: string;
  try {
    const body = (await request.json()) as { code?: string };
    code = body.code?.trim() ?? '';
    if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: `Here is a HoloScript scene:\n\n\`\`\`\n${code}\n\`\`\`\n\nProvide exactly 5 numbered improvement suggestions.`,
        system: CRITIQUE_SYSTEM,
        stream: false,
        options: { temperature: 0.7, num_predict: 512 },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Ollama error: ${text.slice(0, 200)}` }, { status: 502 });
    }

    const data = (await res.json()) as { response?: string; error?: string };
    if (data.error) return NextResponse.json({ error: data.error }, { status: 502 });

    const raw = data.response ?? '';
    // Parse numbered list: "1. Foo\n2. Bar\n..."
    const suggestions = raw
      .split('\n')
      .map((l) => l.replace(/^\d+\.\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 5);

    return NextResponse.json({ suggestions });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
