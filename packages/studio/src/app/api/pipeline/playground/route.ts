export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { forwardAuthHeaders } from '@/lib/api-auth';

type Action = 'parse' | 'compile';

interface Body {
  action?: Action;
  code?: string;
}

import { ENDPOINTS } from '@holoscript/config/endpoints';

let MCP_EXTERNAL_URL = ENDPOINTS.MCP_ORCHESTRATOR;

if (MCP_EXTERNAL_URL && !MCP_EXTERNAL_URL.startsWith('http')) {
  MCP_EXTERNAL_URL = `https://${MCP_EXTERNAL_URL}`;
}

interface ToolCallResult {
  success?: boolean;
  error?: string;
  pipeline?: unknown;
  code?: string;
  errors?: Array<{ message?: string; line?: number }>;
}

async function callTool(
  request: NextRequest,
  tool: 'parse_pipeline' | 'compile_pipeline',
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const response = await fetch(`${MCP_EXTERNAL_URL}/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...forwardAuthHeaders(request) },
    body: JSON.stringify({ tool, args }),
    signal: AbortSignal.timeout(15000),
  });

  const data = (await response.json()) as ToolCallResult;

  if (!response.ok) {
    return {
      success: false,
      error: data.error ?? `Tool call failed with status ${response.status}`,
      errors: data.errors,
    };
  }

  return data;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Body;
  const action = body.action;
  const code = body.code?.trim() ?? '';

  if (!action || (action !== 'parse' && action !== 'compile')) {
    return NextResponse.json(
      { success: false, errors: [{ message: 'Expected action to be parse or compile.' }] },
      { status: 400 }
    );
  }

  if (!code) {
    return NextResponse.json(
      { success: false, errors: [{ message: 'Pipeline source is required.' }] },
      { status: 400 }
    );
  }

  if (action === 'parse') {
    const parsed = await callTool(request, 'parse_pipeline', { code });
    if (!parsed.success || !parsed.pipeline) {
      return NextResponse.json(
        {
          success: false,
          errors: parsed.errors?.map((e) => ({
            message: e.message ?? 'Parse failed',
            line: e.line,
          })) || [{ message: parsed.error ?? 'Parse failed' }],
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, action: 'parse', pipeline: parsed.pipeline });
  }

  const compiled = await callTool(request, 'compile_pipeline', {
    code,
    target: 'node',
    moduleName: 'index.mjs',
  });

  if (!compiled.success || !compiled.code) {
    return NextResponse.json(
      {
        success: false,
        errors: compiled.errors?.map((e) => ({
          message: e.message ?? 'Compilation failed',
          line: e.line,
        })) || [{ message: compiled.error ?? 'Compilation failed.' }],
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true, action: 'compile', code: compiled.code });
}

export async function GET() {
  return NextResponse.json({ endpoint: '/api/pipeline/playground', actions: ['parse', 'compile'] });
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
