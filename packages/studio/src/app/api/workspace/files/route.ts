/**
 * POST /api/workspace/files — file operations inside a workspace clone.
 *
 * The write half of Brittney's workspace agency (founder directive
 * 2026-06-10: "Brittney should be able to build, write code, move files
 * through studio"). Read-side GitHub tools already existed; this route
 * gives the assistant — and any authenticated Studio surface — real file
 * hands on the local workspace, with the same containment guarantees as
 * the /api/git/* family.
 *
 * Body: {
 *   workspacePath: string   absolute path to the workspace clone
 *   op: 'list' | 'read' | 'write' | 'move' | 'delete' | 'mkdir'
 *   path?: string           workspace-relative target ('' = root for list)
 *   toPath?: string         workspace-relative destination (move only)
 *   content?: string        file content (write only, ≤512KB)
 * }
 *
 * Guards: session auth, workspaces-root containment, no '..'/absolute/
 * flag-like paths, `.git/` off-limits, symlink-escape re-check, size caps,
 * no-clobber move, delete limited to files and empty directories.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

import { corsHeaders } from '../../_lib/cors';
import {
  resolveWorkspaceFsRoot,
  resolveInsideWorkspace,
  validateWorkspaceRelativePath,
} from '@/lib/workspace/workspaceFs';

const READ_MAX_BYTES = 256 * 1024;
const WRITE_MAX_CHARS = 512 * 1024;
const LIST_MAX_ENTRIES = 500;

const OPS = new Set(['list', 'read', 'write', 'move', 'delete', 'mkdir']);

interface FilesBody {
  workspacePath?: string;
  op?: string;
  path?: string;
  toPath?: string;
  content?: string;
}

function bad(error: string, status = 400): NextResponse {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: NextRequest) {
  const { getServerSession } = await import('next-auth');
  const { authOptions } = await import('@/lib/auth');
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as FilesBody | null;
  if (!body?.workspacePath || !body?.op) {
    return bad('Required: workspacePath, op');
  }
  if (!OPS.has(body.op)) {
    return bad(`Unknown op "${body.op}" — expected list|read|write|move|delete|mkdir`);
  }

  const workspace = resolveWorkspaceFsRoot(body.workspacePath);
  if (!workspace.ok) {
    return bad(workspace.error, workspace.status);
  }
  const root = workspace.resolved;

  const pathCheck = validateWorkspaceRelativePath(body.path ?? '', {
    allowEmpty: body.op === 'list',
  });
  if (!pathCheck.ok) {
    return bad(pathCheck.error);
  }
  const target = resolveInsideWorkspace(root, pathCheck.relative);
  if (!target.ok) {
    return bad(target.error);
  }

  try {
    switch (body.op) {
      case 'list': {
        if (!fs.existsSync(target.absolute) || !fs.statSync(target.absolute).isDirectory()) {
          return bad('path is not a directory');
        }
        const all = fs
          .readdirSync(target.absolute, { withFileTypes: true })
          .filter((entry) => entry.name !== '.git');
        const entries = all
          .slice(0, LIST_MAX_ENTRIES)
          .map((entry) => {
            const entryPath = pathCheck.relative
              ? `${pathCheck.relative}/${entry.name}`
              : entry.name;
            let size: number | null = null;
            if (entry.isFile()) {
              try {
                size = fs.statSync(path.join(target.absolute, entry.name)).size;
              } catch {
                size = null;
              }
            }
            return {
              name: entry.name,
              path: entryPath,
              type: entry.isDirectory() ? 'directory' : 'file',
              size,
            };
          })
          .sort((a, b) =>
            a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1
          );
        return NextResponse.json({
          ok: true,
          op: 'list',
          path: pathCheck.relative,
          entries,
          truncated: all.length > LIST_MAX_ENTRIES,
        });
      }

      case 'read': {
        if (!fs.existsSync(target.absolute) || !fs.statSync(target.absolute).isFile()) {
          return bad('path is not a file');
        }
        const stat = fs.statSync(target.absolute);
        const truncated = stat.size > READ_MAX_BYTES;
        const fd = fs.openSync(target.absolute, 'r');
        let content: string;
        try {
          const buffer = Buffer.alloc(Math.min(stat.size, READ_MAX_BYTES));
          fs.readSync(fd, buffer, 0, buffer.length, 0);
          content = buffer.toString('utf8');
        } finally {
          fs.closeSync(fd);
        }
        return NextResponse.json({
          ok: true,
          op: 'read',
          path: pathCheck.relative,
          content,
          size: stat.size,
          truncated,
        });
      }

      case 'write': {
        if (typeof body.content !== 'string') {
          return bad('Required for write: content (string)');
        }
        if (body.content.length > WRITE_MAX_CHARS) {
          return bad(`content exceeds ${WRITE_MAX_CHARS} chars`);
        }
        if (fs.existsSync(target.absolute) && fs.statSync(target.absolute).isDirectory()) {
          return bad('path is a directory');
        }
        const created = !fs.existsSync(target.absolute);
        fs.mkdirSync(path.dirname(target.absolute), { recursive: true });
        fs.writeFileSync(target.absolute, body.content, 'utf8');
        return NextResponse.json({
          ok: true,
          op: 'write',
          path: pathCheck.relative,
          created,
          bytes: Buffer.byteLength(body.content, 'utf8'),
        });
      }

      case 'move': {
        const toCheck = validateWorkspaceRelativePath(body.toPath);
        if (!toCheck.ok) {
          return bad(`toPath: ${toCheck.error}`);
        }
        const destination = resolveInsideWorkspace(root, toCheck.relative);
        if (!destination.ok) {
          return bad(`toPath: ${destination.error}`);
        }
        if (!fs.existsSync(target.absolute)) {
          return bad('path does not exist');
        }
        if (fs.existsSync(destination.absolute)) {
          return bad('toPath already exists — moves never overwrite');
        }
        fs.mkdirSync(path.dirname(destination.absolute), { recursive: true });
        fs.renameSync(target.absolute, destination.absolute);
        return NextResponse.json({
          ok: true,
          op: 'move',
          from: pathCheck.relative,
          to: toCheck.relative,
        });
      }

      case 'delete': {
        if (!fs.existsSync(target.absolute)) {
          return bad('path does not exist');
        }
        const stat = fs.statSync(target.absolute);
        if (stat.isDirectory()) {
          if (fs.readdirSync(target.absolute).length > 0) {
            return bad('directory is not empty — deletes are limited to files and empty dirs');
          }
          fs.rmdirSync(target.absolute);
        } else {
          fs.unlinkSync(target.absolute);
        }
        return NextResponse.json({ ok: true, op: 'delete', path: pathCheck.relative });
      }

      case 'mkdir': {
        if (fs.existsSync(target.absolute) && !fs.statSync(target.absolute).isDirectory()) {
          return bad('path exists and is not a directory');
        }
        fs.mkdirSync(target.absolute, { recursive: true });
        return NextResponse.json({ ok: true, op: 'mkdir', path: pathCheck.relative });
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'file operation failed' },
      { status: 500 }
    );
  }

  return bad('unreachable');
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'POST, OPTIONS' }),
  });
}
