export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import * as fs from 'fs';
import {
  DEFAULT_PROFILE_PATHS,
  ExistingWorkspaceImportError,
  importExistingWorkspace,
} from '@/lib/workspace/existingWorkspaceImporter';
import { assertWorkspaceOwner } from '@/lib/workspace/workspaceOwner';
import { resolveInsideWorkspace, validateWorkspaceRelativePath } from '@/lib/workspace/workspaceFs';

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

  // Mapping B1 (2026-10-05): only scan inside a workspace the CALLER OWNS.
  // assertWorkspaceOwner realpaths the path, requires it strictly under the
  // workspaces root, takes the first segment as the registry row id and
  // requires ownerId === caller. Anything else (another account's workspace,
  // /etc, /proc, $HOME, the app cwd, a '..' escape, a missing path) gets the
  // same uniform 404 as the rest of the owner check.
  const owned = assertWorkspaceOwner(session, body.rootPath);
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }
  const rootPath = owned.resolved;

  // The profile the importer reads must stay inside the owned workspace too:
  // an explicit manifestPath is workspace-relative and symlink-checked, and a
  // default profile file that is a symlink out of the workspace is refused.
  let manifestPath: string | undefined;
  if (body.manifestPath !== undefined && body.manifestPath !== null && body.manifestPath !== '') {
    const relative = validateWorkspaceRelativePath(body.manifestPath);
    const inside = relative.ok ? resolveInsideWorkspace(rootPath, relative.relative) : relative;
    if (!inside.ok) {
      return NextResponse.json({ error: `manifestPath: ${inside.error}` }, { status: 400 });
    }
    manifestPath = inside.absolute;
  } else {
    for (const profilePath of DEFAULT_PROFILE_PATHS) {
      let present = false;
      try {
        fs.lstatSync(`${rootPath}/${profilePath}`);
        present = true;
      } catch {
        present = false;
      }
      if (present && !resolveInsideWorkspace(rootPath, profilePath).ok) {
        return NextResponse.json(
          { error: `${profilePath} resolves outside the workspace (symlink escape)` },
          { status: 400 }
        );
      }
    }
  }

  try {
    const result = await importExistingWorkspace({
      rootPath,
      // The scan cache is keyed by workspace id: pin it to the owned workspace
      // so one account can never be served another account's cached scan.
      workspaceId: owned.workspaceId,
      manifestPath,
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
