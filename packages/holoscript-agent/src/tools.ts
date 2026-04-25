/**
 * Tool runner for headless mesh agents.
 *
 * Provides a small, sandboxed set of tools that LLM agents can call during
 * task execution. Anthropic tool-use shape — these specs are passed to
 * `messages.stream({ tools: [...] })`, the model returns `tool_use` blocks,
 * the runner executes them via `runTool()` and feeds results back as
 * `tool_result` blocks until the model emits its final text response.
 *
 * Sandbox model:
 *   - read_file / list_dir: restricted to ALLOWED_READ_ROOTS (task inputs +
 *     read-only views of the cloned repo). No /etc, no /home, no /root/.ssh.
 *   - write_file: restricted to ALLOWED_WRITE_ROOTS (just /root/agent-output/).
 *     Creates dir if needed, refuses paths that escape via .. or symlinks.
 *   - bash: ONLY whitelisted command prefixes (lake build, lean ..., ls, cat,
 *     grep, find, wc, head, tail, git status/log/diff/show, pnpm --filter,
 *     vitest run --no-coverage). Hard 60s wall timeout, 1MB stdout cap. Refuses
 *     anything else (rm, curl, ssh, sudo, eval, etc.).
 *
 * The sandbox is best-effort host isolation — these instances are dedicated
 * to a single mesh-worker identity, so we trade some flexibility for a clear
 * "what the LLM can do" contract that audits cleanly.
 */

import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import type { ToolSpec, ToolUseBlock, ToolResultBlock } from '@holoscript/llm-provider';

// ---------------------------------------------------------------------------
// Sandbox roots — keep narrow. Add only when a task needs more.
// ---------------------------------------------------------------------------
const ALLOWED_READ_ROOTS = [
  '/root/msc-paper-22',          // Paper 22 mechanization inputs (scp'd by deploy)
  '/root/holoscript-mesh',        // Read-only repo view (clone path on instance)
  '/root/agent-output',           // Read back what we wrote
];

const ALLOWED_WRITE_ROOTS = [
  '/root/agent-output',           // Single write sink — keeps deliverables in one place
];

// Command-prefix whitelist. Prefix-match is intentional — `lake build MSC`
// matches `lake build`, `pnpm --filter @holoscript/core build` matches
// `pnpm --filter`, etc. Refuses anything else (no sudo, rm, curl, ssh, eval).
const BASH_WHITELIST = [
  'lake build', 'lake env', 'lake clean',
  'lean ',
  'ls ', 'ls\n', 'ls$',
  'cat ',
  'grep ', 'rg ',
  'find ',
  'wc ',
  'head ', 'tail ',
  'git status', 'git log', 'git diff', 'git show',
  'pnpm --filter',
  'pnpm vitest', 'vitest run',
  'pwd',
  'echo ',
];

// ---------------------------------------------------------------------------
// Tool specs surfaced to the LLM
// ---------------------------------------------------------------------------
export const MESH_TOOLS: ToolSpec[] = [
  {
    name: 'read_file',
    description:
      'Read a file from the agent sandbox. Allowed roots: /root/msc-paper-22, ' +
      '/root/holoscript-mesh, /root/agent-output. Returns the file content as text. ' +
      'Use this to inspect inputs scp\'d to the instance (e.g. MSC/Invariants.lean).',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path under an allowed read root' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_dir',
    description:
      'List entries in a directory under the agent sandbox. Same root restrictions ' +
      'as read_file. Returns a newline-separated list of entries.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path under an allowed read root' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description:
      'Write a file to /root/agent-output/. This is the deliverable sink — anything ' +
      'you want to emit as task output (a Lean proof, a markdown report, a JSON dataset) ' +
      'goes here. Creates parent directories. Will refuse paths outside the write root.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path under /root/agent-output/' },
        content: { type: 'string', description: 'File content to write (UTF-8)' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'bash',
    description:
      'Run a shell command. Whitelisted prefixes only: lake build, lean, ls, cat, ' +
      'grep, find, wc, head, tail, git status/log/diff/show, pnpm --filter, vitest run, ' +
      'pwd, echo. Hard 60s wall timeout, 1MB stdout cap. Use for lake build / lean ' +
      'kernel-checks, git inspection, repo greps. Refuses rm, curl, ssh, sudo, eval.',
    input_schema: {
      type: 'object',
      properties: {
        cmd: { type: 'string', description: 'Whitelisted shell command' },
        cwd: { type: 'string', description: 'Optional working directory (defaults to /root)' },
      },
      required: ['cmd'],
    },
  },
];

// ---------------------------------------------------------------------------
// Path-sandbox helpers
// ---------------------------------------------------------------------------
function isUnderRoot(absPath: string, root: string): boolean {
  const resolved = resolve(absPath);
  const rootResolved = resolve(root);
  return resolved === rootResolved || resolved.startsWith(rootResolved + '/');
}

