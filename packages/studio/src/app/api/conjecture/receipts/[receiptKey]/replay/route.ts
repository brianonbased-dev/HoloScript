import { NextRequest, NextResponse } from 'next/server';

import { replayConjectureReceipt } from '@/lib/conjectureReceipts.server';
import type { StudioConjectureRunnerSuite } from '@/types/conjectureReceipts';

export const runtime = 'nodejs';

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function suiteFrom(value: unknown): StudioConjectureRunnerSuite | null {
  return value === 'proof-carrying-geometry-smoke' || value === 'generated-geometry-family'
    ? value
    : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ receiptKey: string }> }
) {
  const { receiptKey } = await params;
  const body = await req.json().catch(() => ({}));
  const record = isObject(body) ? body : {};
  const suite = suiteFrom(record.suite);

  if (!suite) {
    return NextResponse.json({ ok: false, error: 'suite is required' }, { status: 400 });
  }

  const scenarioId = typeof record.scenarioId === 'string' ? record.scenarioId : undefined;
  const replay = await replayConjectureReceipt({
    targetReceiptKey: receiptKey,
    suite,
    scenarioId,
  });

  return NextResponse.json(replay);
}
