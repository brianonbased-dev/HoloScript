import { NextResponse } from 'next/server';

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

const LLM_SERVICE_URL = process.env.LLM_SERVICE_URL || 'http://localhost:8000';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, existingCode, model } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { success: false, code: '', error: 'Prompt is required' },
        { status: 400 }
      );
    }

    let fullPrompt = prompt;
    if (existingCode) {
      fullPrompt = `Here is the current HoloScript scene:\n\n${existingCode}\n\nModify it according to this instruction: ${prompt}\n\nReturn the COMPLETE updated HoloScript code.`;
    }

    const payload = {
      prompt: fullPrompt,
      context: 'holoscript',
      model
    };

    const res = await fetch(`${LLM_SERVICE_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.BRITTNEY_API_KEY || 'anonymous'}`
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000)
    });

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json({ success: false, code: '', error: errorText }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ success: false, code: '', error: String(err) }, { status: 500 });
  }
}
