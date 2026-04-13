import { NextResponse, NextRequest } from 'next/server';

/**
 * Store Semantic Search Proxy
 * 
 * Powered by Absorb Service.
 * Translates natural language queries into ranked marketplace results.
 */
export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();
    const apiKey = process.env.ABSORB_API_KEY;

    if (!apiKey) {
      // Fallback or early exit if key is missing in dev
      return NextResponse.json({ 
        results: [], 
        warning: 'Semantic Search disabled (ABSORB_API_KEY missing)' 
      });
    }

    const response = await fetch('https://absorb.holoscript.net/api/query', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question: `High-fidelity semantic search for HoloScript assets: ${query}`,
        rootDir: 'packages/studio/src/lib/marketplace',
        limit: 10,
        context: 'market'
      }),
    });

    if (!response.ok) {
      throw new Error(`Absorb service error: ${response.status}`);
    }

    const data = await response.json();

    // Map Absorb response back to Marketplace format if needed
    // Assuming Absorb returns a list of matched files/entities
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
