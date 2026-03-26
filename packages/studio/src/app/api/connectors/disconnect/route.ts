import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { serviceId } = await req.json();

    if (!serviceId) {
      return NextResponse.json({ error: 'serviceId is required' }, { status: 400 });
    }

    // In a real backend, you would invalidate tokens, close SSE streams, etc.
    console.log(`[API] Disconnecting from ${serviceId}`);

    return NextResponse.json({
      status: 'success',
      serviceId,
    });
  } catch (error) {
    console.error('[API] Disconnect error:', error);
    return NextResponse.json({ error: 'Failed to disconnect from service' }, { status: 500 });
  }
}
