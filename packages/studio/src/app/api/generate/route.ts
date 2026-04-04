import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

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

const GENERATE_SYSTEM = `You are a HoloScript code generator. Given a description, generate valid HoloScript code (.holo format).

HoloScript syntax:
- composition "Name" { ... } — root container
- object "Name" { position: [x,y,z]  @trait { prop: value } }
- scene "Name" { ... } — scene container
- Traits use @ prefix: @physics, @glow, @material, @animation, @light, etc.

Return ONLY the HoloScript code — no markdown fences, no explanation.`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, existingCode } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { success: false, code: '', error: 'Prompt is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, code: '', error: 'ANTHROPIC_API_KEY not configured' },
        { status: 500 }
      );
    }

    let userPrompt = prompt;
    if (existingCode) {
      userPrompt = `Here is the current HoloScript scene:\n\n${existingCode}\n\nModify it according to this instruction: ${prompt}\n\nReturn the COMPLETE updated HoloScript code.`;
    } else {
      userPrompt = `Generate a HoloScript scene for: ${prompt}`;
    }

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: process.env.BRITTNEY_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: GENERATE_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    const code = textBlock ? textBlock.text.trim() : '';

    return NextResponse.json({ success: true, code });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, code: '', error: msg }, { status: 500 });
  }
}
