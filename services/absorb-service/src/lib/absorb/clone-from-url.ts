/**
 * Clone a public GitHub repo for a scan, with every guard in one place.
 *
 * absorb clones the repo itself (card-absorb-import-real-fix.md, option 1)
 * because it cannot see Studio's clone: the two services have separate
 * Railway volumes. A caller-supplied URL makes this an outbound fetch, so the
 * URL, the git invocation and the result are all fenced:
 *   - https only, host exactly github.com, no port, no user:pass@, no query
 *     or fragment, path exactly /owner/repo[.git];
 *   - git config on the command line: no hooks, no fsmonitor, only the https
 *     transport, no redirects, no credential helper, no LFS filters, no
 *     submodule recursion, no symlinks; system and global config ignored;
 *   - depth 1, single branch, no tags; GIT_LFS_SKIP_SMUDGE=1; no prompt;
 *   - a minimal environment (no service secrets reach git);
 *   - a time cap and a size cap, either of which kills the clone;
 *   - a fresh temp dir under absorb's own volume, removed by cleanup().
 */
import { spawn, type ChildProcess, type SpawnOptions } from 'child_process';
import { promises as fsp } from 'fs';
import * as os from 'os';
import * as path from 'path';

export const CLONE_TIMEOUT_MS = 60_000;
export const CLONE_MAX_BYTES = 200 * 1024 * 1024;
const SIZE_POLL_MS = 500;

export class CloneRefusal extends Error {
  constructor(
    readonly code:
      | 'repo_url_not_allowed'
      | 'branch_not_allowed'
      | 'clone_timeout'
      | 'clone_too_large'
      | 'clone_failed',
    message: string
  ) {
    super(message);
    this.name = 'CloneRefusal';
  }
}

const OWNER_REPO = /^\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/;

/** The canonical https://github.com/owner/repo.git, or a CloneRefusal. */
export function normalizeRepoUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 300) {
    throw new CloneRefusal('repo_url_not_allowed', 'repoUrl must be a GitHub https URL');
  }
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new CloneRefusal('repo_url_not_allowed', 'repoUrl is not a URL');
  }
  if (u.protocol !== 'https:') {
    throw new CloneRefusal('repo_url_not_allowed', 'repoUrl must use https');
  }
  if (u.username !== '' || u.password !== '') {
    throw new CloneRefusal('repo_url_not_allowed', 'repoUrl must not carry credentials');
  }
  if (u.hostname.toLowerCase() !== 'github.com' || u.port !== '') {
    throw new CloneRefusal('repo_url_not_allowed', 'repoUrl host must be github.com');
  }
  if (u.search !== '' || u.hash !== '') {
    throw new CloneRefusal('repo_url_not_allowed', 'repoUrl must not have a query or fragment');
  }
  const m = OWNER_REPO.exec(u.pathname);
  if (!m || m[2] === '.' || m[2] === '..') {
    throw new CloneRefusal('repo_url_not_allowed', 'repoUrl must be https://github.com/<owner>/<repo>');
  }
  return `https://github.com/${m[1]}/${m[2]}.git`;
}

/** A plain branch name, or undefined for the default branch. */
export function normalizeBranch(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (
    typeof raw !== 'string' ||
    !/^[A-Za-z0-9._/-]{1,200}$/.test(raw) ||
    raw.startsWith('-') ||
    raw.startsWith('/') ||
    raw.endsWith('/') ||
    raw.endsWith('.lock') ||
    raw.includes('..') ||
    raw.includes('//')
  ) {
    throw new CloneRefusal('branch_not_allowed', 'branch is not a plain git branch name');
  }
  return raw;
}

/** Config passed on the command line; it beats repo, global and system config. */
export const CLONE_GIT_CONFIG: readonly string[] = Object.freeze([
  'core.hooksPath=/dev/null',
  'core.fsmonitor=false',
  'core.symlinks=false',
  'protocol.allow=never',
  'protocol.https.allow=always',
  'http.followRedirects=false',
  'credential.helper=',
  'submodule.recurse=false',
  'fetch.recurseSubmodules=false',
  'filter.lfs.smudge=',
  'filter.lfs.process=',
  'filter.lfs.required=false',
  'advice.detachedHead=false',
]);

