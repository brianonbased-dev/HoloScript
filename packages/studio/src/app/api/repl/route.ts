export const maxDuration = 300;

import { NextResponse } from 'next/server';

/**
 * POST /api/repl
 *
 * Body: { code: string }
 * Returns: { trace: TraceEntry[], error?: string }
 *
 * Lightweight HoloScript execution trace:
 * - Parses scene/object/trait declarations using regex
 * - Returns a structured execution trace (what would happen at runtime)
 * - No actual 3D rendering — pure semantic trace for the REPL panel
 */

interface TraceEntry {
  step: number;
  type: 'scene' | 'object' | 'trait' | 'error' | 'info';
  name?: string;
  trait?: string;
  props?: Record<string, string>;
  message: string;
  timeMs: number;
}

function parseHoloScript(code: string): TraceEntry[] {
  const entries: TraceEntry[] = [];
  const lines = code.split('\n');
  let step = 0;
  let t = 0;

  const inc = () => {
    t += Math.floor(Math.random() * 3) + 1;
    return t;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('//')) continue;

    const sceneMatch = line.match(/^scene\s+"([^"]+)"/);
    const objectMatch = line.match(/^object\s+"([^"]+)"/);
    const traitMatch = line.match(/^@(\w+)\(([^)]*)\)/);
    const varMatch = line.match(/^(let|const)\s+(\w+)\s*=\s*(.+)/);

    if (sceneMatch) {
      entries.push({
        step: ++step,
        type: 'scene',
        name: sceneMatch[1],
        message: `Scene "${sceneMatch[1]}" initialized`,
        timeMs: inc(),
      });
    } else if (objectMatch) {
      entries.push({
        step: ++step,
        type: 'object',
        name: objectMatch[1],
        message: `Object "${objectMatch[1]}" created`,
        timeMs: inc(),
      });
    } else if (traitMatch) {
      // Parse key=value pairs
      const props: Record<string, string> = {};
      const propsRaw = traitMatch[2];
      propsRaw.replace(/(\w+):\s*"?([^",)]+)"?/g, (_, k, v) => {
        props[k] = v.trim();
        return '';
      });

      entries.push({
        step: ++step,
        type: 'trait',
        trait: traitMatch[1],
        props,
        message: `@${traitMatch[1]}(${Object.entries(props)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')}) applied`,
        timeMs: inc(),
      });
    } else if (varMatch) {
      entries.push({
        step: ++step,
        type: 'info',
        message: `Binding ${varMatch[1]} "${varMatch[2]}" = ${varMatch[3].trim()}`,
        timeMs: inc(),
      });
    }
  }

  if (entries.length === 0) {
    entries.push({
      step: 1,
      type: 'info',
      message: 'No declarations found — type some HoloScript code',
      timeMs: 0,
    });
  }

  return entries;
}

export async function POST(request: Request) {
  let code: string;
  try {
    const body = (await request.json()) as { code?: string };
    code = body.code?.trim() ?? '';
    if (!code) return NextResponse.json({ trace: [], error: 'code is required' }, { status: 400 });
  } catch {
    return NextResponse.json({ trace: [], error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const trace = parseHoloScript(code);
    return NextResponse.json({ trace });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ trace: [], error: msg }, { status: 500 });
  }
}


export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
