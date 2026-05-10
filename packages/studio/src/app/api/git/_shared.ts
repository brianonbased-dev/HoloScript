import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function getWorkspacesRoot(): string {
  return path.resolve(
    process.env.HOLOSCRIPT_WORKSPACES_DIR ??
      path.join(
        process.env.HOME ?? process.env.USERPROFILE ?? os.homedir(),
        '.holoscript',
        'workspaces'
      )
  );
}

export function isInsidePath(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function resolveWorkspaceGitPath(
  workspacePath: string
): { ok: true; resolved: string } | { ok: false; error: string; status: number } {
  const root = getWorkspacesRoot();
  const resolved = path.resolve(workspacePath);
  if (!isInsidePath(root, resolved)) {
    return {
      ok: false,
      error: 'workspacePath must be inside ~/.holoscript/workspaces',
      status: 403,
    };
  }
  if (!fs.existsSync(path.join(resolved, '.git'))) {
    return {
      ok: false,
      error: 'workspacePath does not contain a git repository',
      status: 400,
    };
  }
  return { ok: true, resolved };
}

const GIT_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;

export function isSafeGitRef(ref: string): boolean {
  const value = ref.trim();
  if (!GIT_REF_RE.test(value)) return false;
  if (value.startsWith('-')) return false;
  if (value.includes('..') || value.includes('//') || value.includes('@{')) return false;
  if (value.endsWith('/') || value.endsWith('.') || value.endsWith('.lock')) return false;
  if (value.split('/').some((part) => part.startsWith('.') || part.endsWith('.lock'))) {
    return false;
  }
  return true;
}

export function isSafeGitRemote(remote: string): boolean {
  const value = remote.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value);
}

export function normalizeWorkspaceRelativePath(value: string | null): string {
  if (!value) return '';
  return value.replace(/\\/g, '/').replace(/^\/+/, '');
}

export function validateRelativeGitPaths(
  files: string[] | undefined
): { ok: true } | { ok: false; error: string } {
  if (!files?.length) return { ok: true };
  for (const file of files) {
    if (typeof file !== 'string' || !file) {
      return { ok: false, error: 'Empty entries are not allowed in files[]' };
    }
    if (file.startsWith('-')) {
      return { ok: false, error: 'Flag-like entries are not allowed in files[]' };
    }
    if (file.split(/[/\\]/).some((segment) => segment === '..')) {
      return { ok: false, error: "Path traversal ('..') is not allowed in files[]" };
    }
  }
  return { ok: true };
}
