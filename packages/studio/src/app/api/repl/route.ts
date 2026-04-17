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

import { HoloCompositionParser } from '@holoscript/core';

function parseHoloScript(code: string): TraceEntry[] {
  const entries: TraceEntry[] = [];
  let step = 0;
  let t = 0;

  const inc = () => {
    t += Math.floor(Math.random() * 3) + 1;
    return t;
  };

  try {
    const parser = new HoloCompositionParser();
    const result = parser.parse(code);

    if (result.errors && result.errors.length > 0) {
      for (const err of result.errors) {
        entries.push({
          step: ++step,
          type: 'error',
          message: err.message,
          timeMs: inc(),
        });
      }
      return entries;
    }

    const ast = result.ast;
    if (!ast) {
      entries.push({
        step: 1,
        type: 'info',
        message: 'No declarations found — type some HoloScript code',
        timeMs: 0,
      });
      return entries;
    }

    const traverse = (node: any) => {
      if (!node || typeof node !== 'object') return;

      if (node.type === 'Composition' || node.type === 'Scene') {
        entries.push({
          step: ++step,
          type: 'scene',
          name: node.name || 'unnamed',
          message: `Scene "${node.name || 'unnamed'}" initialized`,
          timeMs: inc(),
        });
      } else if (node.type === 'Object' || node.type === 'Zone' || node.type === 'Actor') {
        entries.push({
          step: ++step,
          type: 'object',
          name: node.name || 'unnamed',
          message: `Object "${node.name || 'unnamed'}" created`,
          timeMs: inc(),
        });
      }

      if (node.traits && Array.isArray(node.traits)) {
        for (const trait of node.traits) {
          const props = trait.params || {};
          entries.push({
            step: ++step,
            type: 'trait',
            trait: trait.name,
            props: Object.keys(props).reduce((acc, k) => {
              acc[k] = String(props[k]);
              return acc;
            }, {} as Record<string, string>),
            message: `@${trait.name}(${Object.entries(props)
              .map(([k, v]) => `${k}: ${v}`)
              .join(', ')}) applied`,
            timeMs: inc(),
          });
        }
      }

      if (node.children && Array.isArray(node.children)) {
        node.children.forEach(traverse);
      }
    };

    traverse(ast);
  } catch (err: any) {
    entries.push({
      step: ++step,
      type: 'error',
      message: err.message || 'Parse error',
      timeMs: inc(),
    });
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