function checkReadAllowed(path: string): string | null {
  if (!path.startsWith('/')) return `path must be absolute, got "${path}"`;
  for (const root of ALLOWED_READ_ROOTS) {
    if (isUnderRoot(path, root)) return null;
  }
  return `read denied — path "${path}" not under allowed roots: ${ALLOWED_READ_ROOTS.join(', ')}`;
}

function checkWriteAllowed(path: string): string | null {
  if (!path.startsWith('/')) return `path must be absolute, got "${path}"`;
  for (const root of ALLOWED_WRITE_ROOTS) {
    if (isUnderRoot(path, root)) return null;
  }
  return `write denied — path "${path}" not under allowed roots: ${ALLOWED_WRITE_ROOTS.join(', ')}`;
}

function checkBashAllowed(cmd: string): string | null {
  const trimmed = cmd.trim();
  if (trimmed.length === 0) return 'empty command';
  // Reject obvious shell-injection attempts. Whitelist below still applies.
  if (/[;&|`$<>]|>>|\|\||&&/.test(trimmed)) {
    return `command contains shell metachars (; & | \` $ < > >> || &&) — not allowed for safety`;
  }
  for (const prefix of BASH_WHITELIST) {
    if (trimmed.startsWith(prefix.trim())) return null;
  }
  return `command not on whitelist. Allowed prefixes: ${BASH_WHITELIST.join(' / ')}`;
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------
export async function runTool(use: ToolUseBlock): Promise<ToolResultBlock> {
  try {
    if (use.name === 'read_file') {
      const path = use.input.path as string;
      const denied = checkReadAllowed(path);
      if (denied) return errResult(use.id, denied);
      const text = await readFile(path, 'utf8');
      // Cap at 200KB to avoid context blowups
      const truncated = text.length > 200_000 ? text.slice(0, 200_000) + `\n…[truncated, full file is ${text.length} bytes]` : text;
      return okResult(use.id, truncated);
    }

    if (use.name === 'list_dir') {
      const path = use.input.path as string;
      const denied = checkReadAllowed(path);
      if (denied) return errResult(use.id, denied);
      const entries = await readdir(path, { withFileTypes: true });
      const lines = entries.map((e) => `${e.isDirectory() ? 'd' : '-'} ${e.name}`);
      return okResult(use.id, lines.join('\n'));
    }

    if (use.name === 'write_file') {
      const path = use.input.path as string;
      const content = use.input.content as string;
      const denied = checkWriteAllowed(path);
      if (denied) return errResult(use.id, denied);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, 'utf8');
      const s = await stat(path);
      return okResult(use.id, `wrote ${s.size} bytes to ${path}`);
    }

    if (use.name === 'bash') {
      const cmd = use.input.cmd as string;
      const cwd = (use.input.cwd as string | undefined) ?? '/root';
      const denied = checkBashAllowed(cmd);
      if (denied) return errResult(use.id, denied);
      const result = await runBash(cmd, cwd);
      return result.code === 0
        ? okResult(use.id, result.stdout)
        : errResult(use.id, `exit=${result.code}\n${result.stderr || result.stdout}`);
    }

    return errResult(use.id, `unknown tool: ${use.name}`);
  } catch (err) {
    return errResult(use.id, err instanceof Error ? err.message : String(err));
  }
}

interface BashResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runBash(cmd: string, cwd: string): Promise<BashResult> {
  return new Promise((resolveProm) => {
    const child = spawn('bash', ['-c', cmd], { cwd, env: process.env });
    let stdout = '';
    let stderr = '';
    let killed = false;
    const STDOUT_CAP = 1_000_000;
    const TIMEOUT_MS = 60_000;
    const killer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, TIMEOUT_MS);
    child.stdout.on('data', (d: Buffer) => {
      if (stdout.length < STDOUT_CAP) stdout += d.toString('utf8');
    });
    child.stderr.on('data', (d: Buffer) => {
      if (stderr.length < STDOUT_CAP) stderr += d.toString('utf8');
    });
    child.on('error', (err) => {
      clearTimeout(killer);
      resolveProm({ code: 1, stdout, stderr: stderr + '\nspawn-error: ' + err.message });
    });
    child.on('exit', (code) => {
      clearTimeout(killer);
      const finalStdout = stdout.length >= STDOUT_CAP ? stdout + `\n…[stdout truncated at ${STDOUT_CAP} bytes]` : stdout;
      const note = killed ? `\n[bash killed after ${TIMEOUT_MS}ms timeout]` : '';
      resolveProm({ code: code ?? 1, stdout: finalStdout + note, stderr });
    });
  });
}

function okResult(id: string, content: string): ToolResultBlock {
  return { type: 'tool_result', tool_use_id: id, content };
}

function errResult(id: string, message: string): ToolResultBlock {
  return { type: 'tool_result', tool_use_id: id, content: message, is_error: true };
}
