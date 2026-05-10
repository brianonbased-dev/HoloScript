export const maxDuration = 60;

/**
 * GET /api/git/tree - List files for a local workspace clone.
 *
 * Query params:
 *   workspacePath: absolute path under ~/.holoscript/workspaces
 *   path: optional directory path relative to workspacePath
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

import { corsHeaders } from '../../_lib/cors';
import { isInsidePath, normalizeWorkspaceRelativePath, resolveWorkspaceGitPath } from '../_shared';

interface TreeEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modifiedAt: string;
}

function entryToPayload(workspacePath: string, dirent: fs.Dirent, absolute: string): TreeEntry {
  const stats = fs.statSync(absolute);
  const relative = path.relative(workspacePath, absolute).replace(/\\/g, '/');
  return {
    name: dirent.name,
    path: relative,
    type: dirent.isDirectory() ? 'directory' : 'file',
    size: dirent.isDirectory() ? 0 : stats.size,
    modifiedAt: stats.mtime.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const { getServerSession } = await import('next-auth');
  const { authOptions } = await import('@/lib/auth');
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const workspacePath = req.nextUrl.searchParams.get('workspacePath');
  if (!workspacePath) {
    return NextResponse.json({ error: 'Required: workspacePath' }, { status: 400 });
  }

  const validated = resolveWorkspaceGitPath(workspacePath);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: validated.status });
  }

  const relativePath = normalizeWorkspaceRelativePath(req.nextUrl.searchParams.get('path'));
  const targetPath = path.resolve(validated.resolved, relativePath);
  if (!isInsidePath(validated.resolved, targetPath)) {
    return NextResponse.json({ error: 'path must stay inside the workspace' }, { status: 400 });
  }
  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
    return NextResponse.json({ error: 'path is not a directory' }, { status: 400 });
  }

  const entries = fs
    .readdirSync(targetPath, { withFileTypes: true })
    .filter((entry) => entry.name !== '.git')
    .slice(0, 500)
    .map((entry) => entryToPayload(validated.resolved, entry, path.join(targetPath, entry.name)))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return NextResponse.json({
    workspacePath: validated.resolved,
    path: relativePath,
    parentPath: relativePath ? path.dirname(relativePath).replace(/\\/g, '/') : null,
    entries,
    total: entries.length,
  });
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
