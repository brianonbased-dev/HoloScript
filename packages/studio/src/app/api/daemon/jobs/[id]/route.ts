import { NextResponse } from 'next/server';
import { getDaemonJob } from '../store';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const job = getDaemonJob(id);

  if (!job) {
    return NextResponse.json({ error: 'Daemon job not found' }, { status: 404 });
  }

  return NextResponse.json({ job });
}
