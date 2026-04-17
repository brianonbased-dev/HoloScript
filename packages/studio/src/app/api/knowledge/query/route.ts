import { NextResponse } from 'next/server';

const KNOWLEDGE_QUERY_ENDPOINT = 'https://mcp-orchestrator-production-45f9.up.railway.app/knowledge/query';

export async function POST(req: Request) {
  try {
    const apiKey = process.env.HOLOSCRIPT_API_KEY || process.env.NEXT_PUBLIC_MCP_API_KEY || '';
    
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key configuration' }, { status: 500 });
    }

    const payload = await req.json();

    const response = await fetch(KNOWLEDGE_QUERY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mcp-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.text();
      return NextResponse.json({ error: 'Orchestrator query failed', details: errorData }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal Server Error', details: error?.message }, { status: 500 });
  }
}
