import { NextRequest, NextResponse } from 'next/server';

// ─── Allowlist — only IDE tools are proxied here ──────────────────────────────
const IDE_TOOLS = new Set(['hs_diagnostics', 'hs_autocomplete', 'hs_hover', 'hs_go_to_definition']);

function getMCPUrl(): string {
  return process.env['HOLOSCRIPT_MCP'] ?? 'https://mcp.holoscript.net';
}

function getAPIKey(): string {
  return process.env['HOLOSCRIPT_API_KEY'] ?? process.env['MCP_API_KEY'] ?? '';
}

let rpcId = 0;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { tool?: unknown; args?: unknown };
  try {
    body = (await req.json()) as { tool?: unknown; args?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const tool = body.tool;
  if (typeof tool !== 'string' || !IDE_TOOLS.has(tool)) {
    return NextResponse.json({ error: 'Unknown tool' }, { status: 400 });
  }

  const args = (body.args ?? {}) as Record<string, unknown>;

  rpcId += 1;
  const rpcBody = {
    jsonrpc: '2.0' as const,
    id: rpcId,
    method: 'tools/call',
    params: { name: tool, arguments: args },
  };

  let upstream: Response;
  try {
    upstream = await fetch(`${getMCPUrl()}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAPIKey()}`,
      },
      body: JSON.stringify(rpcBody),
      signal: AbortSignal.timeout(6000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'MCP server unreachable';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  let rpcResponse: Record<string, unknown>;
  try {
    rpcResponse = (await upstream.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: `MCP HTTP ${upstream.status}` }, { status: 502 });
  }

  if (rpcResponse['error']) {
    const rpcErr = rpcResponse['error'] as Record<string, unknown>;
    return NextResponse.json({ error: String(rpcErr['message'] ?? 'RPC error') }, { status: 500 });
  }

  // Unwrap MCP content envelope: result.content[0].text (JSON string)
  const result = rpcResponse['result'] as Record<string, unknown> | null | undefined;
  let data: unknown = result;
  if (result && Array.isArray(result['content'])) {
    const textItem = (result['content'] as Array<{ type: string; text?: string }>).find(
      (c) => c.type === 'text' && typeof c.text === 'string'
    );
    if (textItem?.text) {
      try {
        data = JSON.parse(textItem.text);
      } catch {
        data = textItem.text;
      }
    }
  }

  return NextResponse.json({ ok: true, data });
}