export function cloneArgs(url: string, dest: string, branch?: string): string[] {
  const args: string[] = [];
  for (const c of CLONE_GIT_CONFIG) args.push('-c', c);
  args.push('clone', '--depth', '1', '--single-branch', '--no-tags', '--quiet');
  if (branch) args.push('--branch', branch);
  args.push('--', url, dest);
  return args;
}

/** Only what git needs. No service keys, tokens or DATABASE_URL reach git. */
export function cloneEnv(home: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: home,
    GIT_TERMINAL_PROMPT: '0',
    GIT_LFS_SKIP_SMUDGE: '1',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_ASKPASS: '/bin/false',
    GIT_ALLOW_PROTOCOL: 'https',
  };
}

/** Clones live under absorb's own volume, never in a caller-chosen place. */
export function cloneRoot(): string {
  const base = process.env.ABSORB_CLONE_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || os.tmpdir();
  return path.join(base, 'absorb-clones');
}

export async function dirBytes(dir: string): Promise<number> {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop()!;
    let entries: import('fs').Dirent[];
    try {
      entries = await fsp.readdir(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) {
        try {
          total += (await fsp.lstat(p)).size;
        } catch {
          /* vanished mid-walk */
        }
      }
    }
  }
  return total;
}

export interface CloneOptions {
  timeoutMs?: number;
  maxBytes?: number;
  root?: string;
  spawnImpl?: (cmd: string, args: string[], opts: SpawnOptions) => ChildProcess;
  sizeOf?: (dir: string) => Promise<number>;
}

export interface ClonedRepo {
  dir: string;
  cleanup: () => Promise<void>;
}

/**
 * Clone url@branch into a fresh temp dir. On any failure the dir is removed
 * before the CloneRefusal is thrown. On success the caller MUST call
 * cleanup() in a finally.
 */
export async function cloneRepo(
  rawUrl: unknown,
  rawBranch: unknown,
  opts: CloneOptions = {}
): Promise<ClonedRepo> {
  const url = normalizeRepoUrl(rawUrl);
  const branch = normalizeBranch(rawBranch);
  const root = opts.root ?? cloneRoot();
  const timeoutMs = opts.timeoutMs ?? CLONE_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? CLONE_MAX_BYTES;
  const spawnImpl = opts.spawnImpl ?? spawn;
  const sizeOf = opts.sizeOf ?? dirBytes;

  await fsp.mkdir(root, { recursive: true });
  const work = await fsp.mkdtemp(path.join(root, 'c-'));
  const dest = path.join(work, 'repo');
  const cleanup = () => fsp.rm(work, { recursive: true, force: true });

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawnImpl('git', cloneArgs(url, dest, branch), {
        cwd: work,
        env: cloneEnv(work),
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      let done = false;
      const finish = (err?: Error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearInterval(poll);
        if (err) {
          child.kill('SIGKILL');
          reject(err);
        } else resolve();
      };
      const timer = setTimeout(
        () => finish(new CloneRefusal('clone_timeout', `clone took longer than ${timeoutMs} ms`)),
        timeoutMs
      );
      const poll = setInterval(() => {
        void sizeOf(work).then((bytes) => {
          if (bytes > maxBytes) {
            finish(new CloneRefusal('clone_too_large', `repo is larger than ${maxBytes} bytes`));
          }
        });
      }, SIZE_POLL_MS);
      child.stderr?.on('data', (d: Buffer) => {
        if (stderr.length < 2000) stderr += d.toString();
      });
      child.on('error', (e) => finish(new CloneRefusal('clone_failed', `git did not start: ${e.message}`)));
      child.on('close', (code) => {
        if (code === 0) finish();
        else finish(new CloneRefusal('clone_failed', `git clone exited ${code}: ${stderr.slice(0, 300)}`));
      });
    });
    // A clone that finished between two polls is still measured.
    if ((await sizeOf(work)) > maxBytes) {
      throw new CloneRefusal('clone_too_large', `repo is larger than ${maxBytes} bytes`);
    }
    return { dir: dest, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}
