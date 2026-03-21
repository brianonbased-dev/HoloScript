/**
 * GET  /api/pipeline/feedback — List accumulated feedback signals.
 * POST /api/pipeline/feedback — Manually inject a feedback signal (debug/testing).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import type { FeedbackSignal } from '@/lib/recursive/types';

// Server-side feedback log (mirrors client-side globalFeedback for SSE/multi-tab)
const feedbackLog: FeedbackSignal[] = [];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  return NextResponse.json({
    signals: feedbackLog.slice(-200),
    total: feedbackLog.length,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let signal: FeedbackSignal;
  try {
    signal = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (signal.sourceLayer === undefined || !signal.signalType) {
    return NextResponse.json(
      { error: 'sourceLayer and signalType are required' },
      { status: 400 },
    );
  }

  signal.timestamp = signal.timestamp ?? new Date().toISOString();
  feedbackLog.push(signal);

  // Cap log size
  if (feedbackLog.length > 1000) {
    feedbackLog.splice(0, feedbackLog.length - 1000);
  }

  return NextResponse.json({ injected: true, total: feedbackLog.length });
}
