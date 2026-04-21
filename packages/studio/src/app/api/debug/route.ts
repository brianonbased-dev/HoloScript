export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { readJsonBody } from '../_lib/body-size';

import { corsHeaders } from '../_lib/cors';
/**
 * POST /api/debug
 *
 * Body: { code: string, breakpoints: number[], action: 'start'|'step'|'continue'|'reset' }
 * Returns: { frames: DebugFrame[], variables: DebugVar[], finished: boolean }
 *
 * Parses HoloScript code into execution frames (one per statement/trait call),
 * simulates a step-through debugger with variable state accumulation.
 *
 * SEC-T10: Route is auth-gated, enforces a 64KB cap on the `code` field, and
 * the trait-call parser uses a bounded character class ([^)]*) instead of the
 * previous nested-optional `(.*)?\)?` form which was vulnerable to catastrophic
 * regex backtracking on pathological inputs.
 */

const MAX_CODE_BYTES = 65_536;

interface DebugRequest {
  code?: string;
  breakpoints?: number[];
  action?: 'start' | 'step' | 'continue' | 'reset';
  currentFrame?: number;
}

interface DebugFrame {
  index: number;
  line: number;
  type: 'scene' | 'object' | 'trait' | 'comment' | 'property';
  label: string;
  detail?: string;
  isBreakpoint: boolean;
}

interface DebugVar {
  name: string;
  type: string;
  value: string;
  scope: 'global' | 'scene' | 'object';
}

function buildFrames(code: string, breakpoints: number[]): DebugFrame[] {
  const lines = code.split('\n');
  const frames: DebugFrame[] = [];
  let ctx: string | null = null;

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('//')) return;

    const lineNum = i + 1;
    const bp = breakpoints.includes(lineNum);

    const sceneM = line.match(/^scene\s+"([^"]+)"/);
    const objM = line.match(/^object\s+"([^"]+)"/);
    // SEC-T10: Non-backtracking form — single optional paren group, body is
    // bounded by `[^)]*` so there is no nested quantifier ambiguity.
    const traitM = line.match(/^@(\w+)\s*(?:\(([^)]*)\))?\s*$/);
    const propM = line.match(/^(\w+):\s*(.+)$/);

    if (sceneM) {
      ctx = sceneM[1];
      frames.push({
        index: frames.length,
        line: lineNum,
        type: 'scene',
        label: `scene "${sceneM[1]}"`,
        isBreakpoint: bp,
      });
      return;
    }
    if (objM) {
      ctx = objM[1];
      frames.push({
        index: frames.length,
        line: lineNum,
        type: 'object',
        label: `object "${objM[1]}"`,
        isBreakpoint: bp,
      });
      return;
    }
    if (traitM) {
      frames.push({
        index: frames.length,
        line: lineNum,
        type: 'trait',
        label: `@${traitM[1]}`,
        detail: traitM[2]?.trim(),
        isBreakpoint: bp,
      });
      return;
    }
    if (propM && ctx) {
      frames.push({
        index: frames.length,
        line: lineNum,
        type: 'property',
        label: `${propM[1]}: ${propM[2]}`,
        isBreakpoint: bp,
      });
    }
  });

  return frames;
}

function buildVars(frames: DebugFrame[], upTo: number): DebugVar[] {
  const vars: DebugVar[] = [];
  let currentScene = '';
  let currentObj = '';

  for (let i = 0; i <= upTo && i < frames.length; i++) {
    const f = frames[i]!;
    if (f.type === 'scene') {
      currentScene = f.label.replace('scene "', '').replace('"', '');
      vars.push({ name: '__scene__', type: 'string', value: currentScene, scope: 'global' });
    } else if (f.type === 'object') {
      currentObj = f.label.replace('object "', '').replace('"', '');
      vars.push({ name: `${currentObj}.__active__`, type: 'bool', value: 'true', scope: 'object' });
    } else if (f.type === 'trait') {
      vars.push({
        name: `${currentObj}.${f.label.slice(1)}`,
        type: 'trait',
        value: f.detail ?? '{}',
        scope: 'object',
      });
    } else if (f.type === 'property') {
      const [k, v] = f.label.split(': ');
      vars.push({ name: `${currentObj}.${k}`, type: 'string', value: v ?? '', scope: 'object' });
    }
  }
  // Remove duplicates — keep last
  const seen = new Map<string, DebugVar>();
  for (const v of vars) seen.set(v.name, v);
  return [...seen.values()];
}

export async function POST(request: NextRequest) {
  // SEC-T10: Require authenticated session. Previously unauthenticated; anyone
  // could submit code for parsing and burn the 300s maxDuration budget.
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  // SEC-T17: cap body bytes before parsing. 64KB matches the inner `code`
  // cap below; JSON/breakpoint-array overhead is negligible at this scale.
  const parsed = await readJsonBody<DebugRequest>(request, { maxBytes: 65_536 });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const body = parsed.body;

  const { code = '', breakpoints = [], action = 'start', currentFrame = -1 } = body;

  // SEC-T10: Reject oversize payloads to prevent CPU/memory DoS.
  if (typeof code !== 'string' || code.length > MAX_CODE_BYTES) {
    return NextResponse.json(
      { error: `code exceeds ${MAX_CODE_BYTES}-byte limit` },
      { status: 413 }
    );
  }

  const frames = buildFrames(code, breakpoints);

  let nextFrame = 0;
  if (action === 'step') nextFrame = Math.min(currentFrame + 1, frames.length - 1);
  else if (action === 'continue') {
    // Jump to next breakpoint or end
    nextFrame = currentFrame + 1;
    while (nextFrame < frames.length && !frames[nextFrame]!.isBreakpoint) nextFrame++;
    if (nextFrame >= frames.length) nextFrame = frames.length - 1;
  } else if (action === 'reset') nextFrame = 0;

  const variables = buildVars(frames, nextFrame);
  const finished = nextFrame >= frames.length - 1 && action !== 'reset';

  return NextResponse.json({ frames, currentFrame: nextFrame, variables, finished });
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
