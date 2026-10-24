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
      | 'clone_failed'
      | 'clone_commit_mismatch',
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
  /**
   * Pin the clone to this commit (#617): the SHA the charge is keyed on. After
   * the clone, HEAD must be exactly this commit (fetched by SHA if the branch
   * moved since ls-remote), otherwise the clone is refused (502) and nothing
   * is scanned or charged.
   */
  expectedSha?: string;
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
    if (opts.expectedSha) {
      await pinToCommit(spawnImpl, dest, work, opts.expectedSha.toLowerCase(), timeoutMs);
    }
    return { dir: dest, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

export const RESOLVE_TIMEOUT_MS = 15_000;

export function lsRemoteArgs(url: string, branch?: string): string[] {
  const args: string[] = [];
  for (const c of CLONE_GIT_CONFIG) args.push('-c', c);
  args.push('ls-remote', '--quiet', '--', url, branch ? `refs/heads/${branch}` : 'HEAD');
  return args;
}

/**
 * The commit url@branch points at now (git ls-remote, same allowlist, config
 * and env as the clone). /scan keys its once-per-import claim on it (#617).
 */
export async function resolveCommitSha(
  rawUrl: unknown,
  rawBranch: unknown,
  opts: { timeoutMs?: number; spawnImpl?: CloneOptions['spawnImpl'] } = {}
): Promise<string> {
  const url = normalizeRepoUrl(rawUrl);
  const branch = normalizeBranch(rawBranch);
  const spawnImpl = opts.spawnImpl ?? spawn;
  const timeoutMs = opts.timeoutMs ?? RESOLVE_TIMEOUT_MS;
  const home = os.tmpdir();
  return await new Promise<string>((resolve, reject) => {
    const child = spawnImpl('git', lsRemoteArgs(url, branch), {
      cwd: home,
      env: cloneEnv(home),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    let done = false;
    const finish = (e: Error | null, sha?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (e) {
        child.kill('SIGKILL');
        reject(e);
      } else resolve(sha as string);
    };
    const timer = setTimeout(
      () => finish(new CloneRefusal('clone_timeout', `resolving the commit took longer than ${timeoutMs} ms`)),
      timeoutMs
    );
    child.stdout?.on('data', (d: Buffer) => {
      if (out.length < 4000) out += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      if (err.length < 2000) err += d.toString();
    });
    child.on('error', (e) => finish(new CloneRefusal('clone_failed', `git did not start: ${e.message}`)));
    child.on('close', (code) => {
      if (code !== 0) return finish(new CloneRefusal('clone_failed', `git ls-remote exited ${code}: ${err.slice(0, 300)}`));
      const sha = out.split('\n')[0]?.split('\t')[0]?.trim() ?? '';
      if (!/^[0-9a-f]{40}([0-9a-f]{24})?$/i.test(sha)) {
        return finish(new CloneRefusal('clone_failed', 'branch not found on the remote'));
      }
      finish(null, sha.toLowerCase());
    });
  });
}

/** Run one git command in dir with the clone's hardened config and env; resolves stdout. */
function runGit(
  spawnImpl: NonNullable<CloneOptions['spawnImpl']>,
  args: string[],
  dir: string,
  home: string,
  timeoutMs: number
): Promise<string> {
  const full: string[] = [];
  for (const c of CLONE_GIT_CONFIG) full.push('-c', c);
  full.push(...args);
  return new Promise<string>((resolve, reject) => {
    const child = spawnImpl('git', full, { cwd: dir, env: cloneEnv(home), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let done = false;
    const finish = (e?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (e) {
        child.kill('SIGKILL');
        reject(e);
      } else resolve(out);
    };
    const timer = setTimeout(
      () => finish(new CloneRefusal('clone_timeout', `git ${args[0]} took longer than ${timeoutMs} ms`)),
      timeoutMs
    );
    child.stdout?.on('data', (d: Buffer) => {
      if (out.length < 4000) out += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      if (err.length < 2000) err += d.toString();
    });
    child.on('error', (e) => finish(new CloneRefusal('clone_failed', `git did not start: ${e.message}`)));
    child.on('close', (code) => {
      if (code === 0) finish();
      else finish(new CloneRefusal('clone_failed', `git ${args[0]} exited ${code}: ${err.slice(0, 300)}`));
    });
  });
}

/**
 * Make the clone's HEAD exactly expectedSha (#617). The shallow clone took the
 * branch tip; if the branch moved after ls-remote, fetch that commit by SHA and
 * check it out detached. Any mismatch is a clone_commit_mismatch (502).
 */
export async function pinToCommit(
  spawnImpl: NonNullable<CloneOptions['spawnImpl']>,
  dest: string,
  home: string,
  expectedSha: string,
  timeoutMs: number
): Promise<void> {
  const head = async () => (await runGit(spawnImpl, ['rev-parse', 'HEAD'], dest, home, timeoutMs)).trim().toLowerCase();
  if ((await head()) === expectedSha) return;
  await runGit(spawnImpl, ['fetch', '--depth', '1', '--no-tags', '--quiet', 'origin', expectedSha], dest, home, timeoutMs);
  await runGit(spawnImpl, ['checkout', '--quiet', '--detach', expectedSha], dest, home, timeoutMs);
  const now = await head();
  if (now !== expectedSha) {
    throw new CloneRefusal('clone_commit_mismatch', `clone is at ${now.slice(0, 12)}, expected ${expectedSha.slice(0, 12)}`);
  }
}
