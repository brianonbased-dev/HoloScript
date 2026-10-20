/**
 * The ONE way Studio runs git on the server (P0b 2026-10-05).
 *
 * Workspace clones are attacker-influenced. Repo-local config and hooks can
 * name programs that git runs by itself: `core.fsmonitor` runs on `git status`
 * / `diff` / `add` / `commit`, and `.git/hooks/*` (or `core.hooksPath`) run on
 * `commit`, `checkout`, `clone`, `push`. If repo metadata is ever writable
 * (e.g. through a `gitalias -> .git` symlink, see workspaceFs.ts), the next
 * server-side git call would run that program as the Studio user.
 *
 * Every invocation therefore passes command-line config, which overrides any
 * repo, global or system value and is inherited by git's own subprocesses:
 *   - core.fsmonitor=false       no fsmonitor hook program, ever.
 *   - core.hooksPath=/dev/null   no hooks (not a directory, so nothing runs).
 *   - protocol.ext.allow=never   `ext::` remotes run an arbitrary command; the
 *                                push/ship routes use the repo's remote URL,
 *                                and a repo config could otherwise re-allow it.
 *
 * Deliberately NOT added (kept minimal):
 *   - GIT_CONFIG_NOSYSTEM: system config belongs to the image, not to a
 *     tenant; disabling it could drop legitimate settings (safe.directory).
 *   - core.sshCommand=: Studio talks to GitHub over HTTPS with a token; an
 *     empty value would only break SSH remotes. Like the other repo-config
 *     program settings (credential.helper, filter/textconv drivers,
 *     gpg.program) it needs a writable .git, which the .git landing guard in
 *     workspaceFs.ts closes. Listed as a residual in the PR body.
 */
import {
  execFile,
  execFileSync,
  type ExecFileOptions,
  type ExecFileSyncOptions,
} from 'child_process';

export const GIT_HARDENING_ARGS: readonly string[] = Object.freeze([
  '-c',
  'core.fsmonitor=false',
  '-c',
  'core.hooksPath=/dev/null',
  '-c',
  'protocol.ext.allow=never',
]);

/** `git` argv with the hardening config in front (config must precede the subcommand). */
export function hardenedGitArgs(args: readonly string[]): string[] {
  return [...GIT_HARDENING_ARGS, ...args];
}

export interface GitResult {
  stdout: string;
  stderr: string;
}

/**
 * Async `git <args>`. Same contract as `promisify(execFile)('git', ...)`:
 * resolves `{ stdout, stderr }`, rejects with the error carrying stdout/stderr.
 */
export function runGit(args: readonly string[], options: ExecFileOptions = {}): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      hardenedGitArgs(args),
      { ...options, encoding: 'utf8' },
      (error, stdout, stderr) => {
        const output = { stdout: String(stdout ?? ''), stderr: String(stderr ?? '') };
        if (error) {
          reject(Object.assign(error, output));
          return;
        }
        resolve(output);
      }
    );
  });
}

/** Sync `git <args>`; returns stdout as a string. Throws like execFileSync. */
export function runGitSync(args: readonly string[], options: ExecFileSyncOptions = {}): string {
  return String(execFileSync('git', hardenedGitArgs(args), { ...options, encoding: 'utf8' }));
}
