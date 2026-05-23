import { NextResponse } from 'next/server';

import { listConjectureReceipts } from '@/lib/conjectureReceipts.server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(await listConjectureReceipts());
}
