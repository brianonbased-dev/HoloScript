import { NextRequest, NextResponse } from 'next/server';

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'https://mcp.holoscript.net';
const HOLOMESH_KEY = process.env.HOLOMESH_API_KEY;

if (!HOLOMESH_KEY) {
  console.error(
    'FATAL: HOLOMESH_API_KEY environment variable is not set. Knowledge publish endpoint will reject requests.'
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const entries = body.entries;
    const workspaceId = body.workspace_id;

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ success: false, error: 'Missing entries' }, { status: 400 });
    }

    if (!workspaceId) {
      return NextResponse.json({ success: false, error: 'Missing workspace_id' }, { status: 400 });
    }

    if (!HOLOMESH_KEY) {
      return NextResponse.json(
        { success: false, error: 'HOLOMESH_API_KEY environment variable is not set' },
        { status: 500 }
      );
    }

    const defaultPremium = body.default_premium === true;
    let premium_count = 0;
    let free_count = 0;
    let successCount = 0;
    const errors: string[] = [];

    // POST https://mcp.holoscript.net/api/holomesh/contribute
    for (const entry of entries) {
      try {
        const isPremium = entry.is_premium ?? defaultPremium;

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
            tags: isPremium ? ['premium'] : [],
            ...entry,
            is_premium: isPremium,
          }),
        });

        if (res.ok) {
          successCount++;
          if (isPremium) {
            premium_count++;
          } else {
            free_count++;
          }
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
      premium_count,
      free_count,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
