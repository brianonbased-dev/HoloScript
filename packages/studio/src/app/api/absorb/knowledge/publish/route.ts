import { NextRequest, NextResponse } from 'next/server';

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'https://mcp.holoscript.net';
// As per the specification from the orchestrator
const HOLOMESH_KEY = process.env.HOLOMESH_API_KEY || 'holomesh_sk_q8VL4jrxcwPi0O9DP-gMOnqEUhLuiNZR';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const entries = body.entries || [];
    const workspaceId = body.workspace_id || 'default';
    
    let successCount = 0;
    const errors: any[] = [];

    // POST https://mcp.holoscript.net/api/holomesh/contribute
    for (const entry of entries) {
      try {
        const res = await fetch(`${MCP_SERVER_URL}/api/holomesh/contribute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${HOLOMESH_KEY}`,
          },
          body: JSON.stringify({
            // Fallback map format if type is raw text
            type: entry.type?.toLowerCase() || 'wisdom',
            content: entry.content || '',
            domain: workspaceId,
            tags: entry.is_premium ? ['premium'] : [],
            ...entry
          }),
        });
        
        if (res.ok) {
          successCount++;
        } else {
          errors.push(await res.text());
        }
      } catch (err) {
        errors.push(String(err));
      }
    }

    return NextResponse.json({
      success: true,
      publishedCount: successCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
