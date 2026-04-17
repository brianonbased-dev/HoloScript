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

import { parseHolo } from '@holoscript/core';

function parseHoloScript(code: string): TraceEntry[] {
  const entries: TraceEntry[] = [];
  let step = 0;
  let t = 0;

  const inc = () => {
    t += Math.floor(Math.random() * 3) + 1;
    return t;
  };

  try {
    const result = parseHolo(code);

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
      } else if (node.type === 'Object' || node.type === 'Zone' || node.type === 'Actor' || node.type === 'team_agent') {
        entries.push({
          step: ++step,
          type: 'object',
          name: node.name || node.id || 'unnamed',
          message: `Object "${node.name || node.id || 'unnamed'}" created${node.type === 'team_agent' ? ' (Team Agent)' : ''}`,
          timeMs: inc(),
        });
      }
      
      // Also check standard object properties that indicate a native type
      if (node.type === 'ObjectDefinition' && node.fields?.type === 'team_agent') {
        entries.push({
          step: ++step,
          type: 'object',
          name: node.name || node.id || 'unnamed',
          message: `Object "${node.name || node.id || 'unnamed'}" created (Team Agent)`,
          timeMs: inc(),
        });
      }

      const allTraits = [...(node.traits || []), ...(node.directives || [])];
      
      if (allTraits.length > 0) {
        for (const trait of allTraits) {
          // Traits usually have 'config' or 'params' 
          let props = trait.params || {};
          
          if (trait.config) {
            props = {};
            for (let i = 0; i < 20; i += 3) {
              const k = trait.config[`_arg${i}`];
              const v = trait.config[`_arg${i + 2}`];
              if (k !== undefined && v !== undefined) {
                props[k] = v;
              }
            }
          }
          
          let message = `@${trait.name}(${Object.entries(props)
              .map(([k, v]) => `${k}: ${v}`)
              .join(', ')}) applied`;
              
          if (trait.name === 'agent') {
             message = `Agent Profile Configured: ${props.name || props.id} (Role: ${props.role}, Model: ${props.model})`;
          } else if (trait.name === 'capabilities') {
             const skills = Array.isArray(props.skills) ? props.skills.join(', ') : props.skills;
             message = `Agent Capabilities Registered: [${skills}]`;
          }
          
          entries.push({
            step: ++step,
            type: 'trait',
            trait: trait.name,
            props: Object.keys(props).reduce((acc, k) => {
              acc[k] = String(props[k]);
              return acc;
            }, {} as Record<string, string>),
            message,
            timeMs: inc(),
          });
        }
      }

      // AST can have objects, children, domainBlocks, etc.
      if (node.objects && Array.isArray(node.objects)) node.objects.forEach(traverse);
      if (node.children && Array.isArray(node.children)) node.children.forEach(traverse);
      if (node.domainBlocks && Array.isArray(node.domainBlocks)) node.domainBlocks.forEach(traverse);
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
