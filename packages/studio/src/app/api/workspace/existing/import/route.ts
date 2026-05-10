export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  ExistingWorkspaceImportError,
  importExistingWorkspace,
} from '@/lib/workspace/existingWorkspaceImporter';

import { corsHeaders } from '../../../_lib/cors';

interface ExistingWorkspaceImportRequest {
  rootPath?: string;
  workspaceId?: string;
  manifestPath?: string;
  persist?: boolean;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: ExistingWorkspaceImportRequest;
  try {
    body = (await request.json()) as ExistingWorkspaceImportRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.rootPath || typeof body.rootPath !== 'string') {
    return NextResponse.json({ error: 'rootPath is required' }, { status: 400 });
  }

  try {
    const result = await importExistingWorkspace({
      rootPath: body.rootPath,
      workspaceId: body.workspaceId,
      manifestPath: body.manifestPath,
      persist: body.persist,
    });

    return NextResponse.json({
      success: true,
      workspace: result,
    });
  } catch (err) {
    if (err instanceof ExistingWorkspaceImportError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Workspace import failed' }, { status: 500 });
  }
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'POST, OPTIONS' }),
  });
}
