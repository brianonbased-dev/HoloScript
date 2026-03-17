import { NextResponse } from 'next/server';
import { createDaemonJob, listDaemonJobs, type CreateDaemonJobInput } from './store';

export async function GET() {
  return NextResponse.json({ jobs: listDaemonJobs() });
}

export async function POST(request: Request) {
  let body: Partial<CreateDaemonJobInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.projectId || !body.profile || !body.projectDna) {
    return NextResponse.json(
      { error: 'Missing required fields: projectId, profile, projectDna' },
      { status: 400 }
    );
  }

  const created = createDaemonJob({
    projectId: body.projectId,
    profile: body.profile,
    projectDna: body.projectDna,
  });

  return NextResponse.json({ job: created }, { status: 201 });
}
